// Hollow Chess — sound. Everything is synthesized with WebAudio at play time:
// no audio files, nothing to download, works offline. Piece moves get short
// wooden thocks; BOARD moves get a low stone-grind rumble that sounds like
// nothing else in the game, on purpose — you should be able to hear a terrain
// move from across the room.
// Exposed as window.WCSOUND.

(function () {
  'use strict';

  const KEY = 'wildcardchess.sound.v1';
  const MUSIC_KEY = 'wildcardchess.music.v1';
  let ctx = null;
  let muted = false;
  // Ambient menu music is OFF by default — it's opt-in via the appearance panel.
  let musicOn = false;
  try { muted = localStorage.getItem(KEY) === 'off'; } catch (e) {}
  try { musicOn = localStorage.getItem(MUSIC_KEY) === 'on'; } catch (e) {}

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
    // A board turn just became available. The thing players actually miss is
    // not that a square MOVED — that already has the loudest sound in the game
    // — but that they are *allowed* to move one this ply. So this cue sits at
    // the opposite end of the spectrum from `terrain`: bright, bell-like and
    // high, where nothing else in the mix lives. Detuned twins give it the
    // shimmer that reads as "✦" rather than as a notification beep.
    wildready: function (a, t) {
      [784, 1175.7, 1568].forEach(function (f, i) {        // G5 - D6 - G6
        const at = t + i * 0.07;
        tone(a, at, f, 0.45, { vol: 0.075, type: 'triangle', attack: 0.008 });
        tone(a, at, f * 1.006, 0.45, { vol: 0.032, type: 'sine', attack: 0.01 });
      });
      tone(a, t + 0.13, 392, 0.55, { vol: 0.045, type: 'sine', attack: 0.02 });  // root, so it isn't thin
    },
    // a square of the WORLD grinding into a new place. Low, long, unmistakable.
    terrain: function (a, t) {
      tone(a, t, 140, 0.5, { vol: 0.16, slideTo: 52, type: 'sawtooth', attack: 0.03 });
      tone(a, t, 70, 0.55, { vol: 0.14, slideTo: 45, attack: 0.02 });
      thud(a, t, 0.4, 300, 0.35);
      thud(a, t + 0.32, 0.14, 700, 0.30);          // the square settling into place
    },
    // a wrong puzzle answer: a short flat two-note fall. Deliberately small —
    // being wrong in a puzzle is information, not a defeat.
    wrong: function (a, t) {
      tone(a, t, 300, 0.11, { vol: 0.07, type: 'triangle' });
      tone(a, t + 0.1, 225, 0.18, { vol: 0.07, type: 'triangle' });
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

  // ---- ambient menu music ---------------------------------------------------
  // A very quiet generative tune for the lobby / welcome / post-game lull:
  // two barely-there drone sines and an unhurried A-minor-pentatonic pluck
  // every few seconds. Composed live, never repeats, costs nothing to ship.
  let ambientWanted = false;
  let amb = null;                  // { master, oscs, timer }
  const PENTA = [220, 261.63, 293.66, 329.63, 392, 440, 523.25];

  function ambientStart() {
    if (amb || muted || !musicOn) return;
    const a = ac();
    if (!a) return;                // no gesture yet: the unlock listener retries
    const master = a.createGain();
    master.gain.setValueAtTime(0.0001, a.currentTime);
    master.gain.exponentialRampToValueAtTime(1, a.currentTime + 2.5);   // fade in
    master.connect(a.destination);
    const oscs = [];
    [[110, 0.016], [164.81, 0.011]].forEach(function (d) {             // A2 + E3 drone
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'sine'; o.frequency.value = d[0]; g.gain.value = d[1];
      o.connect(g); g.connect(master); o.start();
      oscs.push(o);
    });
    const pluck = function () {
      if (!amb || muted) return;
      const f = PENTA[Math.floor(Math.random() * PENTA.length)];
      const t = a.currentTime + 0.02;
      const o = a.createOscillator(), g = a.createGain();
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.035, t + 0.06);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
      o.connect(g); g.connect(master);
      o.start(t); o.stop(t + 2.3);
    };
    const timer = setInterval(function () {
      if (Math.random() < 0.75) pluck();                 // the silences matter
    }, 2600);
    amb = { master, oscs, timer };
    pluck();
  }

  function ambientStop() {
    if (!amb) return;
    const a = ctx, dying = amb;
    amb = null;
    clearInterval(dying.timer);
    try {
      dying.master.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + 0.45); // fast fade
      setTimeout(function () {
        dying.oscs.forEach(function (o) { try { o.stop(); } catch (e) {} });
        try { dying.master.disconnect(); } catch (e) {}
      }, 600);
    } catch (e) {}
  }

  function setAmbient(on) {
    ambientWanted = !!on;
    if (ambientWanted) ambientStart(); else ambientStop();
  }

  // Autoplay policy: the context unlocks on the first gesture — start the
  // ambience then if a menu is already asking for it (and music is enabled).
  ['pointerdown', 'keydown', 'touchstart'].forEach(function (ev) {
    window.addEventListener(ev, function () {
      if (!muted && musicOn && ambientWanted && !amb) ambientStart();
    }, { passive: true });
  });

  function setMuted(v) {
    muted = !!v;
    try { localStorage.setItem(KEY, muted ? 'off' : 'on'); } catch (e) {}
    if (muted) ambientStop();
    else if (ambientWanted) ambientStart();
  }

  // Opt-in menu music, independent of the sound-effects mute.
  function setMusic(v) {
    musicOn = !!v;
    try { localStorage.setItem(MUSIC_KEY, musicOn ? 'on' : 'off'); } catch (e) {}
    if (musicOn && ambientWanted) ambientStart();
    else ambientStop();
  }

  window.WCSOUND = {
    play,
    setMuted,
    setAmbient,
    setMusic,
    isMuted: function () { return muted; },
    musicEnabled: function () { return musicOn; },
    toggle: function () { setMuted(!muted); return muted; },
  };
})();
