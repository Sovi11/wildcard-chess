// Copy finished shorts into the upload folder with a post-copy .txt beside each one.
//
//   node harness/export-shorts.js            # everything rendered so far (re-runnable)
//
// Target: C:\Users\prava\OneDrive\Desktop\Hollow Chess Shorts
//   puzzles/batch-N/puzzle-N.mp4, puzzle-N-sq.mp4, puzzle-N.txt
//   day/dayN.mp4, dayN-sq.mp4, dayN.txt
// Only puzzles whose BOTH formats exist are exported.

const path = require('path');
const fs = require('fs');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'shorts', 'out');
const TARGET = process.argv[2] || 'C:\\Users\\prava\\OneDrive\\Desktop\\Hollow Chess Shorts';
const BATCH = 10;
const WORDS = ['', 'one', 'two', 'three'];

const puzzles = JSON.parse(fs.readFileSync(path.join(ROOT, 'shorts', 'puzzles.json'), 'utf8')).puzzles;

function copy(src, dst) {
  if (!fs.existsSync(src)) return false;
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  const same = fs.existsSync(dst) && fs.statSync(dst).size === fs.statSync(src).size && fs.statSync(dst).mtimeMs >= fs.statSync(src).mtimeMs;
  if (!same) fs.copyFileSync(src, dst);
  return true;
}

function puzzleText(p, i) {
  const n = i + 1, side = p.spec.turn === 'white' ? 'White' : 'Black';
  const when = p.phase === 'now' ? 'right now' : 'on your second move';
  const whenShort = p.phase === 'now' ? 'now' : 'on move 2';
  const solution = p.line.map((m, j) => (j % 2 === 0 ? Math.floor(j / 2) + 1 + '. ' : '') + m.hcn).join(' ');
  const tag = ['', '#mateinone', '#mateintwo', '#mateinthree'][p.n];
  return `Hollow Chess puzzle #${n}  |  mate in ${p.n}, ${side} to play, board move ${whenShort}
Files: puzzle-${i}.mp4 (9:16 for Reels / Shorts)   puzzle-${i}-sq.mp4 (1:1 for the Instagram feed)
Series rule: keep the Day count going — replace [DAY] with today's number.

=== YOUTUBE TITLE ===
Mate in ${p.n} — but you can move the FLOOR. Hollow Chess puzzle #${n}

=== YOUTUBE DESCRIPTION ===
Day [DAY] of posting until Hikaru plays my chess game.

Hollow Chess puzzle #${n}: mate in ${p.n}, ${side} to play. You may move one empty square of the board ${when} — that's the whole trick.

Rules in one line: every third turn you can move a square of the board instead of a piece. Holes block rooks, bishops and queens; filling a hole opens a line; knights jump.

Pause before the solution. Comment your answer if you had it before the reveal.

Free in your browser, no download, no login: https://hollowchess.com

#chess #chesspuzzle #chessvariant #hollowchess #shorts ${tag} #hikaru

=== INSTAGRAM CAPTION ===
day [DAY] of posting until Hikaru plays my chess game ♟️🕳️

mate in ${WORDS[p.n]}. ${side.toLowerCase()} to play. you can move a square of the board ${when}.
pause it. find it. solution at the end.

puzzle #${n} — play the game free, link in bio.

#chess #chesspuzzle #chessreels #chessvariant #hollowchess ${tag} #hikaru #indiegame

=== FIRST COMMENT (both platforms) ===
hollowchess.com — every 3rd turn you may pick up an EMPTY square and re-attach it edge-to-edge anywhere. Holes block rooks/bishops/queens.

=== SOLUTION (pin it after 24h, or answer whoever asks) ===
${solution}
`;
}

const dayText = (n) => `Day ${n} — "until Hikaru plays my chess game"
Files: day${n}.mp4 (9:16 for Reels / Shorts)   day${n}-sq.mp4 (1:1 for the Instagram feed)

=== YOUTUBE TITLE ===
Day ${n} of posting until Hikaru plays my chess game

=== YOUTUBE DESCRIPTION ===
Day ${n}. I built a chess variant and I'm posting until Hikaru plays it.

Hollow Chess: normal chess, except every third turn you can pick up an empty square of the board and move it somewhere else. Holes block rooks, bishops and queens. Knights jump them. Checkmate wins, same as always — the board just keeps changing shape under you.

Free in your browser, no download, no login: https://hollowchess.com

Solo project. If you play it, tell me what broke.
#chess #chessvariant #hollowchess #shorts #indiegame #hikaru

=== INSTAGRAM CAPTION ===
day ${n} of posting until Hikaru plays my chess game ♟️🕳️

it's chess, but every 3rd turn you move a square of the board.
so the rook gets stuck. and "checkmate" isn't.

free, in your browser — link in bio.

#chess #chessvariant #chessreels #hikaru #indiegame #hollowchess #gamedev

=== FIRST COMMENT ===
hollowchess.com
`;

let exported = 0, skipped = 0;
puzzles.forEach((p, i) => {
  const batch = Math.floor(i / BATCH) + 1;
  const srcDir = path.join(OUT, 'puzzles', 'batch-' + batch);
  const dstDir = path.join(TARGET, 'puzzles', 'batch-' + batch);
  const a = path.join(srcDir, `puzzle-${i}.mp4`), b = path.join(srcDir, `puzzle-${i}-sq.mp4`);
  if (!fs.existsSync(a) || !fs.existsSync(b)) { skipped++; return; }
  copy(a, path.join(dstDir, `puzzle-${i}.mp4`));
  copy(b, path.join(dstDir, `puzzle-${i}-sq.mp4`));
  fs.writeFileSync(path.join(dstDir, `puzzle-${i}.txt`), puzzleText(p, i), 'utf8');
  exported++;
});
for (const f of fs.readdirSync(path.join(OUT, 'day')).filter((f) => /^day\d+\.mp4$/.test(f))) {
  const n = +f.match(/\d+/)[0];
  copy(path.join(OUT, 'day', f), path.join(TARGET, 'day', f));
  copy(path.join(OUT, 'day', `day${n}-sq.mp4`), path.join(TARGET, 'day', `day${n}-sq.mp4`));
  fs.writeFileSync(path.join(TARGET, 'day', `day${n}.txt`), dayText(n), 'utf8');
}
console.log(`exported ${exported} puzzles (${skipped} not rendered yet) + day videos -> ${TARGET}`);
