// Hollow Chess — the walkthrough. A short, skippable tour shown on first visit
// (and any time from "How to play"). All diagrams are inline SVG drawn with the
// theme's own square colours, so the tutorial always matches the board skin.
// Exposed as window.WCTUT.

(function () {
  'use strict';

  // tiny svg board helper: cells = [[c,r,kind]] where kind: '' | 'hole' | 'lift' | 'dash' | 'mark'
  // pieces = [[c,r,glyph,color]]
  function mini(w, h, cells, pieces, extra) {
    let s = '<svg class="tut-board" viewBox="0 0 ' + w + ' ' + h + '" xmlns="http://www.w3.org/2000/svg">';
    for (const [c, r, kind] of cells) {
      if (kind === 'hole') continue;                       // a hole is just… nothing
      const light = (c + r) % 2 === 1;
      let cls = 'tut-sq ' + (light ? 'lt' : 'dk');
      if (kind === 'lift') cls += ' lift';
      s += '<rect x="' + c + '" y="' + (h - 1 - r) + '" width="1" height="1" class="' + cls + '"/>';
      if (kind === 'mark') s += '<rect x="' + (c + 0.06) + '" y="' + (h - 1 - r + 0.06) + '" width=".88" height=".88" rx=".1" class="tut-markbox"/>';
    }
    for (const [c, r, kind] of cells) {
      if (kind === 'dash') s += '<rect x="' + (c + 0.08) + '" y="' + (h - 1 - r + 0.08) + '" width=".84" height=".84" rx=".08" class="tut-dash"/>';
    }
    for (const p of pieces || []) {
      s += '<text x="' + (p[0] + 0.5) + '" y="' + (h - 1 - p[1] + 0.78) + '" class="tut-pc ' + (p[3] || 'w') + '" text-anchor="middle">' + p[2] + '</text>';
    }
    s += (extra || '') + '</svg>';
    return s;
  }

  const arrow = function (x1, y1, x2, y2) {
    return '<line x1="' + x1 + '" y1="' + y1 + '" x2="' + x2 + '" y2="' + y2 + '" class="tut-arrow"/>' +
      '<circle cx="' + x2 + '" cy="' + y2 + '" r=".12" class="tut-arrowhead"/>';
  };

  const g4 = [];
  for (let c = 0; c < 4; c++) for (let r = 0; r < 3; r++) g4.push([c, r, '']);

  // The board move, animated: the square at (fc,fr) lifts, glides to (tc,tr) — a
  // dashed spot on the board's edge — and settles; the hole it left stays. Loops.
  function liftAnim(w, h, cells, from, to) {
    const [fc, fr] = from, [tc, tr] = to;
    const base = cells.filter(function (x) { return !(x[0] === fc && x[1] === fr); });
    let s = mini(w, h, base, []);
    s = s.slice(0, -6);                                   // reopen the svg
    const y = h - 1 - fr, dx = tc - fc, dy = (h - 1 - tr) - y;
    const light = (fc + fr) % 2 === 1;
    // SMIL wants plain decimals with a leading zero ("-0.16", never "-.16")
    const f = function (n) { return (Math.round(n * 100) / 100).toFixed(2); };
    const pt = function (x, y) { return f(x) + ' ' + f(y); };
    const timing = ' keyTimes="0; 0.14; 0.3; 0.66; 0.74; 1" calcMode="spline"' +
      ' keySplines="0.4 0 0.2 1; 0 0 1 1; 0.3 0 0.2 1; 0.4 0 0.2 1; 0 0 1 1" dur="4.2s" repeatCount="indefinite"';
    const T = 'values="' + [pt(0, 0), pt(0, -0.16), pt(0, -0.16), pt(dx, dy - 0.16), pt(dx, dy), pt(dx, dy)].join('; ') + '"' + timing;
    const TS = 'values="' + [pt(0, 0), pt(0, 0), pt(0, 0), pt(dx, dy), pt(dx, dy), pt(dx, dy)].join('; ') + '"' + timing;   // shadow stays on the ground
    s += '<g class="tut-lift-anim">' +
      '<rect x="' + (fc + .08) + '" y="' + (y + .18) + '" width=".84" height=".84" rx=".1" class="tut-lift-shadow">' +
        '<animateTransform attributeName="transform" type="translate" ' + TS + '/>' +
        '<animate attributeName="opacity" values="0;0.45;0.45;0.45;0;0" keyTimes="0;0.14;0.3;0.66;0.74;1" dur="4.2s" repeatCount="indefinite"/>' +
      '</rect>' +
      // the rect keeps the CSS "lift" look (its own CSS transform would override
      // SMIL), so the motion goes on a wrapper group
      '<g>' +
        '<animateTransform attributeName="transform" type="translate" ' + T + '/>' +
        '<animate attributeName="opacity" values="0;1;1;1;1;1;1;0" keyTimes="0;0.05;0.14;0.3;0.66;0.74;0.93;1" dur="4.2s" repeatCount="indefinite"/>' +
        '<rect x="' + fc + '" y="' + y + '" width="1" height="1" class="tut-sq ' + (light ? 'lt' : 'dk') + ' lift"/>' +
      '</g>' +
      '</g></svg>';
    return s;
  }

  const STEPS = [
    {
      title: 'This is Hollow Chess',
      body: 'The pieces play <b>normal chess</b>. But the board is not safe: squares can be picked up and moved, leaving <b>holes</b> behind. The map you start on is not the map you finish on.',
      art: mini(4, 3, [
        [0, 0, ''], [1, 0, ''], [2, 0, ''], [3, 0, ''],
        [0, 1, ''], [1, 1, 'hole'], [2, 1, ''], [3, 1, ''],
        [0, 2, ''], [1, 2, ''], [2, 2, ''], [3, 2, 'hole'],
      ], [[0, 0, '♜', 'w'], [2, 2, '♚', 'b']]),
    },
    {
      title: 'Every 3rd turn is a board turn',
      body: 'The rhythm of a game: <span class="tut-seq"><i>W</i><i class="s">B✦</i><i>W</i><i>B</i><i class="s">W✦</i><i>B</i><i>W</i><i class="s">B✦</i></span><br>On a <b>✦ board turn</b> you may move a piece as usual <b>or</b> move a square instead. Black gets the first one (move 1), then White (move 3), then Black again (move 4)… The glowing board edge tells you it is yours.',
      art: null,
    },
    {
      title: 'Click a square to lift it',
      body: 'On your board turn, <b>click any empty square</b> — it lifts off the world. Then click one of the <b>dashed spots</b> to set it down anywhere <b>edge-adjacent</b> to the board (sharing a side, not just a corner). It leaves a hole where it was. Click the lifted square again to cancel.',
      art: liftAnim(4, 3, [
        [0, 0, ''], [1, 0, ''], [2, 0, ''], [3, 0, ''],
        [0, 1, ''], [1, 1, ''], [2, 1, ''], [3, 1, ''],
        [0, 2, 'dash'], [1, 2, ''], [2, 2, ''], [3, 2, 'dash'],
      ], [1, 1], [3, 2]),
    },
    {
      title: 'Holes change everything',
      body: 'Rooks, bishops and queens <b>cannot cross a hole</b> — tear out one square and a deadly diagonal is gone. <b>Knights jump over holes</b> but must land on real ground. Kings cannot step into the void, and a hole in the castling path denies the castle.',
      art: mini(5, 1, [
        [0, 0, ''], [1, 0, ''], [2, 0, 'hole'], [3, 0, ''], [4, 0, ''],
      ], [[0, 0, '♜', 'w'], [4, 0, '♚', 'b']],
        '<text x="2.5" y="0.72" class="tut-void" text-anchor="middle">✕</text>'),
    },
    {
      title: 'Win by checkmate — anyway',
      body: 'Checkmate wins, exactly like chess — except on a board turn you can also <b>escape check by reshaping the world</b> (steal the square your attacker slides through). Pawns promote at the <b>edge of the world</b>: extend the board upward and they must march further. Good luck out there.',
      art: mini(4, 3, [
        [0, 0, ''], [1, 0, ''], [2, 0, ''], [3, 0, ''],
        [0, 1, ''], [1, 1, ''], [2, 1, 'hole'], [3, 1, ''],
        [0, 2, ''], [1, 2, ''], [2, 2, ''], [3, 2, ''],
      ], [[3, 2, '♚', 'b'], [2, 0, '♛', 'w'], [0, 2, '♟', 'w']]),
    },
  ];

  let el = null, step = 0, onClose = null;

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
      '</div>';
    document.body.appendChild(el);
    el.querySelector('#tutSkip').addEventListener('click', close);
    el.querySelector('#tutPrev').addEventListener('click', function () { go(step - 1, 'r'); });
    el.querySelector('#tutNext').addEventListener('click', function () {
      if (step >= STEPS.length - 1) close(); else go(step + 1, 'l');
    });
    el.addEventListener('click', function (e) { if (e.target === el) close(); });

    // phones: swipe left/right through the steps
    let tx = 0, ty = 0, tt = 0;
    el.addEventListener('touchstart', function (e) {
      const p = e.changedTouches[0]; tx = p.clientX; ty = p.clientY; tt = Date.now();
    }, { passive: true });
    el.addEventListener('touchend', function (e) {
      const p = e.changedTouches[0];
      const dx = p.clientX - tx, dy = p.clientY - ty;
      if (Date.now() - tt > 800) return;                            // a slow drag is a scroll, not a swipe
      if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      if (dx < 0) { if (step >= STEPS.length - 1) close(); else go(step + 1, 'l'); }
      else if (step > 0) go(step - 1, 'r');
    }, { passive: true });
    // desktop: arrow keys
    document.addEventListener('keydown', function (e) {
      if (!el.classList.contains('show')) return;
      if (e.key === 'ArrowRight') { e.preventDefault(); if (step >= STEPS.length - 1) close(); else go(step + 1, 'l'); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); if (step > 0) go(step - 1, 'r'); }
      else if (e.key === 'Escape') close();
    });
  }

  function go(n, dir) {
    step = Math.max(0, Math.min(STEPS.length - 1, n));
    const s = STEPS[step];
    // slide the card in from the side the user is heading toward
    const inner = el.querySelector('.tut-inner');
    if (dir) { inner.classList.remove('slide-l', 'slide-r'); void inner.offsetWidth; inner.classList.add(dir === 'l' ? 'slide-l' : 'slide-r'); }
    el.querySelector('#tutArt').innerHTML = s.art || '';
    el.querySelector('#tutArt').style.display = s.art ? '' : 'none';
    el.querySelector('#tutTitle').textContent = s.title;
    el.querySelector('#tutBody').innerHTML = s.body;
    el.querySelector('#tutDots').innerHTML = STEPS.map(function (_, i) {
      return '<span class="tut-dot' + (i === step ? ' on' : '') + '"></span>';
    }).join('');
    el.querySelector('#tutPrev').style.visibility = step === 0 ? 'hidden' : '';
    el.querySelector('#tutNext').textContent = step >= STEPS.length - 1 ? "Let's play" : 'Next →';
    el.querySelector('#tutSkip').style.display = step >= STEPS.length - 1 ? 'none' : '';
  }

  function open(done) {
    onClose = done || null;
    if (!el) build();
    go(0);
    el.classList.add('show');
  }

  function close() {
    if (el) el.classList.remove('show');
    if (onClose) { const fn = onClose; onClose = null; fn(); }
  }

  window.WCTUT = { open: open, close: close };
})();
