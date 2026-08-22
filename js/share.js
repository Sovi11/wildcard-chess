// Wildcard Chess — shareable game state.
// Packs the whole position into a short URL-safe string so two players can pass
// a link back and forth. No server, no accounts: the link IS the save file.
// Exposed as window.WCSHARE.

(function () {
  'use strict';

  const VERSION = 2;   // v2 adds the en-passant square
  const TYPES = ['pawn', 'knight', 'bishop', 'rook', 'queen', 'king'];

  function b64url(bytes) {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b & 255);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function unb64url(str) {
    const t = str.replace(/-/g, '+').replace(/_/g, '/');
    const s = atob(t + '==='.slice((t.length + 3) % 4));
    const out = [];
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    return out;
  }

  // Layout: version, minC+128, minR+128, w, h, cellBitmap…, pieceCount(16),
  // [cellIndex(16), typeColorMoved(8)]…, turn, moveW(16), moveB(16), usedW(16), usedB(16)
  function encode(game) {
    const b = game.bounds();
    const w = b.maxC - b.minC + 1, h = b.maxR - b.minR + 1;
    if (w > 250 || h > 250) throw new Error('board too large to share');

    const bytes = [VERSION, b.minC + 128, b.minR + 128, w, h];
    const nbits = w * h;
    const bm = new Array(Math.ceil(nbits / 8)).fill(0);
    const pieces = [];
    for (let i = 0; i < nbits; i++) {
      const c = b.minC + (i % w), r = b.minR + Math.floor(i / w);
      if (!game.hasCell(c, r)) continue;
      bm[i >> 3] |= (1 << (i & 7));
      const p = game.get(c, r);
      if (p) pieces.push([i, TYPES.indexOf(p.type) * 2 + (p.color === 'white' ? 0 : 1), p.hasMoved ? 1 : 0]);
    }
    bytes.push(...bm);
    const push16 = (v) => bytes.push((v >> 8) & 255, v & 255);
    push16(pieces.length);
    for (const [i, code, moved] of pieces) { push16(i); bytes.push(code * 2 + moved); }
    bytes.push(game.turn === 'white' ? 0 : 1);
    push16(game.moveCount.white); push16(game.moveCount.black);
    push16(game.wildUsed ? game.wildUsed.white : 0);
    push16(game.wildUsed ? game.wildUsed.black : 0);
    const ep = game.epTarget;
    bytes.push(ep ? 1 : 0, ep ? ep.c + 128 : 0, ep ? ep.r + 128 : 0);
    return b64url(bytes);
  }

  // Rebuild `game` in place from an encoded string. Throws on malformed input.
  function decode(str, game) {
    const d = unb64url(str);
    let i = 0;
    const u8 = () => { if (i >= d.length) throw new Error('truncated'); return d[i++]; };
    const u16 = () => { const hi = u8(), lo = u8(); return (hi << 8) | lo; };

    if (u8() !== VERSION) throw new Error('unsupported link version');
    const minC = u8() - 128, minR = u8() - 128, w = u8(), h = u8();
    if (w < 1 || h < 1) throw new Error('bad bounds');

    const nbits = w * h;
    const bm = [];
    for (let k = 0; k < Math.ceil(nbits / 8); k++) bm.push(u8());

    const cells = new Set();
    for (let k = 0; k < nbits; k++) {
      if (!(bm[k >> 3] & (1 << (k & 7)))) continue;
      cells.add((minC + (k % w)) + ',' + (minR + Math.floor(k / w)));
    }
    if (!cells.size) throw new Error('no squares');

    const board = new Map();
    const n = u16();
    for (let k = 0; k < n; k++) {
      const idx = u16(), tcm = u8();
      const moved = tcm & 1, code = tcm >> 1;
      const type = TYPES[code >> 1], color = (code & 1) ? 'black' : 'white';
      if (!type) throw new Error('bad piece');
      const c = minC + (idx % w), r = minR + Math.floor(idx / w);
      board.set(c + ',' + r, { type, color, hasMoved: !!moved });
    }
    const turn = u8() === 0 ? 'white' : 'black';
    const mcW = u16(), mcB = u16(), uW = u16(), uB = u16();
    const epFlag = u8(), epC = u8() - 128, epR = u8() - 128;

    // commit
    game.cells = cells;
    game.board = board;
    game.turn = turn;
    game.moveCount = { white: mcW, black: mcB };
    game.wildUsed = { white: uW, black: uB };
    game.epTarget = epFlag ? { c: epC, r: epR } : null;
    game.history = [];
    game.repCount = new Map();
    game.winner = null;
    game.status = 'playing';
    game.lastAction = null;
    game._evaluate();
    return true;
  }

  function linkFor(game) {
    const base = location.origin + location.pathname;
    return base + '#g=' + encode(game);
  }

  // Read a game out of the current URL hash, if present.
  function fromLocation(game) {
    const m = /[#&]g=([A-Za-z0-9\-_]+)/.exec(location.hash || '');
    if (!m) return false;
    decode(m[1], game);
    return true;
  }

  window.WCSHARE = { encode, decode, linkFor, fromLocation };
})();
