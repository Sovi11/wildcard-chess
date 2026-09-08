// Curate the generated puzzles into a posting set and render them.
//
//   node harness/puzzle-batch.js curate            # merge shorts/puzzles*.json -> shorts/puzzles.json (2 / 6 / 2)
//   node harness/puzzle-batch.js render [--square] # record + mix every puzzle in shorts/puzzles.json
//   node harness/puzzle-batch.js all
//
// Mix: 20% mate-in-1, 60% mate-in-2, 20% mate-in-3 (the user's call). Ranked for
// phone legibility: compact board, fewer holes, moderate piece count.

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHORTS = path.join(ROOT, 'shorts');
const FINAL = path.join(SHORTS, 'puzzles.json');
const COUNT = { 1: +argOf('m1', 2), 2: +argOf('m2', 6), 3: +argOf('m3', 2) };

function argOf(name, def) { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : def; }

function curate() {
  const files = fs.readdirSync(SHORTS).filter((f) => /^puzzles(-[a-z]+)?\.json$/.test(f) && f !== 'puzzles.json');
  const seen = new Set(), all = [];
  for (const f of files) {
    let d; try { d = JSON.parse(fs.readFileSync(path.join(SHORTS, f), 'utf8')); } catch (e) { continue; }
    for (const p of d.puzzles || []) {
      const id = p.spec.turn + '|' + p.spec.cells.map((c) => c.join(',')).sort().join(';') + '|' + p.spec.pieces.map((x) => x.slice(0, 4).join(',')).sort().join(';');
      if (seen.has(id)) continue;
      seen.add(id); all.push({ ...p, source: f });
    }
  }
  // legibility score: smaller board, fewer holes, 9-18 pieces; a square move that
  // gives check ('fill' idea) is the most watchable, so nudge those up
  const score = (p) => {
    let s = 0;
    s -= Math.max(0, p.span - 8) * 6;
    s -= p.holes * 0.6;
    s -= Math.abs(p.pieces - 13) * 1.2;
    if (p.line.some((m, i) => i % 2 === 0 && m.kind === 'mc' && /[+#]/.test(m.hcn))) s += 8;
    if (p.span > 11) s -= 40;
    return s;
  };
  const picked = [];
  for (const n of [1, 2, 3]) {
    const pool = all.filter((p) => p.n === n).sort((a, b) => score(b) - score(a));
    console.log(`mate-in-${n}: ${pool.length} candidates, taking ${Math.min(COUNT[n], pool.length)}`);
    picked.push(...pool.slice(0, COUNT[n]));
  }
  // posting order: alternate lengths so the feed doesn't get 6 M2s in a row
  const order = [2, 1, 2, 3, 2, 2, 1, 2, 3, 2];
  const byN = { 1: picked.filter((p) => p.n === 1), 2: picked.filter((p) => p.n === 2), 3: picked.filter((p) => p.n === 3) };
  const out = [];
  for (const n of order) { const p = byN[n].shift(); if (p) out.push(p); }
  for (const n of [1, 2, 3]) out.push(...byN[n]);
  fs.writeFileSync(FINAL, JSON.stringify({ curated: new Date().toISOString(), puzzles: out }, null, 1));
  out.forEach((p, i) => console.log(`${i}: M${p.n} [${p.phase}] ${p.line.map((m) => m.hcn).join(' ')}  pieces ${p.pieces} span ${p.span} holes ${p.holes} (${p.source}${p.derived ? ', derived' : ''})`));
  return out;
}

function render(square) {
  const list = JSON.parse(fs.readFileSync(FINAL, 'utf8')).puzzles;
  for (let i = 0; i < list.length; i++) {
    const args = ['harness/render-media.js', 'shorts', 'puzzle:' + i];
    if (square) args.push('--square');
    execFileSync('node', args, { cwd: ROOT, stdio: 'inherit' });
    execFileSync('node', ['harness/mix-audio.js', 'puzzle-' + i + (square ? '-sq' : '')], { cwd: ROOT, stdio: 'inherit' });
  }
}

const what = process.argv[2] || 'all';
if (what === 'curate' || what === 'all') curate();
if (what === 'render' || what === 'all') render(process.argv.includes('--square'));
