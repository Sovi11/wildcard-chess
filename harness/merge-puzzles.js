#!/usr/bin/env node
// Merge composer output files into the shipped set, easiest first, ids renumbered.
//   node harness/merge-puzzles.js out/a.json out/b.json
const fs = require('fs');
const path = require('path');
const S = require('../js/solver.js');

// Seed rating: where a puzzle's rating STARTS before anyone has attempted it.
// Depth is the big term; the number of legal actions on the board at the root
// is the "needle in a haystack" term — the key move is one of ~1,500 on an
// 8x8 board turn and one of ~25 on a quiet ply. The server drifts it toward
// the truth from real attempts (sql/puzzles.sql); this only has to be sane.
function seedRating(p) {
  const g = S.fromSpec({ cells: p.cells, pieces: p.pieces, turn: p.turn, ply: p.ply });
  const n = S.allActions(g).length;
  const r = 600 + 400 * (p.mateIn - 1) + Math.round(80 * Math.log2(Math.max(1, n) / 40));
  return { rating: Math.max(400, Math.min(2000, r)), rootActions: n };
}
const out = path.join(__dirname, '..', 'js', 'puzzle-data.json');
const seen = new Set();
const all = [];
for (const f of process.argv.slice(2)) {
  if (!fs.existsSync(f)) { console.error('skip (missing): ' + f); continue; }
  for (const p of (JSON.parse(fs.readFileSync(f, 'utf8')).puzzles || [])) {
    const sig = JSON.stringify([p.cells, p.pieces, p.turn, p.ply]);
    if (seen.has(sig)) continue;
    seen.add(sig);
    Object.assign(p, seedRating(p));
    all.push(p);
  }
}
// difficulty order: depth first, then how much board there is to read
all.sort((a, b) => (a.mateIn - b.mateIn) || (Object.keys(a.pieces).length - Object.keys(b.pieces).length));
all.forEach((p, i) => { p.id = 'hc-' + String(i + 1).padStart(3, '0'); });
fs.writeFileSync(out, JSON.stringify({ generated: new Date().toISOString(), puzzles: all }, null, 1));
console.log(`merged ${all.length} puzzles -> ${path.relative(process.cwd(), out)}`);
const byDepth = {};
for (const p of all) byDepth[p.mateIn] = (byDepth[p.mateIn] || 0) + 1;
console.log('  by depth:', JSON.stringify(byDepth));
const rs = all.map((p) => p.rating);
console.log('  seed ratings:', Math.min(...rs), '..', Math.max(...rs));
