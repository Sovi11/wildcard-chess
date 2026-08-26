// Hollow Chess — sound. Everything is synthesized with WebAudio at play time:
// no audio files, nothing to download, works offline. Piece moves get short
// wooden thocks; BOARD moves get a low stone-grind rumble that sounds like
// nothing else in the game, on purpose — you should be able to hear a terrain
// move from across the room.
// Exposed as window.WCSOUND.

(function () {
  'use strict';

  const KEY = 'wildcardchess.sound.v1';
  let ctx = null;
  let muted = false;
  try { muted = localStorage.getItem(KEY) === 'off'; } catch (e) {}

  function ac() {
    if (!ctx) {
      try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} }
    return ctx;
  }
  // Browsers keep the context suspended until a user gesture; any tap unlocks it.
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    window.addEventListener(ev, function unlock() { if (!muted) ac(); }, { once: true, passive: true });
  });

  // A tone with a percussive envelope. slideTo bends the pitch over the note.
  function tone(a, when, freq, dur, opts) {
    opts = opts || {};
    const o = a.createOscillator(), g = a.createGain();
    o.type = opts.type || 'sine';
    o.frequency.setValueAtTime(freq, when);
    if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(opts.slideTo, when + dur);
    const vol = opts.vol != null ? opts.vol : 0.12;
    g.gain.setValueAtTime(0.0001, when);
    g.gain.exponentialRampToValueAtTime(vol, when + (opts.attack || 0.004));
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    o.connect(g); g.connect(a.destination);
    o.start(when); o.stop(when + dur + 0.02);
  }

  // A burst of filtered noise — the "wood" in a piece landing on a square.
  function thud(a, when, dur, cutoff, vol) {
    const len = Math.max(1, Math.floor(a.sampleRate * dur));
    const buf = a.createBuffer(1, len, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = a.createBufferSource(); src.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = cutoff;
    const g = a.createGain();
    g.gain.setValueAtTime(vol, when);
    g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
    src.connect(f); f.connect(g); g.connect(a.destination);
    src.start(when); src.stop(when + dur);
  }

  const FX = {
    // piece set down on a square
    move: function (a, t) {
      thud(a, t, 0.09, 900, 0.30);
      tone(a, t, 190, 0.08, { vol: 0.07, slideTo: 150 });
    },
    // taking a piece: heavier knock plus a snap
    capture: function (a, t) {
      thud(a, t, 0.12, 1400, 0.45);
      tone(a, t, 300, 0.10, { vol: 0.10, slideTo: 140, type: 'triangle' });
    },
    castle: function (a, t) { FX.move(a, t); FX.move(a, t + 0.11); },
    check: function (a, t) {
      tone(a, t, 660, 0.10, { vol: 0.09, type: 'triangle' });
      tone(a, t + 0.11, 880, 0.14, { vol: 0.09, type: 'triangle' });
    },
    // an empty square being picked up — light, airy, rising
    lift: function (a, t) {
      tone(a, t, 220, 0.16, { vol: 0.07, slideTo: 360 });
    },
    // a square of the WORLD grinding into a new place. Low, long, unmistakable.
    terrain: function (a, t) {
      tone(a, t, 140, 0.5, { vol: 0.16, slideTo: 52, type: 'sawtooth', attack: 0.03 });
      tone(a, t, 70, 0.55, { vol: 0.14, slideTo: 45, attack: 0.02 });
      thud(a, t, 0.4, 300, 0.35);
      thud(a, t + 0.32, 0.14, 700, 0.30);          // the square settling into place
    },
    win: function (a, t) {
      [523, 659, 784, 1047].forEach(function (f, i) {
        tone(a, t + i * 0.12, f, 0.28, { vol: 0.09, type: 'triangle' });
      });
    },
    lose: function (a, t) {
      [392, 330, 262, 196].forEach(function (f, i) {
        tone(a, t + i * 0.14, f, 0.30, { vol: 0.08, type: 'triangle' });
      });
    },
    draw: function (a, t) {
      tone(a, t, 440, 0.2, { vol: 0.08, type: 'triangle' });
      tone(a, t + 0.18, 440, 0.28, { vol: 0.08, type: 'triangle' });
    },
    // match found / opponent connected
    notify: function (a, t) {
      tone(a, t, 700, 0.09, { vol: 0.08, type: 'triangle' });
      tone(a, t + 0.1, 1050, 0.16, { vol: 0.08, type: 'triangle' });
    },
  };

  function play(name) {
    if (muted) return;
    const a = ac();
    if (!a || !FX[name]) return;
    try { FX[name](a, a.currentTime + 0.001); } catch (e) {}
  }

  function setMuted(v) {
    muted = !!v;
    try { localStorage.setItem(KEY, muted ? 'off' : 'on'); } catch (e) {}
  }

  window.WCSOUND = {
    play,
    setMuted,
    isMuted: function () { return muted; },
    toggle: function () { setMuted(!muted); return muted; },
  };
})();
