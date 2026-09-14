// Give the shorts their sound: a synthesized hype bed (kick / sub bass / hats,
// pure PCM written from scratch — no samples, no licensing), impact SFX, and a
// neural trailer voiceover via edge-tts. Beat times come from the scene's
// beats.json; absolute sync is recovered from the white sync-flash frame the
// stage emits at scene start.
//
//   node harness/mix-audio.js            # mix every recorded scene
//   node harness/mix-audio.js rook       # just one

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { execFileSync, execSync } = require('child_process');

const OUT = path.join(__dirname, '..', 'shorts', 'out');
const VO_DIR = path.join(__dirname, '..', 'shorts', 'vo');
const SR = 44100;

const ffmpeg = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error'].concat(args), { stdio: 'inherit' });
const ffprobe = (args) => execFileSync('ffprobe', ['-v', 'error'].concat(args)).toString();
// `python` does not exist on a modern macOS/homebrew box; only `python3` does.
const PY = (function () {
  for (const c of ['python3', 'python']) {
    try { execFileSync(c, ['-c', ''], { stdio: 'ignore' }); return c; } catch (e) {}
  }
  return 'python3';
})();

// ---- WAV writing -----------------------------------------------------------
function writeWav(file, left, right) {
  const n = left.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20);
  buf.writeUInt16LE(2, 22); buf.writeUInt32LE(SR, 24); buf.writeUInt32LE(SR * 4, 28);
  buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    const l = Math.max(-1, Math.min(1, left[i])), r = Math.max(-1, Math.min(1, right[i]));
    buf.writeInt16LE((l * 32767) | 0, 44 + i * 4);
    buf.writeInt16LE((r * 32767) | 0, 46 + i * 4);
  }
  fs.writeFileSync(file, buf);
}
const clip = (x) => Math.tanh(x);

// ---- the bed: 128 BPM kick, sub bass, offbeat hats -------------------------
function synthBed(file, seconds) {
  const n = Math.floor(seconds * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  const beat = 60 / 128;
  // A minor movement: A1 A1 C2 G1, one note per bar (4 beats)
  const bassNotes = [55, 55, 65.41, 49];
  let hatLp = 0, outLp = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const inBeat = t % beat;
    const beatIdx = Math.floor(t / beat);
    let s = 0;
    // kick: pitch 150->45 sweep. The decay used to run 0.32s of a 0.47s beat,
    // so the low end never cleared between hits and smeared into the bass.
    if (inBeat < 0.18) {
      const f = 45 + 105 * Math.exp(-inBeat * 26);
      s += Math.sin(2 * Math.PI * f * inBeat) * Math.exp(-inBeat * 22) * 0.55;
    }
    // Sub bass. This used to be Math.sign(sin()) — a SQUARE wave, which at 55Hz
    // is a buzzsaw of odd harmonics running all the way up the spectrum with
    // nothing filtering them. It was also gated on eighth notes with a hard
    // on/off and no ramp, so every one of the ~4.3 notes per second began and
    // ended on a discontinuity: a click. Square + clicks + eighths is exactly
    // the harsh "duh-duh-duh-duh" buzz. Now it is a pure sine, one note per
    // beat, with a soft attack and a long release — a pulse, not a buzz.
    // The bass has to be SILENT between notes. The previous attempt gave it a
    // long release that ran to the end of the beat and then restarted, so it
    // never stopped — which turned the old rhythmic buzz into a continuous
    // 55Hz drone, the "dhhhhh". It now sounds for under half the beat and
    // then genuinely stops, at less than half the level.
    const bass = bassNotes[Math.floor(beatIdx / 4) % 4];
    const q = inBeat / beat;
    if (q < 0.40) {
      const env = Math.min(1, q / 0.05) * Math.min(1, (0.40 - q) / 0.14);
      s += Math.sin(2 * Math.PI * bass * t) * BASS * env;
    }
    // Hats. Differenced noise is a differentiator — i.e. a harsh highpass that
    // leaves nothing but bright hiss, and it sat at 0.5. Now a soft lowpassed
    // tick at a third of the level: it keeps the offbeat without the sizzle.
    const off = (t + beat / 2) % beat;
    if (off < 0.04) {
      const w = Math.random() * 2 - 1;
      hatLp += (w - hatLp) * 0.55;
      s += hatLp * Math.exp(-off * 120) * 0.10;
    }
    // fade in / out
    const env2 = Math.min(1, t / 0.8) * Math.min(1, (seconds - t) / 1.2);
    const v = clip(s) * env2;
    outLp += (v - outLp) * 0.72;            // gentle overall lowpass, ~5kHz
    L[i] = outLp; R[i] = outLp;
  }
  writeWav(file, L, R);
}

