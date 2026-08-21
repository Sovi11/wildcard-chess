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
      this.cadence = (spec.rules && spec.rules.cadence) || 2;
      this.budget = (spec.rules && spec.rules.budget != null) ? spec.rules.budget : Infinity;
      this.wildUsed = spec.wildUsed ? [spec.wildUsed.white, spec.wildUsed.black] : [0, 0];
      this.w = weights || DEFAULT_WEIGHTS;
      this.nodes = 0;
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
        rules: game.rules, wildUsed: game.wildUsed,
      }, weights);
    }

    eligible(col) {
      return this.counts[col] % this.cadence === this.cadence - 1 && this.wildUsed[col] < this.budget;
    }
    has(k) { return this.cells.has(k); }

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

    // ---- make / unmake ----------------------------------------------------
    // move: {kind:'m',from,to} | {kind:'ac',cell} | {kind:'rc',cell} | {kind:'mc',from,to}
    make(m) {
      const side = this.turn;
      const u = { kind: m.kind, side };
      if (m.kind === 'm') {
        const p = this.board.get(m.from);
        u.from = m.from; u.to = m.to;
        u.captured = this.board.get(m.to) || null;
        u.wasMoved = p.moved; u.wasT = p.t;
        this.board.delete(m.from);
        p.moved = true;
        // promote at edge of world
        if (p.t === PT.pawn) {
          const dir = p.col === W ? 1 : -1;
          if (!this.has(pack(upC(m.to), upR(m.to) + dir))) p.t = PT.queen;
        }
        this.board.set(m.to, p);
        if (p.t === PT.king || u.wasT === PT.king) this.kings[p.col] = m.to;
      } else if (m.kind === 'ac') { this.cells.add(m.cell); u.cell = m.cell; this.wildUsed[side]++; }
      else if (m.kind === 'rc') { this.cells.delete(m.cell); u.cell = m.cell; this.wildUsed[side]++; }
      else { this.cells.delete(m.from); this.cells.add(m.to); u.from = m.from; u.to = m.to; this.wildUsed[side]++; }
      this.counts[side]++;
      this.turn = side === W ? B : W;
      return u;
    }

    unmake(u) {
      this.turn = u.side;
      this.counts[u.side]--;
      if (u.kind === 'm') {
        const p = this.board.get(u.to);
        this.board.delete(u.to);
        if (u.captured) this.board.set(u.to, u.captured);
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
            }
            break;
          }
          case PT.knight:
            for (const [dc, dr] of KNIGHT) { const x = c + dc, y = r + dr; if (this.has(pack(x, y))) emit(x, y); }
            break;
          case PT.king:
            for (const [dc, dr] of N8) { const x = c + dc, y = r + dr; if (this.has(pack(x, y))) emit(x, y); }
            break;
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

      // addable spots (perimeter incl. holes)
      const addsSeen = new Set(), adds = [];
      for (const k of this.cells) {
        const c = upC(k), r = upR(k);
        for (const [dc, dr] of N8) {
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
      return picks.slice(0, K);
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
      for (const [k, p] of this.board) {
        const sign = p.col === W ? 1 : -1;
        score += sign * w.material[p.t];
        const c = upC(k), r = upR(k);
        if (p.t === PT.pawn) {
          const dir = p.col === W ? 1 : -1;
          const aheadK = pack(c, r + dir);
          // frozen: hole directly ahead (can still capture diagonally, but can't advance)
          const holeAhead = !this.has(aheadK);
          if (holeAhead) score += sign * w.frozenPawn;
          // advancement: fewer steps to the world's edge in this file = better
          let steps = 0, y = r + dir;
          while (this.has(pack(c, y)) && steps < 12) { steps++; y += dir; }
          score += sign * w.pawnAdv * Math.max(0, 8 - steps);
        } else if (p.t !== PT.king) {
          // mobility
          let mob = 0;
          if (p.t === PT.knight) {
            for (const [dc, dr] of KNIGHT) { const tk = pack(c + dc, r + dr); if (this.has(tk) && (!this.board.get(tk) || this.board.get(tk).col !== p.col)) mob++; }
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
          }
          score += sign * w.mobility * mob;
        } else {
          // king ring: existing cells around king (terrain safety/escape room)
          let ring = 0;
          for (const [dc, dr] of N8) if (this.has(pack(c + dc, r + dr))) ring++;
          score += sign * w.kingRing * (ring - 5);
        }
      }
      score += (this.turn === W ? 1 : -1) * w.tempo;
      return score;
    }

    // ---- search -----------------------------------------------------------
    quiesce(alpha, beta, colorSign) {
      this.nodes++;
      const stand = colorSign * this.evaluate();
      if (stand >= beta) return beta;
      if (stand > alpha) alpha = stand;
      const caps = this.pieceMoves(true).sort((a, b) => b.cap - a.cap);
      const side = this.turn;
      for (const m of caps) {
        const u = this.make(m);
        if (this.inCheck(side)) { this.unmake(u); continue; }
        const s = -this.quiesce(-beta, -alpha, -colorSign);
        this.unmake(u);
        if (s >= beta) return beta;
        if (s > alpha) alpha = s;
      }
      return alpha;
    }

    negamax(depth, alpha, beta, colorSign, ply, K, deadline) {
      if (deadline && this.nodes % 2048 === 0 && Date.now() > deadline) throw 'TIME';
      if (depth === 0) return this.quiesce(alpha, beta, colorSign);
      this.nodes++;
      const side = this.turn;
      const moves = this.pieceMoves(false);
      if (this.eligible(side)) moves.push(...this.wildcardMoves(K));
      moves.sort((a, b) => (b.cap || b.s || 0) - (a.cap || a.s || 0));

      let best = -Infinity, anyLegal = false;
      for (const m of moves) {
        const u = this.make(m);
        if (this.inCheck(side)) { this.unmake(u); continue; }
        anyLegal = true;
        const s = -this.negamax(depth - 1, -beta, -alpha, -colorSign, ply + 1, K, deadline);
        this.unmake(u);
        if (s > best) best = s;
        if (s > alpha) alpha = s;
        if (alpha >= beta) break;
      }
      if (!anyLegal) return this.inCheck(side) ? -MATE + ply : 0;
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

      const side = this.turn;
      const colorSign = side === W ? 1 : -1;
      const rootMoves = this.genAll(K);
      if (!rootMoves.length) return { move: null, score: this.inCheck(side) ? -MATE : 0, depth: 0, nodes: 0 };

      let bestMove = rootMoves[0], bestScore = -Infinity, lastDepth = 0;
      for (let d = 1; d <= maxDepth; d++) {
        let curBest = null, curScore = -Infinity;
        try {
          const scored = [];
          for (const m of rootMoves) {
            const u = this.make(m);
            const s = -this.negamax(d - 1, -Infinity, Infinity, -colorSign, 1, K, deadline);
            this.unmake(u);
            scored.push({ m, s });
            if (s > curScore) { curScore = s; curBest = m; }
          }
          // root jitter: pick among near-best for self-play variety
          if (jitter > 0) {
            const near = scored.filter(x => x.s >= curScore - jitter);
            const pick = near[Math.floor(rand() * near.length)];
            curBest = pick.m; curScore = pick.s;
          }
          bestMove = curBest; bestScore = curScore; lastDepth = d;
          // order root moves by score for next iteration
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
    { id: 4, name: 'Strong',   depth: 4, K: 12, movetime: 2000, jitter: 0,   blunder: 0,    blurb: 'Punishes mistakes. Real terrain tactics.' },
    { id: 5, name: 'Brutal',   depth: 6, K: 16, movetime: 3500, jitter: 0,   blunder: 0,    blurb: 'Deepest search the clock allows.' },
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

  const API = { Pos, moveToGame, applyToGame, DEFAULT_WEIGHTS, PT, PT_NAME, MATE, LEVELS, levelById, chooseMove };
  if (typeof module !== 'undefined') module.exports = API;
  if (typeof window !== 'undefined') window.WCAI = API;
})();
