# Wildcard Chess

Standard chess — but **the board itself is fair game**. Every second move, instead of moving a piece, you can reshape the terrain: add a square, remove a square, or move a square. Tear a hole in a bishop's diagonal. Grow a corridor behind the enemy king. The pieces play chess; the players play geography.

## Rules (v3)

- Standard chess movement, local 2-player hotseat. Board starts 8×8.
- Each player's **2nd, 4th, 6th… move** is *wildcard-eligible*: make a normal move **or** one board action:
  - **Add square** — attach a new square at any empty spot touching the board (any direction, including diagonally). The board can grow without limit.
  - **Remove square** — delete any **empty** square (occupied squares are safe). Leaves a hole.
  - **Move square** — pick up any **empty** square and re-attach it anywhere touching the rest of the board.
- **Holes block sliding pieces** (rook/bishop/queen lines stop at missing squares). Knights jump over holes but must land on an existing square. Square colour is just position parity — a moved square may change colour.
- **Win by checkmate.** Full legality: no moving into check, pins are real. On a wildcard turn, board actions count as escapes — e.g. removing a square to sever the attacker's line. It's only mate if nothing (moves *or* board actions) saves you.
- **Pawns promote at the edge of the world**: a pawn promotes only when there is no square anywhere ahead of it in its file. A lone hole directly in front is *not* the edge — the board may resume past it. Extend the board above the 8th rank and the pawn must march further.
- **En passant** works as in normal chess: a double-stepped pawn can be taken on the square it skipped, but only on the immediate reply. Spending that reply on a board wildcard forfeits the capture.
- **Castling** works as in normal chess, with one variant condition: the path between king and rook must be **complete**. A hole anywhere along it denies castling on that side until the square is put back.

## Play

**Online:** https://sovi11.github.io/wildcard-chess/

**Ranked:** hit *Find a match* and you are queued against someone near your rating.

**With a friend, two ways:**
- *2 players, one screen* — offline hotseat, pass the mouse.
- *Friend, by link* — after each move you get a link; send it however you like (WhatsApp,
  Discord). Your friend opens it, sees the exact position, plays, and sends one back. The
  link is the whole save file (~180 characters) — no server, no accounts, no sign-up.

## Play it (dev)

No build step — plain HTML/JS/SVG:

```bash
cd wildcard-chess
python -m http.server 5180
# open http://localhost:5180
```

## Desktop app (Electron)

```bash
npm install
npm start
```

## Steam-ready Windows build

```bash
npm run dist:win
# dist/win-unpacked/ is the folder you upload via SteamPipe
```

See package.json for electron-builder config. For achievements/overlay later: `steamworks.js` + `steam_appid.txt`.

## Layout

```
wildcard-chess/
  index.html          # page + UI shell
  styles.css          # dark theme, board + void styling
  js/engine.js        # pure game logic (cells Set + pieces Map) — Node-testable, no DOM
  js/pieces.js        # original flat SVG piece set (no licensing issues)
  js/main.js          # SVG rendering + click/UI wiring
  electron-main.js    # desktop wrapper
```

## Ranked play and matchmaking

You start at **500**. Hit **Find a match** and you are queued: the search opens a rating
band around you and pairs you with the closest available opponent.

The pool is stocked with resident bots so the queue is never empty. You do not pick them —
they are matched to you like any other player, weighted toward your rating, with the
opponent you just played damped so you are not fed the same one twice. **Their ratings move
too**, by the same Elo maths (smaller K, since they play far more games), so the pool stays
honest as you climb.

`js/matchmaking.js` prefers a human whenever a backend is registered via
`WCMATCH.setBackend(...)`; with none registered every match resolves to the pool.

Ratings were calibrated by bot-vs-bot self-play (`node harness/calibrate.js`), not guessed.

### Who is in the pool

Personalities are evaluation weights, not just search depth — a root-only bias per board
action steers style without corrupting the search:

| Player | Seed | Style |
|---|---|---|
| Pawnsy | 300 | Beginner, barely notices the board can change |
| Rusty Rook | 420 | Overvalues rooks, trades anything for one |
| The Vandal | 520 | Tears squares out; expect holes everywhere |
| Sir Castle | 600 | Defensive, hoards floor around his king |
| Gambit | 700 | Aggressive, sacrifices happily |
| Chaos Kate | 760 | Terrain shuffler, wildly inconsistent |
| The Architect | 820 | Grows new ground and marches pawns across it |
| Iron Ivan | 1020 | Pure chess, ignores the wildcards entirely |
| Grandmaster Vex | 1200 | Strong all-round |
| THE VOID | 1450 | Terrain master; you run out of floor first |

## Tutor / analysis

A chess.com-style coach runs alongside play:

- **Eval bar** beside the board, White at the bottom, with a numeric score (`+1.2`, `-0.4`, `+M3`).
- **Best move** button draws a gold arrow for piece moves, or marks the square for board actions.
- **Move grading** — every ply is graded by centipawn loss against the engine's best:
  Best `*`, Excellent, Good, Inaccuracy `?!`, Mistake `?`, Blunder `??`. Badges appear inline in the move log.
- **Accuracy %** per side, derived from average centipawn loss.
- Depth selector: Fast (2) / Normal (3) / Deep (4). One search per ply serves double duty —
  it evaluates the new position *and* grades the move that produced it.

Board wildcards are graded and suggested exactly like piece moves, which matters because nobody has
intuition for terrain tactics yet.

## Engine architecture

```
js/engine.js   rules authority — legality, check/mate, repetition. Clones state per
               legality probe: correct and simple, too slow for search.
js/ai.js       search engine — its own make/unmake position with int-packed
               coords and no allocation per node.
```

The AI mirrors the rules rather than sharing them (deliberate: the rules engine optimises for
clarity, the search for speed), so `harness/` asserts they agree — every AI action is replayed
through `engine.js` and any rejection is reported as `AI-ILLEGAL`.

Search: iterative deepening → negamax + alpha-beta → quiescence (captures only) at the leaves.
Move ordering by captured-piece value. ~270k nodes/sec; depth 4 in under a second.

The variant-specific problem is branching factor. A wildcard turn offers ~35 piece moves **plus**
~40 adds, ~30 removes and ~1200 square-moves. Full width is hopeless, so board actions are
**candidate-pruned to top-K** by a static score: cut a check line to my king, freeze an enemy pawn
by stealing the square ahead of it, deny promotion by extending the world, open escape squares
for my king. Piece moves stay full width.

Evaluation is hand-written and terrain-aware: material, mobility (counted over *existing* cells,
so holes reduce it), king ring (how much floor surrounds the king), pawn advancement measured as
distance to the world's edge, and a penalty for pawns with a hole in front.

## Analysis harness

```bash
node harness/analyze.js --depth=5          # best action + eval for one position
node harness/selfplay.js 30 3              # N games, stats on mates/draws/action usage
node harness/botmatch.js 2 3 6             # level vs level, colours swapped
```

## Roadmap
- Analysis engine: iterative-deepening alpha-beta + variant-aware eval, candidate pruning for board actions (branching factor of square-moves is huge). Node self-play harness to answer design questions (mate feasibility, piece values on mutable terrain, game length).
- Play vs AI in the UI (Web Worker), eval bar.
- Balance passes: action budgets, restrict adds per game, connectivity rules.
- Sound, animations, promotion choice, capsule art for Steam.
