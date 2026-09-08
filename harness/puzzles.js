// Hollow Chess puzzle generator: mate-in-1 / 2 / 3 where the board move matters.
//
// Positions come from bot self-play (so they look like real games and already
// have holes). For each one we run an exact mate search on the fast AI board:
// the DEFENDER's replies are exhaustive (every piece move, every legal square
// move when eligible); the ATTACKER's candidates are every piece move plus the
// square moves that can matter (fill a hole to open a line = discovered check,
// remove a flight square, cut a defender's line). A puzzle is kept only when
//   - the mate is forced, no shorter mate exists, and the key move is unique,
//   - the attacker's solution contains at least one square move,
//   - the whole solution tree re-verifies against engine.js (the rules authority),
//     enumerating the defender's legal replies with the engine itself.
//
//   node harness/puzzles.js [--games 120] [--depth 2] [--seed 7] [--out shorts/puzzles.json]

const path = require('path');
const fs = require('fs');
const { Game, sq } = require(path.join(__dirname, '..', 'js', 'engine.js'));
const { Pos, moveToGame, applyToGame, PT, PT_NAME, chooseMoveFor } = require(path.join(__dirname, '..', 'js', 'ai.js'));

const args = process.argv.slice(2);
const arg = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const N_GAMES = +arg('games', 120);
const DEPTH = +arg('depth', 2);
const SEED = +arg('seed', 7);
const OUT = path.resolve(arg('out', path.join(__dirname, '..', 'shorts', 'puzzles.json')));
const WANT = { 1: +arg('m1', 6), 2: +arg('m2', 14), 3: +arg('m3', 6) };   // candidates to collect per length
const BLUNDER = +arg('blunder', 0.06);   // base blunder rate of the self-play bots (more = more mates)

const pack = (c, r) => ((c + 128) << 10) | (r + 128);
const upC = (k) => (k >> 10) - 128;
const upR = (k) => (k & 1023) - 128;
const N4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const W = 0, B = 1;

let nodes = 0, budget = 0;
class Budget extends Error {}
const tick = () => { if (++nodes > budget) throw new Budget('budget'); };

// ---- move generation on Pos -------------------------------------------------
function legalPieceMoves(pos) {
  const side = pos.turn, out = [];
  for (const m of pos.pieceMoves(false)) {
    const u = pos.make(m); tick();
    if (!pos.inCheck(side)) out.push(m);
    pos.unmake(u);
  }
  return out;
}

function attachTargetsExcluding(pos, src) {
  const dests = new Set();
  for (const k of pos.cells) {
    if (k === src) continue;
    const c = upC(k), r = upR(k);
    for (const [dc, dr] of N4) {
      const nk = pack(c + dc, r + dr);
      if (nk !== src && !pos.cells.has(nk)) dests.add(nk);
    }
  }
  return dests;
}

// Cells strictly between a sliding checker and the king (empty of pieces, may
// include holes). Returns null if some checker cannot be blocked (knight, pawn,
// king, or contact check).
function checkers(pos, side) {
  const kk = pos.kings[side], kc = upC(kk), kr = upR(kk), by = side === W ? B : W;
  const out = [];
  for (const [k, p] of pos.board) {
    if (p.col !== by) continue;
    const c = upC(k), r = upR(k), dc = c - kc, dr = r - kr;
    if (p.t === PT.knight) { if ((Math.abs(dc) === 1 && Math.abs(dr) === 2) || (Math.abs(dc) === 2 && Math.abs(dr) === 1)) out.push({ k, between: null }); continue; }
    if (p.t === PT.pawn) { const pdir = by === W ? 1 : -1; if (Math.abs(dc) === 1 && kr - r === pdir) out.push({ k, between: null }); continue; }
    if (p.t === PT.king) { if (Math.max(Math.abs(dc), Math.abs(dr)) === 1) out.push({ k, between: null }); continue; }
    const diag = Math.abs(dc) === Math.abs(dr) && dc !== 0, orth = (dc === 0) !== (dr === 0);
    if (!(diag || orth)) continue;
    if (p.t === PT.bishop && !diag) continue;
    if (p.t === PT.rook && !orth) continue;
    const sc = Math.sign(dc), sr = Math.sign(dr);
    const between = [];
    let x = kc + sc, y = kr + sr, blocked = false;
    while (x !== c || y !== r) {
      const ck = pack(x, y);
      if (!pos.cells.has(ck) || pos.board.get(ck)) { blocked = true; break; }
      between.push(ck); x += sc; y += sr;
    }
    if (!blocked) out.push({ k, between });
  }
  return out;
}

