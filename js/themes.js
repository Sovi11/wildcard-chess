// Wildcard Chess — appearance themes.
// A board theme is a palette (square colours, the void that shows through
// holes, coordinate labels) plus optional square shaping; a piece set comes
// from PIECE_SETS. They mix freely and persist locally.
// Exposed as window.WCTHEME.

(function () {
  'use strict';

  const KEY = 'wildcardchess.appearance.v1';

  const BOARD_THEMES = {
    slate: {
      name: 'Slate',
      desc: 'The house style. Cool stone and cream.',
      light: '#e9e3d6', dark: '#6f7d92',
      void: '#101218', label: '#8a90a0',
      grid: 'rgba(20,22,28,0.16)',
      holeLight: '#2c3342',            // darker than the dark square, not between the two
    },
    garden: {
      name: 'Garden & stone',
      desc: 'Moss and sun-warmed paving. Holes show bare soil.',
      light: '#dfe9c4', dark: '#8caf68',
      void: '#2b2013', label: '#e8efd4',
      grid: 'rgba(52,64,30,0.18)',
      holeLight: '#43301c',            // bare soil, dug deeper for a light page
      rounded: true,                     // squares sit like paving stones
      hatW: '#c8452f', hatB: '#3e63c4',  // gnome hats: classic red vs cornflower
    },
    parchment: {
      name: 'Parchment',
      desc: 'An old manuscript. Ink on paper.',
      light: '#f1e7cd', dark: '#b3925f',
      void: '#221a10', label: '#7a6749',
      grid: 'rgba(70,55,30,0.15)',
      holeLight: '#332614',
    },
    midnight: {
      name: 'Neon void',
      desc: 'Deep space. Black pieces trace in cyan.',
      light: '#39415c', dark: '#232a3d',
      void: '#04060c', label: '#4dd0e1',
      grid: 'rgba(120,200,230,0.08)',
      // This theme's squares are already near-black, so the void barely reads
      // against them in EITHER mode (1.4:1). Here the rim does all the work.
      holeLight: '#04060c', holeRim: 'rgba(77,208,225,.55)',
      neon: true,                        // black pieces get a cyan outline
    },
  };

  let current = { board: 'slate', pieces: 'classic' };

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (BOARD_THEMES[p.board]) current.board = p.board;
        if (window.PIECE_SETS && window.PIECE_SETS[p.pieces]) current.pieces = p.pieces;
        else if (typeof PIECE_SETS !== 'undefined' && PIECE_SETS[p.pieces]) current.pieces = p.pieces;
      }
    } catch (e) {}
    return current;
  }

  const isLight = () => document.body.classList.contains('light');

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(current)); } catch (e) {}
  }

  function apply(boardId, piecesId) {
    if (boardId && BOARD_THEMES[boardId]) current.board = boardId;
    if (piecesId) current.pieces = piecesId;
    const t = BOARD_THEMES[current.board];
    const r = document.documentElement.style;
    r.setProperty('--sq-light', t.light);
    r.setProperty('--sq-dark', t.dark);
    // The void (off-board space and holes) is near-black per board theme, which
    // reads as a heavy frame on a light page. In light mode use a soft neutral
    // instead. This is set as an inline style on :root, so a CSS override in
    // body.light could not win — it has to be decided here.
    r.setProperty('--board-void', isLight() ? (t.voidLight || '#dfe3ea') : t.void);
    // The hole is set independently of the frame. That split is the whole point:
    // the frame can stay quiet on a light page while the hole goes dark enough
    // to read against the light squares it sits beside.
    r.setProperty('--hole', isLight() ? (t.holeLight || '#2c3342') : t.void);
    r.setProperty('--hole-rim', t.holeRim || (isLight() ? 'rgba(255,255,255,.16)' : 'rgba(255,255,255,.10)'));
    r.setProperty('--lbl-edge', t.label);
    r.setProperty('--grid', t.grid);
    r.setProperty('--pc-hat-w', t.hatW || 'currentColor');
    r.setProperty('--pc-hat-b', t.hatB || 'currentColor');
    document.body.classList.toggle('brd-rounded', !!t.rounded);
    document.body.classList.toggle('brd-neon', !!t.neon);
    save();
    return current;
  }

  const get = () => ({ board: current.board, pieces: current.pieces });


  // ---- page mode (dark / light) --------------------------------------------
  // Separate from the BOARD theme: the board keeps its own square colours in
  // either mode. Defaults to the OS preference on first visit, then whatever
  // the player last chose.
  const MODEKEY = 'wildcardchess.mode.v1';
  function prefersLight() {
    try { return window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches; }
    catch (e) { return false; }
  }
  function getMode() {
    try {
      const v = localStorage.getItem(MODEKEY);
      if (v === 'light' || v === 'dark') return v;
    } catch (e) {}
    return prefersLight() ? 'light' : 'dark';
  }
  function applyMode(mode) {
    const m = mode || getMode();
    document.body.classList.toggle('light', m === 'light');
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', m === 'light' ? '#eef0f4' : '#14161b');
    try { localStorage.setItem(MODEKEY, m); } catch (e) {}
    apply();                       // re-pick the void for the new mode
    return m;
  }

  window.WCTHEME = {
    getMode, applyMode, BOARD_THEMES, load, apply, get };
})();
