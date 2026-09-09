// Curate generated puzzles into posting batches and render them.
//
//   node harness/puzzle-batch.js curate [--batch N]   # append the next BATCH puzzles (2/6/2) to shorts/puzzles.json
//   node harness/puzzle-batch.js render [--batch N]   # record + mix that batch, both formats, skipping files that exist
//   node harness/puzzle-batch.js table  [--batch N]   # append the post table + solutions for that batch to shorts/POSTS.md
//   node harness/puzzle-batch.js status               # candidate pool vs what is already curated
//
// Batches are 10 puzzles: 20% mate-in-1, 60% mate-in-2, 20% mate-in-3 (the user's
// call), ordered so the feed alternates lengths. Ids are global (batch N holds ids
// (N-1)*10 .. N*10-1) and finals land in shorts/out/puzzles/batch-N/.
// Ranking favours phone legibility: compact board, fewer holes, moderate piece count.

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SHORTS = path.join(ROOT, 'shorts');
const FINAL = path.join(SHORTS, 'puzzles.json');
const POSTS = path.join(SHORTS, 'POSTS.md');
const BATCH = 10;                                  // mirrored in mix-audio.js finalDir()
const MIX = { 1: 2, 2: 6, 3: 2 };
const ORDER = [2, 1, 2, 3, 2, 2, 1, 2, 3, 2];

function argOf(name, def) { const i = process.argv.indexOf('--' + name); return i >= 0 ? process.argv[i + 1] : def; }

const posKey = (p) => p.spec.turn + '|' + p.spec.cells.map((c) => c.join(',')).sort().join(';') + '|' + p.spec.pieces.map((x) => x.slice(0, 4).join(',')).sort().join(';');
// Two puzzles from the same game a few plies apart look identical to a viewer, and a
// derived mate-in-2 is its parent mate-in-3 two plies in. "Same family" = most pieces
// stand on the same squares (Jaccard over placements), or the same finishing moves.
const placements = (p) => new Set(p.spec.pieces.map((x) => x.slice(0, 4).join(',')));
function sameFamily(a, b) {
  if (a.source && a.source === b.source && a.gameIdx === b.gameIdx) return true;   // same self-play game
  const A = placements(a), B = placements(b);
  let inter = 0; for (const x of A) if (B.has(x)) inter++;
  // same game a few plies apart scores ~0.5+; unrelated games share only untouched back-rank pieces (~0.3)
  if (inter / (A.size + B.size - inter) >= 0.45) return true;
  const fin = (p) => p.line.slice(-2).map((m) => m.hcn.replace(/>.*$/, '>')).join(' ');
  return fin(a) === fin(b);
}