// Every legal square move for the side to move. In check only removals from the
// check line can be legal, which keeps this small exactly when it matters.
function legalSquareMovesExhaustive(pos) {
  const side = pos.turn;
  if (!pos.eligible(side) || pos.cells.size <= 1) return [];
  let sources;
  if (pos.inCheck(side)) {
    const cs = checkers(pos, side);
    if (cs.some((c) => !c.between || c.between.length === 0)) return [];
    let set = new Set(cs[0].between);
    for (let i = 1; i < cs.length; i++) set = new Set(cs[i].between.filter((k) => set.has(k)));
    sources = [...set].filter((k) => pos.cells.has(k));
  } else {
    sources = [...pos.cells].filter((k) => !pos.board.get(k));
  }
  const out = [];
  for (const src of sources) {
    for (const d of attachTargetsExcluding(pos, src)) {
      const m = { kind: 'mc', from: src, to: d };
      const u = pos.make(m); tick();
      if (!pos.inCheck(side)) out.push(m);
      pos.unmake(u);
    }
  }
  return out;
}

// Holes that, if filled, open a line from one of `side`'s sliders to a target
// square (the enemy king, or a square next to it for mating-net purposes).
function fillSpots(pos, side, targetK) {
  const spots = new Set();
  const tc = upC(targetK), tr = upR(targetK);
  for (const [k, p] of pos.board) {
    if (p.col !== side || (p.t !== PT.bishop && p.t !== PT.rook && p.t !== PT.queen)) continue;
    const c = upC(k), r = upR(k), dc = tc - c, dr = tr - r;
    const diag = Math.abs(dc) === Math.abs(dr) && dc !== 0, orth = (dc === 0) !== (dr === 0);
    if (!(diag || orth)) continue;
    if (p.t === PT.bishop && !diag) continue;
    if (p.t === PT.rook && !orth) continue;
    const sc = Math.sign(dc), sr = Math.sign(dr);
    let x = c + sc, y = r + sr, hole = -1, ok = true;
    while (x !== tc || y !== tr) {
      const ck = pack(x, y);
      if (pos.board.get(ck)) { ok = false; break; }
      if (!pos.cells.has(ck)) { if (hole >= 0) { ok = false; break; } hole = ck; }
      x += sc; y += sr;
    }
    if (ok && hole >= 0) spots.add(hole);
  }
  return spots;
}

const cheb = (a, b) => Math.max(Math.abs(upC(a) - upC(b)), Math.abs(upR(a) - upR(b)));

