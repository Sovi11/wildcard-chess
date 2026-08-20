// Position analysis: run the engine on a position and print the best action.
// Usage:
//   node harness/analyze.js                       (startpos after 1.e4 e5, White wildcard turn)
//   node harness/analyze.js --depth=5 --K=16
// Edit buildPosition() to probe endgames / custom setups.

const path = require('path');
const { Game, sq } = require(path.join(__dirname, '..', 'js', 'engine.js'));
const { Pos, moveToGame } = require(path.join(__dirname, '..', 'js', 'ai.js'));

const flags = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => {
  const [k, v] = a.replace(/^--/, '').split('=');
  return [k, v === undefined ? true : +v];
}));

function buildPosition() {
  const game = new Game();
  game.makeMove(4, 1, 4, 3);   // e4
  game.makeMove(4, 6, 4, 4);   // e5
  return game;                 // White to move, wildcard-eligible
}

const game = buildPosition();
console.log(`turn: ${game.turn}, wildcard-eligible: ${game.wildcardEligible()}, status: ${game.status}`);

const pos = Pos.fromGame(game);
const t0 = Date.now();
const res = pos.search({ depth: flags.depth || 4, K: flags.K || 12, movetime: flags.movetime || 0 });
const dt = Date.now() - t0;

const gm = moveToGame(res.move);
const fmt = (gm) => {
  if (!gm) return '(none)';
  if (gm.kind === 'm') return `piece ${sq(gm.from.c, gm.from.r)} -> ${sq(gm.to.c, gm.to.r)}`;
  if (gm.kind === 'ac') return `ADD square ${sq(gm.cell.c, gm.cell.r)}`;
  if (gm.kind === 'rc') return `REMOVE square ${sq(gm.cell.c, gm.cell.r)}`;
  return `MOVE square ${sq(gm.from.c, gm.from.r)} -> ${sq(gm.to.c, gm.to.r)}`;
};
console.log(`best: ${fmt(gm)}`);
console.log(`score: ${res.score}cp (side to move POV), depth ${res.depth}, ${res.nodes} nodes, ${dt}ms (${Math.round(res.nodes / Math.max(dt, 1) * 1000)} nps)`);
