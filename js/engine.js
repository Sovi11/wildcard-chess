// Wildcard Chess — engine v3.
// The wildcard operates on the BOARD, not the pieces: add / remove / move a SQUARE.
// - cells: Set of "c,r" — which squares exist. Starts as 8x8, can grow any direction.
// - board: Map "c,r" -> { type, color, hasMoved } — pieces standing on cells.
// Pieces play normal chess over existing cells only; missing cells (holes) block sliders.
// Knights jump holes but must LAND on an existing cell. Win by checkmate
// (wildcard-aware: on a wildcard turn you may escape check by reshaping the board).

const WHITE = 'white';
const BLACK = 'black';
const PIECE = { P: 'pawn', N: 'knight', B: 'bishop', R: 'rook', Q: 'queen', K: 'king' };

const key = (c, r) => c + ',' + r;
const parseKey = (k) => { const [c, r] = k.split(',').map(Number); return { c, r }; };
const opp = (col) => (col === WHITE ? BLACK : WHITE);

const NEIGH8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
// A square attaches to the board only along a shared EDGE — orthogonal
// neighbours, never a corner-only diagonal touch. (King attacks still use all 8.)
const NEIGH4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

class Game {
  constructor() { this.reset(); }

  reset() {
    this.cells = new Set();
    this.board = new Map();
    this.turn = WHITE;
    this.moveCount = { white: 0, black: 0 };
    this.history = [];
    this.winner = null;
    this.status = 'playing';          // playing | check | checkmate | stalemate | repetition | fifty
    this.halfmoveClock = 0;           // plies since a pawn move or capture (50-move rule;
                                      // board moves do NOT reset it, so fortress wars end)
    this.lastAction = null;
    this.epTarget = null;             // square a double-stepped pawn skipped over
    // rule knobs: cadence = every Nth PLY is a board turn (see _eligibleFor);
    // budget = max board actions per player; actions = which board actions
    // exist at all. Add/Remove are parked for now (design call: Move subsumes
    // them); an absent `actions` object means everything is allowed, which the
    // harness relies on.
    this.rules = this.rules || { cadence: 3, budget: Infinity, actions: { ac: false, rc: false, mc: true } };
    this.wildUsed = { white: 0, black: 0 };
    this.repCount = new Map();        // position key -> occurrences (threefold repetition)
    for (let c = 0; c < 8; c++) for (let r = 0; r < 8; r++) this.cells.add(key(c, r));
    const back = [PIECE.R, PIECE.N, PIECE.B, PIECE.Q, PIECE.K, PIECE.B, PIECE.N, PIECE.R];
    for (let c = 0; c < 8; c++) {
      this._put(c, 0, back[c], WHITE); this._put(c, 1, PIECE.P, WHITE);
      this._put(c, 6, PIECE.P, BLACK); this._put(c, 7, back[c], BLACK);
    }
    this._evaluate();
  }

  _put(c, r, type, color, hasMoved = false) { this.board.set(key(c, r), { type, color, hasMoved }); }
  get(c, r) { return this.board.get(key(c, r)); }
  hasCell(c, r) { return this.cells.has(key(c, r)); }
  // v4 cadence: every 3rd PLY of the game is a board turn, staggered so it is
  // never two board turns in a row: W B✦ W B W✦ B W B✦ … — Black's 1st/4th/7th
  // move, White's 3rd/6th/9th. Black's early one offsets White's tempo.
  // Whoever is to move on such a ply may reshape the board instead of moving.
  _eligibleFor(color) {
    const cad = this.rules.cadence;
    const total = this.moveCount.white + this.moveCount.black;
    return total % cad === ((cad - 2) % cad + cad) % cad && this.wildUsed[color] < this.rules.budget;
  }
  wildcardEligible() { return this._eligibleFor(this.turn); }
  canWildcard() { return this.wildcardEligible() && !this.winner; }
  budgetLeft(color) { return Math.max(0, this.rules.budget - this.wildUsed[color]); }

  bounds() {
    let minC = Infinity, maxC = -Infinity, minR = Infinity, maxR = -Infinity;
    for (const k of this.cells) {
      const { c, r } = parseKey(k);
      if (c < minC) minC = c; if (c > maxC) maxC = c;
      if (r < minR) minR = r; if (r > maxR) maxR = r;
    }
    return { minC, maxC, minR, maxR };
  }