// Attacker square-move candidates: every source that can matter x every
// destination that can matter, plus one "harmless" partner for each so that
// pure removal and pure fill ideas are both covered.
function attackerSquareMoves(pos, exhaustiveSources) {
  const side = pos.turn, opp = side === W ? B : W;
  if (!pos.eligible(side) || pos.cells.size <= 1) return [];
  const ek = pos.kings[opp], ok = pos.kings[side];
  const empties = [...pos.cells].filter((k) => !pos.board.get(k));
  // destinations that matter: holes that open one of my lines onto the king or its ring
  const dests = new Set(fillSpots(pos, side, ek));
  for (const [dc, dr] of N8) {
    const rk = pack(upC(ek) + dc, upR(ek) + dr);
    if (pos.cells.has(rk) && !pos.board.get(rk)) for (const s of fillSpots(pos, side, rk)) dests.add(s);
  }
  // sources that matter: king ring, and cells on enemy slider lines to the king ring
  const srcSet = new Set();
  for (const k of empties) if (cheb(k, ek) <= 1) srcSet.add(k);
  for (const [k, p] of pos.board) {
    if (p.col !== opp || (p.t !== PT.bishop && p.t !== PT.rook && p.t !== PT.queen)) continue;
    const dirs = p.t === PT.bishop ? DIAG : p.t === PT.rook ? ORTHO : N8;
    const c = upC(k), r = upR(k);
    for (const [dc, dr] of dirs) {
      let x = c + dc, y = r + dr;
      const path = [];
      while (pos.cells.has(pack(x, y)) && !pos.board.get(pack(x, y))) {
        path.push(pack(x, y));
        if (cheb(pack(x, y), ek) <= 1) { for (const s of path) srcSet.add(s); break; }
        x += dc; y += dr;
      }
    }
  }
  if (exhaustiveSources) for (const k of empties) srcSet.add(k);
  // harmless partners: far from both kings
  const far = (arr) => arr.slice().sort((a, b) => (cheb(b, ek) + cheb(b, ok)) - (cheb(a, ek) + cheb(a, ok)));
  const harmlessSrc = far(empties.filter((k) => !srcSet.has(k))).slice(0, 2);
  const allDests = new Set();
  for (const k of pos.cells) { const c = upC(k), r = upR(k); for (const [dc, dr] of N4) { const nk = pack(c + dc, r + dr); if (!pos.cells.has(nk)) allDests.add(nk); } }
  const harmlessDst = far([...allDests].filter((k) => !dests.has(k))).slice(0, 2);

  const cands = new Set();
  const add = (s, d) => { if (s !== d) cands.add(s + ':' + d); };
  for (const s of srcSet) { for (const d of dests) add(s, d); for (const d of harmlessDst) add(s, d); }
  for (const d of dests) for (const s of harmlessSrc) add(s, d);
  const out = [];
  for (const sd of cands) {
    const [s, d] = sd.split(':').map(Number);
    if (!attachTargetsExcluding(pos, s).has(d)) continue;
    const m = { kind: 'mc', from: s, to: d };
    const u = pos.make(m); tick();
    if (!pos.inCheck(side)) out.push(m);
    pos.unmake(u);
  }
  return out;
}

function givesCheck(pos, m) {
  const side = pos.turn, opp = side === W ? B : W;
  const u = pos.make(m); const chk = pos.inCheck(opp); pos.unmake(u);
  return chk;
}

// ---- the mate search --------------------------------------------------------
// attacker to move: returns a solution tree { move, replies: [{ reply, next }] } or null
function findMate(pos, n, exhaustiveRoot) {
  const side = pos.turn;
  const moves = legalPieceMoves(pos).concat(attackerSquareMoves(pos, exhaustiveRoot))
    .map((m) => ({ m, chk: givesCheck(pos, m) }))
    .sort((a, b) => (b.chk ? 1 : 0) - (a.chk ? 1 : 0))   // checks first: forcing lines are found faster
    .map((x) => x.m);
  for (const m of moves) {
    const u = pos.make(m);
    const tree = defenderLoses(pos, n - 1);
    pos.unmake(u);
    if (tree) return { move: m, replies: tree };
  }
  return null;
}

// Does the side to move have ANY legal action? Exits on the first one found,
// which is what makes the mate test cheap (most positions are not mate).
function hasLegalReply(pos) {
  const side = pos.turn;
  for (const m of pos.pieceMoves(false)) {
    const u = pos.make(m); tick();
    const ok = !pos.inCheck(side);
    pos.unmake(u);
    if (ok) return true;
  }
  return legalSquareMovesExhaustive(pos).length > 0;
}

