// Hollow Chess — the walkthrough. A short, skippable tour (any time from "How
// to play"), and the intro card a first visit lands on: one looping animation
// of the board move, and a button to try it. Every diagram is inline SVG drawn
// with the theme's own square colours and animated with SMIL, so it loops with
// no script and always matches the board skin.
// Exposed as window.WCTUT.

(function () {
  'use strict';

  // ---- svg helpers -----------------------------------------------------------
  // Board coordinates: (c, r) with r = 0 at the bottom, like the real board.
  // SMIL wants plain decimals with a leading zero ("-0.16", never "-.16").
  const f = function (n) { return (Math.round(n * 100) / 100).toFixed(2); };
  const light = function (c, r) { return (c + r) % 2 === 1; };

  function open(w, h, vh) {
    return '<svg class="tut-board" viewBox="0 0 ' + w + ' ' + (vh || h) + '" xmlns="http://www.w3.org/2000/svg">';
  }
  // cells = [[c, r, kind]] where kind: '' | 'hole' | 'dash'
  function squares(h, cells) {
    let s = '';
    for (const [c, r, kind] of cells) {
      if (kind === 'hole' || kind === 'dash') continue;      // a hole is just… nothing
      s += '<rect x="' + c + '" y="' + (h - 1 - r) + '" width="1" height="1" class="tut-sq ' + (light(c, r) ? 'lt' : 'dk') + '"/>';
    }
    return s;
  }
  function dash(h, c, r, inner) {
    return '<rect x="' + (c + 0.08) + '" y="' + (h - 1 - r + 0.08) + '" width=".84" height=".84" rx=".08" class="tut-dash">' + (inner || '') + '</rect>';
  }
  function piece(h, c, r, glyph, color, inner) {
    return '<text x="' + (c + 0.5) + '" y="' + (h - 1 - r + 0.78) + '" class="tut-pc ' + (color || 'w') + '" text-anchor="middle">' + glyph + (inner || '') + '</text>';
  }
  function grid(w, h, skip) {
    const out = [];
    for (let c = 0; c < w; c++) for (let r = 0; r < h; r++) {
      if (!(skip || []).some(function (x) { return x[0] === c && x[1] === r; })) out.push([c, r, '']);
    }
    return out;
  }
  // one looping <animate>; vals and kts are parallel arrays
  function an(attr, vals, kts, dur) {
    return '<animate attributeName="' + attr + '" values="' + vals.join(';') + '" keyTimes="' + kts.join(';') + '" dur="' + dur + 's" repeatCount="indefinite"/>';
  }
  // one looping translate; pts = [[x, y]] in board units
  function move(pts, kts, dur) {
    return '<animateTransform attributeName="transform" type="translate" values="' +
      pts.map(function (p) { return f(p[0]) + ' ' + f(p[1]); }).join('; ') + '" keyTimes="' + kts.join('; ') + '" dur="' + dur + 's" repeatCount="indefinite"' +
      ' calcMode="spline" keySplines="' + pts.slice(1).map(function () { return '0.4 0 0.2 1'; }).join('; ') + '"/>';
  }
  // A square of the board lifting at `from`, gliding to `to` and settling there.
  // k = [lift starts, lifted, arrives, settled, fade starts] as fractions of dur.
  function mover(h, from, to, k, dur) {
    const fc = from[0], fr = from[1], y = h - 1 - fr, dx = to[0] - fc, dy = (h - 1 - to[1]) - y;
    const kts = [0, k[0], k[1], k[2], k[3], k[4], 1];
    const fadeEnd = Math.min(0.99, k[4] + 0.05);
    return '<g class="tut-lift-anim">' +
      '<rect x="' + (fc + 0.08) + '" y="' + (y + 0.18) + '" width=".84" height=".84" rx=".1" class="tut-lift-shadow">' +
        move([[0, 0], [0, 0], [0, 0], [dx, dy], [dx, dy], [dx, dy], [dx, dy]], kts, dur) +       // the shadow stays on the ground
        an('opacity', [0, 0, 0.45, 0.45, 0, 0, 0], kts, dur) +
      '</rect>' +
      // the rect keeps the CSS "lift" look only while in the air; the motion goes on a wrapper group
      '<g>' + move([[0, 0], [0, 0], [0, -0.16], [dx, dy - 0.16], [dx, dy], [dx, dy], [dx, dy]], kts, dur) +
        an('opacity', [0, 1, 1, 0, 0], [0, 0.03, k[4], fadeEnd, 1], dur) +
        '<rect x="' + fc + '" y="' + y + '" width="1" height="1" class="tut-sq ' + (light(fc, fr) ? 'lt' : 'dk') + '">' +
          an('stroke-opacity', [0, 0, 1, 1, 0, 0, 0], kts, dur) +
        '</rect>' +
      '</g></g>';
  }
  // a red line of attack from (c1, r) to (c2, r), shown between two moments
  function beam(h, c1, c2, r, vals, kts, dur) {
    const y = h - 1 - r + 0.5;
    return '<line x1="' + (c1 + 0.82) + '" y1="' + y + '" x2="' + (c2 + 0.2) + '" y2="' + y + '" class="tut-beam" opacity="0">' + an('opacity', vals, kts, dur) + '</line>';
  }
  function hit(h, c, r, vals, kts, dur) {
    return '<rect x="' + c + '" y="' + (h - 1 - r) + '" width="1" height="1" class="tut-hit" opacity="0">' + an('opacity', vals, kts, dur) + '</rect>';
  }
  function cross(h, c, r, vals, kts, dur) {
    return '<text x="' + (c + 0.5) + '" y="' + (h - 1 - r + 0.72) + '" class="tut-void" text-anchor="middle" opacity="0">✕' + an('opacity', vals, kts, dur) + '</text>';
  }
  function caption(w, y, text, vals, kts, dur) {
    // drawn at 100x and scaled down: browsers space sub-pixel font sizes badly
    return '<g transform="translate(' + (w / 2) + ' ' + y + ') scale(0.01)"><text x="0" y="0" class="tut-cap" text-anchor="middle" opacity="0">' + text + an('opacity', vals, kts, dur) + '</text></g>';
  }

  // ---- the scenes -------------------------------------------------------------
  // The hook, in six seconds: a hole stops the rook; a square slides into the
  // hole; the rook sees the king; checkmate. Used on the intro card and as the
  // first step of the tour.
  function demo() {
    const w = 5, h = 3, D = 6.4;
    let s = open(w, h, 3.62) + squares(h, grid(w, h, [[2, 2], [2, 0]]));
    s += dash(h, 2, 2, an('opacity', [0, 1, 1, 0, 0], [0, 0.04, 0.5, 0.56, 1], D));
    s += hit(h, 4, 2, [0, 0, 0.75, 0.75, 0, 0], [0, 0.56, 0.6, 0.9, 0.95, 1], D);
    s += mover(h, [2, 0], [2, 2], [0.2, 0.26, 0.5, 0.56, 0.9], D);
    s += beam(h, 0, 4, 2, [0, 0, 1, 1, 0, 0], [0, 0.56, 0.6, 0.9, 0.95, 1], D);
    s += cross(h, 2, 2, [0, 1, 1, 0, 0], [0, 0.04, 0.22, 0.28, 1], D);
    s += piece(h, 0, 2, '♜', 'w') + piece(h, 3, 0, '♚', 'w') + piece(h, 4, 2, '♚', 'b');
    s += caption(w, 3.4, 'A hole stops the rook.', [0, 1, 1, 0, 0], [0, 0.04, 0.22, 0.28, 1], D);
    s += caption(w, 3.4, 'So slide a square into it…', [0, 0, 1, 1, 0, 0], [0, 0.28, 0.32, 0.54, 0.58, 1], D);
    s += caption(w, 3.4, 'Checkmate.', [0, 0, 1, 1, 0, 0], [0, 0.58, 0.62, 0.9, 0.95, 1], D);
    return s + '</svg>';
  }

  // Lifting a square: it glides to a dashed spot on the edge and leaves a hole.
  function liftScene() {
    const w = 4, h = 3, D = 4.2;
    return open(w, h) + squares(h, grid(w, h, [[1, 1], [0, 2], [3, 2]])) +
      dash(h, 0, 2) + dash(h, 3, 2) +
      mover(h, [1, 1], [0, 2], [0.06, 0.16, 0.6, 0.68, 0.92], D) + '</svg>';
  }

  // Holes: the rook runs into one and stops; the knight jumps clean over.
  function holeScene() {
    const w = 5, h = 2, D = 6;
    let s = open(w, h) + squares(h, grid(w, h, [[2, 1]]));
    s += cross(h, 2, 1, [0, 0, 1, 1, 0, 0], [0, 0.18, 0.24, 0.42, 0.48, 1], D);
    s += '<g>' + move([[0, 0], [0, 0], [1.3, 0], [1, 0], [1, 0], [0, 0], [0, 0]], [0, 0.05, 0.2, 0.26, 0.9, 0.96, 1], D) + piece(h, 0, 1, '♜', 'w') + '</g>';
    s += '<g>' + move([[0, 0], [0, 0], [1, -1.15], [2, -1], [2, -1], [0, 0], [0, 0]], [0, 0.5, 0.62, 0.72, 0.9, 0.96, 1], D) + piece(h, 1, 0, '♞', 'w') + '</g>';
    s += piece(h, 4, 1, '♚', 'b');
    return s + '</svg>';
  }

  // Escaping check with the board: the queen attacks along the rank, the square
  // between them is lifted away, and the line of attack is gone.
  function escapeScene() {
    const w = 4, h = 3, D = 6;
    let s = open(w, h) + squares(h, grid(w, h, [[2, 1], [3, 0]]));
    s += dash(h, 3, 0, an('opacity', [1, 1, 0, 0, 1], [0, 0.6, 0.66, 0.95, 1], D));
    s += hit(h, 3, 1, [0, 0.75, 0.75, 0, 0], [0, 0.05, 0.3, 0.36, 1], D);
    s += mover(h, [2, 1], [3, 0], [0.3, 0.36, 0.6, 0.66, 0.92], D);
    s += beam(h, 0, 3, 1, [0, 1, 1, 0, 0], [0, 0.05, 0.3, 0.36, 1], D);
    s += cross(h, 2, 1, [0, 0, 1, 1, 0, 0], [0, 0.62, 0.68, 0.9, 0.95, 1], D);
    s += piece(h, 0, 1, '♛', 'w') + piece(h, 3, 1, '♚', 'b');
    return s + '</svg>';
  }

  const STEPS = [
    {
      title: 'This is Hollow Chess',
      body: 'The pieces play <b>normal chess</b>. But squares can be picked up and moved, leaving <b>holes</b> behind.',
      art: demo,
    },
    {
      title: 'Every 3rd turn is a board turn',
      body: 'The rhythm of a game: <span class="tut-seq run"><i>W</i><i class="s">B✦</i><i>W</i><i>B</i><i class="s">W✦</i><i>B</i><i>W</i><i class="s">B✦</i></span><br>On a <b>✦ board turn</b> you move a piece <b>or</b> a square. The glowing board edge means it is yours.',
      art: null,
    },
    {
      title: 'Tap a square to lift it',
      body: '<b>Tap an empty square</b> to lift it, then a <b>dashed spot</b> to set it down. It leaves a hole where it was.',
      art: liftScene,
    },
    {
      title: 'Holes change everything',
      body: 'Rooks, bishops and queens <b>cannot cross a hole</b>. <b>Knights jump over</b> them. Nothing can stand in one.',
      art: holeScene,
    },
    {
      title: 'Win by checkmate — anyway',
      body: 'Checkmate wins, as in chess. On a board turn you can also <b>escape check by removing the square</b> the attacker slides through.',
      art: escapeScene,
    },
  ];

  let el = null, step = 0, onClose = null, introOn = false, introCbs = null;

  function build() {
    el = document.createElement('div');
    el.id = 'tutorial';
    el.className = 'lobby tut';
    el.innerHTML =
      '<div class="lobby-inner tut-inner">' +
        '<div class="tut-art" id="tutArt"></div>' +
        '<h2 class="lobby-title" id="tutTitle"></h2>' +
        '<p class="tut-body" id="tutBody"></p>' +
        '<div class="tut-dots" id="tutDots"></div>' +
        '<div class="tut-nav">' +
          '<button id="tutSkip" class="ghost-btn">Skip</button>' +
          '<span class="tut-navright">' +
            '<button id="tutPrev" class="ghost-btn">← Back</button>' +
            '<button id="tutNext" class="find-btn tut-next">Next →</button>' +
          '</span>' +
        '</div>' +
        '<div class="tut-intro-nav">' +
          '<button id="tutTry" class="find-btn tut-try"><span class="find-title">Try it</span><span class="find-sub">Mate in 1 · takes a minute</span></button>' +
          '<button id="tutPlay" class="ghost-btn tut-play">Play a game</button>' +
          '<button id="tutTour" class="tut-link" type="button">How it works</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    const next = function () { if (step >= STEPS.length - 1) close(); else go(step + 1, 'l'); };
    el.querySelector('#tutSkip').addEventListener('click', close);
    el.querySelector('#tutPrev').addEventListener('click', function () { go(step - 1, 'r'); });
    el.querySelector('#tutNext').addEventListener('click', next);
    el.querySelector('#tutTry').addEventListener('click', function () { leaveIntro('try'); });
    el.querySelector('#tutPlay').addEventListener('click', function () { leaveIntro('play'); });
    el.querySelector('#tutTour').addEventListener('click', function () {
      // the tour, then the board that is already waiting underneath
      const cbs = introCbs; introOn = false; introCbs = null;
      el.classList.remove('intro');
      if (cbs && cbs.tour) cbs.tour();
      onClose = cbs && cbs.play ? cbs.play : null;
      go(0, 'l');
    });
    el.addEventListener('click', function (e) { if (e.target === el) { if (introOn) leaveIntro('close'); else close(); } });

    // phones: swipe left/right through the steps
    let tx = 0, ty = 0, tt = 0;
    el.addEventListener('touchstart', function (e) {
      const p = e.changedTouches[0]; tx = p.clientX; ty = p.clientY; tt = Date.now();
    }, { passive: true });
    el.addEventListener('touchend', function (e) {
      if (introOn) return;
      const p = e.changedTouches[0];
      const dx = p.clientX - tx, dy = p.clientY - ty;
      if (Date.now() - tt > 800) return;                            // a slow drag is a scroll, not a swipe
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) next();
      else if (step > 0) go(step - 1, 'r');
    }, { passive: true });
    // desktop: arrow keys
    document.addEventListener('keydown', function (e) {
      if (!el.classList.contains('show')) return;
      if (introOn) { if (e.key === 'Escape') leaveIntro('close'); else if (e.key === 'Enter') leaveIntro('try'); return; }
      if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); if (step > 0) go(step - 1, 'r'); }
      else if (e.key === 'Escape') close();
    });
  }

  function paint(art, title, body) {
    const a = el.querySelector('#tutArt');
    a.innerHTML = art ? art() : '';              // built fresh, so the animation starts from its first frame
    a.style.display = art ? '' : 'none';
    el.querySelector('#tutTitle').textContent = title;
    el.querySelector('#tutBody').innerHTML = body;
  }

  function go(n, dir) {
    step = Math.max(0, Math.min(STEPS.length - 1, n));
    const s = STEPS[step];
    // slide the card in from the side the user is heading toward
    const inner = el.querySelector('.tut-inner');
    if (dir) { inner.classList.remove('slide-l', 'slide-r'); void inner.offsetWidth; inner.classList.add(dir === 'l' ? 'slide-l' : 'slide-r'); }
    paint(s.art, s.title, s.body);
    el.querySelector('#tutDots').innerHTML = STEPS.map(function (_, i) {
      return '<span class="tut-dot' + (i === step ? ' on' : '') + '"></span>';
    }).join('');
    el.querySelector('#tutPrev').style.visibility = step === 0 ? 'hidden' : '';
    el.querySelector('#tutNext').textContent = step >= STEPS.length - 1 ? "Let's play" : 'Next →';
    el.querySelector('#tutSkip').style.display = step >= STEPS.length - 1 ? 'none' : '';
  }

  function openTour(done) {
    onClose = done || null;
    if (!el) build();
    introOn = false; introCbs = null;
    el.classList.remove('intro');
    go(0);
    el.classList.add('show');
  }

  // The card a first visit lands on. cbs: { try, play, tour, close } — try opens
  // the starter puzzle, play and close leave the visitor on the board underneath.
  function intro(cbs) {
    if (!el) build();
    introOn = true; introCbs = cbs || {}; onClose = null;
    el.classList.add('intro');
    paint(demo, 'Chess, but you can move the squares',
      'Every third turn you may <b>slide a square of the board</b> instead of moving a piece. Holes stop rooks, bishops and queens.');
    el.classList.add('show');
  }
  function leaveIntro(how) {
    const cbs = introCbs || {};
    introOn = false; introCbs = null;
    el.classList.remove('show', 'intro');
    const fn = cbs[how] || cbs.play;
    if (fn) fn();
  }

  function close() {
    if (el) el.classList.remove('show', 'intro');
    introOn = false; introCbs = null;
    if (onClose) { const fn = onClose; onClose = null; fn(); }
  }

  window.WCTUT = { open: openTour, close: close, intro: intro, demo: demo };
})();
