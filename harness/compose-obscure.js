#!/usr/bin/env node
// Compose the strange puzzles: positions that could only exist in Hollow Chess.
//
// compose-puzzles.js builds one motif (a slider's line with a hole in it, and
// the square that fills it). These are the other ones:
//
//   ISLAND     the defending king stands on an island of one to three squares
//              with water all round. Sliders cannot reach it and no king can
//              walk to it, so the mate comes from a knight jumping the water,
//              or from a square carried over to make a bridge.
//   PENINSULA  the same island with a single square left as a causeway.
//
// Always a full 8x8 frame (the daily only takes full boards) and never a pawn
// on the first or last rank. As everywhere, the motif only decides where to
// look: a position is kept only if the full-width solver proves exactly one
// winning action at every solver turn.
//
//   node harness/compose-obscure.js --want=20 --seconds=600 --seed=7 --out=harness/pzout/ob1.json
const fs = require('fs');
const path = require('path');
const S = require('../js/solver.js');

const arg = (k, d) => { const hit = process.argv.find((a) => a.startsWith('--' + k + '=')); return hit ? hit.split('=')[1] : d; };
const WANT = +arg('want', 20), SECONDS = +arg('seconds', 600), SEED = +arg('seed', 20261123);
const OUT = path.resolve(arg('out', path.join(__dirname, 'pzout', 'obscure.json')));

let _s = SEED >>> 0;
function rnd() { _s ^= _s << 13; _s ^= _s >>> 17; _s ^= _s << 5; _s >>>= 0; return _s / 4294967296; }
const pick = (a) => a[Math.floor(rnd() * a.length)];
const shuffled = (a) => { const c = a.slice(); for (let i = c.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [c[i], c[j]] = [c[j], c[i]]; } return c; };
const K = (c, r) => c + ',' + r;
const P = (k) => k.split(',').map(Number);
const inb = (c, r) => c >= 0 && c < 8 && r >= 0 && r < 8;
const cheb = (a, b) => { const [ac, ar] = P(a), [bc, br] = P(b); return Math.max(Math.abs(ac - bc), Math.abs(ar - br)); };
const N8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// Board turns fall on plies = 1 (mod 3). Starting at ply t the solver moves on
// t, t+2 and the defender on t+1: so t=1 gives the solver the board first,
// t=0 gives it to the defender's reply, and t=2 gives it to nobody, which is
// where the pure knight-over-water mates live.
const STARTS = [
  { turn: 'white', ply: 4 }, { turn: 'black', ply: 1 }, { turn: 'black', ply: 7 },      // solver reshapes first
  { turn: 'white', ply: 0 }, { turn: 'white', ply: 6 }, { turn: 'black', ply: 3 },      // defender may reshape in reply
  { turn: 'white', ply: 2 }, { turn: 'white', ply: 8 }, { turn: 'black', ply: 5 },      // nobody reshapes
];
const CASTS = [['knight'], ['knight', 'knight'], ['knight', 'rook'], ['knight', 'bishop'], ['rook'], ['queen'],
               ['rook', 'rook'], ['rook', 'bishop'], ['knight', 'queen'], ['bishop', 'bishop'], ['knight', 'knight', 'rook']];

function islandPosition() {
  const start = pick(STARTS);
  const solver = start.turn, defender = solver === 'white' ? 'black' : 'white';
  const dk = K(Math.floor(rnd() * 8), Math.floor(rnd() * 8));
  const isle = new Set([dk]);
  const size = rnd() < 0.4 ? 1 : (rnd() < 0.6 ? 2 : 3);
  for (let i = 1; i < size; i++) {
    const opts = [];
    for (const k of isle) { const [c, r] = P(k); for (const [dc, dr] of N8) if (inb(c + dc, r + dr) && !isle.has(K(c + dc, r + dr))) opts.push(K(c + dc, r + dr)); }
    if (opts.length) isle.add(pick(opts));
  }
  const moat = new Set();
  for (const k of isle) { const [c, r] = P(k); for (const [dc, dr] of N8) { const n = K(c + dc, r + dr); if (inb(c + dc, r + dr) && !isle.has(n)) moat.add(n); } }
  // a peninsula keeps one square of the moat as a causeway
  let kind = 'island';
  if (rnd() < 0.25 && moat.size) { moat.delete(pick([...moat])); kind = 'peninsula'; }
  const cells = [];
  for (let c = 0; c < 8; c++) for (let r = 0; r < 8; r++) if (!moat.has(K(c, r))) cells.push(K(c, r));
  // a little more water elsewhere, so the mainland is not a plain rectangle
  const extra = Math.floor(rnd() * 3);
  for (let i = 0; i < extra; i++) { const k = pick(cells); if (!isle.has(k)) cells.splice(cells.indexOf(k), 1); }
  const main = cells.filter((k) => !isle.has(k));
  if (main.length < 30) return null;

  const pieces = {}; pieces[dk] = ['king', defender];
  const used = new Set([dk]);
  const take = (list) => { for (const k of list) if (!used.has(k)) { used.add(k); return k; } return null; };
  const sk = take(shuffled(main.filter((k) => cheb(k, dk) >= 3)));
  if (!sk) return null;
  pieces[sk] = ['king', solver];
  const cast = pick(CASTS);
  for (const t of cast) { const k = take(shuffled(main.filter((x) => cheb(x, dk) >= 2 && cheb(x, dk) <= 4))); if (!k) return null; pieces[k] = [t, solver]; }
  // the defender gets something that can move, so "no legal move" is not the story
  const scenery = [['pawn', defender], [pick(['knight', 'bishop', 'pawn']), defender], ['pawn', solver]];
  for (const [t, col] of scenery) {
    if (rnd() < 0.4) continue;
    const k = take(shuffled(main.filter((x) => cheb(x, dk) >= 3)));
    if (!k) continue;
    const r = P(k)[1];
    if (t === 'pawn' && (r === 0 || r === 7)) { used.delete(k); continue; }
    pieces[k] = [t, col];
  }
  // a full frame, or the daily will not take it
  const cs = cells.map((k) => P(k)[0]), rs = cells.map((k) => P(k)[1]);
  if (Math.max(...cs) - Math.min(...cs) < 7 || Math.max(...rs) - Math.min(...rs) < 7) return null;
  return { cells, pieces, turn: solver, ply: start.ply, _shape: '8x8 ' + kind, _isle: [...isle], _kind: kind };
}

