// Hollow Chess — the controls. Loaded after main.js.
//
// The game logic reads its settings from a handful of <select> and checkbox
// elements. Those stay in the page as the single source of truth, but nobody
// sees them any more: this file draws the real controls (a strength ladder,
// side tiles, tempo chips, board swatches, segmented toggles) and each one
// simply sets its hidden element and fires `change`, so none of the game code
// had to learn anything new. Also: the setup sheet, the settings sheet and the
// phone action bar.
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const fire = (el) => el && el.dispatchEvent(new Event('change', { bubbles: true }));
  const pickers = [];                       // { refresh() } — repainted when state may have moved

  // A row of buttons bound to a <select>. items: [{ value, html }]
  function bind(container, select, items, cls) {
    if (!container || !select) return;
    container.classList.add('pick'); if (cls) container.classList.add(cls);
    container.setAttribute('role', 'group');
    container.innerHTML = items.map(function (it) {
      return '<button type="button" class="pick-opt" data-v="' + it.value + '" aria-pressed="false">' + it.html + '</button>';
    }).join('');
    const refresh = function () {
      container.querySelectorAll('.pick-opt').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === String(select.value))); });
    };
    container.addEventListener('click', function (e) {
      const b = e.target.closest('.pick-opt'); if (!b || b.disabled) return;
      select.value = b.dataset.v; fire(select); refresh();
    });
    select.addEventListener('change', refresh);
    pickers.push({ refresh: refresh });
    refresh();
  }
  const refreshAll = function () { pickers.forEach(function (p) { p.refresh(); }); };

  // ---- before the game: play the computer ------------------------------------
  const levelSel = $('botLevel'), sideSel = $('botSide'), tempoSel = $('timeCtl');
  const LV = (window.WCAI && WCAI.LEVELS) || [];
  bind($('pickLevel'), levelSel, LV.map(function (l) {
    let bars = '';
    for (let i = 1; i <= 5; i++) bars += '<i class="' + (i <= l.id ? 'on' : '') + '" style="height:' + (5 + i * 3) + 'px"></i>';
    return { value: l.id, html: '<span class="lv-bars">' + bars + '</span><span class="lv-name">' + l.name + '</span>' };
  }), 'ladder');

  // "You play" is the inverse of the bot's side; Surprise me picks at Start.
  let youPlay = (sideSel && sideSel.value === 'white') ? 'black' : 'white';
  const sideEl = $('pickSide');
  function paintSide() {
    if (!sideEl) return;
    sideEl.querySelectorAll('.pick-opt').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === youPlay)); });
  }
  if (sideEl) {
    sideEl.classList.add('pick', 'tiles');
    sideEl.innerHTML =
      '<button type="button" class="pick-opt" data-v="white"><span class="sd-glyph">♔</span><span>White</span></button>' +
      '<button type="button" class="pick-opt" data-v="black"><span class="sd-glyph">♚</span><span>Black</span></button>' +
      '<button type="button" class="pick-opt" data-v="random"><span class="sd-glyph">♔♚</span><span>Surprise me</span></button>';
    sideEl.addEventListener('click', function (e) { const b = e.target.closest('.pick-opt'); if (!b) return; youPlay = b.dataset.v; paintSide(); paintSummary(); });
    paintSide();
  }

  const TEMPO = { none: ['∞', 'Untimed'], '1+0': ['1+0', 'Bullet'], '3+2': ['3+2', 'Blitz'], '5+3': ['5+3', 'Blitz'], '10+5': ['10+5', 'Rapid'], '15+10': ['15+10', 'Rapid'] };
  bind($('pickTempo'), tempoSel, Object.keys(TEMPO).map(function (k) {
    return { value: k, html: '<b>' + TEMPO[k][0] + '</b><small>' + TEMPO[k][1] + '</small>' };
  }), 'chips');

  // the same tempo chips, wherever a game is being set up
  const tempoItems = Object.keys(TEMPO).map(function (k) { return { value: k, html: '<b>' + TEMPO[k][0] + '</b><small>' + TEMPO[k][1] + '</small>' }; });
  bind($('pickTempoHot'), tempoSel, tempoItems, 'chips');
  bind($('pickTempoRoom'), tempoSel, tempoItems, 'chips');

  // two players, one screen: ask for the clock first
  const hotEl = $('hotseatSheet');
  const hotRow = document.querySelector('[data-lobbymode="hotseat"]');
  if (hotRow && hotEl) hotRow.addEventListener('click', function (e) { e.stopImmediatePropagation(); refreshAll(); hotEl.classList.add('show'); }, true);
  if (hotEl) hotEl.addEventListener('click', function (e) { if (e.target === hotEl || e.target.closest('[data-close]')) hotEl.classList.remove('show'); });
  const hotStart = $('hotseatStart');
  if (hotStart) hotStart.addEventListener('click', function () {
    if (typeof leaveLiveGame === 'function' && !leaveLiveGame()) return;
    hotEl.classList.remove('show');
    startCasual('hotseat');               // resetGameState() reads the clock just chosen
  });

  function paintSummary() {
    const el = $('setupSummary'); if (!el || !levelSel) return;
    const l = LV.find(function (x) { return String(x.id) === String(levelSel.value); }) || {};
    const t = tempoSel ? tempoSel.value : 'none';
    el.innerHTML = '<b>' + (l.name || '') + '</b>. You take <b>' + (youPlay === 'random' ? 'either side' : youPlay === 'white' ? 'White' : 'Black') + '</b>, ' +
      (t === 'none' ? '<b>no clock</b>.' : '<b>' + t.replace('+', ' min + ') + ' sec</b> a move.');
    const bl = $('setupBlurb'); if (bl) bl.textContent = l.blurb || '';
  }
  [levelSel, tempoSel].forEach(function (s) { if (s) s.addEventListener('change', paintSummary); });

  const setupEl = $('setupSheet'), settingsEl = $('settingsSheet');
  const show = function (el) { if (el) { refreshAll(); paintSide(); paintSummary(); paintAna(); el.classList.add('show'); } };
  const hide = function (el) { if (el) el.classList.remove('show'); };
  [setupEl, settingsEl].forEach(function (el) {
    if (!el) return;
    el.addEventListener('click', function (e) { if (e.target === el || e.target.closest('[data-close]')) hide(el); });
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { hide(setupEl); hide(settingsEl); closeMore(); } });

  // the lobby row: capture phase, so the generic mode handler never sees "computer"
  const compRow = document.querySelector('[data-lobbymode="computer"]');
  if (compRow) compRow.addEventListener('click', function (e) { e.stopImmediatePropagation(); show(setupEl); }, true);

  const startBtn = $('setupStart');
  if (startBtn) startBtn.addEventListener('click', function () {
    if (typeof leaveLiveGame === 'function' && !leaveLiveGame()) return;
    const me = youPlay === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : youPlay;
    const mode = $('oppMode');
    if (mode) { mode.value = 'bot'; }
    if (sideSel) sideSel.value = me === 'white' ? 'black' : 'white';
    /* an unrated game against the engine, not a ladder opponent */
    try { activeBot = null; ratedGame = false; onlineActive = false; myColor = null; } catch (e) {}
    hide(setupEl);
    if (typeof closeLobby === 'function') closeLobby();
    try {
      gameStarted({ mode: 'bot', opponent: 'bot', level: levelSel ? +levelSel.value : 3, signedIn: !!(WCCLOUD.currentUser && WCCLOUD.currentUser()) });
      resetGameState();
      orientFor(me); paintOppCard(); applyTutorVisibility();
      refreshBotUI(); refreshShareUI();
      runAnalysis(); sync(); render(); maybeAI();
    } catch (e) { console.error(e); }
  });

  // ---- settings ---------------------------------------------------------------
  const boardSel = $('themeBoard'), piecesSel = $('themePieces'), modeSel = $('themeMode');
  if (window.WCTHEME && boardSel) {
    bind($('pickBoard'), boardSel, Object.entries(WCTHEME.BOARD_THEMES).map(function (kv) {
      const t = kv[1];
      return { value: kv[0], html: '<span class="sw" title="' + t.name + '" style="--a:' + t.light + ';--b:' + t.dark + '"></span><span class="sr">' + t.name + '</span>' };
    }), 'swatches');
  }
  if (typeof PIECE_SETS !== 'undefined' && piecesSel) {
    bind($('pickPieces'), piecesSel, Object.entries(PIECE_SETS).map(function (kv) {
      return { value: kv[0], html: kv[1].name };
    }), 'seg');
  }
  bind($('pickMode'), modeSel, [{ value: 'dark', html: 'Dark' }, { value: 'light', html: 'Light' }], 'seg');

  // analysis: one control for the checkbox and the depth
  const anaOn = $('anaOn'), anaDepth = $('anaDepth'), anaEl = $('pickAna');
  function anaValue() { return (anaOn && !anaOn.checked) ? 'off' : String(anaDepth ? anaDepth.value : 3); }
  function paintAna() { if (anaEl) anaEl.querySelectorAll('.pick-opt').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.v === anaValue())); }); }
  if (anaEl && anaOn && anaDepth) {
    anaEl.classList.add('pick', 'seg');
    anaEl.innerHTML = [['off', 'Off'], ['2', 'Fast'], ['3', 'Normal'], ['4', 'Deep']].map(function (x) { return '<button type="button" class="pick-opt" data-v="' + x[0] + '">' + x[1] + '</button>'; }).join('');
    anaEl.addEventListener('click', function (e) {
      const b = e.target.closest('.pick-opt'); if (!b) return;
      if (b.dataset.v === 'off') { anaOn.checked = false; fire(anaOn); }
      else { anaOn.checked = true; anaDepth.value = b.dataset.v; fire(anaOn); fire(anaDepth); }
      paintAna();
    });
    paintAna();
  }

  // hosting a friend room: which colour you take
  (function () {
    const rs = $('roomSide'); if (!rs) return;
    bind($('pickRoomSide'), rs, [].map.call(rs.options, function (o) { return { value: o.value, html: o.textContent }; }), 'seg');
  })();

  const settingsBtn = $('settingsBtn');
  if (settingsBtn) settingsBtn.addEventListener('click', function () { show(settingsEl); });

  // ---- phone action bar ---------------------------------------------------------
  const bar = $('actionBar'), more = $('actionMore');
  function closeMore() { if (more) more.classList.remove('show'); }
  if (bar) bar.addEventListener('click', function (e) {
    const b = e.target.closest('[data-do]'); if (!b) return;
    const what = b.dataset.do;
    if (what === 'more') { if (more) more.classList.toggle('show'); return; }
    closeMore();
    if (what === 'wild') { const w = document.querySelector('.wild-btn'); if (w && !w.disabled) w.click(); return; }
    if (what === 'settings') { show(settingsEl); return; }
    const t = $(what); if (t) t.click();
  });
  document.addEventListener('click', function (e) { if (more && more.classList.contains('show') && !e.target.closest('#actionBar')) closeMore(); });

  // ---- back ------------------------------------------------------------------------
  // Three ways back, all doing the same thing: the arrow in the header (to the
  // menu), a Back link at the top of every panel that opens over the game, and
  // the browser's or phone's own back button, which closes the top panel
  // instead of leaving the site.
  const homeBtn = $('homeBtn');
  if (homeBtn) homeBtn.addEventListener('click', function () { if (typeof openLobby === 'function') openLobby(); });

  const CLOSERS = {
    lobby: function () { closeLobby(); },
    profile: function () { closeProfile(); },
    setupSheet: function () { hide(setupEl); },
    settingsSheet: function () { hide(settingsEl); },
    hotseatSheet: function () { const e = $('hotseatSheet'); if (e) e.classList.remove('show'); },
    shareSheet: function () { const e = $('shareSheet'); if (e) e.classList.remove('show'); },
    authModal: function () { closeAuthModal(); },
    feedback: function () { closeFeedback(); },
    tutorial: function () { if (window.WCTUT) WCTUT.close(); },
  };
  const BACK_LABEL = { lobby: 'Back to the board', profile: 'Back', setupSheet: 'Back', settingsSheet: 'Back', hotseatSheet: 'Back', tutorial: null, shareSheet: null, authModal: null, feedback: null };
  function addBackLink(id) {
    const el = $(id); if (!el || !BACK_LABEL[id]) return;
    const inner = el.querySelector('.lobby-inner'); if (!inner || inner.querySelector('.ov-back')) return;
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'ov-back';
    b.innerHTML = '<svg class="ico" viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg><span>' + BACK_LABEL[id] + '</span>';
    b.addEventListener('click', function () { CLOSERS[id](); });
    inner.insertBefore(b, inner.firstChild);
  }
  Object.keys(CLOSERS).forEach(addBackLink);

  const stack = [];                 // overlay ids, in the order they opened
  let fromPop = false, ignorePop = 0;
  const isOpen = function (id) { const e = $(id); return !!(e && e.classList.contains('show')); };
  function reconcile() {
    Object.keys(CLOSERS).forEach(function (id) {
      const open = isOpen(id), at = stack.indexOf(id);
      if (open && at < 0) {
        stack.push(id);
        try { history.pushState({ hcOv: stack.length }, ''); } catch (e) {}
      } else if (!open && at >= 0) {
        stack.splice(at, 1);
        // closed from the page, not by Back: drop the history entry we added for it
        if (!fromPop && history.state && history.state.hcOv) { ignorePop++; try { history.back(); } catch (e) { ignorePop--; } }
      }
    });
  }
  new MutationObserver(reconcile).observe(document.body, { subtree: true, attributes: true, attributeFilter: ['class'] });
  window.addEventListener('popstate', function () {
    if (ignorePop > 0) { ignorePop--; return; }
    const top = stack[stack.length - 1];
    if (!top) return;
    fromPop = true;
    try { CLOSERS[top](); } catch (e) {}
    // the observer runs as a microtask; let it see the close before clearing the flag
    Promise.resolve().then(function () { reconcile(); fromPop = false; });
  });

  window.HCUI = { openSetup: function () { show(setupEl); }, openSettings: function () { show(settingsEl); }, refresh: refreshAll };
})();
