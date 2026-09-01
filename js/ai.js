// Wildcard Chess — analysis engine.
// Iterative-deepening negamax + alpha-beta + quiescence over a fast make/unmake
// position. Wildcard (board-reshaping) actions are candidate-pruned: full-width
// search over piece moves, top-K square actions chosen by a cheap tactical score.
// Works in browser (global WCAI) and Node (module.exports).

(function () {
  'use strict';

  const W = 0, B = 1;                       // colors as ints
  const PT = { pawn: 0, knight: 1, bishop: 2, rook: 3, queen: 4, king: 5 };
  const PT_NAME = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];
  const MATE = 100000;

  // pack coords into one int; supports c,r in [-128, 383]
  const pack = (c, r) => ((c + 128) << 10) | (r + 128);
  const upC = (k) => (k >> 10) - 128;
  const upR = (k) => (k & 1023) - 128;

  const N8 = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
  const N4 = [[1,0],[-1,0],[0,1],[0,-1]];   // squares attach along a shared edge only
  const DIAG = [[1,1],[1,-1],[-1,1],[-1,-1]];
  const ORTHO = [[1,0],[-1,0],[0,1],[0,-1]];
  const KNIGHT = [[1,2],[2,1],[-1,2],[-2,1],[1,-2],[2,-1],[-1,-2],[-2,-1]];

  const DEFAULT_WEIGHTS = {
    material: [100, 320, 330, 500, 900, 0],   // by PT
    mobility: 3,                              // cp per pseudo-move (N/B/R/Q)
    kingRing: 6,                              // cp per existing empty cell around own king
    pawnAdv: 5,                               // cp per step of pawn advancement toward its edge
    frozenPawn: -18,                          // pawn with a hole directly ahead
    tempo: 8,
    // Positional terms. A board that changes shape has no fixed squares, so
    // "piece-square tables" here are computed against the board's CURRENT
    // bounds rather than a static 8x8 grid.
    centerN: 32,                              // knights love the middle of whatever board exists
    centerB: 14,
    centerQ: 6,
    rookOpen: 22,                             // rook on a file with no pawns
    rookSemi: 10,
    bishopPair: 38,
    passedPawn: 22,                           // per rank of advancement, scaled
    doubledPawn: -16,
    isolatedPawn: -14,
    kingShelter: 26,                          // midgame: king away from the open middle
    kingActive: 24,                           // endgame: king wants the middle
    // Personality. Root-only nudge (cp) toward or away from each board action;
    // deep eval is untouched, so a biased bot is still tactically sound.
    kindBias: { ac: 0, rc: 0, mc: 0 },
  };

  // deterministic RNG (mulberry32) for root jitter / experiments
  function rng(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---- Zobrist keys -----------------------------------------------------
  // Keys are generated lazily per coordinate, because this board can grow past
  // its original 8x8 in any direction — there is no fixed square count to
  // pre-table. Deterministic seed so runs are reproducible.
  const zrand = rng(0x9E3779B9);
  const zTable = new Map();
  function zk(tag) {
    let v = zTable.get(tag);
    if (!v) {
      v = [(zrand() * 4294967296) | 0, (zrand() * 4294967296) | 0];
      zTable.set(tag, v);
    }
    return v;
  }

  class Pos {
    // spec: { cells: [[c,r],...], pieces: [[c,r,typeName,colorName,hasMoved],...], turn, counts:{white,black} }
    constructor(spec, weights) {
      this.cells = new Set(spec.cells.map(([c, r]) => pack(c, r)));
      this.board = new Map();                 // packed -> {t, col, moved}
      this.kings = [-1, -1];
      for (const [c, r, t, col, moved] of spec.pieces) {
        const k = pack(c, r), ci = col === 'white' ? W : B;
        this.board.set(k, { t: PT[t], col: ci, moved: !!moved });
        if (PT[t] === PT.king) this.kings[ci] = k;
      }
      this.turn = spec.turn === 'white' ? W : B;
      this.counts = [spec.counts.white, spec.counts.black];
      this.cadence = (spec.rules && spec.rules.cadence) || 3;
      this.budget = (spec.rules && spec.rules.budget != null) ? spec.rules.budget : Infinity;
      this.wildUsed = spec.wildUsed ? [spec.wildUsed.white, spec.wildUsed.black] : [0, 0];
      this.ep = spec.ep ? pack(spec.ep.c, spec.ep.r) : -1;    // -1 = no en-passant square
      // which board actions the ruleset offers (absent = all)
      this.allowActions = (spec.rules && spec.rules.actions) || this.allowActions || null;
      this.w = weights || DEFAULT_WEIGHTS;
      this.nodes = 0;
      this.killers = [];
      this.hist = new Map();
      this.tt = new Map();
      this.cellVer = 0;                        // bumped whenever terrain changes
      this.bv = -1;                            // version the bounds cache was built at
      this.initHash();
    }

    static fromGame(game, weights) {
      const cells = [], pieces = [];
      for (const k of game.cells) { const [c, r] = k.split(',').map(Number); cells.push([c, r]); }
      for (const [k, p] of game.board) {
        const [c, r] = k.split(',').map(Number);
        pieces.push([c, r, p.type, p.color, p.hasMoved]);
      }
      return new Pos({
        cells, pieces, turn: game.turn,
        counts: { white: game.moveCount.white, black: game.moveCount.black },
        rules: game.rules, wildUsed: game.wildUsed, ep: game.epTarget,
      }, weights);
    }

    // Mirrors engine.js: every Nth PLY is a board turn (W B✦ W B W✦ B …),
    // keyed off the total move count, not the per-colour one.
    eligible(col) {
      const cad = this.cadence;
      return (this.counts[0] + this.counts[1]) % cad === ((cad - 2) % cad + cad) % cad
        && this.wildUsed[col] < this.budget;
    }
    has(k) { return this.cells.has(k); }

    // The board's current extent. Recomputed only when terrain actually moves,
    // which is at most once every three plies — everything positional is scored
    // relative to this, since there are no fixed squares in this variant.
    bounds() {
      if (this.bv === this.cellVer) return;
      let minC = 1e9, maxC = -1e9, minR = 1e9, maxR = -1e9;
      for (const k of this.cells) {
        const c = upC(k), r = upR(k);
        if (c < minC) minC = c;
        if (c > maxC) maxC = c;
        if (r < minR) minR = r;
        if (r > maxR) maxR = r;
      }
      this.bMinC = minC; this.bMaxC = maxC; this.bMinR = minR; this.bMaxR = maxR;
      this.bv = this.cellVer;
    }

    // ---- position hashing (transposition table) ---------------------------
    // ha/hb are the "material + terrain" half, updated incrementally on every
    // make(). Side to move, en-passant and the board-turn phase are folded in
    // at probe time, since they are cheap and change every ply.
    xorPiece(k, t, col) {
      const z = zk('p' + k + ':' + t + ':' + col);
      this.ha ^= z[0]; this.hb ^= z[1];
    }
    xorCell(k) {
      const z = zk('c' + k);
      this.ha ^= z[0]; this.hb ^= z[1];
    }
    initHash() {
      this.ha = 0; this.hb = 0;
      for (const k of this.cells) this.xorCell(k);
      for (const [k, q] of this.board) this.xorPiece(k, q.t, q.col);
    }
    hash() {
      let a = this.ha, b = this.hb;
      if (this.turn === B) { const z = zk('turn'); a ^= z[0]; b ^= z[1]; }
      if (this.ep >= 0) { const z = zk('e' + this.ep); a ^= z[0]; b ^= z[1]; }
      // Board-turn eligibility changes what is legal, so it must be part of
      // the position's identity or the table would mix incompatible nodes.
      const ph = (this.counts[0] + this.counts[1]) % this.cadence;
      const zp = zk('h' + ph + ':' + (this.wildUsed[0] < this.budget ? 1 : 0)
                     + (this.wildUsed[1] < this.budget ? 1 : 0));
      a ^= zp[0]; b ^= zp[1];
      return { a: a >>> 0, b: b >>> 0 };
    }

    // ---- attacks ----------------------------------------------------------
    attacked(k, by) {
      const c = upC(k), r = upR(k);
      for (const [dc, dr] of KNIGHT) {
        const p = this.board.get(pack(c + dc, r + dr));
        if (p && p.col === by && p.t === PT.knight) return true;
      }
      for (const [dc, dr] of N8) {
        const p = this.board.get(pack(c + dc, r + dr));
        if (p && p.col === by && p.t === PT.king) return true;
      }
      const pdir = by === W ? 1 : -1;
      for (const dc of [-1, 1]) {
        const p = this.board.get(pack(c + dc, r - pdir));
        if (p && p.col === by && p.t === PT.pawn) return true;
      }
      for (const dirs of [DIAG, ORTHO]) {
        const slider = dirs === DIAG ? PT.bishop : PT.rook;
        for (const [dc, dr] of dirs) {
          let x = c + dc, y = r + dr;
          while (this.has(pack(x, y))) {
            const p = this.board.get(pack(x, y));
            if (p) { if (p.col === by && (p.t === slider || p.t === PT.queen)) return true; break; }
            x += dc; y += dr;
          }
        }
      }
      return false;
    }
    inCheck(col) { return this.attacked(this.kings[col], col === W ? B : W); }

    // A pawn promotes only at the true frontier: no cell anywhere ahead in its
    // file. A single interior hole is not the edge, or holes would mint queens.
    atWorldEdge(c, r, col) {
      const dir = col === W ? 1 : -1;
      if (this.has(pack(c, r + dir))) return false;        // fast path
      for (let i = 2; i <= 40; i++) {
        const y = r + i * dir;
        if (this.has(pack(c, y))) return false;            // board resumes past the gap
      }
      return true;
    }

    // ---- make / unmake ----------------------------------------------------
    // move: {kind:'m',from,to} | {kind:'ac',cell} | {kind:'rc',cell} | {kind:'mc',from,to}
    make(m) {
      const side = this.turn;
      const u = { kind: m.kind, side };
      u.prevEp = this.ep;
      u.ha = this.ha; u.hb = this.hb;      // unmake restores these verbatim
      if (m.kind === 'm') {
        const p = this.board.get(m.from);
        u.from = m.from; u.to = m.to;
        u.captured = this.board.get(m.to) || null;
        u.wasMoved = p.moved; u.wasT = p.t;
        // en passant: the victim stands beside the destination
        if (m.castle) {
          u.rookFrom = m.rookFrom;
          u.rookTo = pack(upC(m.from) + m.castle, upR(m.from));
          const rk = this.board.get(m.rookFrom);
          u.rookWasMoved = rk.moved;
          this.board.delete(m.rookFrom);
          rk.moved = true;
          this.board.set(u.rookTo, rk);
        }
        if (m.ep) {
          u.epVictimSq = pack(upC(m.to), upR(m.from));
          u.epVictim = this.board.get(u.epVictimSq) || null;
          this.board.delete(u.epVictimSq);
        }
        this.board.delete(m.from);
        p.moved = true;
        // promote at edge of world (no cell anywhere ahead in this file)
        if (p.t === PT.pawn && this.atWorldEdge(upC(m.to), upR(m.to), p.col)) p.t = PT.queen;
        this.board.set(m.to, p);
        if (p.t === PT.king || u.wasT === PT.king) this.kings[p.col] = m.to;
        // a double step opens the window; everything else closes it
        this.ep = (u.wasT === PT.pawn && Math.abs(upR(m.to) - upR(m.from)) === 2)
          ? pack(upC(m.from), (upR(m.from) + upR(m.to)) / 2) : -1;
      } else if (m.kind === 'ac') { this.cells.add(m.cell); u.cell = m.cell; this.wildUsed[side]++; }
      else if (m.kind === 'rc') { this.cells.delete(m.cell); u.cell = m.cell; this.wildUsed[side]++; }
      else { this.cells.delete(m.from); this.cells.add(m.to); u.from = m.from; u.to = m.to; this.wildUsed[side]++; }
      if (m.kind !== 'm') this.ep = -1;
      // Hash delta, read off the undo record now that the board is settled.
      if (m.kind === 'm') {
        const np = this.board.get(m.to);
        this.xorPiece(m.from, u.wasT, side);                       // left the source
        if (u.captured) this.xorPiece(m.to, u.captured.t, u.captured.col);
        if (u.epVictim) this.xorPiece(u.epVictimSq, u.epVictim.t, u.epVictim.col);
        if (u.rookFrom !== undefined) {
          this.xorPiece(u.rookFrom, PT.rook, side);
          this.xorPiece(u.rookTo, PT.rook, side);
        }
        this.xorPiece(m.to, np.t, side);                           // arrived (post-promotion)
      } else if (m.kind === 'ac' || m.kind === 'rc') {
        this.xorCell(m.cell); this.cellVer++;
      } else {
        this.xorCell(m.from); this.xorCell(m.to); this.cellVer++;
      }
      this.counts[side]++;
      this.turn = side === W ? B : W;
      return u;
    }

    unmake(u) {
      this.turn = u.side;
      this.counts[u.side]--;
      this.ep = u.prevEp;
      this.ha = u.ha; this.hb = u.hb;
      if (u.kind !== 'm') this.cellVer++;       // terrain restored: bounds cache is stale
      if (u.kind === 'm') {
        const p = this.board.get(u.to);
        this.board.delete(u.to);
        if (u.captured) this.board.set(u.to, u.captured);
        if (u.epVictim) this.board.set(u.epVictimSq, u.epVictim);
        if (u.rookFrom !== undefined) {
          const rk = this.board.get(u.rookTo);
          this.board.delete(u.rookTo);
          rk.moved = u.rookWasMoved;
          this.board.set(u.rookFrom, rk);
        }
        p.t = u.wasT; p.moved = u.wasMoved;
        this.board.set(u.from, p);
        if (p.t === PT.king) this.kings[p.col] = u.from;
      } else if (u.kind === 'ac') { this.cells.delete(u.cell); this.wildUsed[u.side]--; }
      else if (u.kind === 'rc') { this.cells.add(u.cell); this.wildUsed[u.side]--; }
      else { this.cells.delete(u.to); this.cells.add(u.from); this.wildUsed[u.side]--; }
    }

    // ---- piece move generation (pseudo) -----------------------------------
    pieceMoves(onlyCaptures) {
      const side = this.turn, out = [];
      for (const [k, p] of this.board) {
        if (p.col !== side) continue;
        const c = upC(k), r = upR(k);
        const emit = (x, y) => {
          const tk = pack(x, y);
          if (!this.has(tk)) return 2;                     // hole: stop slide
          const t = this.board.get(tk);
          if (!t) { if (!onlyCaptures) out.push({ kind: 'm', from: k, to: tk, cap: 0 }); return 0; }
          if (t.col !== side) out.push({ kind: 'm', from: k, to: tk, cap: this.w.material[t.t] || 1 });
          return 1;                                        // blocked
        };
        switch (p.t) {
          case PT.pawn: {
            const dir = p.col === W ? 1 : -1;
            const f1 = pack(c, r + dir);
            if (!onlyCaptures && this.has(f1) && !this.board.get(f1)) {
              out.push({ kind: 'm', from: k, to: f1, cap: 0 });
              const f2 = pack(c, r + 2 * dir);
              if (!p.moved && this.has(f2) && !this.board.get(f2)) out.push({ kind: 'm', from: k, to: f2, cap: 0 });
            }
            for (const dc of [-1, 1]) {
              const tk = pack(c + dc, r + dir);
              if (!this.has(tk)) continue;
              const t = this.board.get(tk);
              if (t && t.col !== side) out.push({ kind: 'm', from: k, to: tk, cap: this.w.material[t.t] });
              else if (!t && tk === this.ep) {
                const victim = this.board.get(pack(c + dc, r));
                if (victim && victim.t === PT.pawn && victim.col !== side)
                  out.push({ kind: 'm', from: k, to: tk, cap: this.w.material[PT.pawn], ep: 1 });
              }
            }
            break;
          }
          case PT.knight:
            for (const [dc, dr] of KNIGHT) { const x = c + dc, y = r + dr; if (this.has(pack(x, y))) emit(x, y); }
            break;
          case PT.king: {
            for (const [dc, dr] of N8) { const x = c + dc, y = r + dr; if (this.has(pack(x, y))) emit(x, y); }
            // castling — path between king and rook must exist and be empty
            const foe = side === W ? B : W;
            if (!onlyCaptures && !p.moved && !this.attacked(k, foe)) {
              for (const dc of [1, -1]) {
                let x = c + dc;
                while (this.has(pack(x, r)) && !this.board.get(pack(x, r))) x += dc;
                if (!this.has(pack(x, r))) continue;                 // hole: path broken
                const rook = this.board.get(pack(x, r));
                if (!rook || rook.col !== side || rook.t !== PT.rook || rook.moved) continue;
                if (Math.abs(x - c) < 3) continue;
                if (this.attacked(pack(c + dc, r), foe)) continue;
                if (this.attacked(pack(c + 2 * dc, r), foe)) continue;
                out.push({ kind: 'm', from: k, to: pack(c + 2 * dc, r), cap: 0, castle: dc, rookFrom: pack(x, r) });
              }
            }
            break;
          }
          default: {
            const dirs = p.t === PT.bishop ? DIAG : p.t === PT.rook ? ORTHO : N8;
            for (const [dc, dr] of dirs) {
              let x = c + dc, y = r + dr;
              while (emit(x, y) === 0) { x += dc; y += dr; }
            }
          }
        }
      }
      return out;
    }

    // ---- wildcard candidate generation ------------------------------------
    // Cheap tactical scoring; returns top-K actions.
    wildcardMoves(K) {
      const side = this.turn, opp = side === W ? B : W;
      const ok = this.kings[side], ek = this.kings[opp];
      const okc = upC(ok), okr = upR(ok), ekc = upC(ek), ekr = upR(ek);

      // cells on slider lines from enemy sliders to my king (blocking spots)
      const blockSpots = new Set();
      for (const [k, p] of this.board) {
        if (p.col !== opp || (p.t !== PT.bishop && p.t !== PT.rook && p.t !== PT.queen)) continue;
        const dirs = p.t === PT.bishop ? DIAG : p.t === PT.rook ? ORTHO : N8;
        const sc = upC(k), sr = upR(k);
        for (const [dc, dr] of dirs) {
          const path = [];
          let x = sc + dc, y = sr + dr, hit = null;
          while (this.has(pack(x, y))) {
            const q = this.board.get(pack(x, y));
            if (q) { hit = pack(x, y); break; }
            path.push(pack(x, y));
            x += dc; y += dr;
          }
          if (hit === ok) for (const s of path) blockSpots.add(s);
        }
      }

      const cheb = (k, c2, r2) => Math.max(Math.abs(upC(k) - c2), Math.abs(upR(k) - r2));

      // removable empties
      const removes = [];
      if (this.cells.size > 1) for (const k of this.cells) {
        if (this.board.get(k)) continue;
        let s = 0;
        if (blockSpots.has(k)) s += 400;                       // cut a line to my king
        const dEK = cheb(k, ekc, ekr);
        if (dEK === 1) s += 60;                                // shrink enemy king's ring
        // freeze enemy pawn: enemy pawn directly "behind" this cell (it moves into k)
        const c = upC(k), r = upR(k);
        for (const col of [opp]) {
          const dir = col === W ? 1 : -1;
          const p = this.board.get(pack(c, r - dir));
          if (p && p.col === col && p.t === PT.pawn) s += 45 + 6 * Math.abs(r);
        }
        if (dEK >= 4 && cheb(k, okc, okr) >= 4 && s === 0) continue;   // ignore far quiet removes
        removes.push({ kind: 'rc', cell: k, s });
      }

      // addable spots (edge-adjacent perimeter, incl. holes)
      const addsSeen = new Set(), adds = [];
      for (const k of this.cells) {
        const c = upC(k), r = upR(k);
        for (const [dc, dr] of N4) {
          const nk = pack(c + dc, r + dr);
          if (this.has(nk) || addsSeen.has(nk)) continue;
          addsSeen.add(nk);
          let s = 0;
          const nc = c + dc, nr = r + dr;
          // reopen my slider line: does a my-slider "see" this spot through empties?
          if (this.attacked(nk, side)) s += 25;
          if (Math.max(Math.abs(nc - okc), Math.abs(nr - okr)) === 1) s += 50;  // escape square for my king
          // extend world above enemy pawn about to promote (denial)
          const dir = opp === W ? 1 : -1;
          const below = this.board.get(pack(nc, nr - dir));
          if (below && below.col === opp && below.t === PT.pawn) s += 55;
          if (Math.max(Math.abs(nc - ekc), Math.abs(nr - ekr)) <= 2) s += 15;
          adds.push({ kind: 'ac', cell: nk, s });
        }
      }

      removes.sort((a, b) => b.s - a.s);
      adds.sort((a, b) => b.s - a.s);
      const kR = Math.min(removes.length, Math.ceil(K / 2));
      const kA = Math.min(adds.length, Math.ceil(K / 2));
      const picks = [...removes.slice(0, kR), ...adds.slice(0, kA)];

      // square-moves: pair top sources with top targets
      const mvSrc = removes.slice(0, 4), mvDst = adds.slice(0, 4);
      for (const sM of mvSrc) for (const dM of mvDst) {
        if (sM.cell === dM.cell) continue;
        picks.push({ kind: 'mc', from: sM.cell, to: dM.cell, s: sM.s + dM.s - 10 });
      }
      picks.sort((a, b) => b.s - a.s);
      // optional rule experiment: restrict which board actions exist
      const allow = this.allowActions;
      const filtered = allow ? picks.filter(p => allow[p.kind] !== false) : picks;
      return filtered.slice(0, K);
    }

    // all legal actions for side to move (used by search)
    genAll(K) {
      const moves = this.pieceMoves(false);
      if (this.eligible(this.turn)) moves.push(...this.wildcardMoves(K));
      const side = this.turn, legal = [];
      for (const m of moves) {
        const u = this.make(m);
        if (!this.inCheck(side)) legal.push(m);
        this.unmake(u);
      }
      return legal;
    }

    // ---- evaluation (White POV, centipawns) -------------------------------
    evaluate() {
      const w = this.w;
      let score = 0;
      this.bounds();
      const cx = (this.bMinC + this.bMaxC) / 2, cy = (this.bMinR + this.bMaxR) / 2;
      const hw = Math.max(1, (this.bMaxC - this.bMinC) / 2);
      const hh = Math.max(1, (this.bMaxR - this.bMinR) / 2);
      // 1.0 at the board's centre, 0.0 at its rim — the shape-agnostic stand-in
      // for a piece-square table.
      const central = (c, r) => 1 - (Math.abs(c - cx) / hw + Math.abs(r - cy) / hh) / 2;

      // Pawn files, for structure terms. Built once per eval.
      const pf = [new Map(), new Map()];       // [white, black] file -> count
      let nonPawn = 0, bishops = [0, 0];
      for (const [k, p] of this.board) {
        if (p.t === PT.pawn) {
          const c = upC(k);
          pf[p.col].set(c, (pf[p.col].get(c) || 0) + 1);
        } else if (p.t !== PT.king) {
          nonPawn += w.material[p.t];
          if (p.t === PT.bishop) bishops[p.col]++;
        }
      }
      // Game phase: 1 = opening (lots of material), 0 = bare endgame. Kings
      // want opposite things at the two extremes, so their term is tapered.
      const phase = Math.max(0, Math.min(1, nonPawn / 6800));

      if (bishops[W] >= 2) score += w.bishopPair;
      if (bishops[B] >= 2) score -= w.bishopPair;

      for (const [k, p] of this.board) {
        const sign = p.col === W ? 1 : -1;
        score += sign * w.material[p.t];
        const c = upC(k), r = upR(k);
        if (p.t === PT.pawn) {
          const dir = p.col === W ? 1 : -1;
          const holeAhead = !this.has(pack(c, r + dir));
          if (holeAhead) score += sign * w.frozenPawn;
          // advancement: fewer steps to the world's edge in this file = better
          let steps = 0, y = r + dir;
          while (this.has(pack(c, y)) && steps < 12) { steps++; y += dir; }
          score += sign * w.pawnAdv * Math.max(0, 8 - steps);

          // structure
          if ((pf[p.col].get(c) || 0) > 1) score += sign * w.doubledPawn;
          if (!(pf[p.col].get(c - 1) || 0) && !(pf[p.col].get(c + 1) || 0)) {
            score += sign * w.isolatedPawn;
          }
          // passed: no enemy pawn on this file or the two beside it, ahead of us
          const foe = p.col === W ? B : W;
          let passed = true;
          for (let d = -1; d <= 1 && passed; d++) {
            if (!(pf[foe].get(c + d) || 0)) continue;
            for (const [kk, q] of this.board) {
              if (q.t !== PT.pawn || q.col !== foe || upC(kk) !== c + d) continue;
              if ((upR(kk) - r) * dir > 0) { passed = false; break; }
            }
          }
          if (passed) score += sign * w.passedPawn * (1 - Math.max(0, Math.min(8, steps)) / 8);
        } else if (p.t !== PT.king) {
          let mob = 0;
          if (p.t === PT.knight) {
            for (const [dc, dr] of KNIGHT) {
              const tk = pack(c + dc, r + dr);
              if (this.has(tk) && (!this.board.get(tk) || this.board.get(tk).col !== p.col)) mob++;
            }
            score += sign * w.centerN * central(c, r);
          } else {
            const dirs = p.t === PT.bishop ? DIAG : p.t === PT.rook ? ORTHO : N8;
            for (const [dc, dr] of dirs) {
              let x = c + dc, y2 = r + dr;
              while (this.has(pack(x, y2))) {
                const q = this.board.get(pack(x, y2));
                if (q) { if (q.col !== p.col) mob++; break; }
                mob++; x += dc; y2 += dr;
              }
            }
            if (p.t === PT.bishop) score += sign * w.centerB * central(c, r);
            else if (p.t === PT.queen) score += sign * w.centerQ * central(c, r);
            else if (p.t === PT.rook) {
              const own = pf[p.col].get(c) || 0;
              const opp = pf[p.col === W ? B : W].get(c) || 0;
              if (!own && !opp) score += sign * w.rookOpen;
              else if (!own) score += sign * w.rookSemi;
            }
          }
          score += sign * w.mobility * mob;
        } else {
          // terrain safety: how much floor the king still has around it
          let ring = 0;
          for (const [dc, dr] of N8) if (this.has(pack(c + dc, r + dr))) ring++;
          score += sign * w.kingRing * (ring - 5);
          // tapered: hide in the opening, march in the endgame
          const ctr = central(c, r);
          score += sign * (phase * -w.kingShelter * ctr + (1 - phase) * w.kingActive * ctr);
        }
      }
      score += (this.turn === W ? 1 : -1) * w.tempo;
      return score;
    }

    // ---- search -----------------------------------------------------------
    quiesce(alpha, beta, colorSign) {
      const stand = colorSign * this.evaluate();
      if (stand >= beta) return beta;
      if (stand > alpha) alpha = stand;
      const caps = this.pieceMoves(true).sort((a, b) => b.cap - a.cap);
      const side = this.turn;
      // Delta pruning: if winning the captured piece outright still leaves us
      // far below alpha, the capture cannot rescue this line. Skipped in very
      // sharp positions (a big swing already on the board) to stay safe.
      const DELTA = 120;
      for (const m of caps) {
        if (m.cap && stand + m.cap + DELTA < alpha) continue;
        const u = this.make(m);
        if (this.inCheck(side)) { this.unmake(u); continue; }
        const s = -this.quiesce(-beta, -alpha, -colorSign);
        this.unmake(u);
        if (s >= beta) return beta;
        if (s > alpha) alpha = s;
      }
      return alpha;
    }

    // ---- move ordering -------------------------------------------------
    // A stable integer identity for a move, so killers and history can be
    // remembered across nodes without allocating.
    mkey(m) {
      const a = m.from !== undefined ? m.from : (m.cell !== undefined ? m.cell : 0);
      const b = m.to !== undefined ? m.to : 0;
      const k = m.kind === 'm' ? 0 : m.kind === 'mc' ? 1 : m.kind === 'ac' ? 2 : 3;
      return ((k * 262144) + a) * 262144 + b;
    }

    // Best-first ordering is what makes alpha-beta actually cut: the hash move,
    // then captures by victim value, then moves that caused a cutoff at this
    // ply before (killers), then moves good anywhere so far (history).
    order(moves, ply, ttKey) {
      const kl = this.killers[ply];
      const k1 = kl ? kl[0] : 0, k2 = kl ? kl[1] : 0;
      for (const m of moves) {
        const key = this.mkey(m);
        let sc;
        if (ttKey && key === ttKey) sc = 1e9;
        else if (m.cap) sc = 1e6 + m.cap;
        else if (key === k1) sc = 9e5;
        else if (key === k2) sc = 8e5;
        else sc = (this.hist.get(key) || 0) + (m.s || 0);
        m._o = sc;
      }
      moves.sort((a, b) => b._o - a._o);
    }

    // Null-move pruning is unsound in zugzwang, which needs real material.
    hasNonPawn(side) {
      for (const q of this.board.values()) {
        if (q.col === side && q.t !== PT.pawn && q.t !== PT.king) return true;
      }
      return false;
    }

    makeNull() {
      const u = { ep: this.ep, side: this.turn };
      this.ep = -1;
      this.counts[this.turn]++;      // keep the board-turn cadence coherent
      this.turn = this.turn === W ? B : W;
      return u;
    }
    unmakeNull(u) {
      this.turn = u.side;
      this.counts[u.side]--;
      this.ep = u.ep;
    }

    negamax(depth, alpha, beta, colorSign, ply, K, deadline) {
      if (deadline && (this.nodes & 2047) === 0 && Date.now() > deadline) throw 'TIME';
      const side = this.turn;
      const inChk = this.inCheck(side);
      if (inChk) depth++;                                  // check extension
      if (depth <= 0) return this.quiesce(alpha, beta, colorSign);
      this.nodes++;

      const alphaOrig = alpha;

      // ---- transposition table probe ----
      const h = this.hash();
      const te = this.tt.get(h.a);
      let ttMoveKey = 0;
      if (te && te.b === h.b) {
        ttMoveKey = te.mk;
        if (te.depth >= depth) {
          if (te.flag === 0) return te.score;                         // exact
          if (te.flag === 1) { if (te.score > alpha) alpha = te.score; }   // lower
          else if (te.flag === 2) { if (te.score < beta) beta = te.score; } // upper
          if (alpha >= beta) return te.score;
        }
      }

      // ---- reverse futility ----
      // Shallow node standing far ABOVE beta even after conceding a healthy
      // margin: the opponent will avoid this line, so do not spend nodes on it.
      if (!inChk && depth <= 3 && Math.abs(beta) < MATE - 200) {
        const stat = colorSign * this.evaluate();
        if (stat - 130 * depth >= beta) return beta;
      }

      // ---- null move pruning ----
      // If skipping a turn still leaves the opponent unable to reach beta, this
      // node is far too good for them and can be cut without searching it.
      if (!inChk && depth >= 3 && Math.abs(beta) < MATE - 200 && this.hasNonPawn(side)) {
        const R = depth > 6 ? 3 : 2;
        const nu = this.makeNull();
        const nv = -this.negamax(depth - 1 - R, -beta, -beta + 1, -colorSign, ply + 1, K, deadline);
        this.unmakeNull(nu);
        if (nv >= beta) return beta;
      }

      const moves = this.pieceMoves(false);
      if (this.eligible(side)) moves.push(...this.wildcardMoves(K));
      this.order(moves, ply, ttMoveKey);

      let best = -Infinity, bestMove = 0, anyLegal = false, i = 0;
      for (const m of moves) {
        const u = this.make(m);
        if (this.inCheck(side)) { this.unmake(u); continue; }
        anyLegal = true;
        const quiet = !m.cap;
        let s;
        if (i === 0) {
          s = -this.negamax(depth - 1, -beta, -alpha, -colorSign, ply + 1, K, deadline);
        } else {
          // Late move reduction: quiet moves this far down the order are rarely
          // best, so look shallower first and re-search only on a surprise.
          let red = 0;
          if (quiet && depth >= 3 && i >= 4) red = i >= 8 ? 2 : 1;
          s = -this.negamax(depth - 1 - red, -alpha - 1, -alpha, -colorSign, ply + 1, K, deadline);
          if (s > alpha && (red > 0 || s < beta)) {         // PVS / LMR re-search
            s = -this.negamax(depth - 1, -beta, -alpha, -colorSign, ply + 1, K, deadline);
          }
        }
        this.unmake(u);
        i++;
        if (s > best) { best = s; bestMove = this.mkey(m); }
        if (s > alpha) alpha = s;
        if (alpha >= beta) {
          if (quiet) {                                     // remember what cut
            const key = this.mkey(m);
            const ks = this.killers[ply] || (this.killers[ply] = [0, 0]);
            if (ks[0] !== key) { ks[1] = ks[0]; ks[0] = key; }
            this.hist.set(key, (this.hist.get(key) || 0) + depth * depth);
          }
          break;
        }
      }
      if (!anyLegal) return inChk ? -MATE + ply : 0;

      if (this.tt.size < 400000) {
        this.tt.set(h.a, {
          b: h.b, depth: depth, score: best, mk: bestMove,
          flag: best <= alphaOrig ? 2 : (best >= beta ? 1 : 0),
        });
      }
      return best;
    }

    // returns {move, score, depth, nodes, pv?}
    search(opts = {}) {
      const K = opts.K || 12;
      const maxDepth = opts.depth || 4;
      const movetime = opts.movetime || 0;
      const deadline = movetime ? Date.now() + movetime : 0;
      const jitter = opts.jitter || 0;
      const rand = rng(opts.seed || 1);
      this.nodes = 0;
      this.killers = [];
      this.hist = new Map();
      this.tt = new Map();

      const side = this.turn;
      const colorSign = side === W ? 1 : -1;
      const rootMoves = this.genAll(K);
      if (!rootMoves.length) return { move: null, score: this.inCheck(side) ? -MATE : 0, depth: 0, nodes: 0 };

      const kb = this.w.kindBias || {};
      const adjFor = (m) => (m.kind === 'm' ? 0 : (kb[m.kind] || 0));
      // Personality bots re-rank by kindBias after searching, so a narrow window
      // could prune a move their bias would still have preferred. They search
      // full-width; the unbiased analysis engine gets the fast path.
      const biased = !!(kb.ac || kb.rc || kb.mc) || jitter > 0;

      let bestMove = rootMoves[0], bestScore = -Infinity, lastDepth = 0;
      for (let d = 1; d <= maxDepth; d++) {
        let curBest = null, curScore = -Infinity;
        try {
          const scored = [];
          // Aspiration window: after depth 3 the score rarely moves far between
          // iterations, so search a narrow band around the last one and widen
          // only if it falls outside. Unbiased searches only — a personality
          // bot re-ranks by kindBias afterwards, and a narrow window could have
          // pruned the move its bias would have chosen.
          let lo = -Infinity, hi = Infinity;
          if (!biased && d >= 4 && Math.abs(bestScore) < MATE - 200) {
            lo = bestScore - 45; hi = bestScore + 45;
          }
          let curRaw = -Infinity, alpha = lo, n = 0;
          for (const m of rootMoves) {
            const u = this.make(m);
            let s;
            if (biased || n === 0) {
              s = -this.negamax(d - 1, -Infinity, -alpha, -colorSign, 1, K, deadline);
            } else {
              s = -this.negamax(d - 1, -alpha - 1, -alpha, -colorSign, 1, K, deadline);
              if (s > alpha) s = -this.negamax(d - 1, -Infinity, -alpha, -colorSign, 1, K, deadline);
            }
            this.unmake(u);
            n++;
            const sAdj = s + adjFor(m);
            scored.push({ m, s: sAdj, raw: s });
            if (sAdj > curScore) { curScore = sAdj; curBest = m; curRaw = s; }
            if (!biased && s > alpha) alpha = s;
          }
          // The window was too tight — nothing landed inside it. Redo this
          // depth full-width rather than trusting a bounded score.
          if (lo !== -Infinity && (curScore <= lo || curScore >= hi)) {
            const wide = [];
            let wAlpha = -Infinity, wBest = null, wScore = -Infinity, wRaw = -Infinity, k = 0;
            for (const m of rootMoves) {
              const u = this.make(m);
              const sc = -this.negamax(d - 1, -Infinity, -wAlpha, -colorSign, 1, K, deadline);
              this.unmake(u);
              k++;
              const a2 = sc + adjFor(m);
              wide.push({ m, s: a2, raw: sc });
              if (a2 > wScore) { wScore = a2; wBest = m; wRaw = sc; }
              if (sc > wAlpha) wAlpha = sc;
            }
            scored.length = 0; scored.push(...wide);
            curScore = wScore; curBest = wBest; curRaw = wRaw;
          }
          if (jitter > 0) {
            const near = scored.filter(x => x.s >= curScore - jitter);
            const pick = near[Math.floor(rand() * near.length)];
            curBest = pick.m; curScore = pick.s;
          }
          bestMove = curBest; bestScore = curRaw; lastDepth = d;
          scored.sort((a, b) => b.s - a.s);
          rootMoves.length = 0; rootMoves.push(...scored.map(x => x.m));
          if (Math.abs(curScore) > MATE - 100) break;
        } catch (e) {
          if (e === 'TIME') break; else throw e;
        }
      }
      return { move: bestMove, score: bestScore, depth: lastDepth, nodes: this.nodes };
    }
  }

  // convert AI move back into Game API terms
  function moveToGame(m) {
    if (!m) return null;
    const f = m.from !== undefined ? { c: upC(m.from), r: upR(m.from) } : null;
    const t = m.to !== undefined ? { c: upC(m.to), r: upR(m.to) } : null;
    const cell = m.cell !== undefined ? { c: upC(m.cell), r: upR(m.cell) } : null;
    return { kind: m.kind, from: f, to: t, cell };
  }

  function applyToGame(game, gm) {
    if (!gm) return false;
    if (gm.kind === 'm') return game.makeMove(gm.from.c, gm.from.r, gm.to.c, gm.to.r);
    if (gm.kind === 'ac') return game.wildcardAddCell(gm.cell.c, gm.cell.r);
    if (gm.kind === 'rc') return game.wildcardRemoveCell(gm.cell.c, gm.cell.r);
    if (gm.kind === 'mc') return game.wildcardMoveCell(gm.from.c, gm.from.r, gm.to.c, gm.to.r);
    return false;
  }

  // ---- difficulty ladder --------------------------------------------------
  // Strength is shaped by three dials: search depth (how far it sees),
  // jitter (how loosely it picks among near-best moves), and blunder
  // (chance it ignores the search entirely and plays a random legal action).
  const LEVELS = [
    { id: 1, name: 'Beginner', depth: 1, K: 4,  movetime: 250,  jitter: 130, blunder: 0.30, blurb: 'Sees one move ahead. Hangs pieces freely.' },
    { id: 2, name: 'Casual',   depth: 2, K: 6,  movetime: 600,  jitter: 70,  blunder: 0.12, blurb: 'Spots simple captures and threats.' },
    { id: 3, name: 'Medium',   depth: 3, K: 10, movetime: 1200, jitter: 25,  blunder: 0.03, blurb: 'Plans ahead and uses board wildcards with purpose.' },
    { id: 4, name: 'Strong',   depth: 4, K: 12, movetime: 1200, jitter: 0,   blunder: 0,    blurb: 'Punishes mistakes. Real terrain tactics.' },
    { id: 5, name: 'Brutal',   depth: 6, K: 16, movetime: 1400, jitter: 0,   blunder: 0,    blurb: 'Deepest search the clock allows.' },
  ];
  const levelById = (id) => LEVELS.find(l => l.id === +id) || LEVELS[2];

  // Pick an action at the given difficulty. Returns a search result, plus
  // {level, blundered}. seed is optional (harness reproducibility).
  function chooseMove(pos, levelId, seed) {
    const lv = levelById(levelId);
    const rand = seed != null ? rng(seed) : Math.random;
    if (lv.blunder > 0 && rand() < lv.blunder) {
      const all = pos.genAll(lv.K);
      if (all.length) {
        return { move: all[Math.floor(rand() * all.length)], score: 0, depth: 0, nodes: 0, level: lv.name, blundered: true };
      }
    }
    const res = pos.search({
      depth: lv.depth, K: lv.K, movetime: lv.movetime, jitter: lv.jitter,
      seed: seed != null ? seed : (Math.random() * 1e9) | 0,
    });
    res.level = lv.name; res.blundered = false;
    return res;
  }

  // Pick an action for a persona: {depth,K,movetime,jitter,blunder,weights}.
  function chooseMoveFor(pos, persona, seed) {
    const rand = seed != null ? rng(seed) : Math.random;
    if (persona.blunder > 0 && rand() < persona.blunder) {
      const all = pos.genAll(persona.K || 10);
      if (all.length) return { move: all[Math.floor(rand() * all.length)], score: 0, depth: 0, nodes: 0, blundered: true };
    }
    const res = pos.search({
      depth: persona.depth || 3, K: persona.K || 10,
      movetime: persona.movetime || 1200, jitter: persona.jitter || 0,
      seed: seed != null ? seed : (Math.random() * 1e9) | 0,
    });
    res.blundered = false;
    return res;
  }

  const API = { Pos, moveToGame, applyToGame, DEFAULT_WEIGHTS, PT, PT_NAME, MATE, LEVELS, levelById, chooseMove, chooseMoveFor };
  if (typeof module !== 'undefined') module.exports = API;
  if (typeof window !== 'undefined') window.WCAI = API;
})();
