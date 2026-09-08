"""Voice lines for the Pawn, with word timings for lip sync.

  python harness/pawn-vo.py --all                 # every line in shorts/pawn-lines.json
  python harness/pawn-vo.py --line "Mate in two."  # one line

Writes shorts/vo/pawn-<key>.mp3 and pawn-<key>.json ({text, words:[{w,t0,t1}]}),
where <key> = WCPAWN.lineKey(text) (djb2, mirrored below). Existing files are kept.
"""
import asyncio, io, json, os, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import edge_tts

ROOT = os.path.join(os.path.dirname(__file__), '..')
VO = os.path.join(ROOT, 'shorts', 'vo')
LINES = os.path.join(ROOT, 'shorts', 'pawn-lines.json')
VOICE, RATE, PITCH = 'en-US-AndrewNeural', '+10%', '+18Hz'


def line_key(text: str) -> str:
    h = 5381
    for ch in text:
        h = (((h * 33) & 0xFFFFFFFF) ^ ord(ch)) & 0xFFFFFFFF
    return format(h, '08x')


async def render(text: str, force=False):
    key = line_key(text)
    mp3 = os.path.join(VO, f'pawn-{key}.mp3')
    js = os.path.join(VO, f'pawn-{key}.json')
    if not force and os.path.exists(mp3) and os.path.exists(js):
        return key, False
    tts = edge_tts.Communicate(text, VOICE, rate=RATE, pitch=PITCH, boundary='WordBoundary')
    audio, words = bytearray(), []
    async for chunk in tts.stream():
        if chunk['type'] == 'audio':
            audio += chunk['data']
        elif chunk['type'] == 'WordBoundary':
            t0 = chunk['offset'] / 1e7
            words.append({'w': chunk['text'], 't0': round(t0, 3), 't1': round(t0 + chunk['duration'] / 1e7, 3)})
    os.makedirs(VO, exist_ok=True)
    with open(mp3, 'wb') as f:
        f.write(audio)
    with open(js, 'w', encoding='utf-8') as f:
        json.dump({'text': text, 'voice': VOICE, 'words': words}, f)
    return key, True


async def main():
    args = sys.argv[1:]
    force = '--force' in args
    if '--line' in args:
        lines = [args[args.index('--line') + 1]]
    else:
        with open(LINES, encoding='utf-8') as f:
            lines = json.load(f)
    for text in lines:
        key, made = await render(text, force)
        print(('made ' if made else 'have ') + key + '  ' + text)

asyncio.run(main())
