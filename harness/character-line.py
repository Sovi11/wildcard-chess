"""Generate the mascot's voice line with word-level timings (for mouth sync).

  python harness/character-line.py "Day 1 of posting until Hikaru plays my chess game."

Writes shorts/out/character-line.mp3 and shorts/out/character-line.json
({start, words:[{w,t0,t1}]}, seconds).
"""
import asyncio, io, json, os, sys
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
import edge_tts

ROOT = os.path.join(os.path.dirname(__file__), '..')
OUT = os.path.join(ROOT, 'shorts', 'out')
TEXT = sys.argv[1] if len(sys.argv) > 1 else "Day 1 of posting until Hikaru plays my chess game."
VOICE = sys.argv[2] if len(sys.argv) > 2 else "en-US-AndrewNeural"
START = 0.9   # seconds of silence before the line inside the recording


async def main():
    tts = edge_tts.Communicate(TEXT, VOICE, rate="+10%", pitch="+18Hz", boundary="WordBoundary")
    audio = bytearray()
    words = []
    async for chunk in tts.stream():
        if chunk["type"] == "audio":
            audio += chunk["data"]
        elif chunk["type"] == "WordBoundary":
            t0 = chunk["offset"] / 1e7
            t1 = t0 + chunk["duration"] / 1e7
            words.append({"w": chunk["text"], "t0": round(t0, 3), "t1": round(t1, 3)})
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, 'character-line.mp3'), 'wb') as f:
        f.write(audio)
    with open(os.path.join(OUT, 'character-line.json'), 'w', encoding='utf-8') as f:
        json.dump({"start": START, "text": TEXT, "voice": VOICE, "words": words}, f, indent=1)
    print(f"{len(words)} words, last ends at {words[-1]['t1']:.2f}s" if words else "no word boundaries!")
    for w in words:
        print(f"  {w['t0']:5.2f}-{w['t1']:5.2f} {w['w']}")

asyncio.run(main())