// defender to move; attacker has n more moves. Returns the reply table or null.
function defenderLoses(pos, n) {
  const side = pos.turn;
  if (n === 0) return hasLegalReply(pos) ? null : (pos.inCheck(side) ? [] : null);   // mate / stalemate
  const replies = legalPieceMoves(pos).concat(legalSquareMovesExhaustive(pos));
  if (replies.length === 0) return pos.inCheck(side) ? [] : null;
  // refutations are usually captures or king moves: try those first
  const kk = pos.kings[side];
  replies.sort((a, b) => ((b.cap || 0) + (b.from === kk ? 1 : 0)) - ((a.cap || 0) + (a.from === kk ? 1 : 0)));
  const table = [];
  for (const r of replies) {
    const u = pos.make(r);
    const next = findMate(pos, n, false);
    pos.unmake(u);
    if (!next) return null;
    table.push({ reply: r, next });
  }
  return table;
}

// All root moves that force mate in n (for uniqueness), grouped by idea.
function rootSolutions(pos, n) {
  const side = pos.turn, opp = side === W ? B : W;
  const moves = legalPieceMoves(pos).concat(attackerSquareMoves(pos, true));
  const sols = [];
  for (const m of moves) {
    const u = pos.make(m);
    const tree = defenderLoses(pos, n - 1);
    pos.unmake(u);
    if (tree) sols.push({ move: m, replies: tree });
  }
  return sols;
}
const ideaOf = (pos, m) => m.kind === 'm' ? `m:${m.from}>${m.to}` : (givesCheck(pos, m) ? `fill:${m.to}` : `rm:${m.from}`);

// ---- notation / conversion --------------------------------------------------
function gameFromSpec(spec) {
  const g = new Game();
  g.cells = new Set(spec.cells.map(([c, r]) => c + ',' + r));
  g.board = new Map();
  for (const [c, r, t, col, moved] of spec.pieces) g.board.set(c + ',' + r, { type: t, color: col, hasMoved: !!moved });
  g.turn = spec.turn;
  g.moveCount = { white: spec.counts.white, black: spec.counts.black };
  g.wildUsed = { white: spec.wildUsed.white, black: spec.wildUsed.black };
  g.epTarget = spec.ep ? { c: spec.ep.c, r: spec.ep.r } : null;
  g.halfmoveClock = 0; g.history = []; g.repCount = new Map(); g.winner = null;
  g.rules = { cadence: 3, budget: Infinity, actions: { ac: false, rc: false, mc: true } };
  g._evaluate();
  return g;
}
function specFromGame(g) {
  const cells = [], pieces = [];
  for (const k of g.cells) cells.push(k.split(',').map(Number));
  for (const [k, p] of g.board) { const [c, r] = k.split(',').map(Number); pieces.push([c, r, p.type, p.color, p.hasMoved]); }
  return { cells, pieces, turn: g.turn, counts: { ...g.moveCount }, wildUsed: { ...g.wildUsed }, ep: g.epTarget ? { ...g.epTarget } : null };
}
const gm = (m) => moveToGame(m);
const mvJson = (m) => { const g = gm(m); return { kind: g.kind, from: [g.from.c, g.from.r], to: [g.to.c, g.to.r] }; };

// Replay one move on a fresh engine clone; returns { game, hcn } or null if illegal.
function stepEngine(spec, m) {
  const g = gameFromSpec(spec);
  if (!applyToGame(g, gm(m))) return null;
  return { game: g, hcn: g.history[g.history.length - 1].text, status: g.status };
}

