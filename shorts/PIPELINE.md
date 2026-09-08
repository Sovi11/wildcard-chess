# Shorts pipeline (Pawn series)

Everything renders from `shorts/shorts.html` in headless Chromium, then gets its
audio mixed in. Needs the dev server on :5180 (`python -m http.server 5180` from
the repo root), playwright, ffmpeg, and `edge-tts` (`pip install edge-tts`).

## One-off scenes

```bash
node harness/render-media.js shorts day1            # record 9:16  -> shorts/out/day1-video.mp4 + day1.beats.json
node harness/render-media.js shorts day1 --square   # record 1:1   -> day1-sq-video.mp4
node harness/mix-audio.js day1                      # music bed + SFX + voices -> shorts/out/day1.mp4
```

Scenes: `rook island escape cheese morph day1 puzzle:N`. `?safe=1` on the stage URL paints the
Instagram/YouTube UI danger zones.

## Puzzles

```bash
node harness/puzzles.js --games 300 --seed 31 --blunder 0.12 --out shorts/puzzles-c.json   # generate (slow, background)
node harness/puzzle-batch.js curate                 # merge shorts/puzzles-*.json -> shorts/puzzles.json (2 / 6 / 2)
node harness/puzzle-batch.js render                 # record + mix puzzle-0 .. puzzle-9
node harness/puzzle-batch.js render --square        # feed versions
```

What "verified" means: the solver finds a forced mate with a unique key idea and no shorter
mate, then replays the whole solution tree through `js/engine.js` — every engine-legal
defender reply must have a mating answer. `phase` says when the board move is available
(`now` = on the key move, `second` = on the attacker's 2nd move).

## The Pawn's voice

- `shorts/pawn-lines.json` lists every line he can say. `python harness/pawn-vo.py --all`
  makes `shorts/vo/pawn-<key>.mp3` + `.json` (word timings the stage lip-syncs to).
  Lines not in the list are generated on demand by the mixer, but then the recording
  ran without timings, so add new lines to the list and run `--all` BEFORE recording.
- **Your own voice:** record the line on your phone, then
  `python harness/pawn-custom.py memo.m4a "Day one of posting until Hikaru plays my chess game."`
  The stage lip-syncs to the recording's loudness and the mixer uses it instead of the TTS.
  Delete `shorts/vo/custom/pawn-<key>.*` to go back.
- Rig: `shorts/pawn.js` (`WCPAWN.make/idle/speak/speakEnvelope`). Expressions:
  neutral, hype, smug, shocked, dead, think. Demo sheet: `shorts/character.html`.

## Post copy

`shorts/POSTS.md` — titles, descriptions, captions, pinned comment, cadence.
