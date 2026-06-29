// Wildcard Chess — game engine (no DOM, pure logic)
// Coordinates are integers (col, row). Row increases "up" the board.
// The board is a Map: "col,row" -> piece. It can grow beyond the original 8x8.

const WHITE = 'white';
const BLACK = 'black';

const PIECE = { P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };

const key = (c, r) => c + ',' + r;
const parseKey = (k) => { const [c, r] = k.split(',').map(Number); return { c, r }; };

class Game {
  constructor() { this.reset(); }

  reset() {
    this.board = new Map();          // key -> { type, color, id, hasMoved }
    this.turn = WHITE;
    this.moveCount = { white: 0, black: 0 }; // completed turns per color
    this.history = [];               // array of human-readable strings
    this.winner = null;              // null | WHITE | BLACK
    this.lastAction = null;          // {from?, to?, kind} for highlighting
    this._id = 1;
    this._setupStandard();
  }

  _put(c, r, type, color, hasMoved = false) {
    this.board.set(key(c, r), { type, color, id: this._id++, hasMoved });
  }

  _setupStandard() {
    const back = [PIECE.R, PIECE.N, PIECE.B, PIECE.Q, PIECE.K, PIECE.B, PIECE.N, PIECE.R];
    for (let c = 0; c < 8; c++) {
      this._put(c, 0, back[c], WHITE);
      this._put(c, 1, PIECE.P, WHITE);
      this._put(c, 6, PIECE.P, BLACK);
      this._put(c, 7, back[c], BLACK);
    }
  }

  get(c, r) { return this.board.get(key(c, r)); }

  // Bounding box of all pieces (defaults to the classic 8x8 when empty).
  bounds() {
    if (this.board.size === 0) return { minC: 0, maxC: 7, minR: 0, maxR: 7 };
    let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
    for (const k of this.board.keys()) {
      const { c, r } = parseKey(k);
      if (c < minC) minC = c; if (c > maxC) maxC = c;
      if (r < minR) minR = r; if (r > maxR) maxR = r;
    }
    return { minC, maxC, minR, maxR };
  }

  // Active region = bounds padded by one ring of empty squares pieces may expand into.
  activeRegion(pad = 1) {
    const b = this.bounds();
    return { minC: b.minC - pad, maxC: b.maxC + pad, minR: b.minR - pad, maxR: b.maxR + pad };
  }

  inActive(c, r) {
    const a = this.activeRegion();
    return c >= a.minC && c <= a.maxC && r >= a.minR && r <= a.maxR;
  }

  // True when the side to move is on a wildcard-eligible turn (their 2nd, 4th, ...).
  wildcardEligible() { return this.moveCount[this.turn] % 2 === 1; }

  // ---- Move generation (regicide rules: moving "into check" is allowed) ----
  legalMoves(c, r) {
    const p = this.get(c, r);
    if (!p || p.color !== this.turn || this.winner) return [];
    // Normal moves stay inside the current occupied board. The board only GROWS
    // through a deliberate wildcard (Add / Shift), never via an ordinary move.
    const a = this.bounds();
    const inB = (x, y) => x >= a.minC && x <= a.maxC && y >= a.minR && y <= a.maxR;
    const moves = [];
    const push = (x, y, capture) => moves.push({ c: x, r: y, capture: !!capture });

    // Returns true if the slide should continue past (x,y).
    const slideStep = (x, y) => {
      if (!inB(x, y)) return false;
      const t = this.get(x, y);
      if (!t) { push(x, y, false); return true; }
      if (t.color !== p.color) push(x, y, true);
      return false;
    };

    const slide = (dirs) => {
      for (const [dc, dr] of dirs) {
        let x = c + dc, y = r + dr;
        while (slideStep(x, y)) { x += dc; y += dr; }
      }
    };

    const step = (offsets) => {
      for (const [dc, dr] of offsets) {
        const x = c + dc, y = r + dr;
        if (!inB(x, y)) continue;
        const t = this.get(x, y);
        if (!t) push(x, y, false);
        else if (t.color !== p.color) push(x, y, true);
      }
    };

    const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];

    switch (p.type) {
      case PIECE.P: {
        const dir = p.color === WHITE ? 1 : -1;
        if (inB(c, r + dir) && !this.get(c, r + dir)) {
          push(c, r + dir, false);
          if (!p.hasMoved && !this.get(c, r + 2 * dir) && inB(c, r + 2 * dir)) push(c, r + 2 * dir, false);
        }
        for (const dc of [-1, 1]) {
          const t = this.get(c + dc, r + dir);
          if (t && t.color !== p.color) push(c + dc, r + dir, true);
        }
        break;
      }
      case PIECE.N:
        step([[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]);
        break;
      case PIECE.B: slide(DIAG); break;
      case PIECE.R: slide(ORTHO); break;
      case PIECE.Q: slide([...DIAG, ...ORTHO]); break;
      case PIECE.K: step([...DIAG, ...ORTHO]); break;
    }
    return moves;
  }

