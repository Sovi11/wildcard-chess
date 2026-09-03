#!/usr/bin/env node
// Compose Hollow Chess puzzles and PROVE them.
//
// The chess.com/lichess pipeline mines real games and keeps positions where
// the engine says exactly one move wins. We have no game corpus worth mining
// yet, so the same test is applied to a composed seed space instead: place a
// small cast on a small island, then keep only the positions where a full-width
// search finds exactly ONE action that forces mate — at every solver turn, not
// just the first. Uniqueness is what makes a puzzle gradable; everything else
// here is about making the survivors worth solving.
//
// The variant-specific criterion on top: the line must USE the terrain. A
// mate-in-3 that starts on a board turn gives the solver a board turn on its
// first move and the defender one on its second reply (board turns are every
// 3rd ply, so plies t and t+3 are both eligible) — so both players get to
// reshape the world inside a single puzzle. Those are the ones worth shipping.
//
//   node harness/compose-puzzles.js --want=12 --seconds=120
//   node harness/compose-puzzles.js --want=4 --depth=2

const fs = require('fs');
const path = require('path');
const S = require('../js/solver.js');

const arg = (k, d) => {
  const hit = process.argv.find((a) => a.startsWith('--' + k + '='));
  return hit ? hit.split('=')[1] : d;
};
const WANT = +arg('want', 12);
const SECONDS = +arg('seconds', 120);
const ONLY_DEPTH = arg('depth', null) ? +arg('depth') : null;
const SEED = +arg('seed', 20260903);
const OUT = path.resolve(arg('out', path.join(__dirname, '..', 'js', 'puzzle-data.json')));

// deterministic RNG so a run is reproducible from its seed
let _s = SEED >>> 0;
function rnd() { _s ^= _s << 13; _s ^= _s >>> 17; _s ^= _s << 5; _s >>>= 0; return _s / 4294967296; }
const pick = (a) => a[Math.floor(rnd() * a.length)];
const shuffled = (a) => { const c = a.slice(); for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c; };

// ---- seed space ------------------------------------------------------------
// Small islands keep the branching factor survivable and, more importantly,
// make the terrain matter: on a full 8x8 one hole is a rounding error, on a
// 5x5 it is a third of a king's escape routes.
function island(w, h, holes) {
  const cells = [];
  for (let c = 0; c < w; c++) for (let r = 0; r < h; r++) cells.push(c + ',' + r);
  return holes ? cells.filter((k) => holes.indexOf(k) < 0) : cells;
}
const SHAPES = [
  { name: '5x5', cells: island(5, 5) },
  { name: '5x5 nicked', cells: island(5, 5, ['0,4', '4,0']) },
  { name: '6x5', cells: island(6, 5) },
  { name: '6x6 nicked', cells: island(6, 6, ['0,5', '5,0', '2,2']) },
  { name: '4x5', cells: island(4, 5) },
];
// Casts are deliberately thin: a lone extra defender turns most mates into
// "several things win", and uniqueness is the scarce resource here.
const CASTS = [
  { w: ['queen'], b: [] },
  { w: ['rook', 'rook'], b: [] },
  { w: ['queen'], b: ['pawn'] },
  { w: ['rook', 'bishop'], b: [] },
  { w: ['rook', 'knight'], b: [] },
  { w: ['queen', 'knight'], b: ['rook'] },
  { w: ['rook'], b: [] },
];

