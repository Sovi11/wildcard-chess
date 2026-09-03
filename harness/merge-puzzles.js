#!/usr/bin/env node
// Merge composer output files into the shipped set, easiest first, ids renumbered.
//   node harness/merge-puzzles.js out/a.json out/b.json
const fs = require('fs');
const path = require('path');
const out = path.join(__dirname, '..', 'js', 'puzzle-data.json');
const seen = new Set();
const all = [];
for (const f of process.argv.slice(2)) {
  if (!fs.existsSync(f)) { console.error('skip (missing): ' + f); continue; }
  for (const p of (JSON.parse(fs.readFileSync(f, 'utf8')).puzzles || [])) {
    const sig = JSON.stringify([p.cells, p.pieces, p.turn, p.ply]);
    if (seen.has(sig)) continue;
    seen.add(sig);
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
