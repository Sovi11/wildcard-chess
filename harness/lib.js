// Shared self-play machinery for harness scripts.
const path = require('path');
const { Game } = require(path.join(__dirname, '..', 'js', 'engine.js'));
const { Pos, moveToGame, applyToGame } = require(path.join(__dirname, '..', 'js', 'ai.js'));

// cfg: { depth, K, jitter, maxPlies, cadence, budget, setup, seed }
function playGame(cfg, idx) {
  const game = new Game();
  game.rules = { cadence: cfg.cadence || 3, budget: cfg.budget != null ? cfg.budget : Infinity };

  if (cfg.setup === 'knight-vs-bishop') {
    for (const k of [...game.board.keys()]) {
      const p = game.board.get(k);
      if (p.color === 'white' && p.type === 'bishop') game.board.delete(k);
      if (p.color === 'black' && p.type === 'knight') game.board.delete(k);
    }
    game._evaluate();
  }

  const stats = {
    idx, plies: 0, result: null, termination: null,
    wildcards: { white: { ac: 0, rc: 0, mc: 0 }, black: { ac: 0, rc: 0, mc: 0 } },
    cellsEnd: 0, aiIllegal: 0,
  };
  const noWild = cfg.setup === 'no-wildcards';
  const maxPlies = cfg.maxPlies || 200;

  while (!game.winner && !['stalemate', 'repetition'].includes(game.status) && stats.plies < maxPlies) {
    const pos = Pos.fromGame(game);
    if (noWild) pos.eligible = () => false;
    if (cfg.allowActions) pos.allowActions = cfg.allowActions;
    const res = pos.search({ depth: cfg.depth || 3, K: cfg.K || 10, jitter: cfg.jitter != null ? cfg.jitter : 15, seed: (cfg.seed || 0) + idx * 1000 + stats.plies });
    const gm = moveToGame(res.move);
    if (!gm) break;
    const mover = game.turn;
    if (!applyToGame(game, gm)) {
      stats.aiIllegal++;
      let played = false;
      outer: for (const [k, p] of game.board) {
        if (p.color !== game.turn) continue;
        const [c, r] = k.split(',').map(Number);
        for (const m of game.legalMoves(c, r)) if (game.makeMove(c, r, m.c, m.r)) { played = true; break outer; }
      }
      if (!played) break;
    } else if (gm.kind !== 'm') {
      stats.wildcards[mover][gm.kind]++;
    }
    stats.plies++;
  }

  stats.termination = game.status === 'checkmate' ? 'checkmate'
    : game.status === 'stalemate' ? 'stalemate'
    : game.status === 'repetition' ? 'repetition'
    : stats.plies >= maxPlies ? 'move-cap' : 'no-action';
  stats.result = game.winner || 'draw';
  stats.cellsEnd = game.cells.size;
  return stats;
}

function summarize(games) {
  const n = games.length;
  const wins = { white: 0, black: 0, draw: 0 };
  const term = {};
  let plies = 0, cells = 0, illegal = 0;
  const wild = { ac: 0, rc: 0, mc: 0 };
  for (const s of games) {
    wins[s.result]++;
    term[s.termination] = (term[s.termination] || 0) + 1;
    plies += s.plies; cells += s.cellsEnd; illegal += s.aiIllegal;
    for (const side of ['white', 'black']) for (const k of ['ac', 'rc', 'mc']) wild[k] += s.wildcards[side][k];
  }
  return {
    n, wins, term,
    avgPlies: +(plies / n).toFixed(1),
    avgCells: +(cells / n).toFixed(1),
    wildPerGame: { ac: +(wild.ac / n).toFixed(1), rc: +(wild.rc / n).toFixed(1), mc: +(wild.mc / n).toFixed(1) },
    decisiveRate: +(((wins.white + wins.black) / n) * 100).toFixed(0),
    illegal,
  };
}

module.exports = { playGame, summarize };