function plausible(g) {
  const solver = g.turn, defender = solver === 'white' ? 'black' : 'white';
  if (g.inCheck(defender)) return false;
  if (g.status !== 'playing' && g.status !== 'check') return false;
  const kd = g.findKing(defender), ks = g.findKing(solver);
  if (!kd || !ks) return false;
  return Math.max(Math.abs(kd.c - ks.c), Math.abs(kd.r - ks.r)) > 1;
}

// what the solution is made of, for the tags a player sees the theme in
function themes(spec, line) {
  const t = [spec._kind === 'island' ? 'island-king' : 'peninsula-king'];
  const g = S.fromSpec(spec);
  let placed = null, last = null, lastPiece = null, sb = 0, db = 0;
  for (const st of line) {
    if (S.isBoardAction(st.action)) { if (st.by === 'solver') { sb++; placed = st.action.to || st.action.cell; } else db++; }
    else if (st.by === 'solver') { last = st.action; const p = g.get(st.action.from.c, st.action.from.r); lastPiece = p && p.type; }
    S.apply(g, st.action);
  }
  if (sb && db) t.push('both-wildcards'); else if (sb) t.push('wildcard-key'); else if (db) t.push('wildcard-defence');
  if (S.isBoardAction(line[0].action)) t.push('board-move-first');
  if (lastPiece === 'knight' && !S.isBoardAction(line[line.length - 1].action)) t.push('knight-mate');
  // the square the solver carried over is the one a slider then travels along or lands on
  if (placed && last && (lastPiece === 'rook' || lastPiece === 'queen' || lastPiece === 'bishop')) {
    const dc = Math.sign(last.to.c - last.from.c), dr = Math.sign(last.to.r - last.from.r);
    for (let c = last.from.c + dc, r = last.from.r + dr; ; c += dc, r += dr) {
      if (c === placed.c && r === placed.r) { t.push('slide-in'); break; }
      if (c === last.to.c && r === last.to.r) break;
    }
  }
  return t;
}

const found = [], seen = new Set(), t0 = Date.now();
const why = { tried: 0, noMate: 0, notUnique: 0, budget: 0, dull: 0 };
function save() { fs.mkdirSync(path.dirname(OUT), { recursive: true }); fs.writeFileSync(OUT, JSON.stringify({ generated: new Date().toISOString(), seed: SEED, puzzles: found }, null, 1)); }

while (found.length < WANT && Date.now() - t0 < SECONDS * 1000) {
  const depth = rnd() < (1 - +arg('d2', 0.55)) ? 1 : 2;
  const spec = islandPosition();
  if (!spec) continue;
  let g; try { g = S.fromSpec(spec); } catch (e) { continue; }
  if (!plausible(g)) continue;
  why.tried++;
  if (depth > 1) { const quick = S.tryWithin(4000, () => S.matingActions(g, 1, 1)); if (quick === null || quick.length) continue; }
  const res = S.tryWithin(depth >= 2 ? 500000 : 150000, () => S.provePuzzle(g, depth));
  if (res === null) { why.budget++; continue; }
  if (!res.ok) { why[res.reason && res.reason.indexOf('unique') >= 0 ? 'notUnique' : 'noMate']++; continue; }
  const tags = ['mate-in-' + depth].concat(themes(spec, res.line));
  // a causeway position has to earn its place with a board move or a knight
  if (spec._kind === 'peninsula' && !tags.some((x) => x === 'wildcard-key' || x === 'both-wildcards' || x === 'knight-mate' || x === 'wildcard-defence')) { why.dull++; continue; }
  const sig = JSON.stringify([spec.pieces, spec.turn]);
  if (seen.has(sig)) continue;
  seen.add(sig);
  found.push({ id: 'ob-' + (found.length + 1), shape: spec._shape, cells: spec.cells, pieces: spec.pieces, turn: spec.turn, ply: spec.ply, mateIn: depth, line: res.line, tags });
  console.log('  [' + ((Date.now() - t0) / 1000).toFixed(0) + 's] mate-in-' + depth + '  ' + spec._shape + '  ' + tags.slice(1).join(' '));
  save();
}
console.log('kept ' + found.length + ' in ' + ((Date.now() - t0) / 1000).toFixed(0) + 's', JSON.stringify(why));
if (found.length) save();
