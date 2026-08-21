// Rule-variant tournament: compare wildcard cadence/budget configs head-to-head
// on mate rate, stalling, game length, and action usage.
// Usage: node harness/tournament.js [gamesPerConfig=12] [depth=3]

const fs = require('fs');
const path = require('path');
const { playGame, summarize } = require('./lib.js');

const GAMES = +process.argv[2] || 12;
const DEPTH = +process.argv[3] || 3;

const CONFIGS = [
  { name: 'every-2nd (current)', cadence: 2, budget: Infinity },
  { name: 'every-3rd',           cadence: 3, budget: Infinity },
  { name: 'every-2nd budget-6',  cadence: 2, budget: 6 },
];

const results = {};
for (const cfg of CONFIGS) {
  console.log(`\n=== ${cfg.name} — ${GAMES} games, depth ${DEPTH} ===`);
  const games = [];
  const t0 = Date.now();
  for (let i = 0; i < GAMES; i++) {
    const s = playGame({ ...cfg, depth: DEPTH, maxPlies: 200, seed: 555 }, i);
    games.push(s);
    console.log(`  g${String(i).padStart(2)}: ${s.result.padEnd(5)} ${s.termination.padEnd(10)} ${String(s.plies).padStart(3)}p cells=${s.cellsEnd}` + (s.aiIllegal ? ` ILLEGAL x${s.aiIllegal}` : ''));
  }
  const sum = summarize(games);
  sum.secPerGame = +(((Date.now() - t0) / 1000) / GAMES).toFixed(1);
  results[cfg.name] = { config: cfg, summary: sum, games };
  console.log(`  -> decisive ${sum.decisiveRate}% | avg ${sum.avgPlies} plies | terms ${JSON.stringify(sum.term)} | wild/game ac${sum.wildPerGame.ac} rc${sum.wildPerGame.rc} mc${sum.wildPerGame.mc}`);
  // checkpoint after each config so an interrupted run keeps its results
  fs.writeFileSync(path.join(__dirname, `tournament-d${DEPTH}-g${GAMES}.json`), JSON.stringify(results, null, 2));
}

console.log('\n================ TOURNAMENT SUMMARY ================');
console.log('config'.padEnd(22) + 'decisive%'.padEnd(11) + 'avgPlies'.padEnd(10) + 'mates'.padEnd(7) + 'reps'.padEnd(6) + 'caps'.padEnd(6) + 'wild ac/rc/mc');
for (const [name, r] of Object.entries(results)) {
  const s = r.summary;
  console.log(
    name.padEnd(22) +
    String(s.decisiveRate + '%').padEnd(11) +
    String(s.avgPlies).padEnd(10) +
    String(s.term.checkmate || 0).padEnd(7) +
    String(s.term.repetition || 0).padEnd(6) +
    String(s.term['move-cap'] || 0).padEnd(6) +
    `${s.wildPerGame.ac}/${s.wildPerGame.rc}/${s.wildPerGame.mc}`
  );
}

fs.writeFileSync(path.join(__dirname, `tournament-d${DEPTH}-g${GAMES}.json`), JSON.stringify(results, null, 2));
console.log(`\nwrote harness/tournament-d${DEPTH}-g${GAMES}.json`);
