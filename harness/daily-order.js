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
const fresh = data.puzzles.filter((p) => !used.has(p.id));
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
data.dailyOrder = have.concat(add);
if (new Set(data.dailyOrder).size !== data.puzzles.length) throw new Error('daily order does not cover the set exactly once');
fs.writeFileSync(out, JSON.stringify(data, null, 1));
console.log('daily order: ' + have.length + ' kept, ' + add.length + ' appended, ' + data.dailyOrder.length + ' days before it repeats');