  // ---- Normal move ----
  makeMove(fc, fr, tc, tr) {
    const p = this.get(fc, fr);
    if (!p || p.color !== this.turn || this.winner) return false;
    const legal = this.legalMoves(fc, fr).some(m => m.c === tc && m.r === tr);
    if (!legal) return false;

    const target = this.get(tc, tr);
    this.board.delete(key(fc, fr));
    p.hasMoved = true;

    // Promotion at the traditional far rank (generalizes for an expanding board).
    if (p.type === PIECE.P && ((p.color === WHITE && tr >= 7) || (p.color === BLACK && tr <= 0))) {
      p.type = PIECE.Q;
    }
    this.board.set(key(tc, tr), p);

    let capText = '';
    if (target) {
      capText = ' x' + glyphLetter(target.type);
      if (target.type === PIECE.K) this.winner = p.color;
    }
    this.lastAction = { kind: 'move', from: { c: fc, r: fr }, to: { c: tc, r: tr } };
    this._record(`${glyphLetter(p.type)} ${sq(fc, fr)}→${sq(tc, tr)}${capText}`);
    this._endTurn();
    return true;
  }

  // ---- Wildcard actions (only on a wildcard-eligible turn) ----
  canWildcard() { return this.wildcardEligible() && !this.winner; }

  wildcardAdd(c, r) {
    if (!this.canWildcard() || this.get(c, r) || !this.inActive(c, r)) return false;
    this._put(c, r, PIECE.P, this.turn, true);
    this.lastAction = { kind: 'add', to: { c, r } };
    this._record(`✚ add ${this.turn[0].toUpperCase()}-pawn @ ${sq(c, r)}`);
    this._endTurn();
    return true;
  }

  wildcardRemove(c, r) {
    const t = this.get(c, r);
    if (!this.canWildcard() || !t || t.type === PIECE.K) return false;
    this.board.delete(key(c, r));
    this.lastAction = { kind: 'remove', to: { c, r } };
    this._record(`✖ remove ${t.color[0].toUpperCase()}-${glyphLetter(t.type)} @ ${sq(c, r)}`);
    this._endTurn();
    return true;
  }

  wildcardMove(fc, fr, tc, tr) {
    const p = this.get(fc, fr);
    if (!this.canWildcard() || !p || p.color !== this.turn) return false;
    if (this.get(tc, tr) || !this.inActive(tc, tr)) return false; // empty target only
    this.board.delete(key(fc, fr));
    p.hasMoved = true;
    this.board.set(key(tc, tr), p);
    this.lastAction = { kind: 'wmove', from: { c: fc, r: fr }, to: { c: tc, r: tr } };
    this._record(`➤ shift ${glyphLetter(p.type)} ${sq(fc, fr)}→${sq(tc, tr)}`);
    this._endTurn();
    return true;
  }

  _endTurn() {
    this.moveCount[this.turn]++;
    if (!this.winner) this.turn = this.turn === WHITE ? BLACK : WHITE;
  }

  _record(text) {
    this.history.push({ color: this.turn, text });
  }

  // Is (c,r) attacked by `byColor`? Used only for the "king in danger" warning.
  isAttacked(c, r, byColor) {
    // Knights
    for (const [dc, dr] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) {
      const t = this.get(c + dc, r + dr);
      if (t && t.color === byColor && t.type === PIECE.N) return true;
    }
    // King adjacency
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
      const t = this.get(c + dc, r + dr);
      if (t && t.color === byColor && t.type === PIECE.K) return true;
    }
    // Pawns (attack toward this square): a pawn on (c±1, r-dir) hits (c,r)
    const pdir = byColor === WHITE ? 1 : -1;
    for (const dc of [-1, 1]) {
      const t = this.get(c + dc, r - pdir);
      if (t && t.color === byColor && t.type === PIECE.P) return true;
    }
    // Sliders
    const ray = (dirs, types) => {
      const a = this.activeRegion();
      for (const [dc, dr] of dirs) {
        let x = c + dc, y = r + dr;
        while (x >= a.minC && x <= a.maxC && y >= a.minR && y <= a.maxR) {
          const t = this.get(x, y);
          if (t) { if (t.color === byColor && types.includes(t.type)) return true; break; }
          x += dc; y += dr;
        }
      }
      return false;
    };
    if (ray([[1, 1], [1, -1], [-1, 1], [-1, -1]], [PIECE.B, PIECE.Q])) return true;
    if (ray([[1, 0], [-1, 0], [0, 1], [0, -1]], [PIECE.R, PIECE.Q])) return true;
    return false;
  }

  findKing(color) {
    for (const [k, p] of this.board) if (p.type === PIECE.K && p.color === color) return parseKey(k);
    return null;
  }

  // King of side-to-move (or either) currently attacked?
  kingsInDanger() {
    const out = [];
    for (const color of [WHITE, BLACK]) {
      const kpos = this.findKing(color);
      if (kpos && this.isAttacked(kpos.c, kpos.r, color === WHITE ? BLACK : WHITE)) {
        out.push({ color, ...kpos });
      }
    }
    return out;
  }
}

// File letters: 0->a ... 25->z, otherwise the raw integer.
function fileLabel(c) {
  if (c >= 0 && c <= 25) return String.fromCharCode(97 + c);
  return '#' + c;
}
function rankLabel(r) { return String(r + 1); }
function sq(c, r) { return fileLabel(c) + rankLabel(r); }
function glyphLetter(type) {
  return { pawn: 'P', knight: 'N', bishop: 'B', rook: 'R', queen: 'Q', king: 'K' }[type];
}

if (typeof module !== 'undefined') module.exports = { Game, WHITE, BLACK, PIECE, fileLabel, rankLabel, sq };