// Engine-side enumeration of every legal action for the side to move.
function engineReplies(g) {
  const out = [];
  for (const [k, p] of g.board) {
    if (p.color !== g.turn) continue;
    const [c, r] = k.split(',').map(Number);
    for (const m of g.legalMoves(c, r)) out.push({ kind: 'm', from: pack(c, r), to: pack(m.c, m.r) });
  }
  if (g.wildcardEligible() && g.cells.size > 1) {
    // same legality test wildcardMoveCell applies, via the engine's own
    // non-mutating trial (a full clone per probe was minutes per node)
    for (const k of g.cells) {
      if (g.board.has(k)) continue;
      const [c, r] = k.split(',').map(Number);
      for (const tk of g._attachTargetsExcluding(k)) {
        const [tc, tr] = tk.split(',').map(Number);
        if (g._trial(g.turn, () => { g.cells.delete(k); g.cells.add(tk); })) out.push({ kind: 'mc', from: pack(c, r), to: pack(tc, tr) });
      }
    }
  }
  return out;
}
const mkey = (m) => m.kind + ':' + m.from + '>' + m.to;

// Walk the solution tree with the ENGINE: every attacker move must be legal,
// every engine-legal defender reply must have a stored answer, leaves must be mate.
function verifyTree(spec, tree, n) {
  const st = stepEngine(spec, tree.move);
  if (!st) return { ok: false, why: 'attacker move illegal in engine' };
  if (tree.replies.length === 0) {
    return st.status === 'checkmate' ? { ok: true } : { ok: false, why: 'leaf is not mate: ' + st.status };
  }
  if (n === 1) return { ok: false, why: 'mate-in-1 leaf has replies' };
  const g = st.game;
  if (g.status === 'checkmate' || g.status === 'stalemate') return { ok: false, why: 'unexpected terminal ' + g.status };
  const legal = engineReplies(g);
  const stored = new Map(tree.replies.map((r) => [mkey(r.reply), r.next]));
  if (legal.length !== stored.size) return { ok: false, why: `engine has ${legal.length} replies, solver ${stored.size}` };
  const spec2 = specFromGame(g);
  for (const r of legal) {
    const next = stored.get(mkey(r));
    if (!next) return { ok: false, why: 'unanswered defender reply ' + mkey(r) };
    const st2 = stepEngine(spec2, r);
    if (!st2) return { ok: false, why: 'defender reply illegal?' };
    const v = verifyTree(specFromGame(st2.game), next, n - 1);
    if (!v.ok) return v;
  }
  return { ok: true };
}

// Principal line for the video: at each defender node pick the reply that
// "resists most" (longest tree / most replies), prefer captures and king moves.
function principalLine(spec, tree) {
  const line = [];
  let cur = spec, t = tree;
  while (t) {
    const st = stepEngine(cur, t.move);
    line.push({ ...mvJson(t.move), hcn: st.hcn, side: cur.turn });
    if (!t.replies.length) break;
    const scored = t.replies.map((r) => {
      const g = stepEngine(specFromGame(st.game), r.reply);
      const depth = (function d(x) { return x.replies.length ? 1 + Math.max(...x.replies.map((y) => d(y.next))) : 0; })(r.next);
      const cap = g.hcn.includes('x') ? 1 : 0, king = /^K/.test(g.hcn) ? 1 : 0;
      return { r, g, s: depth * 10 + r.next.replies.length + cap * 2 + king };
    }).sort((a, b) => b.s - a.s);
    const pick = scored[0];
    line.push({ ...mvJson(pick.r.reply), hcn: pick.g.hcn, side: pick.g.game.turn === 'white' ? 'black' : 'white' });
    cur = specFromGame(pick.g.game); t = pick.r.next;
  }
  return line;
}

function solutionHasSquareMove(tree) {
  if (tree.move.kind === 'mc') return true;
  return tree.replies.some((r) => solutionHasSquareMove(r.next));
}
function mainLineHasSquareMove(line) { return line.some((m, i) => i % 2 === 0 && m.kind === 'mc'); }

// ---- position source: self-play -------------------------------------------
function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }

