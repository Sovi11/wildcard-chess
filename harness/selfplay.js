// Self-play harness: AI vs AI, collect design-analysis stats.
// Usage:
//   node harness/selfplay.js [games=20] [depth=3] [K=10] [jitter=15] [maxPlies=200]
//     [--setup=standard|no-wildcards|knight-vs-bishop] [--cadence=2] [--budget=Inf]

const fs = require('fs');
const path = require('path');
const { playGame, summarize } = require('./lib.js');

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flags = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? true : v];
}));

const cfg = {
  depth: +args[1] || 3,
  K: +args[2] || 10,
  jitter: args[3] !== undefined ? +args[3] : 15,
  maxPlies: +args[4] || 200,
  setup: flags.setup || 'standard',
  cadence: +flags.cadence || 2,
  budget: flags.budget !== undefined ? +flags.budget : Infinity,
};
const GAMES = +args[0] || 20;

console.log(`Self-play: ${GAMES} games`, cfg);
const games = [];
const t0 = Date.now();
for (let i = 0; i < GAMES; i++) {
  const s = playGame(cfg, i);
  games.push(s);
  const wc = s.wildcards;
  console.log(
    `game ${String(i).padStart(3)}: ${s.result.padEnd(5)} by ${s.termination.padEnd(10)} in ${String(s.plies).padStart(3)} plies | cells ${s.cellsEnd} | ` +
    `W ac${wc.white.ac}/rc${wc.white.rc}/mc${wc.white.mc} B ac${wc.black.ac}/rc${wc.black.rc}/mc${wc.black.mc}` +
    (s.aiIllegal ? ` | AI-ILLEGAL x${s.aiIllegal}` : '')
  );
}
const dt = (Date.now() - t0) / 1000;
const sum = summarize(games);
console.log('---');
console.log(`elapsed ${dt.toFixed(1)}s (${(dt / GAMES).toFixed(1)}s/game)`);
console.log(`results: W ${sum.wins.white}  B ${sum.wins.black}  draw ${sum.wins.draw}  (decisive ${sum.decisiveRate}%)`);
console.log(`terminations:`, sum.term);
console.log(`avg plies ${sum.avgPlies} | avg end cells ${sum.avgCells} (start 64)`);
console.log(`wildcards/game: add ${sum.wildPerGame.ac}, remove ${sum.wildPerGame.rc}, move ${sum.wildPerGame.mc}`);
if (sum.illegal) console.log(`WARNING: ${sum.illegal} AI-illegal actions`);

const tag = `${cfg.setup}-c${cfg.cadence}-b${Number.isFinite(cfg.budget) ? cfg.budget : 'inf'}-d${cfg.depth}-g${GAMES}`;
fs.writeFileSync(path.join(__dirname, `results-${tag}.json`), JSON.stringify({ cfg, summary: sum, games }, null, 2));
console.log(`wrote harness/results-${tag}.json`);
