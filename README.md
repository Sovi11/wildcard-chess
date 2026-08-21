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
- **Pawns promote at the edge of the world**: a pawn promotes when there is no square in front of it. Extend the board above the 8th rank and the pawn must march further.
- Castling / en-passant omitted in v1.

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

## Playing the bot

Pick **Opponent → Bot**, choose which side it plays, and set a level:

| Level | Depth | Behaviour |
|---|---|---|
| 1 Beginner | 1 | Sees one move ahead, 30% random moves. Hangs pieces. |
| 2 Casual | 2 | Spots simple captures and threats. |
| 3 Medium | 3 | Plans ahead, uses board wildcards with purpose. **Default.** |
| 4 Strong | 4 | Punishes mistakes, real terrain tactics. |
| 5 Brutal | 6 | Deepest search the clock allows (~3.5s/move). |

Verified ladder (colours swapped each game): Medium beat Beginner 8–0 and Casual 5.5–0.5, all wins by checkmate.

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