  // Empty positions edge-adjacent to the board where a new square may attach.
  addTargets() {
    const out = new Set();
    for (const k of this.cells) {
      const { c, r } = parseKey(k);
      for (const [dc, dr] of NEIGH4) {
        const nk = key(c + dc, r + dr);
        if (!this.cells.has(nk)) out.add(nk);
      }
    }
    return [...out].map(parseKey);
  }

  // Attach targets if `exclude` (a "c,r" key) were removed from the board first.
  _attachTargetsExcluding(exclude) {
    const out = new Set();
    for (const k of this.cells) {
      if (k === exclude) continue;
      const { c, r } = parseKey(k);
      for (const [dc, dr] of NEIGH4) {
        const nk = key(c + dc, r + dr);
        if (nk !== exclude && !this.cells.has(nk)) out.add(nk);
      }
    }
    return out;
  }

  // ---- trial: run mutate on cloned state, check `color`'s king is safe ----
  _trial(color, mutate) {
    const liveB = this.board, liveC = this.cells;
    const cb = new Map(); for (const [k, p] of liveB) cb.set(k, { ...p });
    this.board = cb; this.cells = new Set(liveC);
    mutate();
    const kp = this.findKing(color);
    const safe = !!kp && !this.isAttacked(kp.c, kp.r, opp(color));
    this.board = liveB; this.cells = liveC;
    return safe;
  }