// Board turns land on plies ≡ 1 (mod 3), and that arithmetic decides which
// puzzles can contain which wildcards. Starting at ply t, the solver moves on
// t, t+2, t+4 and the defender replies on t+1, t+3. So:
//
//   t ≡ 1 (mod 3)  solver has a board turn on move 1, defender on its 2nd reply
//   t ≡ 0 (mod 3)  defender has one on its 1st reply, solver on its 3rd move
//   t ≡ 2 (mod 3)  neither, inside a 5-ply window — no wildcard puzzle here
//
// Both of the first two give a mate-in-3 a board turn for EACH player, which
// is the whole point of the tier. The second family is the more findable one:
// the solver's board turn is its mating move, and a board move that mates is a
// shape we know how to build (see BRIDGE). A mate-in-2 window only ever spans
// one eligible ply, so those are solver-wildcard only, by arithmetic.
const START_KEY_FIRST = [                 // t ≡ 1: solver reshapes immediately
  { turn: 'white', ply: 4 },
  { turn: 'black', ply: 1 },
  { turn: 'black', ply: 7 },
];
const START_KEY_LAST = [                  // t ≡ 0: solver reshapes to finish
  { turn: 'white', ply: 0 },
  { turn: 'white', ply: 6 },
  { turn: 'black', ply: 3 },
  { turn: 'black', ply: 9 },
];
// A mate-in-2 window spans one eligible ply, and WHICH side owns it is decided
// by the start phase: t ≡ 1 hands it to the solver (the key move is a board
// move), t ≡ 0 hands it to the defender (they tear up the floor to escape and
// you mate anyway). Both are worth playing, and together they cover wildcards
// from both players even before the mate-in-3 tier does it inside one puzzle.
const startsFor = (depth) => (depth === 1 ? START_KEY_FIRST : START_KEY_FIRST.concat(START_KEY_LAST));

// Random placement almost never lands on a forced mate, and proving "no mate
// in 3" is the expensive direction — so the generator is biased hard toward
// positions that are nearly mate already: defending king on the rim, the
// attackers close enough to matter. This is prior, not cheating; uniqueness
// is still proved from scratch below.
function rimSquares(cells) {
  const set = new Set(cells);
  return cells.filter((k) => {
    const [c, r] = k.split(',').map(Number);
    return !set.has((c + 1) + ',' + r) || !set.has((c - 1) + ',' + r)
        || !set.has(c + ',' + (r + 1)) || !set.has(c + ',' + (r - 1));
  });
}
const cheb = (a, b) => {
  const [ac, ar] = a.split(',').map(Number), [bc, br] = b.split(',').map(Number);
  return Math.max(Math.abs(ac - bc), Math.abs(ar - br));
};

function randomPosition(depth) {
  const shape = pick(SHAPES);
  const cast = pick(CASTS);
  const start = pick(startsFor(depth));
  const solver = start.turn;
  const defender = solver === 'white' ? 'black' : 'white';
  const cells = shape.cells;
  const rim = rimSquares(cells);
  if (!rim.length) return null;

  const dk = pick(rim);                                   // defender king on the rim
  const near = shuffled(cells.filter((k) => k !== dk && cheb(k, dk) <= 3 && cheb(k, dk) >= 1));
  const far  = shuffled(cells.filter((k) => k !== dk && cheb(k, dk) >= 2));
  if (near.length < cast.w.length + 1 || far.length < 1) return null;

  const used = new Set([dk]);
  const take = (list) => { for (const k of list) if (!used.has(k)) { used.add(k); return k; } return null; };

  const pieces = {};
  pieces[dk] = ['king', defender];
  const sk = take(far.filter((k) => cheb(k, dk) >= 2));   // kings never adjacent
  if (!sk) return null;
  pieces[sk] = ['king', solver];
  for (const t of cast.w) { const k = take(near); if (!k) return null; pieces[k] = [t, solver]; }
  for (const t of cast.b) { const k = take(far); if (!k) return null; pieces[k] = [t, defender]; }
  return { cells, pieces, turn: solver, ply: start.ply, _shape: shape.name };
}

// ---- constructive motifs ---------------------------------------------------
// Rejection sampling found 384 unique mates-in-1 and not one of them was a
// board move. That is not bad luck, it is the shape of the problem: for a
// square-move to be the ONLY mate, the position has to be built so that the
// terrain is the thing holding the mate up. So build it, then prove it — the
// prover is still the authority, the motif only decides where to look.
//
// BRIDGE: a slider aims at the enemy king along a line broken by exactly one
// hole. Fill the hole and the line completes — discovered check from the
// terrain itself. Take the filling square FROM one of the king's flight
// squares and the same action both gives check and removes the escape.
const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];