// ---- SFX -------------------------------------------------------------------
function synthSfx(kind, file) {
  let dur = { braam: 1.6, boom: 1.1, hit: 0.4, whoosh: 0.55, lift: 0.3 }[kind];
  const n = Math.floor(dur * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  let lp = 0, lp2 = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let s = 0;
    if (kind === 'braam') {
      const drift = 1 - t * 0.05;
      for (const f of [49, 55, 110, 220]) {
        // saw via wrapped phase
        const ph = (f * drift * t) % 1;
        s += (2 * ph - 1) * (f < 200 ? 0.45 : 0.15);
      }
      // A slower attack so it swells under a word instead of hitting it, and a
      // faster decay so it is out of the way by the end of the line.
      s *= Math.min(1, t / 0.10) * Math.exp(-t * 2.6);
      s = clip(s * 1.5) * 0.9;           // was 2.2: less hard saturation
      lp += (s - lp) * 0.06;             // ~420Hz: keeps the weight, drops the buzz
      s = lp;
    } else if (kind === 'boom') {
      // The mate landing. The braam was doing this job and it is the wrong tool:
      // a stack of saw waves saturated at 2.2x, sustaining 1.6s over the moment
      // you actually want to read. This is weight without buzz — a low sine
      // thump and a short, heavily filtered body, no saws, no saturation.
      const f = 38 + 62 * Math.exp(-t * 9);
      s = Math.sin(2 * Math.PI * f * t) * Math.exp(-t * 3.0) * 0.72;
      const w = Math.random() * 2 - 1;
      lp += (w - lp) * 0.03;                        // ~200Hz: body, not sizzle
      lp2 += (lp - lp2) * 0.03;                     // twice, so nothing survives up top
      s += lp2 * Math.exp(-t * 5.5) * 0.7;
      s *= Math.min(1, t / 0.012);
    } else if (kind === 'hit') {
      const w = Math.random() * 2 - 1;
      lp += (w - lp) * 0.12;                       // lowpass
      s = lp * Math.exp(-t * 16) * 2.6;
      s += Math.sin(2 * Math.PI * (60 + 80 * Math.exp(-t * 30)) * t) * Math.exp(-t * 14) * 0.8;
      s = clip(s);
    } else if (kind === 'whoosh') {
      const w = Math.random() * 2 - 1;
      lp += (w - lp) * (0.05 + 0.4 * (t / dur));
      s = lp * Math.pow(t / dur, 1.6) * 2.2;
      if (t > dur - 0.06) s *= (dur - t) / 0.06;
      s = clip(s);
    } else if (kind === 'lift') {
      s = Math.sin(2 * Math.PI * (220 + 500 * (t / dur)) * t) * Math.sin(Math.PI * t / dur) * 0.5;
    }
    L[i] = s; R[i] = s;
  }
  writeWav(file, L, R);
}

// ---- voiceover -------------------------------------------------------------
// Two voices: the deep trailer narrator, and the Pawn (mascot). Pawn lines are
// made by harness/pawn-vo.py, which also writes the word timings the stage
// lip-syncs to; the key mirrors WCPAWN.lineKey (djb2).
function lineKey(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0;
  return h.toString(16).padStart(8, '0');
}
const VOICE = process.env.HC_VOICE || 'en-US-AndrewMultilingualNeural';
const VOICE_RATE = process.env.HC_VOICE_RATE || '+0%';

