// Wildcard Chess — rendering + interaction (browser)
const GLYPH = {
  white: { pawn: '♙', knight: '♘', bishop: '♗', rook: '♖', queen: '♕', king: '♔' },
  black: { pawn: '♟', knight: '♞', bishop: '♝', rook: '♜', queen: '♛', king: '♚' },
};

const game = new Game();

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');

const ui = {
  turn: document.getElementById('turn'),
  badge: document.getElementById('wildBadge'),
  hint: document.getElementById('hint'),
  log: document.getElementById('log'),
  banner: document.getElementById('banner'),
};

// Interaction state
let mode = 'normal';            // normal | add | remove | wmove
let selected = null;            // {c,r}
let legal = [];                 // legal destinations for `selected` in normal/wmove

// ---- View transform -------------------------------------------------------
function view() {
  // One extra ring of breathing room around the active region.
  const a = game.activeRegion(2);
  const cols = a.maxC - a.minC + 1;
  const rows = a.maxR - a.minR + 1;
  const cell = Math.floor(Math.min(canvas.width / cols, canvas.height / rows));
  const ox = Math.floor((canvas.width - cell * cols) / 2);
  const oy = Math.floor((canvas.height - cell * rows) / 2);
  return { a, cols, rows, cell, ox, oy };
}
function px(v, c) { return v.ox + (c - v.a.minC) * v.cell; }
function py(v, r) { return v.oy + (v.a.maxR - r) * v.cell; }
function pickSquare(mx, my) {
  const v = view();
  const c = v.a.minC + Math.floor((mx - v.ox) / v.cell);
  const r = v.a.maxR - Math.floor((my - v.oy) / v.cell);
  if (c < v.a.minC || c > v.a.maxC || r < v.a.minR || r > v.a.maxR) return null;
  return { c, r };
}

// ---- Drawing --------------------------------------------------------------
const C = {
  light: '#e9e2cf', dark: '#9aa67a', grid: '#3a3a32',
  sel: 'rgba(255,210,80,0.55)', dot: 'rgba(40,40,40,0.35)',
  cap: 'rgba(210,60,50,0.55)', last: 'rgba(90,150,230,0.35)',
  danger: 'rgba(225,60,50,0.85)', label: '#6b6b5e',
  addhi: 'rgba(80,200,120,0.45)', remhi: 'rgba(210,60,50,0.40)',
};

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const v = view();

  // Squares + coordinate labels
  ctx.font = `${Math.floor(v.cell * 0.22)}px system-ui, sans-serif`;
  for (let c = v.a.minC; c <= v.a.maxC; c++) {
    for (let r = v.a.minR; r <= v.a.maxR; r++) {
      const x = px(v, c), y = py(v, r);
      ctx.fillStyle = (c + r) % 2 === 0 ? C.dark : C.light;
      ctx.fillRect(x, y, v.cell, v.cell);
    }
  }

  // Highlight: last action
  if (game.lastAction) {
    for (const s of [game.lastAction.from, game.lastAction.to]) {
      if (!s) continue;
      ctx.fillStyle = C.last;
      ctx.fillRect(px(v, s.c), py(v, s.r), v.cell, v.cell);
    }
  }

  // Mode tint: addable empties / removable pieces
  if (mode === 'add') {
    for (let c = v.a.minC + 1; c <= v.a.maxC - 1; c++)
      for (let r = v.a.minR + 1; r <= v.a.maxR - 1; r++)
        if (!game.get(c, r) && game.inActive(c, r)) tile(v, c, r, C.addhi, true);
  }
  if (mode === 'remove') {
    for (const [k, p] of game.board) {
      if (p.type === 'king') continue;
      const { c, r } = parseKeyJS(k);
      tile(v, c, r, C.remhi, true);
    }
  }

  // Selected + legal dots
  if (selected) {
    ctx.fillStyle = C.sel;
    ctx.fillRect(px(v, selected.c), py(v, selected.r), v.cell, v.cell);
    for (const m of legal) {
      const x = px(v, m.c) + v.cell / 2, y = py(v, m.r) + v.cell / 2;
      ctx.beginPath();
      if (m.capture) { ctx.strokeStyle = C.cap; ctx.lineWidth = Math.max(2, v.cell * 0.06);
        ctx.arc(x, y, v.cell * 0.40, 0, Math.PI * 2); ctx.stroke(); }
      else { ctx.fillStyle = C.dot; ctx.arc(x, y, v.cell * 0.16, 0, Math.PI * 2); ctx.fill(); }
    }
  }

  // King-in-danger ring
  for (const k of game.kingsInDanger()) {
    ctx.strokeStyle = C.danger; ctx.lineWidth = Math.max(2, v.cell * 0.07);
    ctx.strokeRect(px(v, k.c) + 2, py(v, k.r) + 2, v.cell - 4, v.cell - 4);
  }

  // Pieces
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.font = `${Math.floor(v.cell * 0.72)}px "Segoe UI Symbol", system-ui, sans-serif`;
  for (const [k, p] of game.board) {
    const { c, r } = parseKeyJS(k);
    const x = px(v, c) + v.cell / 2, y = py(v, r) + v.cell / 2 + v.cell * 0.02;
    ctx.lineWidth = Math.max(1, v.cell * 0.03);
    ctx.strokeStyle = p.color === 'white' ? '#2a2a2a' : '#000';
    ctx.fillStyle = p.color === 'white' ? '#fafafa' : '#1c1c1c';
    ctx.strokeText(GLYPH[p.color][p.type], x, y);
    ctx.fillText(GLYPH[p.color][p.type], x, y);
  }

  // Edge coordinate labels (files along bottom, ranks along left)
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillStyle = C.label;
  ctx.font = `${Math.floor(v.cell * 0.20)}px system-ui, sans-serif`;
  for (let c = v.a.minC; c <= v.a.maxC; c++)
    ctx.fillText(fileLabel(c), px(v, c) + v.cell / 2, py(v, v.a.minR) + v.cell - v.cell * 0.12);
  ctx.textAlign = 'left';
  for (let r = v.a.minR; r <= v.a.maxR; r++)
    ctx.fillText(rankLabel(r), px(v, v.a.minC) + v.cell * 0.06, py(v, r) + v.cell * 0.14);
}