function bridgePosition(depth) {
  const shape = pick(SHAPES);
  const start = pick(startsFor(depth));
  const solver = start.turn, defender = solver === 'white' ? 'black' : 'white';
  const cellSet = new Set(shape.cells);
  const has = (c, r) => cellSet.has(c + ',' + r);

  const rim = rimSquares(shape.cells);
  if (!rim.length) return null;
  const dk = pick(rim);
  const [kc, kr] = dk.split(',').map(Number);

  // a line from the king with exactly one hole in it, and a real square beyond
  const diag = rnd() < 0.5;
  const dirs = shuffled(diag ? DIAG : ORTHO);
  let holeK = null, slideK = null;
  for (const [dc, dr] of dirs) {
    let c = kc + dc, r = kr + dr, gap = null, ok = false;
    for (let step = 0; step < 6; step++, c += dc, r += dr) {
      if (!has(c, r)) {
        if (gap) { ok = false; break; }              // two holes: no single bridge
        gap = c + ',' + r;
        continue;
      }
      if (gap) { slideK = c + ',' + r; ok = true; break; }   // first real square past the gap
    }
    if (ok && gap && slideK) { holeK = gap; break; }
    slideK = null;
  }
  if (!holeK || !slideK) return null;

  // the square we bridge WITH: an empty flight square of the king, so the one
  // action both completes the line and takes the escape away
  const flights = shuffled(shape.cells.filter((k) => k !== dk && cheb(k, dk) === 1));
  const from = flights[0];
  if (!from) return null;

  const pieces = {};
  pieces[dk] = ['king', defender];
  pieces[slideK] = [diag ? pick(['bishop', 'queen']) : pick(['rook', 'queen']), solver];

  // solver king: on the board, not adjacent to either king, not on a used square
  const used = new Set([dk, slideK, from, holeK]);
  const skSpots = shuffled(shape.cells.filter((k) => !used.has(k) && cheb(k, dk) >= 2));
  if (!skSpots.length) return null;
  pieces[skSpots[0]] = ['king', solver];

  // one more attacker often supplies the cover that makes it mate rather than check
  const taken = new Set([...used, skSpots[0]]);
  if (rnd() < 0.65) {
    const more = shuffled(shape.cells.filter((k) => !taken.has(k) && cheb(k, dk) <= 3));
    if (more.length) { pieces[more[0]] = [pick(['rook', 'knight', 'bishop', 'queen']), solver]; taken.add(more[0]); }
  }
  // ...and the defender gets something to hold, so puzzles do not all read as
  // "lone king in a corner". It also makes uniqueness a sharper claim: the
  // defence has resources that have to be shown not to work.
  if (rnd() < 0.55) {
    const d = shuffled(shape.cells.filter((k) => !taken.has(k) && cheb(k, dk) >= 1));
    if (d.length) pieces[d[0]] = [pick(['pawn', 'knight', 'bishop', 'rook']), defender];
  }
  return { cells: shape.cells, pieces, turn: solver, ply: start.ply, _shape: shape.name + ' bridge' };
}

// ---- cheap rejects before the expensive proof ------------------------------
function plausible(g) {
  const solver = g.turn;
  const defender = solver === 'white' ? 'black' : 'white';
  // The side NOT to move being in check is an unreachable position: the
  // previous ply would have been illegal. (The solver being in check is fine
  // and makes a sharper puzzle — the mating move has to escape as well.)
  if (g.inCheck(defender)) return false;
  if (g.status !== 'playing' && g.status !== 'check') return false;
  const kd = g.findKing(defender), ks = g.findKing(solver);
  if (!kd || !ks) return false;
  if (Math.max(Math.abs(kd.c - ks.c), Math.abs(kd.r - ks.r)) <= 1) return false;
  return true;
}

// The cheap prior that makes the search affordable: how much air does the
// defending king have? A king with five flight squares is not getting mated in
// two, and finding that out the expensive way costs seconds per position.
function kingAir(g, color) {
  const kp = g.findKing(color);
  if (!kp) return 99;
  const save = g.turn;
  g.turn = color;
  const n = g.legalMoves(kp.c, kp.r).length;
  g.turn = save;
  return n;
}

// A puzzle is only worth solving if the terrain is part of the answer.
function terrainProfile(line) {
  let solverBoard = 0, defenderBoard = 0;
  for (const step of line) {
    if (!S.isBoardAction(step.action)) continue;
    if (step.by === 'solver') solverBoard++; else defenderBoard++;
  }
  return { solverBoard, defenderBoard };
}

