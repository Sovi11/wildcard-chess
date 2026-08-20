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

## Roadmap
- Analysis engine: iterative-deepening alpha-beta + variant-aware eval, candidate pruning for board actions (branching factor of square-moves is huge). Node self-play harness to answer design questions (mate feasibility, piece values on mutable terrain, game length).
- Play vs AI in the UI (Web Worker), eval bar.
- Balance passes: action budgets, restrict adds per game, connectivity rules.
- Sound, animations, promotion choice, capsule art for Steam.