function tile(v, c, r, color, ring) {
  ctx.fillStyle = color;
  ctx.fillRect(px(v, c), py(v, r), v.cell, v.cell);
}
function parseKeyJS(k) { const [c, r] = k.split(',').map(Number); return { c, r }; }

// ---- Interaction ----------------------------------------------------------
canvas.addEventListener('click', (e) => {
  if (game.winner) return;
  const rect = canvas.getBoundingClientRect();
  const mx = (e.clientX - rect.left) * (canvas.width / rect.width);
  const my = (e.clientY - rect.top) * (canvas.height / rect.height);
  const sqr = pickSquare(mx, my);
  if (!sqr) return;
  const { c, r } = sqr;

  if (mode === 'add') {
    if (game.wildcardAdd(c, r)) { afterAction(); } return;
  }
  if (mode === 'remove') {
    if (game.wildcardRemove(c, r)) { afterAction(); } return;
  }
  if (mode === 'wmove') {
    const p = game.get(c, r);
    if (!selected) {
      if (p && p.color === game.turn) { selected = { c, r }; legal = []; draw(); }
      return;
    }
    if (game.wildcardMove(selected.c, selected.r, c, r)) { afterAction(); }
    else if (p && p.color === game.turn) { selected = { c, r }; draw(); } // reselect
    return;
  }

  // normal mode
  const p = game.get(c, r);
  if (selected) {
    if (game.makeMove(selected.c, selected.r, c, r)) { afterAction(); return; }
    if (p && p.color === game.turn) { selected = { c, r }; legal = game.legalMoves(c, r); draw(); return; }
    selected = null; legal = []; draw(); return;
  }
  if (p && p.color === game.turn) { selected = { c, r }; legal = game.legalMoves(c, r); draw(); }
});

function afterAction() {
  selected = null; legal = []; setMode('normal'); syncUI(); draw();
}

// ---- Mode buttons ---------------------------------------------------------
function setMode(m) {
  mode = m; selected = null; legal = [];
  for (const b of document.querySelectorAll('.wild-btn')) b.classList.toggle('active', b.dataset.mode === m);
  const hints = {
    normal: game.canWildcard() ? 'Wildcard turn — make a normal move, or pick an action above.' : 'Make your move.',
    add: 'ADD: click an empty square (green) to drop a pawn. Edge squares grow the board.',
    remove: 'REMOVE: click any highlighted piece to delete it (kings are safe).',
    wmove: 'SHIFT: click one of your pieces, then an empty square to relocate it.',
  };
  ui.hint.textContent = hints[m];
}

document.querySelectorAll('.wild-btn').forEach(b => {
  b.addEventListener('click', () => {
    if (b.dataset.mode !== 'normal' && !game.canWildcard()) return;
    setMode(mode === b.dataset.mode ? 'normal' : b.dataset.mode);
    draw();
  });
});

document.getElementById('newGame').addEventListener('click', () => {
  game.reset(); selected = null; legal = []; setMode('normal'); ui.banner.classList.remove('show');
  syncUI(); draw();
});

// ---- UI sync --------------------------------------------------------------
function syncUI() {
  const side = game.turn === 'white' ? 'White' : 'Black';
  ui.turn.textContent = `${side} to move`;
  ui.turn.className = 'turn ' + game.turn;
  const eligible = game.canWildcard();
  ui.badge.style.display = eligible ? 'inline-block' : 'none';

  for (const b of document.querySelectorAll('.wild-btn')) {
    if (b.dataset.mode === 'normal') continue;
    b.disabled = !eligible;
  }
  setMode('normal');

  // Move log
  ui.log.innerHTML = '';
  game.history.forEach((h, i) => {
    const li = document.createElement('div');
    li.className = 'logline ' + h.color;
    li.textContent = `${i + 1}. ${h.text}`;
    ui.log.appendChild(li);
  });
  ui.log.scrollTop = ui.log.scrollHeight;

  if (game.winner) {
    ui.banner.textContent = `${game.winner === 'white' ? 'White' : 'Black'} wins — king captured!`;
    ui.banner.classList.add('show');
  }
}

syncUI();
draw();
