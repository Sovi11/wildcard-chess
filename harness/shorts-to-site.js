#!/usr/bin/env node
// Make the puzzles shown in the shorts playable on the site.
//
// A short ends on "solve it yourself: hollowchess.com/p/N". That address opens
// puzzle N of shorts/puzzles.json (N = the "Puzzle #N" in the post title, so
// 1-based) on the real board. The site grades a puzzle against ONE stored
// line, which is only fair when the solution is unique at every solver turn,
// so each puzzle is re-proved here with the same full-width solver the shipped
// set uses. One that is not strictly unique is left out, and its address
// falls back to the daily puzzle.
//
//   node harness/shorts-to-site.js            -> js/short-puzzles.json (resumable)

const fs = require('fs');
const path = require('path');
const S = require('../js/solver.js');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'js', 'short-puzzles.json');
const src = JSON.parse(fs.readFileSync(path.join(ROOT, 'shorts', 'puzzles.json'), 'utf8')).puzzles;
const prev = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')) : { puzzles: [], skipped: {} };
const CAP = 3000000;
const done = new Map(prev.puzzles.map((p) => [p.n, p]));
const skipped = prev.skipped || {};
if (process.argv.includes('--retry')) for (const k of Object.keys(skipped)) delete skipped[k];

function convert(pz) {
  const sp = pz.spec;
  if (sp.ep) return { why: 'en passant square set' };
  // the board turn comes from the total ply count mod 3; the site also wants the
  // parity to agree with the side to move, so pick the ply in 0..5 that fits both
  const total = sp.counts.white + sp.counts.black;
  let ply = -1;
  for (let k = 0; k < 6; k++) if (k % 3 === total % 3 && (k % 2 === 0) === (sp.turn === 'white')) ply = k;
  const pieces = {};
  for (const [c, r, t, col, moved] of sp.pieces) pieces[c + ',' + r] = moved ? [t, col] : [t, col, false];
  const spec = { cells: sp.cells.map(([c, r]) => c + ',' + r).sort(), pieces, turn: sp.turn, ply };
  const g = S.fromSpec(spec);
  // capped: an uncapped full-width mate-in-3 can run for many minutes
  const pr = S.tryWithin(CAP, () => prove(g, pz.n));
  if (pr === null) return { why: 'too slow to prove (search cap)' };
  if (!pr.ok) return { why: pr.reason };
  const key = pr.line[0].action, want = pz.line[0];
  const kf = key.from || key.cell, kt = key.to || key.cell;
  if (key.kind !== want.kind || kf.c !== want.from[0] || kf.r !== want.from[1] || kt.c !== want.to[0] || kt.r !== want.to[1]) {
    return { why: 'key move differs from the video' };
  }
  const out = Object.assign(spec, { mateIn: pz.n, line: pr.line, tags: [], unrated: true });
  if (pr.loose) out.loose = true;
  return { puzzle: out };
}

// solver.provePuzzle, with one allowance: on the LAST move more than one mate may
// exist. The site then accepts any move that is checkmate there (`loose`), which
// is still fair grading. Every earlier solver move has to be unique as usual.
function prove(g, n) {
  const line = [];
  let cur = S.clone(g), loose = false;
  for (let step = n; step >= 1; step--) {
    const hits = S.matingActions(cur, step, 2);
    if (hits.length === 0) return { ok: false, reason: 'no forced mate in ' + step };
    if (hits.length > 1) {
      if (step > 1) return { ok: false, reason: 'solution not unique at move ' + (n - step + 1) };
      loose = true;
    }
    line.push({ by: 'solver', action: hits[0] });
    const after = S.clone(cur);
    S.apply(after, hits[0]);
    if (after.status === 'checkmate') {
      return step === 1 ? { ok: true, line, loose } : { ok: false, reason: 'mates too early' };
    }
    const def = S.bestDefence(after, step - 1);
    if (!def) return { ok: false, reason: 'no defender reply' };
    line.push({ by: 'defender', action: def });
    S.apply(after, def);
    cur = after;
  }
  return { ok: false, reason: 'line did not end in mate' };
}

const save = () => fs.writeFileSync(OUT, JSON.stringify({
  generated: new Date().toISOString(),
  puzzles: [...done.values()].sort((a, b) => a.n - b.n),
  skipped,
}));

for (let i = 0; i < src.length; i++) {
  const n = i + 1;
  if (done.has(n) || skipped[n]) continue;
  const t0 = Date.now();
  let r;
  try { r = convert(src[i]); } catch (e) { r = { why: e.message }; }
  if (r.puzzle) { done.set(n, Object.assign({ id: 'short-' + n, n }, r.puzzle)); console.log(`  ok   #${n}  mate in ${src[i].n}  ${((Date.now() - t0) / 1000).toFixed(1)}s`); }
  else { skipped[n] = r.why; console.log(`  skip #${n}  ${r.why}`); }
  save();
}
save();
console.log(`${done.size} playable, ${Object.keys(skipped).length} left out -> js/short-puzzles.json`);
