"""Use YOUR recording for a Pawn line instead of the TTS.

  python harness/pawn-custom.py my-voice-memo.m4a "Day one of posting until Hikaru plays my chess game."

The line text must match the scene's line exactly (see shorts/pawn-lines.json).
This copies the recording to shorts/vo/custom/pawn-<key>.<ext> and writes the
loudness envelope pawn-<key>.env.json next to it. From then on:
  - the stage lip-syncs the Pawn to your recording (WCPAWN.speakEnvelope),
  - mix-audio.js mixes your recording instead of the TTS file.
Delete the two files to go back to the TTS voice.
"""
import io, os, shutil, subprocess, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
sys.path.insert(0, os.path.dirname(__file__))

ROOT = os.path.join(os.path.dirname(__file__), '..')
CUSTOM = os.path.join(ROOT, 'shorts', 'vo', 'custom')


def line_key(text: str) -> str:
    h = 5381
    for ch in text:
        h = (((h * 33) & 0xFFFFFFFF) ^ ord(ch)) & 0xFFFFFFFF
    return format(h, '08x')


src, text = sys.argv[1], sys.argv[2]
key = line_key(text)
ext = os.path.splitext(src)[1].lower() or '.m4a'
os.makedirs(CUSTOM, exist_ok=True)
dst = os.path.join(CUSTOM, f'pawn-{key}{ext}')
shutil.copyfile(src, dst)
env = os.path.join(CUSTOM, f'pawn-{key}.env.json')
subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), 'voice-envelope.py'), dst, env], check=True)
print(f'custom voice for "{text}" -> {os.path.relpath(dst, ROOT)}')
