// Calibrate the ladder against REAL chess strength: our search vs Stockfish
// (npm package, UCI_LimitStrength) on a normal 8x8 board with wildcards
// disabled (budget 0 - the variant engine then plays plain chess: castling,
// en passant, promotion at rank 8, threefold).
//
//   node harness/stockfish-match.js [gamesPerPairing]
//
// Output: score of each of our levels vs each SF Elo, plus the implied Elo of
// our level via the logistic score->rating-difference formula.

const path = require('path');
const { Game } = require(path.join(__dirname, '..', 'js', 'engine.js'));
const WCAI = require(path.join(__dirname, '..', 'js', 'ai.js'));

const GAMES = +process.argv[2] || 8;
const PLY_CAP = 240;
const SF_MOVETIME = 300;

// Our contenders: the LEVELS dials passed straight to chooseMoveFor.
const OURS = [
  { name: 'd6-analysis', dials: { depth: 6, K: 12, movetime: 1500, jitter: 0, blunder: 0 } },
];
// SF opponents. 1320 is the engine's UCI_Elo floor.
const SF_ELOS = [2200, 2500];

// ---- stockfish wrapper (npm stockfish v18) ---------------------------------
// This emscripten build binds its output to process.stdout at script-eval
// time — Module.print overrides after init are ignored. So the harness tees
// stdout: every complete line is offered to the waiting handlers, engine
// chatter ('info ...') is swallowed to keep the log readable, and the rest
// passes through. Handlers resolve via setImmediate: sending a command from
// inside the engine's own output frame gets silently dropped.
async function makeSF() {
  const init = require('stockfish');
  let lineHandlers = [];
  let buf = '';
  const origWrite = process.stdout.write.bind(process.stdout);
  process.stdout.write = function (chunk, enc, done) {
    buf += chunk.toString();
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, '');
      buf = buf.slice(i + 1);
      lineHandlers = lineHandlers.filter((h) => !h(line));
      if (!/^info /.test(line)) origWrite(line + '\n');
    }
    if (typeof done === 'function') done();
    return true;
  };
  const eng = await new Promise((resolve, reject) => {
    const e = init('lite-single', (err) => (err ? reject(err) : resolve(e)));
  });
  const send = (cmd) => eng.sendCommand(cmd);
  const waitFor = (re) => new Promise((resolve) => {
    lineHandlers.push((line) => {
      const m = line.match(re);
      if (m) { setImmediate(() => resolve(m)); return true; }
      return false;
    });
  });
  return { send, waitFor, quit: () => { try { eng.terminate(); } catch (e) {} } };
}

// ---- FEN from our engine ---------------------------------------------------
const FMAP = { pawn: 'p', knight: 'n', bishop: 'b', rook: 'r', queen: 'q', king: 'k' };
function toFEN(game) {
  let fen = '';
  for (let r = 7; r >= 0; r--) {
    let empty = 0, row = '';
    for (let c = 0; c < 8; c++) {
      const p = game.get(c, r);
      if (!p) { empty++; continue; }
      if (empty) { row += empty; empty = 0; }
      row += p.color === 'white' ? FMAP[p.type].toUpperCase() : FMAP[p.type];
    }
    if (empty) row += empty;
    fen += row + (r ? '/' : '');
  }
  fen += ' ' + (game.turn === 'white' ? 'w' : 'b') + ' ';
  const rights = (color, rank, K, Q) => {
    const k = game.get(4, rank);
    if (!k || k.type !== 'king' || k.color !== color || k.hasMoved) return '';
    let s = '';
    const rk = game.get(7, rank), rq = game.get(0, rank);
    if (rk && rk.type === 'rook' && rk.color === color && !rk.hasMoved) s += K;
    if (rq && rq.type === 'rook' && rq.color === color && !rq.hasMoved) s += Q;
    return s;
  };
  const cr = rights('white', 0, 'K', 'Q') + rights('black', 7, 'k', 'q');
  fen += (cr || '-') + ' ';
  fen += game.epTarget ? String.fromCharCode(97 + game.epTarget.c) + (game.epTarget.r + 1) : '-';
  fen += ' 0 ' + (Math.floor((game.moveCount.white + game.moveCount.black) / 2) + 1);
  return fen;
}

