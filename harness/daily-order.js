#!/usr/bin/env node
// Decide which puzzle the daily hands out on which day, and write it into the
// puzzle set as `dailyOrder`. Days already in the list are NEVER moved: new
// puzzles are shuffled (seeded) and appended, so a day that has been played
// keeps its puzzle forever. Run after add-puzzles.js.
//   node harness/daily-order.js
const fs = require('fs');
const path = require('path');
const out = path.join(__dirname, '..', 'js', 'puzzle-data.json');
const data = JSON.parse(fs.readFileSync(out, 'utf8'));
const byId = new Map(data.puzzles.map((p) => [p.id, p]));
const have = (data.dailyOrder || []).filter((id) => byId.has(id));
const used = new Set(have);
let s = (20261121 + have.length) >>> 0;
const rnd = () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// The daily is always a full-size board, and never a position with a pawn on
// the first or last rank (it could not have arisen in a game). Days already
// handed out stay as they were; an unfit puzzle further down the list is dropped.
const fit = (p) => {
  const rs = p.cells.map((k) => +k.split(',')[1]), cs = p.cells.map((k) => +k.split(',')[0]);
  const lo = Math.min(...rs), hi = Math.max(...rs);
  if (hi - lo + 1 < 8 || Math.max(...cs) - Math.min(...cs) + 1 < 8) return false;
  return !Object.keys(p.pieces).some((k) => p.pieces[k][0] === 'pawn' && (+k.split(',')[1] === lo || +k.split(',')[1] === hi));
};
const played = Math.max(0, Math.min(have.length, Math.floor((Date.now() - Date.UTC(2026, 10, 21)) / 86400000) + 1));
for (let i = have.length - 1; i >= played; i--) if (!fit(byId.get(have[i]))) { used.delete(have[i]); have.splice(i, 1); }
const fresh = data.puzzles.filter((p) => !used.has(p.id) && fit(p));
// a daily should take a minute, not a second: two mate-in-2s for every mate-in-1
const hard = shuffle(fresh.filter((p) => p.mateIn >= 2)), easy = shuffle(fresh.filter((p) => p.mateIn < 2));
if (!have.length) {                       // day one opens on a puzzle whose key move is a board move
  const i = hard.findIndex((p) => (p.tags || []).indexOf('wildcard-key') >= 0);
  if (i > 0) hard.unshift(hard.splice(i, 1)[0]);
}
const add = [];
while (hard.length || easy.length) {
  for (let k = 0; k < 2 && hard.length; k++) add.push(hard.shift().id);
  if (easy.length) add.push(easy.shift().id);
}
// --front puts the new puzzles straight after the days already played, taking
// turns with what was queued, so a fresh batch is seen this week and not in
// three months. Played days still never move.
if (process.argv.includes('--front') && add.length) {
  const head = have.slice(0, played), queued = have.slice(played), mix = [];
  while (add.length || queued.length) { if (add.length) mix.push(add.shift()); if (add.length) mix.push(add.shift()); if (queued.length) mix.push(queued.shift()); }
  have.length = 0; have.push(...head, ...mix);
}
data.dailyOrder = have.concat(add);
if (new Set(data.dailyOrder).size !== data.dailyOrder.length) throw new Error('daily order repeats a puzzle');
fs.writeFileSync(out, JSON.stringify(data, null, 1));
console.log('daily order: ' + have.length + ' kept, ' + add.length + ' appended, ' + data.dailyOrder.length + ' days before it repeats');