function voFile(line, voice) {
  fs.mkdirSync(VO_DIR, { recursive: true });
  if (voice === 'pawn') {
    const key = lineKey(line);
    for (const ext of ['.m4a', '.mp3', '.wav', '.ogg', '.aac']) {     // your own recording (harness/pawn-custom.py)
      const c = path.join(VO_DIR, 'custom', 'pawn-' + key + ext);
      if (fs.existsSync(c)) return c;
    }
    const f = path.join(VO_DIR, 'pawn-' + key + '.mp3');
    if (!fs.existsSync(f)) {
      execFileSync(PY, [path.join(__dirname, 'pawn-vo.py'), '--line', line], { stdio: 'inherit' });
      console.log('pawn vo:', JSON.stringify(line));
    }
    return f;
  }
  // The trailer voice was ChristopherNeural — a NEWSREADER voice — pitched down
  // 14Hz and slowed 6%. Pitch-shifting a neural voice smears its formants and
  // is the loudest "this is a robot" tell there is. Andrew is a conversational
  // voice and is left completely unprocessed: no pitch shift, natural rate.
  // (The pawn above is your own recording and is untouched.)
  const tag = crypto.createHash('md5').update(VOICE + '|' + VOICE_RATE + '|' + line).digest('hex').slice(0, 12);
  const f = path.join(VO_DIR, tag + '.mp3');
  if (!fs.existsSync(f)) {
    execFileSync(PY, ['-m', 'edge_tts', '--voice', VOICE, '--rate=' + VOICE_RATE,
      '--text', line, '--write-media', f], { stdio: 'inherit' });
    console.log('vo:', JSON.stringify(line));
  }
  return f;
}

// ---- sync: find the white flash near t=0 -----------------------------------
function findSync(videoFile) {
  const out = ffprobe(['-f', 'lavfi', '-i', `movie='${videoFile.replace(/\\/g, '/').replace(/:/g, '\\:')}',signalstats`,
    '-show_entries', 'frame=pts_time:frame_tags=lavfi.signalstats.YAVG',
    '-of', 'csv=p=0', '-read_intervals', '%+3']);
  // The capture opens on Chromium's white blank page, THEN the dark stage
  // paints, THEN (>=450ms later) the SOLID white sync hold fires. Look for a
  // near-white frame that follows a dark one inside the first 3 seconds.
  const frames = out.split('\n')
    .map((l) => l.trim().split(',').filter(Boolean))
    .filter((p) => p.length >= 2)
    .map((p) => ({ t: parseFloat(p[0]), y: parseFloat(p[1]) }));
  for (let i = 1; i < frames.length; i++) {
    if (frames[i].y > 200 && frames[i - 1].y < 120) return frames[i].t;
  }
  console.warn('sync flash not found; assuming 0.55s');
  return 0.55;
}

// ---- where a finished video lives --------------------------------------------
// working files (raw -video.mp4, beats.json, sfx) stay in shorts/out; finals are
// sorted by series so the folder is what you upload from.
const BATCH = 10;                                   // mirrored in puzzle-batch.js
function finalDir(scene) {
  const base = scene.replace(/-sq$/, '');
  let m;
  if ((m = /^puzzle-(\d+)$/.exec(base))) return path.join(OUT, 'puzzles', 'batch-' + (Math.floor(+m[1] / BATCH) + 1));
  if (/^day\d+$/.test(base)) return path.join(OUT, 'day');
  return path.join(OUT, 'hooks');
}

