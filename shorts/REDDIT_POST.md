# Reddit post — feedback ask

**Target:** r/chessvariants first (this is exactly their thing). r/playmygame
also works — that sub exists for feedback swaps. Tone is "help me get this
right", not promotion: lead with the rules and the open design questions, and
answer every comment.

---

**Title options (pick one):**

1. I built a chess variant where every 3rd turn you may move a square of the
   board instead of a piece — looking for rules/balance feedback before I take
   it further
2. Feedback wanted on my variant: the board itself is a piece (holes block
   sliders, fortress islands are real). What's broken?
3. Playtesters wanted: chess where you can relocate squares of the board. I
   need people to try to break it.

---

**Body:**

I've spent the last two months building a chess variant and I've reached the
point where I can't see it clearly anymore. I'd genuinely value this
community's judgment before I sink more time in. Rules:

- Normal chess, but **every 3rd ply is a "board turn"**: whoever moves may
  either play a normal move **or pick up one empty square and re-attach it
  anywhere touching the board** (leaves a hole). The stagger is
  `W B✦ W B W✦ B W B✦…` — Black's 1st/4th/7th move, White's 3rd/6th/9th, so
  Black's early board turn compensates White's tempo.
- **Holes block sliders** dead. Knights jump holes but must land on real floor.
- Checkmate wins; on a board turn you may escape check by reshaping terrain
  (cutting the attacker's line counts as a defense — it's only mate if nothing
  saves you).
- Pawns promote at the *edge of the world* — extend the board upward and the
  promotion square runs away from the pawn.
- A hole in the castling path denies castling. En passant as normal. 50-move
  rule, with board moves counting as quiet moves (they never reset the clock).

Things playtesting has already surfaced, which is why I want more eyes:

- **Fortress islands.** A losing king can tear out a moat and live on a
  2-square island. The attacker's counter is bridging a square back in (which
  can be check through the new square); the defender burns the bridge on their
  next board turn. With the 50-move rule it resolves to a draw unless the
  attacker times a bridge so the queen invades during the tempi before the
  defender's board turn. I *think* this is interesting rather than degenerate —
  but I'm not sure, and "losing side can always build a draw-fortress" might be
  a fatal flaw at high level.
- Move-a-square turned out to dominate my earlier add-a-square/remove-a-square
  actions (it's both in one), so I cut those. Was that right, or does a
  remove-only variant read cleaner?
- Self-play says the variant is drawish-er than chess at weak search depth but
  I don't trust bots on this.

**Questions I'd love answers on:**

1. Does every-3rd-ply feel like the right cadence, or should board turns be
   rarer (every 4th/5th) so the chess stays primary?
2. Is the fortress island a feature or a disease?
3. Should moving a square be forbidden in your OWN half / near kings / anywhere?
4. Any variant-history precedent I should study? (I know Alice chess and
   holes-adjacent variants like Omega's wizards, but nothing where terrain
   relocates mid-game.)

It's playable free in a browser at https://hollowchess.com (no login needed —
there's a 60-second tutorial, bots to practice against, and live play with a
friend via one link) — but to be clear, I'm here for the critique, not the
clicks. Tear it apart. I'll be in the comments.

---

**First comment (post immediately):** a 30-second clip of the island-fortress
endgame (shorts/out/island.mp4) with: "the fortress situation from question 2,
in motion."
