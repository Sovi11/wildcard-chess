// Verify the difficulty ladder: level A vs level B, colours swapped each game.
// Usage: node harness/botmatch.js [levelA=1] [levelB=3] [games=8] [maxPlies=140]

const path = require('path');
const { Game } = require(path.join(__dirname, '..', 'js', 'engine.js'));
const { Pos, chooseMove, moveToGame, applyToGame, levelById } = require(path.join(__dirname, '..', 'js', 'ai.js'));

const A = +process.argv[2] || 1;
const B = +process.argv[3] || 3;
const GAMES = +process.argv[4] || 8;
const MAX = +process.argv[5] || 140;

function play(whiteLevel, blackLevel, seed) {
  const game = new Game();
  game.rules = { cadence: 2, budget: Infinity };
  let plies = 0;
  while (!game.winner && !['stalemate', 'repetition'].includes(game.status) && plies < MAX) {
    const lv = game.turn === 'white' ? whiteLevel : blackLevel;
    const pos = Pos.fromGame(game);
    const res = chooseMove(pos, lv, seed * 977 + plies);
    const gm = moveToGame(res.move);
    if (!gm || !applyToGame(game, gm)) {
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
  return { winner: game.winner, status: game.status, plies };
}

const nameA = levelById(A).name, nameB = levelById(B).name;
console.log(`Match: L${A} ${nameA} vs L${B} ${nameB} — ${GAMES} games (colours swapped), max ${MAX} plies\n`);

let scoreA = 0, scoreB = 0, draws = 0;
for (let i = 0; i < GAMES; i++) {
  const aIsWhite = i % 2 === 0;
  const r = play(aIsWhite ? A : B, aIsWhite ? B : A, i + 1);
  let tag;
  if (!r.winner) { draws++; tag = 'draw'; }
  else {
    const winnerIsA = (r.winner === 'white') === aIsWhite;
    if (winnerIsA) { scoreA++; tag = `L${A} ${nameA}`; } else { scoreB++; tag = `L${B} ${nameB}`; }
  }
  console.log(`  g${i} (${nameA} as ${aIsWhite ? 'W' : 'B'}): ${tag.padEnd(12)} ${r.status.padEnd(10)} ${r.plies}p`);
}

const pts = (w, d) => (w + d / 2).toFixed(1);
console.log(`\nL${A} ${nameA}: ${scoreA} wins | L${B} ${nameB}: ${scoreB} wins | draws: ${draws}`);
console.log(`score: ${nameA} ${pts(scoreA, draws)} — ${pts(scoreB, draws)} ${nameB}  (of ${GAMES})`);
