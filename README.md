# Hollow Chess

Standard chess — but **the board itself is fair game**. On board turns, instead of moving a piece, you can reshape the terrain: pick up an empty square and move it somewhere else. Tear a hole in a bishop's diagonal. Grow a corridor behind the enemy king. The pieces play chess; the players play geography.

## Rules (v4)

- Standard chess movement. Board starts 8×8.
- **Every 3rd ply of the game is a board turn**, staggered `W B✦ W B W✦ B W B✦ …` —
  Black's 1st/4th/7th move, White's 3rd/6th/9th. (Black's early board turn offsets
  White's first-move tempo, and no two board turns ever land back to back.)
  On a board turn you make a normal move **or** **move a square** — click any
  **empty** square to lift it, then click where to re-attach it (anywhere edge-adjacent to —
  sharing a side with, not just a corner of —
  the rest of the board). It leaves a hole behind.
  *(Add and Remove square exist in the engine but are parked as redundant: moving a square
  is a remove and an add in one action. The harness can still enable them for experiments.)*
- **Holes block sliding pieces** (rook/bishop/queen lines stop at missing squares). Knights jump over holes but must land on an existing square. Square colour is just position parity — a moved square may change colour.
- **Win by checkmate.** Full legality: no moving into check, pins are real. On a board turn, board actions count as escapes — e.g. moving a square to sever the attacker's line. It's only mate if nothing (moves *or* board actions) saves you.
- **Pawns promote at the edge of the world**: a pawn promotes only when there is no square anywhere ahead of it in its file. A lone hole directly in front is *not* the edge — the board may resume past it. Extend the board above the 8th rank and the pawn must march further.
- **En passant** works as in normal chess: a double-stepped pawn can be taken on the square it skipped, but only on the immediate reply. Spending that reply on a board wildcard forfeits the capture.
- **50-move rule**: 100 plies with no pawn move and no capture is a draw. Board moves never reset the clock — so a fortress-island siege (bridge, burn, bridge, burn) ends in a draw instead of running forever.
- **Castling** works as in normal chess, with one variant condition: the path between king and rook must be **complete**. A hole anywhere along it denies castling on that side until the square is put back.

## Notation

Games are recorded in **Hollow Chess Notation** (HCN) — long-algebraic chess
plus one new operator: `>` moves a square of the world (`e5>c9`). Full spec in
[NOTATION.md](NOTATION.md). The post-game panel has a Copy button that exports
the whole game as text.

## Play

**Play:** https://hollowchess.com  (also at https://sovi11.github.io/wildcard-chess/)

**Ranked:** hit *Find a match*. It looks for a real player for 30 seconds (humans strictly preferred, and only paired within 250 rating points), then falls back
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
  js/solver.js        # full-width prover — puzzle proofs, Node + browser
  js/puzzles.js       # puzzle mode: state machine over a proven line
  js/puzzle-data.json # the shipped set (generated, verifiable)
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
- **Board turns announce themselves** — a sustained gold ring says *this is* a board
  turn; the moment one *arrives* gets its own one-shot burst, a bell (high and
  bright, the opposite end of the mix from the terrain rumble) and the
  "Move a square" button lighting up in the accent. The ambient glow alone was
  easy to miss while you were staring at the pieces. The cue fires only on your
  own board turns, never the bot's, and motion is redundant with sound and
  colour under `prefers-reduced-motion`.
- **Holes are drawn, not left blank** — a hole and the off-board frame used to be
  the same pixel (the board's background), so one colour had to serve both. On a
  light page that colour sat at 1.01:1 against the light squares: holes vanished.
  Holes are now their own element — a dark pit with an inset rim — so the frame
  can stay quiet while the hole reads on every theme (9.9:1 on Slate; the rim is
  what carries Neon void, whose squares are near-black in either mode).
- **Welcome & walkthrough** — signed-out visitors land on a welcome screen with
  sign-in / guest; first-timers get a 5-step illustrated tutorial (replayable from
  Rules → "Replay the walkthrough").

## Mobile

Fully playable by touch: tap a piece, tap a square. The layout reorders on narrow screens
(board first, thumb-sized action buttons beneath), double-tap zoom is suppressed on the
board, and the site installs as a **PWA** — Add to Home Screen gives a standalone app that
opens instantly and plays bot games offline.

## Puzzles

Lobby → **Puzzles**. Each one is a position with a *forced* mate and, at every
one of your turns, **exactly one action that delivers it**. Play the wrong move
and the position rewinds so you can look again from the same picture; play the
right one and the defence answers, chosen as the toughest reply available.

Hints are graduated on purpose — what kind of action it is, then where it
starts, then the move drawn on the board — so a hint is a nudge rather than the
answer.

### How the puzzles are found

The chess.com / lichess pipeline is: mine millions of real games, run an engine
over every position, and keep the ones where the game continuation swung the
evaluation hard — evidence a player missed something. Then apply the test that
actually makes a puzzle: the winning move must be the **only** winning move,
verified at every solver turn, with the defence playing its best. Themes are
tagged from the solution's mechanics, and difficulty is *measured* afterwards
from how often humans solve it, not assigned by hand.

There is no corpus of Hollow Chess games worth mining yet, so the same test is
applied to a composed seed space instead — a small cast on a small island,
proved rather than mined:

```bash
node harness/compose-puzzles.js --want=12 --seconds=600   # search and prove
node harness/verify-puzzles.js                            # re-prove the shipped set
```

Two things about this variant made it harder than the chess version:

**`js/ai.js` cannot verify a puzzle.** Its `wildcardMoves(K)` candidate-prunes
board actions to a top-K by static score — square-moves are only the top-4
sources paired with the top-4 targets. That is the right call for a game engine
and the wrong one for a proof: a pruned *defence* turns an unsound line into a
"mate", a pruned *alternative* turns a two-solution position into a "unique"
one. So `js/solver.js` generates full width, unpruned, against `engine.js` —
the rules the game actually plays, not a mirror of them. It is slower, and it
runs offline in the harness, never in front of a player.

**Which wildcards a puzzle can contain is fixed by arithmetic.** Board turns
land on plies ≡ 1 (mod 3). From a start ply `t` the solver moves on `t, t+2,
t+4` and the defence replies on `t+1, t+3`, so:

| start phase | who gets a board turn |
|---|---|
| `t ≡ 1` | solver on move 1; defence on its 2nd reply |
| `t ≡ 0` | defence on its 1st reply; solver on its 3rd move |
| `t ≡ 2` | neither, inside a 5-ply window |

A **mate-in-2 spans only one eligible ply**, so it is structurally incapable of
holding a wildcard from both sides — the start phase decides which player gets
it. Wildcards from *both* players inside one puzzle require a **mate-in-3**.
The set is tiered accordingly:

- **mate-in-1** — a board move *is* the mate. The mechanic on its own.
  The usual shape: a slider aims at the king along a line broken by one hole;
  bridge the hole and the line completes, and take the bridging square from one
  of the king's flight squares so the same action does both jobs.
- **mate-in-2, `t ≡ 1`** — the key move is a board move, with a real defence to see past.
- **mate-in-2, `t ≡ 0`** — *they* tear up the floor to escape, and you mate anyway.
- **mate-in-3** — both players reshape the board inside the solution.

### Ratings

Two ratings play each other, the way chess.com does it. You have a puzzle
rating (starts at 1000); every puzzle has one, seeded offline from its depth
and how many legal actions were on the board at the root — the key move being
one of ~1,500 on an 8×8 board turn is a different ask from one of ~25 on a
quiet ply. Each **first** attempt at a puzzle is an Elo game between the two: a
clean solve (no wrong move, no hint) takes points off the puzzle, anything
else takes points off you. Later attempts change nothing, so nothing can be
farmed. Puzzle ratings drift toward the truth as people attempt them —
difficulty is measured, not assigned.

Signed in, the maths runs server-side in `hc_puzzle_attempt`
(`sql/puzzles.sql`, security definer — the public key can report an attempt
but never write a rating) and the account's rating follows you between
devices. Signed out, the same maths runs locally against the seeds.

### Where the set stands

The shipped set is **26 puzzles — 8 mate-in-1 and 18 mate-in-2 — every one of
them turning on a board move**: 25 where the board move is yours and one where
the defence tears up the floor to escape and you mate anyway. The mate-in-3
both-wildcards tier has its machinery in place — phase families, tagging,
verifier support — but no puzzle in it yet, for a measurable reason rather than
a mysterious one.

`solver.js` proves against `engine.js`, and `engine.js` clones its piece Map on
every legality probe: correct, clear, and about 6 s per mate-in-3 candidate.
Most candidates have no mate at all, and "prove there is no mate in 3" is the
expensive direction, so a search that needs thousands of candidates needs hours.
(The square-move generator already skips the clone — a square-move touches no
piece, so `cells` is mutated and put back instead, which is the same question
`_trial` answers and roughly 40× cheaper. The remaining cost is inside
`makeMove` → `_evaluate`.)

The fix, when the tier is worth it: port the prover onto `ai.js`'s make/unmake
position — full width, no pruning — and keep the `engine.js` prover as the
authority that re-checks whatever survives, exactly as `harness/` already
arbitrates between the two.

Every shipped puzzle is re-proved from scratch by `harness/verify-puzzles.js`,
which throws the stored answer away and re-derives it: legality of the position,
uniqueness at every solver turn, legality of the stored defence, that the line
really ends in mate, and that the tags it advertises are true of the line. A
puzzle whose "only" solution is not the only solution is worse than no puzzle,
because the mode grades you against it.

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

Search: iterative deepening negamax with alpha-beta, principal variation search,
a transposition table, null-move pruning, late move reductions, check extensions,
killer-move and history ordering, and a captures-only quiescence at the leaves.

The transposition table needed a variant-specific design. Zobrist keys are
generated **lazily per coordinate**, because this board can grow past its
original 8x8 in any direction — there is no fixed square count to pre-table. The
hash covers terrain, pieces, side to move, en passant, **and the board-turn
phase**: wildcard eligibility changes which moves are legal, so it is part of a
position's identity.  snapshots the hash into the undo record and
 restores it verbatim, which is O(1) and cannot drift out of sync.

The variant-specific problem is branching factor. A wildcard turn offers ~35 piece moves **plus**
~40 adds, ~30 removes and ~1200 square-moves. Full width is hopeless, so board actions are
**candidate-pruned to top-K** by a static score: cut a check line to my king, freeze an enemy pawn
by stealing the square ahead of it, deny promotion by extending the world, open escape squares
for my king. Piece moves stay full width.

Evaluation is hand-written and terrain-aware. A board that changes shape has no
fixed squares, so the usual piece-square tables are replaced by terms computed
against the board's **current bounds**: knights, bishops and queens are scored
by how central they are on whatever board currently exists, and the king's term
is tapered — it wants shelter while material is on, and the middle once it
thins out. Alongside those: material, mobility counted over *existing* cells
(holes reduce it), king ring (how much floor surrounds the king), pawn
advancement measured as distance to the world's edge, a penalty for pawns with
a hole in front, passed/doubled/isolated pawns, rooks on open files, and the
bishop pair.

## Analysis harness

```bash
node harness/analyze.js --depth=5          # best action + eval for one position
node harness/selfplay.js 30 3              # N games, stats on mates/draws/action usage
node harness/botmatch.js 2 3 6             # level vs level, colours swapped
node harness/compose-puzzles.js --want=12  # search for provable puzzles
node harness/verify-puzzles.js             # re-prove the shipped puzzle set
```

## Roadmap
- Analysis engine: iterative-deepening alpha-beta + variant-aware eval, candidate pruning for board actions (branching factor of square-moves is huge). Node self-play harness to answer design questions (mate feasibility, piece values on mutable terrain, game length).
- Play vs AI in the UI (Web Worker), eval bar.
- Balance passes: action budgets, restrict adds per game, connectivity rules.
- Animations, promotion choice, capsule art for Steam.
