#!/usr/bin/env node
// Append composer output to the shipped puzzle set WITHOUT renumbering.
//
// merge-puzzles.js rebuilds the set and reassigns every id, which is right for
// a first build and wrong ever after: ids key each player's solved list and the
// server's per-puzzle ratings. This keeps every existing puzzle exactly as it
// is and gives new, unseen positions the next free ids.
//
//   node harness/add-puzzles.js harness/pzout/c1.json harness/pzout/c2.json ...
const fs = require('fs');
const path = require('path');
const S = require('../js/solver.js');

const out = path.join(__dirname, '..', 'js', 'puzzle-data.json');
const data = JSON.parse(fs.readFileSync(out, 'utf8'));
const sig = (p) => JSON.stringify([p.cells.slice().sort(), Object.entries(p.pieces).sort(), p.turn, p.ply]);
// two puzzles with the same cast on the same squares read as a repeat even if the holes differ
const cast = (p) => JSON.stringify([Object.entries(p.pieces).sort(), p.turn]);
const seen = new Set(data.puzzles.map(sig)), casts = new Set(data.puzzles.map(cast));
let next = data.puzzles.reduce((m, p) => Math.max(m, +String(p.id).replace(/\D/g, '') || 0), 0) + 1;

function seedRating(p) {                       // same formula as merge-puzzles.js
  const g = S.fromSpec({ cells: p.cells, pieces: p.pieces, turn: p.turn, ply: p.ply });
  const n = S.allActions(g).length;
  const r = 600 + 400 * (p.mateIn - 1) + Math.round(80 * Math.log2(Math.max(1, n) / 40));
  return { rating: Math.max(400, Math.min(2000, r)), rootActions: n };
}

const fresh = [];
for (const f of process.argv.slice(2)) {
  if (!fs.existsSync(f)) { console.error('skip (missing): ' + f); continue; }
  let src; try { src = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { console.error('skip (unreadable): ' + f); continue; }
  for (const p of src.puzzles || []) {
    if (seen.has(sig(p)) || casts.has(cast(p))) continue;
    seen.add(sig(p)); casts.add(cast(p));
    fresh.push(Object.assign({}, p, seedRating(p)));
  }
}
// new ones go in easiest first, after everything that already shipped
fresh.sort((a, b) => (a.mateIn - b.mateIn) || (a.rating - b.rating));
for (const p of fresh) p.id = 'hc-' + String(next++).padStart(3, '0');
data.puzzles.push(...fresh);
data.generated = new Date().toISOString();
fs.writeFileSync(out, JSON.stringify(data, null, 1));
const by = {};
for (const p of data.puzzles) by[p.mateIn] = (by[p.mateIn] || 0) + 1;
console.log(`added ${fresh.length} puzzles; set is now ${data.puzzles.length}`, JSON.stringify(by));
