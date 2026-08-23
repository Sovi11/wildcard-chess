// Calibrate the bot ladder: play adjacent bots against each other and check the
// rating order actually holds. Prints observed score plus the Elo gap it implies.
// Usage: node harness/calibrate.js [gamesPerPair=4] [maxPlies=140]

const path = require('path');
global.window = { WCAI: require(path.join(__dirname, '..', 'js', 'ai.js')) };
global.localStorage = { getItem: () => null, setItem: () => {} };
require(path.join(__dirname, '..', 'js', 'ladder.js'));

const { Game } = require(path.join(__dirname, '..', 'js', 'engine.js'));
const { Pos, chooseMoveFor, moveToGame, applyToGame } = global.window.WCAI;
const L = global.window.WCLADDER;

const GAMES = +process.argv[2] || 4;
const MAX = +process.argv[3] || 140;

function play(whiteBot, blackBot, seed) {
  const game = new Game();
  game.rules = { cadence: 2, budget: Infinity };
  let plies = 0, illegal = 0;
  while (!game.winner && !['stalemate', 'repetition'].includes(game.status) && plies < MAX) {
    const bot = game.turn === 'white' ? whiteBot : blackBot;
    const pos = Pos.fromGame(game, L.weightsFor(bot));
    const res = chooseMoveFor(pos, bot.search, seed * 7919 + plies);
    const gm = moveToGame(res.move);
    if (!gm || !applyToGame(game, gm)) {
      illegal++;
      let played = false;
      outer: for (const [k, p] of game.board) {
        if (p.color !== game.turn) continue;
        const [c, r] = k.split(',').map(Number);
        for (const m of game.legalMoves(c, r)) if (game.makeMove(c, r, m.c, m.r)) { played = true; break outer; }
      }
      if (!played) break;
    }
    plies++;
  }
  return { winner: game.winner, status: game.status, plies, illegal };
}

// score of A in a pair, colours swapped each game
function match(a, b, games) {
  let sa = 0, illegal = 0, mates = 0;
  for (let i = 0; i < games; i++) {
    const aWhite = i % 2 === 0;
    const r = play(aWhite ? a : b, aWhite ? b : a, i + 1);
    illegal += r.illegal;
    if (r.status === 'checkmate') mates++;
    if (!r.winner) sa += 0.5;
    else if ((r.winner === 'white') === aWhite) sa += 1;
  }
  return { sa, illegal, mates };
}

const bots = [...L.BOTS].sort((x, y) => x.elo - y.elo);
console.log(`Calibration: ${bots.length - 1} adjacent pairs x ${GAMES} games (colours swapped), max ${MAX} plies\n`);

const rows = [];
for (let i = 0; i < bots.length - 1; i++) {
  const lo = bots[i], hi = bots[i + 1];
  const t0 = Date.now();
  const { sa, illegal, mates } = match(hi, lo, GAMES);   // sa = score of the HIGHER-rated bot
  const pct = sa / GAMES;
  // Elo gap implied by the observed score
  const implied = (pct <= 0 || pct >= 1) ? (pct >= 1 ? 400 : -400)
    : Math.round(-400 * Math.log10(1 / pct - 1));
  const stated = hi.elo - lo.elo;
  rows.push({ hi: hi.name, lo: lo.name, sa, pct, implied, stated, mates, illegal });
  console.log(
    `${hi.name.padEnd(17)} vs ${lo.name.padEnd(17)} ` +
    `score ${sa.toFixed(1)}/${GAMES}  (${Math.round(pct * 100)}%)  ` +
    `implied gap ${String(implied).padStart(5)}  stated ${String(stated).padStart(4)}  ` +
    `mates ${mates}${illegal ? '  ILLEGAL ' + illegal : ''}  ${((Date.now() - t0) / 1000).toFixed(0)}s`
  );
}

const wrong = rows.filter(r => r.pct < 0.5);
console.log('\n--- summary ---');
console.log(`pairs where the higher-rated bot did NOT score above 50%: ${wrong.length}/${rows.length}`);
for (const r of wrong) console.log(`  ORDER SUSPECT: ${r.hi} only scored ${Math.round(r.pct * 100)}% vs ${r.lo}`);
const totalIllegal = rows.reduce((a, r) => a + r.illegal, 0);
console.log(totalIllegal ? `WARNING: ${totalIllegal} illegal actions` : 'no illegal actions');

require('fs').writeFileSync(path.join(__dirname, 'calibration.json'), JSON.stringify(rows, null, 2));
console.log('wrote harness/calibration.json');
