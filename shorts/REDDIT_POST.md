# Reddit post — the island fortress

**Primary target:** r/chessvariants. Also fits r/playmygame, r/WebGames ("I made
a…" framing), and a tightened version works as a Show HN comment. Post the video
(shorts/out/island.mp4) natively where the sub allows video, link in comments.

---

**Title options (pick one):**

1. I built a chess variant where you can move squares of the board — and players
   discovered you can build a fortress ISLAND that forces a draw
2. In my chess variant the board itself is a piece. Yesterday the first "island
   fortress" endgame appeared and I haven't stopped thinking about it
3. Chess, but every 3rd turn you may move one square of the board. The endgame
   theory is getting weird already

---

**Body:**

I've been building **Hollow Chess** — normal chess, except every 3rd ply of the
game is a "board turn": whoever's move it is may either move a piece normally
**or pick up one empty square and re-attach it anywhere touching the board**.
The square leaves a hole. Holes block rooks, bishops and queens dead; knights
jump over them but must land on real floor. Checkmate wins, and on a board turn
you can escape check by reshaping the terrain (cut the attacker's line instead
of blocking it).

The mechanic sounds like a gimmick until you see what it does to endgames.

**The island fortress.** A losing king walks to the corner and, over a few board
turns, tears out the squares around himself — leaving a 2-square island floating
in the void with him on it. Nothing can reach him: sliders stop at the moat, and
there's no floor for anything else to stand on.

The attacker's counter is beautiful: **build a bridge**. Use your own board turn
to drop a square back into the moat — suddenly the queen's diagonal runs through
it and it's check. But the defender's board turn comes back around... and he
**burns the bridge**, lifting that same square right back out. Bridge, burn,
bridge, burn.

Two details make this actually work as a game instead of a stalemate-forever
mess:

- The wildcard cadence is staggered (Black's board turns are their 1st/4th/7th
  moves, White's are their 3rd/6th/9th), so between a bridge and the burn there
  are real tempi — a well-timed bridge can let the queen INVADE before the
  defender's board turn arrives. One-square moats are actually unsafe; wide
  moats cost more turns to dig. That's a genuine attack/defense tradeoff.
- The **50-move rule** counts board moves as "quiet" moves — they never reset
  the clock. So a pure bridge/burn war ends in a draw instead of running
  forever, exactly like shuffling in a dead rook endgame. (Threefold repetition
  alone wasn't enough: the defender can park the burned square somewhere new
  each cycle and never repeat the exact position.)

Other things that fell out of the rules that I didn't design on purpose:
pawns promote at the *edge of the world*, so extending the board above the 8th
rank makes an enemy pawn's promotion square run away from it; and a hole
anywhere in the castling path denies castling until someone fills it in.

It's free in a browser, no download, no login wall: **https://hollowchess.com**
— ranked ladder against bots with personalities (calibrated by playing actual
Stockfish with the wildcards switched off; the top bot lands around 2050 on that
scale), live play with a friend over one link, and a 60-second interactive
tutorial.

The engine is hand-written (negamax + candidate pruning — "move any square
anywhere" has a branching factor around 1200, which was the hard part). Happy to
answer anything about the rules or the engine.

---

**First comment (post it yourself immediately):**

Video of the island fortress in action + the bridge/burn war:
[attach island.mp4 or link]. Site: https://hollowchess.com
