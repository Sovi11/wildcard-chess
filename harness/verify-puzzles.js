#!/usr/bin/env node
// Re-prove every shipped puzzle from scratch.
//
// The composer's word is not good enough on its own: puzzle-data.json is a
// file, files get hand-edited, and a puzzle whose "unique" solution is not
// unique is worse than no puzzle at all — the mode grades you against it. So
// this throws the stored answer away and re-derives it with the full-width
// solver against engine.js, the same rules the game plays.
//
// It checks, for every puzzle:
//   - the position is legal (the side not to move is not in check)
//   - the ply phase agrees with whose turn it is
//   - at EVERY solver turn exactly one action forces mate in the moves left
//   - the stored action is that action
//   - the stored defence is legal, and the line really ends in checkmate
//   - the tags it claims about terrain are true of the line
//
//   node harness/verify-puzzles.js [path/to/puzzle-data.json]

const fs = require('fs');
const path = require('path');
const S = require('../js/solver.js');

const file = process.argv[2] || path.join(__dirname, '..', 'js', 'puzzle-data.json');
const data = JSON.parse(fs.readFileSync(file, 'utf8'));
const puzzles = data.puzzles || [];
let bad = 0;
const t0 = Date.now();

console.log(`verifying ${puzzles.length} puzzles from ${path.relative(process.cwd(), file)}\n`);

for (const p of puzzles) {
  const errs = [];
  let g;
  try {
    g = S.fromSpec({ cells: p.cells, pieces: p.pieces, turn: p.turn, ply: p.ply });
  } catch (e) {
    console.log(`  ✗ ${p.id}  ${e.message}`);
    bad++; continue;
  }
  const defender = p.turn === 'white' ? 'black' : 'white';
  if (g.inCheck(defender)) errs.push('illegal position: side not to move is in check');

  // walk the stored line, re-proving uniqueness at each of the solver's turns
  let cur = S.clone(g);
  let solverBoard = 0, defenderBoard = 0;
  for (let i = 0; i < p.line.length; i++) {
    const stepNo = Math.floor(i / 2);
    const need = p.mateIn - stepNo;                 // moves still to deliver
    const rec = p.line[i];
    if (rec.by === 'solver') {
      const hits = S.matingActions(cur, need);
      if (hits.length === 0) { errs.push(`no forced mate in ${need} at move ${stepNo + 1}`); break; }
      if (hits.length > 1) { errs.push(`${hits.length} solutions at move ${stepNo + 1} — not unique`); break; }
      if (!S.sameAction(hits[0], rec.action)) {
        errs.push(`stored move ${stepNo + 1} is not the solution (solver says ${JSON.stringify(hits[0])})`);
        break;
      }
      if (S.isBoardAction(rec.action)) solverBoard++;
    } else {
      const legal = S.allActions(cur).some((a) => S.sameAction(a, rec.action));
      if (!legal) { errs.push(`stored defence at ply ${i} is not legal`); break; }
      if (S.isBoardAction(rec.action)) defenderBoard++;
    }
    if (!S.apply(cur, rec.action)) { errs.push(`ply ${i} would not apply`); break; }
  }
  if (!errs.length && cur.status !== 'checkmate') errs.push('line does not end in checkmate');

  // the tags are a promise to the player about what the puzzle contains
  const tags = p.tags || [];
  if (tags.includes('both-wildcards') && !(solverBoard && defenderBoard)) {
    errs.push('tagged both-wildcards but the line does not have a board move from each side');
  }
  if (tags.includes('wildcard-key') && !solverBoard) errs.push('tagged wildcard-key but no board move by the solver');
  if (tags.includes('board-move-first') && !S.isBoardAction(p.line[0].action)) {
    errs.push('tagged board-move-first but the first move is a piece move');
  }

  if (errs.length) { bad++; console.log(`  ✗ ${p.id}  ${errs.join('; ')}`); }
  else console.log(`  ✓ ${p.id}  mate-in-${p.mateIn}  ${(p.tags || []).join(' ')}`);
}

console.log(`\n${puzzles.length - bad}/${puzzles.length} verified in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
if (bad) { console.error(`${bad} puzzle(s) FAILED — do not ship this set`); process.exit(1); }