function* selfPlayPositions(gameIdx) {
  const game = new Game();
  game.rules = { cadence: 3, budget: Infinity, actions: { ac: false, rc: false, mc: true } };
  const rand = rng(SEED * 7919 + gameIdx * 104729);
  const persona = { depth: DEPTH, K: 10, jitter: 40 + Math.floor(rand() * 40), blunder: BLUNDER + rand() * 0.1, movetime: 400 };
  let plies = 0;
  while (!game.winner && ['playing', 'check'].includes(game.status) && plies < 140) {
    if (plies >= 10) yield { spec: specFromGame(game), gameIdx, ply: plies };
    const pos = Pos.fromGame(game);
    const res = chooseMoveFor(pos, persona, SEED + gameIdx * 1000 + plies);
    const g = gm(res.move);
    if (!g || !applyToGame(game, g)) break;
    plies++;
  }
}

// ---- main -------------------------------------------------------------------
// Solve one spec for mate-in-n. Returns a puzzle record or a status string.
function solveSpec(spec, n, meta) {
  const pos = Pos.fromGame(gameFromSpec(spec));
  const side = pos.turn, opp = side === W ? B : W;
  if (pos.inCheck(side) || pos.inCheck(opp)) return 'illegal';
  nodes = 0; budget = n === 3 ? 6e6 : 2e6;
  let sols;
  try {
    for (let k = 1; k < n; k++) if (findMate(pos, k, true)) return 'shorter';
    sols = rootSolutions(pos, n);
  } catch (e) { if (e instanceof Budget) return 'budget'; throw e; }
  if (!sols.length) return 'none';
  const ideas = new Set(sols.map((s) => ideaOf(pos, s.move)));
  if (ideas.size !== 1) return 'dual';
  const ek = pos.kings[opp], ok = pos.kings[side];
  const farness = (t) => t.move.kind !== 'mc' ? 0
    : (ideaOf(pos, t.move).startsWith('fill') ? cheb(t.move.from, ek) + cheb(t.move.from, ok) : cheb(t.move.to, ek) + cheb(t.move.to, ok));
  const tree = sols.slice().sort((a, b) => farness(b) - farness(a))[0];
  if (!solutionHasSquareMove(tree)) return { pieceOnly: true, tree };
  const v = verifyTree(spec, tree, n);
  if (!v.ok) { console.log('\nverify FAILED:', v.why); return 'verify'; }
  const line = principalLine(spec, tree);
  if (!mainLineHasSquareMove(line)) return 'sideline';
  const b = gameFromSpec(spec).bounds();
  const total = spec.counts.white + spec.counts.black;
  return {
    n, ...meta, spec, line,
    key: line[0].hcn, keyKind: line[0].kind,
    phase: total % 3 === 1 ? 'now' : 'second',       // when the attacker's board move is available
    pieces: spec.pieces.length,
    span: Math.max(b.maxC - b.minC + 1, b.maxR - b.minR + 1),
    holes: countHoles(spec), nodes,
  };
}

// From a piece-only mate-in-1 by a slider: pre-place the slider on its mating
// square and punch a hole between it and the king. Now the only mate is to
// fill the hole (a board move that opens the line = discovered check).
function deriveFillVariants(spec, tree) {
  const m = tree.move;
  if (m.kind !== 'm') return [];
  const fc = upC(m.from), fr = upR(m.from), tc = upC(m.to), tr = upR(m.to);
  const piece = spec.pieces.find(([c, r]) => c === fc && r === fr);
  if (!piece || !['rook', 'bishop', 'queen'].includes(piece[2])) return [];
  const king = spec.pieces.find(([, , t, col]) => t === 'king' && col !== piece[3]);
  const kc = king[0], kr = king[1], dc = kc - tc, dr = kr - tr;
  const diag = Math.abs(dc) === Math.abs(dr) && dc !== 0, orth = (dc === 0) !== (dr === 0);
  if (!(diag || orth)) return [];
  const sc = Math.sign(dc), sr = Math.sign(dr);
  const between = [];
  for (let x = tc + sc, y = tr + sr; x !== kc || y !== kr; x += sc, y += sr) between.push([x, y]);
  if (!between.length) return [];
  const out = [];
  for (const [hc, hr] of between) {
    const cells = spec.cells.filter(([c, r]) => !(c === hc && r === hr));
    const pieces = spec.pieces
      .filter(([c, r]) => !(c === fc && r === fr) && !(c === tc && r === tr))   // slider leaves; captured piece gone
      .concat([[tc, tr, piece[2], piece[3], true]]);
    out.push({ ...spec, cells, pieces, counts: { white: 1, black: 0 }, wildUsed: { white: 0, black: 0 }, ep: null });
  }
  return out;
}

