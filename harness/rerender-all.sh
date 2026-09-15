#!/usr/bin/env bash
# Re-render every short with the current scene scripts + audio pipeline.
# Old finals are removed first (git history keeps them); export after each stage.
set -u
cd "$(dirname "$0")/.."
rm -f shorts/out/day/*.mp4 shorts/out/hooks/*.mp4 shorts/out/puzzles/batch-*/*.mp4
stage() { echo "=== STAGE $1 $(date +%H:%M:%S)"; }
stage day1;   node harness/render-media.js shorts day1 && node harness/mix-audio.js day1
              node harness/render-media.js shorts day1 --square && node harness/mix-audio.js day1-sq
              node harness/export-shorts.js
for b in 1 2 3 4 5 6 7; do
  stage "batch $b"; node harness/puzzle-batch.js render --batch $b; node harness/export-shorts.js
done
stage hooks;  node harness/render-media.js shorts && node harness/mix-audio.js
              node harness/render-media.js shorts --square && node harness/mix-audio.js --square
echo "=== ALL DONE $(date +%H:%M:%S)"