// ---- one game --------------------------------------------------------------
// ourColor: 'white' | 'black'. Returns 1 if OUR side wins, 0 loss, 0.5 draw.
async function playGame(sf, dials, sfElo, ourColor, seed) {
  const game = new Game();
  game.rules = { cadence: 3, budget: 0 };   // budget 0: wildcards never fire

  sf.send('ucinewgame');
  sf.send('setoption name UCI_LimitStrength value true');
  sf.send('setoption name UCI_Elo value ' + sfElo);
  sf.send('isready');
  await sf.waitFor(/^readyok/);

  let plies = 0;
  while (!game.winner && !['stalemate', 'repetition'].includes(game.status) && plies < PLY_CAP) {
    if (game.turn === ourColor) {
      const pos = WCAI.Pos.fromGame(game);
      const res = WCAI.chooseMoveFor(pos, dials, seed + plies);
      const gm = WCAI.moveToGame(res.move);
      if (!WCAI.applyToGame(game, gm)) throw new Error('our engine produced an illegal action: ' + JSON.stringify(gm));
    } else {
      sf.send('position fen ' + toFEN(game));
      sf.send('go movetime ' + SF_MOVETIME);
      const m = await sf.waitFor(/^bestmove (\S+)/);
      const uci = m[1];
      if (uci === '(none)') break;
      const fc = uci.charCodeAt(0) - 97, fr = +uci[1] - 1;
      const tc = uci.charCodeAt(2) - 97, tr = +uci[3] - 1;
      if (!game.makeMove(fc, fr, tc, tr)) throw new Error('SF move rejected: ' + uci + ' fen ' + toFEN(game));
      // (underpromotions become queens on our board; harmless at these levels)
    }
    plies++;
  }
  if (game.winner) return { score: game.winner === ourColor ? 1 : 0, plies, end: 'checkmate' };
  return { score: 0.5, plies, end: game.status === 'playing' || game.status === 'check' ? 'ply-cap' : game.status };
}

const impliedElo = (score, n, sfElo) => {
  let p = score / n;
  p = Math.min(0.97, Math.max(0.03, p));            // clamp: no infinities on sweeps
  return Math.round(sfElo + 400 * Math.log10(p / (1 - p)));
};

(async function main() {
  const sf = await makeSF();
  sf.send('uci');
  await sf.waitFor(/^uciok/);
  console.log('stockfish ready. games per pairing:', GAMES);

  const table = [];
  for (const ours of OURS) {
    for (const sfElo of SF_ELOS) {
      let score = 0;
      const t0 = Date.now();
      for (let g = 0; g < GAMES; g++) {
        const ourColor = g % 2 === 0 ? 'white' : 'black';
        const r = await playGame(sf, ours.dials, sfElo, ourColor, 1000 * g + 7);
        score += r.score;
        console.log(`  ${ours.name} vs SF${sfElo} game ${g} (${ourColor}): ${r.score} (${r.end}, ${r.plies} plies)`);
      }
      const row = {
        ours: ours.name, sfElo, score, games: GAMES,
        pct: Math.round((score / GAMES) * 100),
        implied: impliedElo(score, GAMES, sfElo),
        secs: Math.round((Date.now() - t0) / 1000),
      };
      table.push(row);
      console.log(`== ${ours.name} vs SF${sfElo}: ${score}/${GAMES} (${row.pct}%) -> implied ~${row.implied} (${row.secs}s)`);
    }
  }
  console.log('\nFINAL');
  for (const r of table) console.log(`${r.ours} vs SF${r.sfElo}: ${r.score}/${r.games} -> implied ${r.implied}`);
  sf.quit();
  process.exit(0);
})().catch((e) => { console.error('FATAL', e); process.exit(1); });
