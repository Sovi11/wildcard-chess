# Hollow Chess Notation (HCN)

Chess notation has no way to say "the square itself moved," so Hollow Chess
defines its own. HCN is standard long-algebraic chess notation plus **one new
operator**: `>` for terrain. The rule of thumb: `-` and `x` move pieces,
`>` moves the world.

## Squares

Files `a`–`z` left to right (the classic board is `a`–`h`), ranks numbered from
1 upward. The board can grow past its original edges: a square added above the
8th rank is on rank 9, one below rank 1 is on rank 0, then -1, and so on. Files
that grow left of `a` or right of `z` fall back to a parenthesised numeric form —
`(-1)5` is file -1, rank 5 — which in practice almost never appears.

## Piece moves — long algebraic

Long algebraic (from-square always written) rather than short SAN, because on a
board with holes and grown ground, short-form disambiguation is fragile and
replay tools would need the whole terrain history to resolve it. Long form is
always unambiguous.

| Notation | Meaning |
|---|---|
| `e2-e4` | pawn move (pawns get no letter) |
| `Nb1-c3` | knight from b1 to c3 |
| `Qd4xh8` | queen captures on h8 |
| `e5xd6 ep` | en passant capture |
| `O-O` / `O-O-O` | castling (kingside / queenside) |
| `a7-a8=Q` | promotion — at the **edge of the world**, wherever that is (`e8-e9=Q` is legal on grown boards) |
| `…+` / `…#` | check / checkmate suffix, as in chess |

## Board moves — the `>` operator

| Notation | Meaning |
|---|---|
| `e5>c9` | **square-move**: the empty square e5 detaches and re-attaches at c9 (edge-adjacent to the board). e5 is now a hole. |
| `+e9` | add a square at e9 *(reserved — action currently parked)* |
| `×e5` | remove the square e5 *(reserved — action currently parked)* |

Board moves take check suffixes like any move: `g7>a9+` is a square-move that
gives check (usually by opening a line), and a square-move can even mate.

## Game score

Moves are numbered in White/Black pairs exactly like chess. Every 3rd ply is a
board turn (`W B✦ W B W✦ B…`) but the numbering ignores that — you can spot
board turns by the `>`.

```
1. e2-e4 d7>k9 2. Ng1-f3 e7-e6 3. d2>a9 …
```

Result markers: `1-0`, `0-1`, `½-½`, `*` (unfinished). The **Copy** button on
the post-game notation panel exports the full score in this format.

## Design notes

- `>` was chosen because no chess notation uses it, it reads directionally
  ("e5 *into* c9"), and it's plain ASCII — typeable anywhere.
- Squares are named by their coordinates *at the moment of the move*. A square's
  identity is its location, not its history: if e5 moves to c9, a later action
  on that terrain writes `c9`, not "the square formerly known as e5".
- The half-move clock (50-move rule) treats every `>` move as quiet — recorded
  play can therefore be validated replaying HCN alone, no extra annotations.