function tag(spec, depth, line, prof) {
  const t = ['mate-in-' + depth];
  if (prof.solverBoard && prof.defenderBoard) t.push('both-wildcards');
  else if (prof.solverBoard) t.push('wildcard-key');
  else if (prof.defenderBoard) t.push('wildcard-defence');
  if (S.isBoardAction(line[0].action)) t.push('board-move-first');
  return t;
}

// ---- search ----------------------------------------------------------------
const found = [];
function save() {
  fs.writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), seed: SEED, puzzles: found }, null, 1));
}
const seen = new Set();
const t0 = Date.now();
let tried = 0, plausibleN = 0, aborted = 0;
const why = { noMate: 0, notUnique: 0, budget: 0, proved: 0, noTerrain: 0, noBothTerrain: 0 };
const depths = ONLY_DEPTH ? [ONLY_DEPTH] : [3, 3, 2];       // weighted toward 3

while (found.length < WANT && (Date.now() - t0) < SECONDS * 1000) {
  const depth = pick(depths);
  const spec = rnd() < 0.75 ? bridgePosition(depth) : randomPosition(depth);
  if (!spec) continue;
  tried++;
  let g;
  try { g = S.fromSpec(spec); } catch (e) { continue; }
  if (!plausible(g)) continue;
  const defender = g.turn === 'white' ? 'black' : 'white';
  // A king with no air at all is mate-in-1 territory; a king with plenty is not
  // getting mated in two. The window widens with the depth being looked for.
  const air = kingAir(g, defender);
  if (air > (depth >= 3 ? 5 : 3)) continue;
  plausibleN++;
  // Cheap gate: a mate-in-1 already on the board makes a deeper puzzle bogus.
  if (depth > 1) {
    const quick = S.tryWithin(4000, () => S.matingActions(g, 1, 1));
    if (quick === null || quick.length) continue;
  }
  // Budget, not patience: proving "there is NO mate in 3" is the expensive
  // direction and most candidates are exactly that. Capping it trades a few
  // provable-but-slow positions for an order of magnitude more attempts, and
  // the ones that abort were never going to be quick puzzles anyway.
  const res = S.tryWithin(depth >= 3 ? 140000 : 120000, () => S.provePuzzle(g, depth));
  if (res === null) { aborted++; why.budget++; continue; }
  if (!res.ok) { why[res.reason && res.reason.indexOf('unique') >= 0 ? 'notUnique' : 'noMate']++; continue; }
  why.proved++;
  const prof = terrainProfile(res.line);
  // The whole point of a Hollow Chess puzzle: the board has to move in it.
  // Tiering by how much of the variant the puzzle actually exercises:
  //   mate-in-1  the key move IS a board move — the mechanic, isolated
  //   mate-in-2  the key move is a board move, with a real defence to see past
  //   mate-in-3  both players reshape the board inside the solution
  if (depth >= 3 && !(prof.solverBoard && prof.defenderBoard)) { why.noBothTerrain++; continue; }
  if (depth === 2 && !prof.solverBoard && !prof.defenderBoard) { why.noTerrain++; continue; }
  if (depth === 1 && !prof.solverBoard) { why.noTerrain++; continue; }
  const sig = JSON.stringify([spec.cells, spec.pieces, spec.turn, spec.ply]);
  if (seen.has(sig)) continue;
  seen.add(sig);
  found.push({
    id: 'hc-' + (found.length + 1).toString().padStart(3, '0'),
    shape: spec._shape,
    cells: spec.cells, pieces: spec.pieces, turn: spec.turn, ply: spec.ply,
    mateIn: depth,
    line: res.line,
    tags: tag(spec, depth, res.line, prof),
  });
  const el = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`  [${el}s] ${found[found.length - 1].id}  mate-in-${depth}  ${spec._shape}  ${found[found.length - 1].tags.join(' ')}`);
  save();                       // write as we go: a long run must never lose work
}

console.log(`\ntried ${tried} positions, ${plausibleN} plausible, kept ${found.length} in ${((Date.now() - t0) / 1000).toFixed(0)}s`);
console.log('  rejected:', JSON.stringify(why));
if (found.length) { save(); console.log('wrote ' + path.relative(process.cwd(), OUT)); }
