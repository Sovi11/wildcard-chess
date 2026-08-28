# Hollow Chess

Standard chess — but **the board itself is fair game**. On board turns, instead of moving a piece, you can reshape the terrain: pick up an empty square and move it somewhere else. Tear a hole in a bishop's diagonal. Grow a corridor behind the enemy king. The pieces play chess; the players play geography.

## Rules (v4)

- Standard chess movement. Board starts 8×8.
- **Every 3rd ply of the game is a board turn**, staggered `W B✦ W B W✦ B W B✦ …` —
  Black's 1st/4th/7th move, White's 3rd/6th/9th. (Black's early board turn offsets
  White's first-move tempo, and no two board turns ever land back to back.)
  On a board turn you make a normal move **or** **move a square** — click any
  **empty** square to lift it, then click where to re-attach it (anywhere touching
  the rest of the board). It leaves a hole behind.
  *(Add and Remove square exist in the engine but are parked as redundant: moving a square
  is a remove and an add in one action. The harness can still enable them for experiments.)*
- **Holes block sliding pieces** (rook/bishop/queen lines stop at missing squares). Knights jump over holes but must land on an existing square. Square colour is just position parity — a moved square may change colour.
- **Win by checkmate.** Full legality: no moving into check, pins are real. On a board turn, board actions count as escapes — e.g. moving a square to sever the attacker's line. It's only mate if nothing (moves *or* board actions) saves you.
- **Pawns promote at the edge of the world**: a pawn promotes only when there is no square anywhere ahead of it in its file. A lone hole directly in front is *not* the edge — the board may resume past it. Extend the board above the 8th rank and the pawn must march further.
- **En passant** works as in normal chess: a double-stepped pawn can be taken on the square it skipped, but only on the immediate reply. Spending that reply on a board wildcard forfeits the capture.
- **50-move rule**: 100 plies with no pawn move and no capture is a draw. Board moves never reset the clock — so a fortress-island siege (bridge, burn, bridge, burn) ends in a draw instead of running forever.
- **Castling** works as in normal chess, with one variant condition: the path between king and rook must be **complete**. A hole anywhere along it denies castling on that side until the square is put back.

## Play

**Play:** https://hollowchess.com  (also at https://sovi11.github.io/wildcard-chess/)

**Ranked:** hit *Find a match*. It looks for a real player for 10 seconds, then falls back
to the resident pool so you are never left staring at an empty queue.

**With a friend:**
- *Online, live* — send **one** link. Once they open it you both play in real time; moves
  stream straight between the two browsers.
- *2 players, one screen* — offline hotseat, pass the mouse.
- *Correspondence* (tucked away) — trade a fresh link after every move. Slow, but it works
  when you are never online at the same time.

### Accounts and cloud ratings (optional)

Paste Supabase keys into `js/config.js` and you get Google sign-in, a rating that follows
you between devices, a global leaderboard, and a matchmaking queue that persists for two
minutes instead of needing both players inside the same ten seconds. Full walkthrough in
[SUPABASE_SETUP.md](SUPABASE_SETUP.md), about 15 minutes.

Leave `config.js` empty and none of it activates: ratings stay in local storage, the
sign-in button hides itself, and matchmaking stays peer-to-peer. Even with the backend on,
**no moves go through the server** — the queue only exchanges a PeerJS id, and the game
still runs browser-to-browser.

### How online works without a server

Moves travel over a direct WebRTC data channel between the two browsers. A free public
PeerJS broker is used only to introduce the peers and never sees a move.

Matchmaking has no backend either. A player who finds nobody waiting parks on a predictable
"lobby slot" id inside their rating bucket; the next player to queue probes those slots and
connects. The budget is split deliberately — about a third spent looking, the rest spent
waiting — because if every client only probed, nobody would ever be waiting to be found.

Two caveats worth knowing: the public broker is best-effort (it can rate-limit), and with a
small player base two people have to queue inside the same ~10 second window to meet. A real
backend fixes both, and `WCNET`/`WCMATCH` are structured to accept one.

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
| Tumbleweed Tim | 250 | Basically random; every piece is worth a pawn to him |
| Backwards Bella | 400 | Eval installed upside-down; walls in her own king |
| Pawnsy | 550 | Beginner, barely notices the board can change |
| Rusty Rook | 750 | Overvalues rooks, trades anything for one |
| The Vandal | 900 | Tears squares out; expect holes everywhere |
| Sir Castle | 1000 | Defensive, hoards floor around his king |
| Gambit | 1100 | Aggressive, sacrifices happily |
| Chaos Kate | 1250 | Terrain shuffler, wildly inconsistent |
| The Architect | 1350 | Grows new ground and marches pawns across it |
| Iron Ivan | 1500 | Pure chess, ignores the wildcards entirely |
| Grandmaster Vex | 1750 | Strong all-round |
| THE VOID | 2050 | Terrain master; you run out of floor first |

Seeds are calibrated against **real Stockfish 18** (`node harness/stockfish-match.js`,
UCI_LimitStrength, wildcards disabled so it's plain chess): our depth-1 search is
sub-1000, depth-3 lands ≈1050–1150, and depth-5 swept SF-1320 6–0 and beat SF-2000
3.5–2.5 (implied ≈2050). Personality handicaps (blunder rates, cooked evals) place
each bot below its raw search strength.

## Appearance

Board themes and piece sets mix freely and persist (panel → Appearance):

- **Boards:** Slate (default), **Garden & stone** (moss and paving, holes show bare soil,
  squares rounded like stones), Parchment, **Neon void** (black pieces trace in cyan).
- **Pieces:** Classic, or **Garden gnomes** — pawns are small gnomes, rooks are mushroom
  houses, knights ride snails, bishops carry lanterns, queens wear flower crowns, and the
  king has the tallest hat. White wears red hats, black wears blue.

## Feel

- **Sound** — synthesized live with WebAudio (no audio files): wooden thocks for piece
  moves, a sharper knock for captures, and a low **stone-grind rumble plus a screen
  quake** when a square of the world moves — a board move should feel like nothing
  else in the game. Mute toggle in the header, remembered per device.
- **Board turns glow** — the board pulses gold when a ✦ board turn is available, so
  you never miss one.
- **Welcome & walkthrough** — signed-out visitors land on a welcome screen with
  sign-in / guest; first-timers get a 5-step illustrated tutorial (replayable from
  Rules → "Replay the walkthrough").

## Mobile

Fully playable by touch: tap a piece, tap a square. The layout reorders on narrow screens
(board first, thumb-sized action buttons beneath), double-tap zoom is suppressed on the
board, and the site installs as a **PWA** — Add to Home Screen gives a standalone app that
opens instantly and plays bot games offline.

## Tutor / analysis

A chess.com-style coach runs alongside play:

- **Hidden during live play** — no eval, no best move, no grades until the game ends.
  The full report appears the moment it's over. (`?dev=1` shows it live, for development.)
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
- Animations, promotion choice, capsule art for Steam.
