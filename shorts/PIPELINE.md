# Shorts pipeline (Pawn series)

Everything renders from `shorts/shorts.html` in headless Chromium, then gets its
audio mixed in. Needs the dev server on :5180 (`python -m http.server 5180` from
the repo root), playwright, ffmpeg, and `edge-tts` (`pip install edge-tts`).

## One-off scenes

```bash
node harness/render-media.js shorts day1            # record 9:16  -> shorts/out/day1-video.mp4 + day1.beats.json (working files)
node harness/render-media.js shorts day1 --square   # record 1:1   -> day1-sq-video.mp4
node harness/mix-audio.js day1                      # music bed + SFX + voices -> shorts/out/day/day1.mp4
```

Finals are sorted by series: `shorts/out/day/`, `shorts/out/puzzles/batch-N/`, `shorts/out/hooks/`
(the five product hooks), `shorts/out/mascot/`. Raw recordings and beat logs stay in `shorts/out/`.

Scenes: `rook island escape cheese morph day1 puzzle:N`. `?safe=1` on the stage URL paints the
Instagram/YouTube UI danger zones.

## Puzzles

```bash
node harness/puzzles.js --games 300 --seed 71 --blunder 0.2 --out shorts/puzzles-i.json   # generate (slow; run several seeds)
node harness/puzzle-batch.js status                 # unused candidates vs what a batch needs
node harness/puzzle-batch.js curate                 # append the next batch of 10 (2/6/2) to shorts/puzzles.json
node harness/puzzle-batch.js render --batch 2       # record + mix both formats -> shorts/out/puzzles/batch-2/ (resumable)
node harness/puzzle-batch.js table  --batch 2       # append titles + solutions for the batch to POSTS.md
```
Blunder rate matters: at 0.1 the bots shuffle for 140 plies and almost never mate; 0.2–0.28 gives
a puzzle every few games. Mate-in-2 is the scarce length; every mate-in-3 is also solved two
plies in as a mate-in-2 candidate.

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
