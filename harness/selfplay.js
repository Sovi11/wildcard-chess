// Self-play harness: AI vs AI, collect design-analysis stats.
// Usage:
//   node harness/selfplay.js [games=20] [depth=3] [K=10] [jitter=15] [maxPlies=200]
//   node harness/selfplay.js 50 3 --setup=no-wildcards      (baseline: plain chess rules)
//   node harness/selfplay.js 50 3 --setup=knight-vs-bishop  (white keeps knights, black keeps bishops)
// Prints per-game lines + a summary; writes harness/results-<tag>.json

const path = require('path');
const { Game } = require(path.join(__dirname, '..', 'js', 'engine.js'));
const { Pos, moveToGame, applyToGame } = require(path.join(__dirname, '..', 'js', 'ai.js'));

const args = process.argv.slice(2).filter(a => !a.startsWith('--'));
const flags = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? true : v];
}));

const GAMES = +args[0] || 20;
const DEPTH = +args[1] || 3;
const K = +args[2] || 10;
const JITTER = args[3] !== undefined ? +args[3] : 15;
const MAX_PLIES = +args[4] || 200;
const SETUP = flags.setup || 'standard';

function applySetup(game, setup) {
  if (setup === 'knight-vs-bishop') {
    // white loses bishops, black loses knights -> N+N vs B+B with all else equal
    for (const k of [...game.board.keys()]) {
      const p = game.board.get(k);
      if (p.color === 'white' && p.type === 'bishop') game.board.delete(k);
      if (p.color === 'black' && p.type === 'knight') game.board.delete(k);
    }
    game._evaluate();
  }
}

function playGame(idx) {
  const game = new Game();
  applySetup(game, SETUP);
  const stats = {
    idx, plies: 0, result: null, termination: null,
    wildcards: { white: { ac: 0, rc: 0, mc: 0 }, black: { ac: 0, rc: 0, mc: 0 } },
    cellsEnd: 0, checksGiven: 0,
  };
  const noWild = SETUP === 'no-wildcards';

  while (!game.winner && game.status !== 'stalemate' && stats.plies < MAX_PLIES) {
    const pos = Pos.fromGame(game);
    if (noWild) pos.eligible = () => false;
    const res = pos.search({ depth: DEPTH, K, jitter: JITTER, seed: idx * 1000 + stats.plies });
    const gm = moveToGame(res.move);
    if (!gm) break;  // no legal action found by AI => engine _evaluate decides below
    const mover = game.turn;
    if (!applyToGame(game, gm)) {
      // AI proposed something the rules engine rejects — log & play first legal piece move
      stats.aiIllegal = (stats.aiIllegal || 0) + 1;
      let played = false;
      outer: for (const [k, p] of game.board) {
        if (p.color !== game.turn) continue;
        const [c, r] = k.split(',').map(Number);
        for (const m of game.legalMoves(c, r)) {
          if (game.makeMove(c, r, m.c, m.r)) { played = true; break outer; }
        }
      }
      if (!played) break;
    } else if (gm.kind !== 'm') {
      stats.wildcards[mover][gm.kind]++;
    }
    if (game.status === 'check') stats.checksGiven++;
    stats.plies++;
  }

  stats.termination = game.status === 'checkmate' ? 'checkmate'
    : game.status === 'stalemate' ? 'stalemate'
    : stats.plies >= MAX_PLIES ? 'move-cap' : 'no-action';
  stats.result = game.winner || 'draw';
  stats.cellsEnd = game.cells.size;
  return stats;
}

console.log(`Self-play: ${GAMES} games, depth ${DEPTH}, K=${K}, jitter=${JITTER}cp, setup=${SETUP}`);
const all = [];
const t0 = Date.now();
for (let i = 0; i < GAMES; i++) {
  const s = playGame(i);
  all.push(s);
  const wc = s.wildcards;
  console.log(
    `game ${String(i).padStart(3)}: ${s.result.padEnd(5)} by ${s.termination.padEnd(9)} in ${String(s.plies).padStart(3)} plies | ` +
    `cells ${s.cellsEnd} | W wild ac${wc.white.ac}/rc${wc.white.rc}/mc${wc.white.mc}  B wild ac${wc.black.ac}/rc${wc.black.rc}/mc${wc.black.mc}` +
    (s.aiIllegal ? ` | AI-ILLEGAL x${s.aiIllegal}` : '')
  );
}
const dt = (Date.now() - t0) / 1000;

const n = all.length;
const wins = { white: 0, black: 0, draw: 0 };
const term = {};
let plies = 0, cells = 0, wildTotal = { ac: 0, rc: 0, mc: 0 }, illegal = 0;
for (const s of all) {
  wins[s.result]++;
  term[s.termination] = (term[s.termination] || 0) + 1;
  plies += s.plies; cells += s.cellsEnd; illegal += s.aiIllegal || 0;
  for (const side of ['white', 'black']) for (const k of ['ac', 'rc', 'mc']) wildTotal[k] += s.wildcards[side][k];
}
console.log('---');
console.log(`elapsed ${dt.toFixed(1)}s (${(dt / n).toFixed(1)}s/game)`);
console.log(`results: W ${wins.white}  B ${wins.black}  draw ${wins.draw}`);
console.log(`terminations:`, term);
console.log(`avg plies ${(plies / n).toFixed(1)} | avg end cells ${(cells / n).toFixed(1)} (start 64)`);
console.log(`wildcards used per game: add ${(wildTotal.ac / n).toFixed(1)}, remove ${(wildTotal.rc / n).toFixed(1)}, move ${(wildTotal.mc / n).toFixed(1)}`);
if (illegal) console.log(`WARNING: AI proposed ${illegal} illegal actions (engine/AI rules mismatch)`);

const fs = require('fs');
const tag = `${SETUP}-d${DEPTH}-g${GAMES}`;
fs.writeFileSync(path.join(__dirname, `results-${tag}.json`), JSON.stringify({ config: { GAMES, DEPTH, K, JITTER, MAX_PLIES, SETUP }, summary: { wins, term, avgPlies: plies / n, avgCells: cells / n, wildTotal, illegal }, games: all }, null, 2));
console.log(`wrote harness/results-${tag}.json`);
