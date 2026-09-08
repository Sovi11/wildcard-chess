"""Loudness envelope of a recording, for lip-syncing the Pawn to a real voice.

  python harness/voice-envelope.py my-line.m4a shorts/vo/pawn-custom-day1.json

Output: {"fps": 50, "dur": seconds, "v": [0..1, ...]}  — WCPAWN.speakEnvelope() reads it.
Any format ffmpeg can decode (m4a / mp3 / wav / phone voice memos).
"""
import io, json, subprocess, sys, struct, math
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

src, dst = sys.argv[1], sys.argv[2]
FPS, SR = 50, 16000
pcm = subprocess.run(['ffmpeg', '-v', 'error', '-i', src, '-ac', '1', '-ar', str(SR), '-f', 's16le', '-'],
                     capture_output=True, check=True).stdout
n = len(pcm) // 2
samples = struct.unpack('<%dh' % n, pcm)
win = SR // FPS
env = []
for i in range(0, n, win):
    chunk = samples[i:i + win]
    if not chunk:
        break
    env.append(math.sqrt(sum(s * s for s in chunk) / len(chunk)) / 32768.0)
peak = max(env) or 1.0
v = [round(min(1.0, e / peak), 3) for e in env]
# light smoothing so the jaw doesn't chatter
sm = [round(max(v[i], 0.6 * v[i - 1] if i else 0), 3) for i in range(len(v))]
with open(dst, 'w', encoding='utf-8') as f:
    json.dump({'fps': FPS, 'dur': round(n / SR, 3), 'v': sm}, f)
print(f'{dst}: {n / SR:.2f}s, {len(sm)} frames')
