// Derive mate-in-2 puzzles from the mate-in-3s already generated (see puzzles.js deriveShorter).
//   node harness/puzzle-derive.js            -> shorts/puzzles-h.json
const path = require('path');
const fs = require('fs');
const { deriveShorter } = require('./puzzles.js');
const SHORTS = path.join(__dirname, '..', 'shorts');
const seen = new Set(), out = [];
for (const f of fs.readdirSync(SHORTS).filter((f) => /^puzzles-[a-z]+\.json$/.test(f) && f !== 'puzzles-h.json')) {
  let d; try { d = JSON.parse(fs.readFileSync(path.join(SHORTS, f), 'utf8')); } catch (e) { continue; }
  for (const p of d.puzzles || []) {
    if (p.n !== 3) continue;
    const id = p.line.map((m) => m.hcn).join(' ');
    if (seen.has(id)) continue; seen.add(id);
    const r = deriveShorter(p);
    console.log('M3', id, '->', r ? 'M2 ' + r.line.map((m) => m.hcn).join(' ') + ' [' + r.phase + ']' : 'no');
    if (r) out.push(r);
  }
}
fs.writeFileSync(path.join(SHORTS, 'puzzles-h.json'), JSON.stringify({ generated: new Date().toISOString(), derived: 'M3->M2', puzzles: out }, null, 1));
console.log(out.length, 'derived mate-in-2 puzzles -> shorts/puzzles-h.json');
