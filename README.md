# Wildcard Chess

Standard chess, but **every second move bends the rules**. On your wildcard turn you can play normally *or* spend the turn to **Add**, **Remove**, or **Shift** a piece — and the board **grows** beyond 8×8 when you push pieces past the edge.

## Rules (v1)

- Standard chess setup and movement, local 2-player hotseat.
- Each player's **2nd, 4th, 6th… move** is *wildcard-eligible*. That turn you may **either** make a normal move **or** one special action:
  - **Add** — drop a pawn (your color) on any empty square, including one step off the current edge → the board grows (ranks `9`, `0`, `-1`, files past `h`).
  - **Remove** — delete any one piece, yours or theirs, **except a king**.
  - **Shift** — relocate one of *your* pieces to any empty square (no capture). Can push off-edge to expand.
- **Expansion is deliberate.** Normal moves stay inside the current board; only a wildcard grows it (one ring at a time).
- **Win by capturing the king** (regicide). No check/checkmate enforcement — a red ring warns when a king is attacked, but it's legal to leave it hanging.
- Pawns auto-promote to queen at the far rank. *Castling / en-passant omitted in v1.*

## Play it (dev)

Any static file server works — it's plain HTML/JS/Canvas, no build step:

```bash
cd wildcard-chess
python -m http.server 5180
# open http://localhost:5180
```

## Run as a desktop app (Electron)

```bash
cd wildcard-chess
npm install
npm start
```

## Build a Steam-ready Windows executable

```bash
npm run dist:win
# unpacked build in dist/win-unpacked/  (the folder you upload to Steam via SteamPipe)
# installer in dist/  (nsis .exe, optional — Steam usually wants the unpacked folder)
```

### Steam integration checklist
1. **Steamworks SDK** — for achievements/overlay, add the `steamworks.js` npm package and call `init(<appid>)` in `electron-main.js`. Not required just to ship.
2. **steam_appid.txt** — drop a file containing your App ID next to the executable during testing.
3. **SteamPipe** — point `ContentBuilder` at `dist/win-unpacked/` and set the launch executable to `Wildcard Chess.exe`.
4. Store page assets (capsules, screenshots, trailer) are separate from the build.

## Layout

```
wildcard-chess/
  index.html          # page + UI shell
  styles.css          # dark theme
  js/engine.js        # pure game logic (no DOM) — unit-testable in Node
  js/main.js          # canvas rendering + click/UI wiring
  electron-main.js    # desktop wrapper
  package.json        # electron + electron-builder config
```

## Roadmap ideas
- AI opponent (minimax over the variant; regicide makes eval simpler).
- Online/hotseat toggle, move timers.
- Wildcard balancing: per-game action budget, costlier adds, promotion choice dialog.
- Castling / en-passant if we want full chess fidelity.
- Sound, piece-drop animations, capsule art.