  // ---- movement (over existing cells; holes block sliders) ----------------
  _pseudo(c, r) {
    const p = this.get(c, r); if (!p) return [];
    const out = [];
    const push = (x, y, capture) => out.push({ c: x, r: y, capture: !!capture });
    const slide = (dirs) => {
      for (const [dc, dr] of dirs) {
        let x = c + dc, y = r + dr;
        while (this.hasCell(x, y)) {                 // hole => stop
          const t = this.get(x, y);
          if (!t) push(x, y, false);
          else { if (t.color !== p.color) push(x, y, true); break; }
          x += dc; y += dr;
        }
      }
    };
    const step = (offs) => {
      for (const [dc, dr] of offs) {
        const x = c + dc, y = r + dr;
        if (!this.hasCell(x, y)) continue;
        const t = this.get(x, y);
        if (!t) push(x, y, false); else if (t.color !== p.color) push(x, y, true);
      }
    };
    const DIAG = [[1, 1], [1, -1], [-1, 1], [-1, -1]];
    const ORTHO = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    switch (p.type) {
      case PIECE.P: {
        const dir = p.color === WHITE ? 1 : -1;
        if (this.hasCell(c, r + dir) && !this.get(c, r + dir)) {
          push(c, r + dir, false);
          if (!p.hasMoved && this.hasCell(c, r + 2 * dir) && !this.get(c, r + 2 * dir)) push(c, r + 2 * dir, false);
        }
        for (const dc of [-1, 1]) {
          if (!this.hasCell(c + dc, r + dir)) continue;
          const t = this.get(c + dc, r + dir);
          if (t && t.color !== p.color) push(c + dc, r + dir, true);
        }
        // en passant: capture onto the square an enemy pawn just skipped
        const ep = this.epTarget;
        if (ep && ep.r === r + dir && Math.abs(ep.c - c) === 1 && this.hasCell(ep.c, ep.r) && !this.get(ep.c, ep.r)) {
          const victim = this.get(ep.c, r);
          if (victim && victim.type === PIECE.P && victim.color !== p.color) push(ep.c, ep.r, true);
        }
        break;
      }
      case PIECE.N: step([[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]); break;
      case PIECE.B: slide(DIAG); break;
      case PIECE.R: slide(ORTHO); break;
      case PIECE.Q: slide([...DIAG, ...ORTHO]); break;
      case PIECE.K: {
        step([...DIAG, ...ORTHO]);
        // Castling. Variant rule: the path between king and rook must be COMPLETE —
        // every square in between has to exist and be empty. A hole torn anywhere
        // along that path denies castling on that side, permanently if never refilled.
        const foe = opp(p.color);
        if (!p.hasMoved && !this.isAttacked(c, r, foe)) {
          for (const dc of [1, -1]) {
            let x = c + dc;
            while (this.hasCell(x, r) && !this.get(x, r)) x += dc;   // walk existing empty squares
            if (!this.hasCell(x, r)) continue;                       // hit a hole: path broken
            const rook = this.get(x, r);
            if (!rook || rook.color !== p.color || rook.type !== PIECE.R || rook.hasMoved) continue;
            if (Math.abs(x - c) < 3) continue;                       // no room for a 2-square king move
            if (this.isAttacked(c + dc, r, foe)) continue;           // cannot pass through check
            if (this.isAttacked(c + 2 * dc, r, foe)) continue;       // cannot land in check
            out.push({ c: c + 2 * dc, r, capture: false, castle: dc, rookFrom: x });
          }
        }
        break;
      }
    }
    return out;
  }

  legalMoves(c, r) {
    const p = this.get(c, r);
    if (!p || p.color !== this.turn || this.winner) return [];
    return this._pseudo(c, r).filter(m => this._trial(p.color, () => {
      this.board.delete(key(c, r));
      // en passant: the captured pawn sits beside the destination, not on it
      if (p.type === PIECE.P && m.c !== c && !this.get(m.c, m.r)) this.board.delete(key(m.c, r));
      if (m.castle) {
        const rk = this.get(m.rookFrom, r);
        if (rk) { this.board.delete(key(m.rookFrom, r)); this.board.set(key(c + m.castle, r), { ...rk, hasMoved: true }); }
      }
      this.board.set(key(m.c, m.r), { ...p, hasMoved: true });
    }));
  }

  isAttacked(c, r, byColor) {
    for (const [dc, dr] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) {
      const t = this.get(c + dc, r + dr);
      if (t && t.color === byColor && t.type === PIECE.N) return true;
    }
    for (const [dc, dr] of NEIGH8) {
      const t = this.get(c + dc, r + dr);
      if (t && t.color === byColor && t.type === PIECE.K) return true;
    }
    const pdir = byColor === WHITE ? 1 : -1;
    for (const dc of [-1, 1]) {
      const t = this.get(c + dc, r - pdir);
      if (t && t.color === byColor && t.type === PIECE.P) return true;
    }
    const ray = (dirs, types) => {
      for (const [dc, dr] of dirs) {
        let x = c + dc, y = r + dr;
        while (this.hasCell(x, y)) {                 // holes block slider attacks too
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

  findKing(color) { for (const [k, p] of this.board) if (p.type === PIECE.K && p.color === color) return parseKey(k); return null; }
  inCheck(color) { const kp = this.findKing(color); return kp ? this.isAttacked(kp.c, kp.r, opp(color)) : false; }

  // A pawn is at the edge of the world when NO cell exists anywhere ahead of it
  // in its own file. A lone hole directly ahead is not the edge — the board may
  // continue past it — otherwise any interior hole would mint free queens.
  _atWorldEdge(c, r, color) {
    const dir = color === WHITE ? 1 : -1;
    if (this.hasCell(c, r + dir)) return false;          // fast path: floor ahead
    const b = this.bounds();
    for (let y = r + 2 * dir; y >= b.minR && y <= b.maxR; y += dir) {
      if (this.hasCell(c, y)) return false;              // board resumes past the gap
    }
    return true;
  }

  makeMove(fc, fr, tc, tr) {
    const p = this.get(fc, fr);
    if (!p || p.color !== this.turn || this.winner) return false;
    const mv = this.legalMoves(fc, fr).find(m => m.c === tc && m.r === tr);
    if (!mv) return false;
    const target = this.get(tc, tr);
    // en passant: diagonal pawn move onto an empty square takes the passed pawn
    let epCaptured = null;
    if (p.type === PIECE.P && tc !== fc && !target) {
      epCaptured = this.get(tc, fr) || null;
      this.board.delete(key(tc, fr));
    }
    if (mv.castle) {
      const rk = this.get(mv.rookFrom, fr);
      if (rk) { this.board.delete(key(mv.rookFrom, fr)); rk.hasMoved = true; this.board.set(key(fc + mv.castle, fr), rk); }
    }
    this.board.delete(key(fc, fr));
    p.hasMoved = true;
    this.board.set(key(tc, tr), p);
    const wasPawn = p.type === PIECE.P;
    this.halfmoveClock = (wasPawn || target || epCaptured) ? 0 : this.halfmoveClock + 1;
    // a double step leaves the skipped square capturable for exactly one reply
    this.epTarget = (wasPawn && Math.abs(tr - fr) === 2)
      ? { c: fc, r: (fr + tr) / 2 } : null;
    // Promotion: the pawn reached the edge of the world in its file.
    const promoted = wasPawn && this._atWorldEdge(tc, tr, p.color);
    if (promoted) p.type = PIECE.Q;
    this.lastAction = { kind: 'move', from: { c: fc, r: fr }, to: { c: tc, r: tr } };
    // HCN (Hollow Chess Notation): long algebraic — piece letter (pawns bare),
    // from, '-' or 'x', to; '=Q' promotion; ' ep' en passant; O-O castling.
    // Check '+' and mate '#' are appended in _endTurn once the reply is known.
    this._record(mv.castle
      ? (mv.castle > 0 ? 'O-O' : 'O-O-O')
      : (wasPawn ? '' : L(p.type)) + sq(fc, fr) + ((target || epCaptured) ? 'x' : '-') + sq(tc, tr)
        + (promoted ? '=Q' : '') + (epCaptured ? ' ep' : ''));
    this._endTurn();
    return true;
  }

  // ---- wildcards: reshape the board --------------------------------------
  // Add a square at an empty position edge-adjacent to the board.
  _actionAllowed(kind) {
    const a = this.rules.actions;
    return !a || a[kind] !== false;
  }

  wildcardAddCell(c, r) {
    if (!this._actionAllowed('ac')) return false;
    if (!this.canWildcard() || this.hasCell(c, r)) return false;
    const touches = NEIGH4.some(([dc, dr]) => this.hasCell(c + dc, r + dr));
    if (!touches) return false;
    if (!this._trial(this.turn, () => this.cells.add(key(c, r)))) return false;
    this.cells.add(key(c, r));
    this.wildUsed[this.turn]++;
    this.halfmoveClock++;
    this.epTarget = null;
    this.lastAction = { kind: 'addcell', to: { c, r } };
    this._record(`+${sq(c, r)}`);                       // HCN: add square
    this._endTurn();
    return true;
  }

  // Remove an EMPTY square (leaves a hole).
  wildcardRemoveCell(c, r) {
    if (!this._actionAllowed('rc')) return false;
    if (!this.canWildcard() || !this.hasCell(c, r) || this.get(c, r)) return false;
    if (this.cells.size <= 1) return false;
    if (!this._trial(this.turn, () => this.cells.delete(key(c, r)))) return false;
    this.cells.delete(key(c, r));
    this.wildUsed[this.turn]++;
    this.halfmoveClock++;
    this.epTarget = null;
    this.lastAction = { kind: 'removecell', to: { c, r } };
    this._record(`×${sq(c, r)}`);                       // HCN: remove square
    this._endTurn();
    return true;
  }

  // Move an EMPTY square: detach it and re-attach edge-adjacent to the remaining board.
  wildcardMoveCell(fc, fr, tc, tr) {
    if (!this._actionAllowed('mc')) return false;
    if (!this.canWildcard()) return false;
    if (!this.hasCell(fc, fr) || this.get(fc, fr)) return false;      // source must exist & be empty
    if (this.hasCell(tc, tr)) return false;                            // target must be new ground
    if (fc === tc && fr === tr) return false;
    if (this.cells.size <= 1) return false;
    if (!this._attachTargetsExcluding(key(fc, fr)).has(key(tc, tr))) return false;
    if (!this._trial(this.turn, () => { this.cells.delete(key(fc, fr)); this.cells.add(key(tc, tr)); })) return false;
    this.cells.delete(key(fc, fr));
    this.cells.add(key(tc, tr));
    this.wildUsed[this.turn]++;
    this.halfmoveClock++;
    this.epTarget = null;
    this.lastAction = { kind: 'movecell', from: { c: fc, r: fr }, to: { c: tc, r: tr } };
    this._record(`${sq(fc, fr)}>${sq(tc, tr)}`);        // HCN: square-move — '>' is terrain-only
    this._endTurn();
    return true;
  }

  _endTurn() {
    this.moveCount[this.turn]++;
    if (!this.winner) {
      this.turn = opp(this.turn);
      this._evaluate();
      // HCN check/mate suffix — knowable only after the position is evaluated
      const last = this.history[this.history.length - 1];
      if (last) {
        if (this.status === 'checkmate') last.text += '#';
        else if (this.status === 'check') last.text += '+';
      }
      if (this.status === 'playing' || this.status === 'check') {
        // 50-move rule: 100 plies with no pawn move and no capture is a draw.
        // Board moves don't reset the clock — an island fortress can be built
        // and its bridges burned forever, but the game still ends.
        if (this.halfmoveClock >= 100) { this.status = 'fifty'; this.winner = null; return; }
        const k = this._posKey();
        const n = (this.repCount.get(k) || 0) + 1;
        this.repCount.set(k, n);
        if (n >= 3) { this.status = 'repetition'; this.winner = null; }
      }
    }
  }

  // Position identity for repetition: terrain + pieces + turn + wildcard phase.
  _posKey() {
    const cad = this.rules.cadence;
    const cells = [...this.cells].sort().join(';');
    const pieces = [...this.board.entries()].map(([k, p]) => k + p.type[0] + p.color[0]).sort().join(';');
    const phase = this.turn + '|' + ((this.moveCount.white + this.moveCount.black) % cad)
      + '|' + (this.budgetLeft(WHITE) > 0 ? 1 : 0) + (this.budgetLeft(BLACK) > 0 ? 1 : 0);
    const ep = this.epTarget ? `${this.epTarget.c},${this.epTarget.r}` : '-';
    return phase + '|' + ep + '#' + cells + '#' + pieces;
  }
  _record(text) { this.history.push({ color: this.turn, text }); }

  _evaluate() {
    const color = this.turn;
    const eligible = this._eligibleFor(color);
    const inChk = this.inCheck(color);
    if (this._hasAnyLegalAction(color, eligible)) { this.status = inChk ? 'check' : 'playing'; this.winner = null; return; }
    if (inChk) { this.status = 'checkmate'; this.winner = opp(color); }
    else { this.status = 'stalemate'; this.winner = null; }
  }

  _hasAnyLegalAction(color, eligible) {
    for (const [k, p] of this.board) {
      if (p.color !== color) continue;
      const { c, r } = parseKey(k);
      if (this.legalMoves(c, r).length) return true;
    }
    if (!eligible) return false;
    if (this._actionAllowed('ac')) {
      for (const t of this.addTargets()) {
        if (this._trial(color, () => this.cells.add(key(t.c, t.r)))) return true;
      }
    }
    if (this._actionAllowed('rc')) {
      for (const k of this.cells) {
        if (this.board.has(k)) continue;
        if (this.cells.size <= 1) break;
        if (this._trial(color, () => this.cells.delete(k))) return true;
      }
    }
    if (this._actionAllowed('mc')) {
      for (const k of this.cells) {
        if (this.board.has(k)) continue;
        for (const tk of this._attachTargetsExcluding(k)) {
          const t = parseKey(tk);
          if (this._trial(color, () => { this.cells.delete(k); this.cells.add(key(t.c, t.r)); })) return true;
        }
      }
    }
    return false;
  }
}

// Files a–z; a board grown past that uses the numeric index in parens, so
// "(-1)5" reads unambiguously as file -1, rank 5 (see NOTATION.md).
function fileLabel(c) { return c >= 0 && c <= 25 ? String.fromCharCode(97 + c) : '(' + c + ')'; }
function rankLabel(r) { return String(r + 1); }
function sq(c, r) { return fileLabel(c) + rankLabel(r); }
const L = (type) => ({ pawn: 'P', knight: 'N', bishop: 'B', rook: 'R', queen: 'Q', king: 'K' }[type]);

if (typeof module !== 'undefined') module.exports = { Game, WHITE, BLACK, PIECE, sq, fileLabel, rankLabel };