// ---- mix one scene ---------------------------------------------------------
// Gain staging, then ONE loudness target at the end.
//
// Dropping the bed to 0.24 helped, but the shorts still measured -10 to -12
// LUFS with the dynamic range crushed to ~5 LU: the voice was pushed to +6dB,
// the sum was slammed into a brickwall limiter, and every platform then turned
// the result back DOWN again — so the loudness only ever bought distortion and
// listening fatigue. Now the bed ducks under the voice (sidechain), so the
// voice is clear without being loud, and the finished mix is normalised
// two-pass to -14 LUFS / -2 dBTP, which is what X, YouTube and Instagram all
// normalise to anyway.
// Dialogue keeps the levels it had. Lowering the voice was a mistake: the
// complaint was never the voice, and because the final mix is normalised as a
// whole, a quieter bed is what makes the voice sit forward — not a quieter
// voice. Bed and SFX come down instead, so the voice dominates the normalised
// result. HC_BED overrides the bed level without editing anything.
// Levels. shorts/mix-levels.json (written by the mixer UI -- open
// shorts/mixer.html) overrides any of these, and env vars override that.
const LEVELS_FILE = path.join(__dirname, '..', 'shorts', 'mix-levels.json');
const SAVED = fs.existsSync(LEVELS_FILE) ? JSON.parse(fs.readFileSync(LEVELS_FILE, 'utf8')) : {};
const lvl = (k, d) => +(process.env['HC_' + k.toUpperCase()] ?? SAVED[k] ?? d);

// The braam is the one that blasts: it lands 1ms after the word it punctuates
// and sustains 1.6s straight through it. Four saw waves hard-saturated at 2.2x
// is a lot of energy right on top of a syllable, so it sits well down now.
const VOL = {
  bed: lvl('bed', 0.17), vo: lvl('vo', 1.9), pawn: lvl('pawn', 1.7),
  braam: lvl('braam', 0.30), boom: lvl('boom', 0.40),
  hit: lvl('hit', 0.45), whoosh: lvl('whoosh', 0.38), lift: lvl('lift', 0.35),
};
const BASS = lvl('bass', 0.09);          // 0 removes the sub bass entirely
// The overall loudness is held where it always was (~-12 LUFS integrated) --
// the shorts never sounded "too loud" because of the voice, they sounded loud
// because of a harsh bed running wall to wall. So the bed comes down ~17dB and
// the voice stays put. Every knob here is an env var: HC_LUFS, HC_TP, HC_BED,
// HC_BASS (0 kills the sub bass entirely), HC_CEIL.
const TARGET = { I: +(process.env.HC_LUFS || -12), TP: +(process.env.HC_TP || -1.0), LRA: 11 };
// The limiter works on sample peaks; the AAC encoder afterwards creates
// inter-sample peaks above them, so leave real headroom. NOTE: alimiter's
// `level` option defaults to TRUE ("auto level"), which normalises the output
// back up to 0 dB and silently undoes both this ceiling and the loudness
// target — it must be disabled wherever the filter follows loudnorm.
const CEILING = +(process.env.HC_CEIL || 0.94);

// The square cuts were only kept as finished mixes, so the silent source can be
// missing. The video stream is untouched by mixing, so recover it by stripping
// the audio off the old mix rather than re-recording the scene.
function ensureSilentSource(scene) {
  const video = path.join(OUT, scene + '-video.mp4');
  if (fs.existsSync(video)) return video;
  for (const cand of [path.join(finalDir(scene), scene + '.mp4'), path.join(OUT, scene + '.mp4')]) {
    if (fs.existsSync(cand)) {
      ffmpeg(['-i', cand, '-map', '0:v', '-c:v', 'copy', '-an', video]);
      return video;
    }
  }
  return null;
}

