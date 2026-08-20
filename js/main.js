// Wildcard Chess — SVG rendering + interaction (board-reshaping wildcards).
const game = new Game();
const boardEl = document.getElementById('board');
const ui = {
  turn: document.getElementById('turn'),
  badge: document.getElementById('wildBadge'),
  state: document.getElementById('state'),
  hint: document.getElementById('hint'),
  log: document.getElementById('log'),
  banner: document.getElementById('banner'),
  bannerText: document.getElementById('bannerText'),
};

let mode = 'normal';        // normal | addcell | removecell | movecell
let selected = null;        // piece square (normal) or source cell (movecell)
let legal = [];

const SYM = { pawn: 'pc-pawn', knight: 'pc-knight', bishop: 'pc-bishop', rook: 'pc-rook', queen: 'pc-queen', king: 'pc-king' };
const mod2 = (n) => ((n % 2) + 2) % 2;

// ---- view: fit current bounds + 1 ring of expandable space ---------------
function view() {
  const b = game.bounds();
  const minC = b.minC - 1, maxC = b.maxC + 1, minR = b.minR - 1, maxR = b.maxR + 1;
  return { minC, maxC, minR, maxR, cols: maxC - minC + 1, rows: maxR - minR + 1 };
}

function render() {
  const v = view();
  boardEl.setAttribute('viewBox', `0 0 ${v.cols} ${v.rows}`);
  const X = (c) => c - v.minC;
  const Y = (r) => v.maxR - r;
  let svg = pieceDefs();

  // existing cells
  for (const k of game.cells) {
    const { c, r } = parseKeyJS(k);
    const light = mod2(c + r) === 1;
    svg += `<rect x="${X(c)}" y="${Y(r)}" width="1" height="1" class="sq ${light ? 'lt' : 'dk'}"/>`;
  }

  // last action tint
  if (game.lastAction) for (const s of [game.lastAction.from, game.lastAction.to]) {
    if (s && game.hasCell(s.c, s.r)) svg += `<rect x="${X(s.c)}" y="${Y(s.r)}" width="1" height="1" class="last"/>`;
  }

  // mode guides
  if (mode === 'addcell' || (mode === 'movecell' && selected)) {
    const targets = mode === 'addcell'
      ? game.addTargets()
      : [...game._attachTargetsExcluding(keyJS(selected.c, selected.r))].map(parseKeyJS);
    for (const t of targets)
      svg += `<rect x="${X(t.c) + 0.07}" y="${Y(t.r) + 0.07}" width="0.86" height="0.86" rx="0.08" class="guide"/>`;
  }
  if (mode === 'removecell' || (mode === 'movecell' && !selected)) {
    for (const k of game.cells) {
      if (game.board.has(k)) continue;
      const { c, r } = parseKeyJS(k);
      svg += `<rect x="${X(c) + 0.05}" y="${Y(r) + 0.05}" width="0.9" height="0.9" rx="0.09" class="target ${mode === 'removecell' ? 'remove' : 'movecell'}"/>`;
    }
  }

  // selection
  if (selected) {
    const cls = mode === 'movecell' ? 'selcell' : 'sel';
    svg += `<rect x="${X(selected.c)}" y="${Y(selected.r)}" width="1" height="1" class="${cls}"/>`;
  }

  // check / mate ring
  const dangerColors = game.status === 'checkmate' ? [game.winner === 'white' ? 'black' : 'white']
    : (game.status === 'check' ? [game.turn] : []);
  for (const col of dangerColors) {
    const kp = game.findKing(col);
    if (kp) svg += `<rect x="${X(kp.c) + 0.04}" y="${Y(kp.r) + 0.04}" width="0.92" height="0.92" rx="0.1" class="danger"/>`;
  }

  // pieces
  for (const [k, p] of game.board) {
    const { c, r } = parseKeyJS(k);
    svg += `<use href="#${SYM[p.type]}" x="${X(c)}" y="${Y(r)}" width="1" height="1" class="pc ${p.color === 'white' ? 'w' : 'b'}"/>`;
  }

  // legal move markers
  for (const m of legal) {
    if (m.capture) svg += `<rect x="${X(m.c) + 0.06}" y="${Y(m.r) + 0.06}" width="0.88" height="0.88" rx="0.12" class="capdot"/>`;
    else svg += `<circle cx="${X(m.c) + 0.5}" cy="${Y(m.r) + 0.5}" r="0.15" class="movedot"/>`;
  }

  // coordinate labels along current edges
  const b = game.bounds();
  for (let c = b.minC; c <= b.maxC; c++)
    svg += `<text x="${X(c) + 0.5}" y="${v.rows - 0.18}" class="lbl edge">${fileLabel(c)}</text>`;
  for (let r = b.minR; r <= b.maxR; r++)
    svg += `<text x="0.5" y="${Y(r) + 0.62}" class="lbl edge">${rankLabel(r)}</text>`;

  boardEl.innerHTML = svg;
}

