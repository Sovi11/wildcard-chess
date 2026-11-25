# Launch posts

Ready-to-paste text for each place. None of these are posted yet: on 25 Nov 2026
Chrome was not signed in to any of these sites (Hacker News, Lichess, Chess.com,
itch.io, Product Hunt, Discord). Sign in, then either paste these yourself or
tell Claude which ones to post.

Suggested order and spacing: Show HN on a weekday around 7-9pm IST (US morning).
Lichess and Chess.com forums any time. Product Hunt on a different day from HN,
so you can answer comments on each.

---

## 1. Hacker News (Show HN)

Submit at https://news.ycombinator.com/submit

**Title** (80 characters max, this is 73):

    Show HN: Hollow Chess – chess where every third turn you can move the board

**URL:**

    https://hollowchess.com

Leave the text box empty, then post this as the first comment straight away:

    I built this on my own over the last few months. It is normal chess with one
    extra rule: every third turn of the game is a "board turn", and on it you may
    lift an empty square and put it down anywhere that touches the rest of the
    board along an edge. The place it came from becomes a hole. Rooks, bishops
    and queens cannot cross a hole, kings cannot step into one, knights jump over.

    What surprised me is how much ordinary chess survives. Checkmate is still the
    only way to win, but you can answer a check by cutting the attacker's line,
    or give a discovered check by filling a hole, and kings end up stranded on
    islands that only a knight can reach.

    It runs in the browser with no sign-up: bots at different strengths, play a
    friend by link, ranked games, and a daily puzzle that is the same for
    everyone. Plain HTML/CSS/JS with no build step; Supabase for accounts and
    matchmaking; puzzles are generated and then proved unique by a small solver.

    Rules in one page: https://hollowchess.com/how-to-play.html
    I would like to know where the rule feels unfair or where the UI loses you.

Notes: do not ask anyone to upvote (HN penalises it). Stay around for two hours
to answer comments; that is most of what decides whether it stays up.

---

## 2. Lichess forum