function mixScene(scene) {
  const video = ensureSilentSource(scene);
  const beatsFile = path.join(OUT, scene + '.beats.json');
  if (!video || !fs.existsSync(beatsFile)) { console.warn('skip', scene, '(not recorded)'); return; }
  const beats = JSON.parse(fs.readFileSync(beatsFile, 'utf8'));
  const dur = parseFloat(ffprobe(['-show_entries', 'format=duration', '-of', 'csv=p=0', video]));
  const sync = findSync(video);
  console.log(`${scene}: ${dur.toFixed(1)}s, sync flash at ${sync.toFixed(2)}s, ${beats.length} beats`);

  const bed = path.join(OUT, scene + '-bed.wav');
  synthBed(bed, dur);
  for (const k of ['braam', 'boom', 'hit', 'whoosh', 'lift']) {
    const f = path.join(OUT, 'sfx-' + k + '.wav');
    if (!fs.existsSync(f)) synthSfx(k, f);
  }

  const inputs = ['-i', video, '-i', bed];
  const chains = [`[1]volume=${VOL.bed}[bed]`];
  const voLabels = [], sfxLabels = [];
  let idx = 2;
  for (const b of beats) {
    if (b.sync) continue;
    const at = Math.max(0, Math.round((sync + b.t) * 1000));
    const isVo = !!b.vo;
    const file = isVo ? voFile(b.vo, b.voice) : path.join(OUT, 'sfx-' + b.sfx + '.wav');
    const vol = isVo ? (b.voice === 'pawn' ? VOL.pawn : VOL.vo) : (VOL[b.sfx] || 0.5);
    const lbl = (isVo ? 'v' : 's') + idx;
    inputs.push('-i', file);
    chains.push(`[${idx}]adelay=${at}|${at},volume=${vol}[${lbl}]`);
    (isVo ? voLabels : sfxLabels).push(`[${lbl}]`);
    idx++;
  }

  const merge = (labels, out) => {
    if (!labels.length) return null;
    if (labels.length === 1) { chains.push(`${labels[0]}anull[${out}]`); return `[${out}]`; }
    chains.push(`${labels.join('')}amix=inputs=${labels.length}:normalize=0[${out}]`);
    return `[${out}]`;
  };
  const vo = merge(voLabels, 'vo');
  const sfx = merge(sfxLabels, 'sfx');

  // Duck the bed under any dialogue — trailer voice or pawn — so speech is the
  // clearest thing in the mix without having to be the loudest.
  let bedOut = '[bed]';
  if (vo) {
    chains.push(`${vo}asplit=2[vomix][vokeyraw]`);
    // The key must run the FULL length: sidechaincompress ends when EITHER
    // input ends, which otherwise truncates the mix at the last spoken word
    // and cuts the end card — and the URL on it — off the video.
    chains.push(`[vokeyraw]apad=whole_dur=${dur}[vokey]`);
    chains.push(`[bed][vokey]sidechaincompress=threshold=0.02:ratio=6:attack=15:release=350:makeup=1[bedduck]`);
    bedOut = '[bedduck]';
  }
  const stems = [bedOut, vo ? '[vomix]' : null, sfx].filter(Boolean);
  chains.push(`${stems.join('')}amix=inputs=${stems.length}:normalize=0,` +
    `apad=whole_dur=${dur},atrim=0:${dur},alimiter=limit=0.97:level=disabled[mixed]`);

  // Two-pass loudness: measure the finished mix, then normalise to the target
  // exactly. Single-pass loudnorm guesses, and pumps.
  const raw = path.join(OUT, scene + '-mix.wav');
  ffmpeg(inputs.concat(['-filter_complex', chains.join(';'), '-map', '[mixed]', '-c:a', 'pcm_s16le', raw]));
  const probe = require('child_process').spawnSync('ffmpeg', ['-hide_banner', '-i', raw,
    '-af', `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}:print_format=json`,
    '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const m = JSON.parse(probe.slice(probe.lastIndexOf('{'), probe.lastIndexOf('}') + 1));
  const ln = `loudnorm=I=${TARGET.I}:TP=${TARGET.TP}:LRA=${TARGET.LRA}` +
    `:measured_I=${m.input_i}:measured_TP=${m.input_tp}:measured_LRA=${m.input_lra}` +
    `:measured_thresh=${m.input_thresh}:offset=${m.target_offset}:linear=true:print_format=summary`;
  console.log(`  measured ${m.input_i} LUFS -> ${TARGET.I}`);

  const dir = finalDir(scene);
  fs.mkdirSync(dir, { recursive: true });
  const final = path.join(dir, scene + '.mp4');
  ffmpeg(['-i', video, '-i', raw, '-filter_complex', `[1:a]${ln},alimiter=limit=${CEILING}:level=disabled[aout]`,
    '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-shortest', final]);
  fs.unlinkSync(bed); fs.unlinkSync(raw);
  console.log('mixed:', path.relative(OUT, final).replace(/\\/g, '/'));
}

// ---- stems, for the mixer UI ------------------------------------------------
// Writes every layer separately at unity gain, already time-aligned, so
// shorts/mixer.html can balance them live in the browser instead of you
// re-rendering to hear a change.
//
//   node harness/mix-audio.js escape-sq --stems
function exportStems(scene) {
  const video = ensureSilentSource(scene);
  const beatsFile = path.join(OUT, scene + '.beats.json');
  if (!video || !fs.existsSync(beatsFile)) { console.warn('skip', scene, '(not recorded)'); return; }
  const beats = JSON.parse(fs.readFileSync(beatsFile, 'utf8'));
  const dur = parseFloat(ffprobe(['-show_entries', 'format=duration', '-of', 'csv=p=0', video]));
  const sync = findSync(video);
  const dir = path.join(OUT, 'stems', scene);
  fs.mkdirSync(dir, { recursive: true });

  const bed = path.join(dir, 'bed.wav');
  synthBed(bed, dur);
  for (const k of ['braam', 'boom', 'hit', 'whoosh', 'lift']) {
    const f = path.join(OUT, 'sfx-' + k + '.wav');
    if (!fs.existsSync(f)) synthSfx(k, f);
  }

  const groups = {};
  for (const b of beats) {
    if (b.sync) continue;
    const at = Math.max(0, Math.round((sync + b.t) * 1000));
    const name = b.vo ? (b.voice === 'pawn' ? 'pawn' : 'vo') : b.sfx;
    const file = b.vo ? voFile(b.vo, b.voice) : path.join(OUT, 'sfx-' + b.sfx + '.wav');
    (groups[name] = groups[name] || []).push({ file, at });
  }

  const stems = ['bed'];
  for (const name of Object.keys(groups)) {
    const parts = groups[name];
    const inputs = [], chains = [], labels = [];
    parts.forEach((p, i) => {
      inputs.push('-i', p.file);
      chains.push(`[${i}]adelay=${p.at}|${p.at}[x${i}]`);
      labels.push(`[x${i}]`);
    });
    const mix = labels.length > 1
      ? `${labels.join('')}amix=inputs=${labels.length}:normalize=0[m]`
      : `${labels[0]}anull[m]`;
    chains.push(mix);
    chains.push(`[m]apad=whole_dur=${dur},atrim=0:${dur}[o]`);
    ffmpeg(inputs.concat(['-filter_complex', chains.join(';'), '-map', '[o]',
      '-c:a', 'pcm_s16le', '-ar', '44100', path.join(dir, name + '.wav')]));
    stems.push(name);
  }

  // the UI reads this: which stems exist, the video to sync to, current levels
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify({
    scene, duration: dur, video: '../../' + scene + '-video.mp4',
    stems, levels: Object.assign({}, VOL, { bass: BASS }),
  }, null, 1));
  console.log('stems:', path.relative(OUT, dir), '->', stems.join(', '));
}

const only = process.argv[2];
const BASE_SCENES = ['rook', 'island', 'escape', 'cheese', 'morph'];
// '--square' mixes the 1:1 feed cuts instead of the 9:16 ones.
const list = only && !only.startsWith('--')
  ? [only]
  : BASE_SCENES.map((x) => x + (process.argv.includes('--square') ? '-sq' : ''));
const STEMS = process.argv.includes('--stems');
for (const scene of list) (STEMS ? exportStems : mixScene)(scene);
console.log(STEMS ? 'stems done — open shorts/mixer.html' : 'audio done.');