function keyJS(c, r) { return c + ',' + r; }
function parseKeyJS(k) { const [c, r] = k.split(',').map(Number); return { c, r }; }

// ---- interaction ----------------------------------------------------------
boardEl.addEventListener('click', (e) => {
  if (game.winner || game.status === 'stalemate') return;
  const v = view();
  const rect = boardEl.getBoundingClientRect();
  const c = v.minC + Math.floor(((e.clientX - rect.left) / rect.width) * v.cols);
  const r = v.maxR - Math.floor(((e.clientY - rect.top) / rect.height) * v.rows);
  const p = game.hasCell(c, r) ? game.get(c, r) : null;

  if (mode === 'addcell') { if (game.wildcardAddCell(c, r)) done(); return; }
  if (mode === 'removecell') { if (game.wildcardRemoveCell(c, r)) done(); return; }

  if (mode === 'movecell') {
    if (!selected) {
      if (game.hasCell(c, r) && !game.get(c, r)) { selected = { c, r }; render(); }
      return;
    }
    if (game.wildcardMoveCell(selected.c, selected.r, c, r)) { done(); return; }
    if (game.hasCell(c, r) && !game.get(c, r)) { selected = { c, r }; render(); }   // reselect
    return;
  }

  // normal chess
  if (selected) {
    if (game.makeMove(selected.c, selected.r, c, r)) { done(); return; }
    if (p && p.color === game.turn) { selected = { c, r }; legal = game.legalMoves(c, r); render(); return; }
    selected = null; legal = []; render(); return;
  }
  if (p && p.color === game.turn) { selected = { c, r }; legal = game.legalMoves(c, r); render(); }
});

function done() { selected = null; legal = []; setMode('normal'); sync(); render(); }

// ---- modes ----------------------------------------------------------------
const HINTS = {
  addcell: 'ADD SQUARE: click a dashed spot to attach a new square to the board.',
  removecell: 'REMOVE SQUARE: click an empty square to delete it. The hole blocks sliding pieces.',
  movecell: 'MOVE SQUARE: click an empty square to pick it up, then a dashed spot to re-attach it.',
};
function setMode(m) {
  mode = m; selected = null; legal = [];
  for (const b of document.querySelectorAll('.wild-btn')) b.classList.toggle('active', b.dataset.mode === m);
  if (m === 'normal') ui.hint.textContent = game.canWildcard()
    ? 'Wildcard turn — move a piece normally, or reshape the board.'
    : (game.status === 'check' ? 'You are in check — get out of it.' : 'Make your move.');
  else ui.hint.textContent = HINTS[m];
}

document.querySelectorAll('.wild-btn').forEach(b => b.addEventListener('click', () => {
  if (!game.canWildcard()) return;
  setMode(mode === b.dataset.mode ? 'normal' : b.dataset.mode);
  render();
}));

document.getElementById('newGame').addEventListener('click', () => {
  game.reset(); selected = null; legal = []; setMode('normal');
  ui.banner.classList.remove('show'); sync(); render();
});

// ---- ui sync --------------------------------------------------------------
function sync() {
  const side = game.turn === 'white' ? 'White' : 'Black';
  ui.turn.textContent = `${side} to move`;
  ui.turn.className = 'turn ' + game.turn;

  const eligible = game.canWildcard();
  ui.badge.style.display = eligible ? 'inline-flex' : 'none';
  for (const b of document.querySelectorAll('.wild-btn')) b.disabled = !eligible;

  ui.state.textContent = game.status === 'check' ? 'Check!' : '';
  ui.state.style.display = game.status === 'check' ? 'inline-flex' : 'none';

  setMode('normal');

  ui.log.innerHTML = '';
  game.history.forEach((h, i) => {
    const d = document.createElement('div');
    d.className = 'logline ' + h.color;
    d.textContent = `${i + 1}. ${h.text}`;
    ui.log.appendChild(d);
  });
  ui.log.scrollTop = ui.log.scrollHeight;

  if (game.status === 'checkmate') {
    ui.bannerText.textContent = `Checkmate — ${game.winner === 'white' ? 'White' : 'Black'} wins`;
    ui.banner.classList.add('show');
  } else if (game.status === 'stalemate') {
    ui.bannerText.textContent = 'Stalemate — draw';
    ui.banner.classList.add('show');
  }
}

sync();
render();