Board: Off-Topic Discussion (https://lichess.org/forum/off-topic-discussion).
Lichess does not allow advertising in the chess boards; a one-off "I made this"
post in Off-Topic is normally fine. Needs a Lichess account that is not brand new.

**Title:**

    I made a chess variant where you can move the squares

**Body:**

    Every third turn you can pick up an empty square and put it down somewhere
    else on the edge of the board. The square you took leaves a hole: rooks,
    bishops and queens can't cross it, kings can't step into it, knights jump it.
    Everything else is normal chess and you still win by checkmate.

    The part I like most is the puzzles. Today's has a king stranded alone on an
    island, cut off from the rest of the board by missing squares.

    Free in the browser, no account needed: https://hollowchess.com
    Rules: https://hollowchess.com/how-to-play.html

    I'd like to hear what stronger players think of it, especially whether the
    board move feels too strong in the endgame.

---

## 3. Chess.com forum

Forum: Chess Variants, or Off Topic if Variants is restricted to the site's own
variants (https://www.chess.com/forum).

**Title:**

    Hollow Chess: a variant where the board itself moves

**Body:** same as the Lichess body above.

---

## 4. itch.io

Create a project at https://itch.io/game/new

- **Title:** Hollow Chess
- **Project URL:** hollow-chess
- **Short description / tagline:** Chess where you can move the squares.
- **Classification:** Games
- **Kind of project:** HTML (see note below)
- **Pricing:** No payments
- **Genre:** Strategy
- **Tags:** chess, board-game, strategy, puzzle, multiplayer, singleplayer, browser, turn-based, 2d, minimalist
- **Cover image:** app/store/icon-512.png or icons/og-card.png (630x500 is itch's preferred size; og-card will be cropped)
- **Screenshots:** app/store/screens/*.png

**Description:**

    Hollow Chess is chess with one extra rule. Every third turn you may lift an
    empty square of the board and put it down somewhere else. The square you
    took leaves a hole.

    - Rooks, bishops and queens cannot cross a hole. Knights jump over.
    - Kings cannot step into a hole, so you can take away an escape square.
    - Fill a hole in front of your rook and it is a discovered check.
    - Pawns promote at the edge of the board, wherever that edge is now.

    Play a ladder of 31 bots, a friend by link, or ranked games. There is a
    daily puzzle that is the same for everyone, with streaks and badges.

    Free, no download, no account needed. Also at https://hollowchess.com

Note on "HTML": itch only lists a game under "playable in browser" if you upload
a zip of the site. The game would then run on itch's own domain, where Google
sign-in will not work (guest play, bots and puzzles will). The alternative is no
upload and a big "Play at hollowchess.com" link, which is simpler but gets far
less browse traffic. Ask Claude to build and test the zip if you want the first.

---

## 5. Chess Discords

Post once in each server's self-promotion, variants or off-topic channel. Read
the channel rules first; some need a mod's OK. Servers already on file in
outreach/contacts.csv:

- Chess Is Boring: discord.gg/pv6ErfyPay
- Naviary (Infinite Chess): discord.gg/fRQFgmyUhV
- Blunderfish 64: discord.gg/RAz5NwjwNr
- Sara Herman: discord.gg/dRampYzpmk
- JGigs: discord.gg/NS6fvt9
- ViperKing: discord.gg/P953z7RJSy
- Micerang: discord.gg/SVzyrFBtzP
- jessedfe: discord.gg/MbqJPVGAxC
- soffiailvento26: discord.gg/HZxChNv7rY

**Message:**

    I made a chess variant where every third turn you can move a square of the
    board instead of a piece. The square leaves a hole that rooks, bishops and
    queens can't cross. Today's daily puzzle is a king stuck on an island with
    one knight coming for it. Free in the browser: https://hollowchess.com
    Happy to play anyone here by link.

For Naviary's server, open with: "Fellow variant maker here; Infinite Chess is
part of why I built this."

---

## 6. chessvariants.com

Needs a member account (https://www.chessvariants.com). Members can submit a
game page; an editor approves it. Category: "Unequal/unusual boards" or
"Modest variants".

**Title:** Hollow Chess

**Summary line:**

    Orthodox chess, except every third turn a player may move an empty square of the board.

**Description:**

    Hollow Chess is played with the orthodox pieces, set-up and rules, with one
    addition. Every third turn of the game (Black's 1st move, White's 3rd,
    Black's 4th, White's 6th, and so on) is a board turn. On a board turn the
    player may, instead of moving a piece, lift any empty square and set it down
    in any empty location that shares an edge with the remaining board. This can
    be inside a hole or outside the original 8x8.

    A missing square is a hole. Riders (rook, bishop, queen) may not pass over a
    hole. Kings and pawns may not move into one. Knights leap holes as they leap
    pieces. A square with a piece on it cannot be lifted, and a board move may
    not leave the mover's own king in check.

    A pawn promotes when it moves to a square with no square anywhere ahead of
    it in its file. Check may be answered on a board turn by removing a square
    from the checking line. Stalemate, threefold repetition and the fifty-move
    rule apply; board moves do not reset the fifty-move count.

    Playable free against bots or other people at https://hollowchess.com
    Notation: https://hollowchess.com/notation.html

---

## 7. Product Hunt

Submit at https://www.producthunt.com/posts/new (new accounts may have to wait a
few days before they can post).

- **Name:** Hollow Chess
- **Tagline** (60 max): Chess where you can move the squares
- **Link:** https://hollowchess.com
- **Topics:** Games, Chess, Indie Games
- **Thumbnail:** app/store/icon-512.png
- **Gallery:** app/store/screens/*.png

**Description** (260 max):

    Chess with one extra rule: every third turn you can lift an empty square and
    put it down somewhere else. Holes block rooks and bishops; knights jump them.
    Play bots, friends or ranked, plus a daily puzzle. Free in the browser.

**First comment:**

    Hi, I'm Pravar. I built Hollow Chess on my own because I wanted a chess
    variant that keeps checkmate but changes what a plan looks like. Moving one
    square turns out to be enough: you can cut a bishop's diagonal, open a file
    for your rook, or strand a king on an island. The daily puzzle takes about
    two minutes and is the quickest way to see it. I'd love to know where it
    confuses you.

---

## 8. YouTube pinned comments (done 25 Nov 2026)

Comment used, posted and pinned as the channel:

    Want to try it yourself? Hollow Chess is free in your browser, with a new puzzle like this every day: https://hollowchess.com

Pinned on: 2SDDXA5DQtc, qUrKPuMavrA, fmdYFAuWQAY, z7ph4DpbzQk, QHiKYNgb6q0,
IzifFC-jhi8, tHd8Je0F0QQ, QXogdRMN7cA.

Already had a link comment from the channel (left alone; pin them by hand if
they are not pinned): XZEcgVNBMJI, _4LqUJ_7A9A, eodPuAcHJM4, B_3A_A84GTU,
yCVjc4Ql0QU.

Not checked (old, low views): taGzWzhbj2Y, j7PID7IrIZY, Pt1hp6ZlT4w.