function loadFinal() {
  try { return JSON.parse(fs.readFileSync(FINAL, 'utf8')); } catch (e) { return { puzzles: [] }; }
}
function candidates() {
  const files = fs.readdirSync(SHORTS).filter((f) => /^puzzles-[a-z]+\.json$/.test(f));
  const seen = new Set(), all = [];
  for (const f of files) {
    let d; try { d = JSON.parse(fs.readFileSync(path.join(SHORTS, f), 'utf8')); } catch (e) { continue; }
    for (const p of d.puzzles || []) {
      const id = posKey(p);
      if (seen.has(id)) continue;
      seen.add(id); all.push({ ...p, source: f });
    }
  }
  return all;
}
const score = (p) => {
  let s = 0;
  s -= Math.max(0, p.span - 8) * 6;
  s -= p.holes * 0.6;
  s -= Math.abs(p.pieces - 13) * 1.2;
  if (p.line.some((m, i) => i % 2 === 0 && m.kind === 'mc' && /[+#]/.test(m.hcn))) s += 8;   // a checking board move is the most watchable
  if (p.span > 11) s -= 40;
  if (p.line.some((m) => m.hcn.includes('('))) s -= 6;     // off-alphabet files read badly in captions
  return s;
};

function curate() {
  const final = loadFinal();
  const usedPos = new Set(final.puzzles.map(posKey)), taken = final.puzzles.slice();
  const batch = +argOf('batch', Math.floor(final.puzzles.length / BATCH) + 1);
  if (final.puzzles.length !== (batch - 1) * BATCH) { console.error(`puzzles.json holds ${final.puzzles.length} puzzles; batch ${batch} must start at id ${(batch - 1) * BATCH}`); process.exit(1); }
  const all = candidates().filter((p) => !usedPos.has(posKey(p)));
  const picked = [];
  for (const n of [1, 2, 3]) {
    const pool = all.filter((p) => p.n === n).sort((a, b) => score(b) - score(a));
    let got = 0;
    for (const p of pool) {
      if (got >= MIX[n]) break;
      if (taken.some((q) => sameFamily(p, q))) continue;
      taken.push(p); picked.push(p); got++;
    }
    console.log(`mate-in-${n}: ${pool.length} unused candidates, taking ${got}`);
    if (got < MIX[n]) { console.error(`not enough mate-in-${n} puzzles for batch ${batch} (need ${MIX[n]}); generate more first`); process.exit(2); }
  }
  const byN = { 1: picked.filter((p) => p.n === 1), 2: picked.filter((p) => p.n === 2), 3: picked.filter((p) => p.n === 3) };
  const out = [];
  for (const n of ORDER) out.push({ ...byN[n].shift(), batch });
  final.puzzles.push(...out);
  final.curated = new Date().toISOString();
  fs.writeFileSync(FINAL, JSON.stringify(final, null, 1));
  out.forEach((p, i) => console.log(`${(batch - 1) * BATCH + i}: M${p.n} [${p.phase}] ${p.line.map((m) => m.hcn).join(' ')}  pieces ${p.pieces} span ${p.span} holes ${p.holes} (${p.source}${p.derived ? ', derived' : ''})`));
  return batch;
}

function finalDir(batch) { return path.join(SHORTS, 'out', 'puzzles', 'batch-' + batch); }

function render(batchArg) {
  const final = loadFinal();
  const batch = +batchArg;
  const ids = final.puzzles.map((p, i) => i).filter((i) => Math.floor(i / BATCH) + 1 === batch);
  if (!ids.length) { console.error('no puzzles in batch', batch); process.exit(1); }
  fs.mkdirSync(finalDir(batch), { recursive: true });
  for (const i of ids) {
    for (const square of [false, true]) {
      const name = 'puzzle-' + i + (square ? '-sq' : '');
      if (fs.existsSync(path.join(finalDir(batch), name + '.mp4'))) { console.log('have', name); continue; }
      const args = ['harness/render-media.js', 'shorts', 'puzzle:' + i];
      if (square) args.push('--square');
      execFileSync('node', args, { cwd: ROOT, stdio: 'inherit' });
      execFileSync('node', ['harness/mix-audio.js', name], { cwd: ROOT, stdio: 'inherit' });
    }
  }
}

function table(batchArg) {
  const final = loadFinal();
  const batch = +batchArg;
  const rows = final.puzzles.map((p, i) => ({ p, i })).filter((x) => Math.floor(x.i / BATCH) + 1 === batch);
  if (!rows.length) { console.error('no puzzles in batch', batch); process.exit(1); }
  let md = `\n---\n\n## Batch ${batch} (shorts/out/puzzles/batch-${batch}/)\n\n| # | file | puzzle | board move | title |\n|---|---|---|---|---|\n`;
  for (const { p, i } of rows) {
    const side = p.spec.turn === 'white' ? 'White' : 'Black';
    md += `| ${i} | puzzle-${i}.mp4 / puzzle-${i}-sq.mp4 | Mate in ${p.n}, ${side} to play | ${p.phase === 'now' ? 'now' : 'on move 2'} | Mate in ${p.n} — but you can move the FLOOR. Hollow Chess puzzle #${i + 1} |\n`;
  }
  md += '\nSolutions (pinned comment after 24h):\n\n';
  for (const { p, i } of rows) md += `- #${i + 1}: ${p.line.map((m, j) => (j % 2 === 0 ? Math.floor(j / 2) + 1 + '. ' : '') + m.hcn).join(' ')}\n`;
  fs.appendFileSync(POSTS, md);
  process.stdout.write(md);
}

function status() {
  const final = loadFinal();
  const used = new Set(final.puzzles.map(posKey));
  const all = candidates().filter((p) => !used.has(posKey(p)));
  const fresh = all.filter((p) => !final.puzzles.some((q) => sameFamily(p, q)));
  const count = (list) => [1, 2, 3].map((n) => `m${n}=${list.filter((p) => p.n === n).length}`).join(' ');
  console.log(`curated: ${final.puzzles.length} (${Math.floor(final.puzzles.length / BATCH)} batches)`);
  console.log(`unused candidates: ${count(fresh)}  (need per batch: m1=${MIX[1]} m2=${MIX[2]} m3=${MIX[3]})`);
}

const what = process.argv[2] || 'status';
if (what === 'curate') curate();
else if (what === 'render') render(argOf('batch', Math.floor(loadFinal().puzzles.length / BATCH)));
else if (what === 'table') table(argOf('batch', Math.floor(loadFinal().puzzles.length / BATCH)));
else status();