const STATUS_CHAR = { illegal: '', shorter: 's', budget: 'b', none: '', dual: 'd', verify: 'V', sideline: '~' };

function tryPosition(p, results) {
  const base = p.spec;
  const pieces = base.pieces.length;
  if (pieces < 7 || pieces > 26) return;
  for (const res of [1, 2]) {
    const spec = { ...base, counts: { white: res, black: 0 }, wildUsed: { white: 0, black: 0 } };
    const lengths = res === 1 ? [1, 2] : [2, 3];   // M3 only when the defender never gets a quiet board turn
    for (const n of lengths) {
      if (results[n].length >= WANT[n]) continue;
      const r = solveSpec(spec, n, { gameIdx: p.gameIdx, ply: p.ply, residue: res });
      if (typeof r === 'string') { process.stdout.write(STATUS_CHAR[r] != null ? STATUS_CHAR[r] : '?'); if (r === 'budget' || r === 'shorter') break; continue; }
      if (r.pieceOnly) {
        process.stdout.write('.');
        if (n === 1 && results[1].length < WANT[1]) {
          for (const v of deriveFillVariants(spec, r.tree)) {
            const rv = solveSpec(v, 1, { gameIdx: p.gameIdx, ply: p.ply, residue: 1, derived: true });
            if (typeof rv !== 'string' && !rv.pieceOnly) { report(rv, results); break; }
          }
        }
        break;   // a piece mate in n exists: longer lengths are 'shorter' anyway
      }
      report(r, results);
      return;   // one puzzle per position
    }
  }
}

function report(r, results) {
  results[r.n].push(r);
  process.stdout.write('\nFOUND mate-in-' + r.n + (r.derived ? ' (derived)' : '') + ': ' + r.line.map((m) => m.hcn).join(' ')
    + ` [board move ${r.phase}] pieces ${r.pieces}, span ${r.span}, holes ${r.holes}\n`);
}

function countHoles(spec) {
  const set = new Set(spec.cells.map(([c, r]) => c + ',' + r));
  let minC = 1e9, maxC = -1e9, minR = 1e9, maxR = -1e9;
  for (const [c, r] of spec.cells) { minC = Math.min(minC, c); maxC = Math.max(maxC, c); minR = Math.min(minR, r); maxR = Math.max(maxR, r); }
  let h = 0;
  for (let c = minC; c <= maxC; c++) for (let r = minR; r <= maxR; r++) if (!set.has(c + ',' + r)) h++;
  return h;
}

(function main() {
  const results = { 1: [], 2: [], 3: [] };
  const t0 = Date.now();
  let positions = 0;
  for (let gi = 0; gi < N_GAMES; gi++) {
    for (const p of selfPlayPositions(gi)) {
      positions++;
      tryPosition(p, results);
    }
    process.stdout.write(`\n[game ${gi + 1}/${N_GAMES}] ${positions} positions, found m1=${results[1].length} m2=${results[2].length} m3=${results[3].length}, ${((Date.now() - t0) / 1000).toFixed(0)}s\n`);
    fs.writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), seed: SEED, puzzles: [...results[1], ...results[2], ...results[3]] }, null, 1));
    if (results[1].length >= WANT[1] && results[2].length >= WANT[2] && results[3].length >= WANT[3]) break;
  }
  console.log('done:', OUT);
})();
