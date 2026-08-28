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
  let noise = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const inBeat = t % beat;
    const beatIdx = Math.floor(t / beat);
    let s = 0;
    // kick: pitch 150->45 sweep, sharp decay
    if (inBeat < 0.32) {
      const f = 45 + 105 * Math.exp(-inBeat * 26);
      s += Math.sin(2 * Math.PI * f * inBeat) * Math.exp(-inBeat * 9) * 0.9;
    }
    // sub bass: gated eighth notes, one chord tone per bar
    const bass = bassNotes[Math.floor(beatIdx / 4) % 4];
    const eighth = (t % (beat / 2)) / (beat / 2);
    if (eighth < 0.72) {
      s += Math.sign(Math.sin(2 * Math.PI * bass * t)) * 0.16 * (1 - eighth * 0.4);
    }
    // hats on the offbeat: differenced noise ~ highpass
    const off = (t + beat / 2) % beat;
    if (off < 0.05) {
      const w = Math.random() * 2 - 1;
      s += (w - noise) * Math.exp(-off * 90) * 0.5;
      noise = w;
    }
    // fade in / out
    const env = Math.min(1, t / 0.8) * Math.min(1, (seconds - t) / 1.2);
    const v = clip(s) * env;
    L[i] = v; R[i] = v;
  }
  writeWav(file, L, R);
}

// ---- SFX -------------------------------------------------------------------
function synthSfx(kind, file) {
  let dur = { braam: 1.6, hit: 0.4, whoosh: 0.55, lift: 0.3 }[kind];
  const n = Math.floor(dur * SR);
  const L = new Float32Array(n), R = new Float32Array(n);
  let lp = 0;
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
      s *= Math.min(1, t / 0.03) * Math.exp(-t * 1.9);
      s = clip(s * 2.2) * 0.9;
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
function voFile(line) {
  fs.mkdirSync(VO_DIR, { recursive: true });
  const f = path.join(VO_DIR, crypto.createHash('md5').update(line).digest('hex').slice(0, 12) + '.mp3');
  if (!fs.existsSync(f)) {
    execFileSync('python', ['-m', 'edge_tts',
      '--voice', 'en-US-ChristopherNeural', '--rate=-6%', '--pitch=-14Hz',
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

// ---- mix one scene ---------------------------------------------------------
const VOL = { bed: 0.42, vo: 1.9, braam: 1.0, hit: 0.85, whoosh: 0.6, lift: 0.45 };

function mixScene(scene) {
  const video = path.join(OUT, scene + '-video.mp4');
  const beatsFile = path.join(OUT, scene + '.beats.json');
  if (!fs.existsSync(video) || !fs.existsSync(beatsFile)) { console.warn('skip', scene, '(not recorded)'); return; }
  const beats = JSON.parse(fs.readFileSync(beatsFile, 'utf8'));
  const dur = parseFloat(ffprobe(['-show_entries', 'format=duration', '-of', 'csv=p=0', video]));
  const sync = findSync(video);
  console.log(`${scene}: ${dur.toFixed(1)}s, sync flash at ${sync.toFixed(2)}s, ${beats.length} beats`);

  const bed = path.join(OUT, scene + '-bed.wav');
  synthBed(bed, dur);
  for (const k of ['braam', 'hit', 'whoosh', 'lift']) {
    const f = path.join(OUT, 'sfx-' + k + '.wav');
    if (!fs.existsSync(f)) synthSfx(k, f);
  }

  const inputs = ['-i', video, '-i', bed];
  const chains = ['[1]volume=' + VOL.bed + '[a0]'];
  let idx = 2, ai = 1;
  for (const b of beats) {
    if (b.sync) continue;
    const at = Math.max(0, Math.round((sync + b.t) * 1000));
    let file, vol;
    if (b.vo) { file = voFile(b.vo); vol = VOL.vo; }
    else { file = path.join(OUT, 'sfx-' + b.sfx + '.wav'); vol = VOL[b.sfx] || 0.7; }
    inputs.push('-i', file);
    chains.push(`[${idx}]adelay=${at}|${at},volume=${vol}[a${ai}]`);
    idx++; ai++;
  }
  const mixIn = Array.from({ length: ai }, (_, i) => `[a${i}]`).join('');
  chains.push(`${mixIn}amix=inputs=${ai}:normalize=0,alimiter=limit=0.92[aout]`);
  const final = path.join(OUT, scene + '.mp4');
  ffmpeg(inputs.concat(['-filter_complex', chains.join(';'),
    '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', final]));
  fs.unlinkSync(bed);
  console.log('mixed:', scene + '.mp4');
}

const only = process.argv[2];
for (const scene of (only ? [only] : ['rook', 'island', 'escape', 'cheese', 'morph'])) mixScene(scene);
console.log('audio done.');
