// Wildcard Chess — SVG rendering, interaction, bot, and tutor wiring.
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
  evalFill: document.getElementById('evalFill'),
  evalNum: document.getElementById('evalNum'),
  anaLine: document.getElementById('anaLine'),
  anaWhy: document.getElementById('anaWhy'),
  lastQuality: document.getElementById('lastQuality'),
  accuracy: document.getElementById('accuracy'),
};

let mode = 'normal';        // normal | addcell | removecell | movecell
let selected = null;
let legal = [];
let hintMove = null;        // best-action overlay, cleared on the next move

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
  svg += `<defs><marker id="hintHead" viewBox="0 0 10 10" refX="7.5" refY="5" markerWidth="3.6" markerHeight="3.6" orient="auto-start-reverse"><path d="M1 1L9 5L1 9Z" fill="#e7c14a"/></marker></defs>`;

  for (const k of game.cells) {
    const { c, r } = parseKeyJS(k);
    const light = mod2(c + r) === 1;
    svg += `<rect x="${X(c)}" y="${Y(r)}" width="1" height="1" class="sq ${light ? 'lt' : 'dk'}"/>`;
  }

  if (game.lastAction) for (const s of [game.lastAction.from, game.lastAction.to]) {
    if (s && game.hasCell(s.c, s.r)) svg += `<rect x="${X(s.c)}" y="${Y(s.r)}" width="1" height="1" class="last"/>`;
  }

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

  if (selected) {
    svg += `<rect x="${X(selected.c)}" y="${Y(selected.r)}" width="1" height="1" class="${mode === 'movecell' ? 'selcell' : 'sel'}"/>`;
  }

  const dangerColors = game.status === 'checkmate' ? [game.winner === 'white' ? 'black' : 'white']
    : (game.status === 'check' ? [game.turn] : []);
  for (const col of dangerColors) {
    const kp = game.findKing(col);
    if (kp) svg += `<rect x="${X(kp.c) + 0.04}" y="${Y(kp.r) + 0.04}" width="0.92" height="0.92" rx="0.1" class="danger"/>`;
  }

  for (const [k, p] of game.board) {
    const { c, r } = parseKeyJS(k);
    svg += `<use href="#${SYM[p.type]}" x="${X(c)}" y="${Y(r)}" width="1" height="1" class="pc ${p.color === 'white' ? 'w' : 'b'}"/>`;
  }

  for (const m of legal) {
    if (m.capture) svg += `<rect x="${X(m.c) + 0.06}" y="${Y(m.r) + 0.06}" width="0.88" height="0.88" rx="0.12" class="capdot"/>`;
    else svg += `<circle cx="${X(m.c) + 0.5}" cy="${Y(m.r) + 0.5}" r="0.15" class="movedot"/>`;
  }

  // tutor: best-action overlay
  if (hintMove) {
    const gm = WCAI.moveToGame(hintMove);
    if (gm.kind === 'm' || gm.kind === 'mc') {
      const fx = X(gm.from.c) + 0.5, fy = Y(gm.from.r) + 0.5;
      const tx = X(gm.to.c) + 0.5, ty = Y(gm.to.r) + 0.5;
      const dx = tx - fx, dy = ty - fy, len = Math.hypot(dx, dy) || 1;
      const x1 = fx + (dx / len) * 0.30, y1 = fy + (dy / len) * 0.30;
      const x2 = tx - (dx / len) * 0.30, y2 = ty - (dy / len) * 0.30;
      svg += `<rect x="${X(gm.from.c) + 0.04}" y="${Y(gm.from.r) + 0.04}" width="0.92" height="0.92" rx="0.1" class="hintcell"/>`;
      svg += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="hintarrow" marker-end="url(#hintHead)"/>`;
    } else {
      const cc = gm.cell;
      svg += `<rect x="${X(cc.c) + 0.04}" y="${Y(cc.r) + 0.04}" width="0.92" height="0.92" rx="0.1" class="hintcell"/>`;
      svg += `<text x="${X(cc.c) + 0.5}" y="${Y(cc.r) + 0.66}" class="hintmark">${gm.kind === 'ac' ? '+' : '×'}</text>`;
    }
  }

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
  if (gameOver()) return;
  if (aiThinking) return;
  if (botEnabled() && game.turn === botSide()) return;
  if (linkMode() && linkPending) return;      // their turn — waiting on their link
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
    if (game.hasCell(c, r) && !game.get(c, r)) { selected = { c, r }; render(); }
    return;
  }

  if (selected) {
    if (game.makeMove(selected.c, selected.r, c, r)) { done(); return; }
    if (p && p.color === game.turn) { selected = { c, r }; legal = game.legalMoves(c, r); render(); return; }
    selected = null; legal = []; render(); return;
  }
  if (p && p.color === game.turn) { selected = { c, r }; legal = game.legalMoves(c, r); render(); }
});

function done() { afterMove(); updateShare(); maybeAI(); }

function afterMove() {
  selected = null; legal = []; hintMove = null;
  setMode('normal');
  runAnalysis();
  sync(); render();
}

// ---- bot opponent ---------------------------------------------------------
const oppModeEl = document.getElementById('oppMode');
const botSideEl = document.getElementById('botSide');
const botLevelEl = document.getElementById('botLevel');
const botBlurbEl = document.getElementById('botBlurb');
let aiThinking = false;

const linkMode = () => oppModeEl && oppModeEl.value === 'link';
let linkPending = false;          // true after your move: waiting on your friend
const botEnabled = () => oppModeEl && oppModeEl.value === 'bot';
const botSide = () => (botSideEl ? botSideEl.value : 'black');
function gameOver() { return !!game.winner || ['stalemate', 'repetition'].includes(game.status); }

function refreshBotUI() {
  const on = botEnabled();
  if (botLevelEl) botLevelEl.disabled = !on;
  if (botSideEl) botSideEl.disabled = !on;
  if (botBlurbEl) {
    const lv = WCAI.levelById(botLevelEl ? botLevelEl.value : 3);
    botBlurbEl.textContent = on ? `${lv.name} — ${lv.blurb}` : 'Two players, one screen.';
  }
}

function maybeAI() {
  if (!botEnabled() || aiThinking || gameOver()) return;
  if (game.turn !== botSide()) return;
  aiThinking = true;
  const lv = WCAI.levelById(botLevelEl ? botLevelEl.value : 3);
  ui.hint.textContent = `${activeBot ? activeBot.name : lv.name} is thinking…`;
  setTimeout(() => {
    try {
      const pos = activeBot
        ? WCAI.Pos.fromGame(game, WCLADDER.weightsFor(activeBot))
        : WCAI.Pos.fromGame(game);
      const res = activeBot
        ? WCAI.chooseMoveFor(pos, activeBot.search)
        : WCAI.chooseMove(pos, lv.id);
      if (!WCAI.applyToGame(game, WCAI.moveToGame(res.move))) {
        outer: for (const [k, p] of game.board) {
          if (p.color !== game.turn) continue;
          const [c, r] = k.split(',').map(Number);
          for (const m of game.legalMoves(c, r)) if (game.makeMove(c, r, m.c, m.r)) break outer;
        }
      }
    } finally {
      aiThinking = false;
      afterMove();
      maybeAI();
    }
  }, 30);
}

if (oppModeEl) oppModeEl.addEventListener('change', () => { refreshBotUI(); refreshShareUI(); maybeAI(); });
if (botSideEl) botSideEl.addEventListener('change', () => { refreshBotUI(); maybeAI(); });
if (botLevelEl) botLevelEl.addEventListener('change', refreshBotUI);

// ---- tutor ----------------------------------------------------------------
const anaOnEl = document.getElementById('anaOn');
const anaDepthEl = document.getElementById('anaDepth');
const hintBtn = document.getElementById('hintBtn');

let anaKey = null;          // ply count the cached analysis describes
let anaStm = 0;             // side-to-move score at that position
let anaBest = null;         // best action there
const quality = [];         // quality[i] grades history[i]

const anaOn = () => !anaOnEl || anaOnEl.checked;
const anaDepth = () => (anaDepthEl ? +anaDepthEl.value : 3);

// One search per ply: evaluates the new position AND grades the move that
// produced it, using the cached eval of the position before it.
function runAnalysis() {
  if (!anaOn()) { anaKey = null; paintEval(null); return; }
  const key = game.history.length;
  if (gameOver()) {
    // the move that ended the game was, by definition, not a mistake
    if (key - 1 >= 0 && anaKey === key - 1) quality[key - 1] = WCAN.classify(0);
    const finalWhite = game.status === 'checkmate' ? (game.winner === 'white' ? WCAN.MATE : -WCAN.MATE) : 0;
    anaKey = key; anaStm = 0; anaBest = null;
    paintEval({ whiteScore: finalWhite, best: null, depth: 0 });
    return;
  }
  const res = WCAN.analyse(game, anaDepth(), 900);
  gradePrevious(key, res.stmScore);
  anaKey = key; anaStm = res.stmScore; anaBest = res.best;
  paintEval(res);
}

// Grade history[key-1] from the side-to-move score at the position after it.
function gradePrevious(key, newStmScore) {
  const idx = key - 1;
  if (idx < 0 || anaKey !== idx) return;         // no cached "before" eval
  const before = WCAN.clamp(anaStm);             // mover POV: best available
  const after = WCAN.clamp(-newStmScore);        // mover POV: what they got
  quality[idx] = WCAN.classify(before - after);
}

function paintEval(res) {
  if (!res) {
    if (ui.evalFill) ui.evalFill.style.height = '50%';
    if (ui.evalNum) { ui.evalNum.textContent = '–'; ui.evalNum.className = 'evalbar-num'; }
    if (ui.anaLine) ui.anaLine.textContent = 'Analysis off';
    if (ui.anaWhy) ui.anaWhy.textContent = '';
    if (ui.lastQuality) ui.lastQuality.innerHTML = '';
    if (ui.accuracy) ui.accuracy.textContent = '';
    return;
  }
  const pct = WCAN.evalToPct(res.whiteScore);
  if (ui.evalFill) ui.evalFill.style.height = pct + '%';
  if (ui.evalNum) {
    ui.evalNum.textContent = WCAN.fmtScore(res.whiteScore);
    ui.evalNum.className = 'evalbar-num ' + (res.whiteScore >= 0 ? 'pos' : 'neg');
  }
  if (ui.anaLine) {
    ui.anaLine.textContent = res.best
      ? `Best: ${WCAN.describe(WCAI.moveToGame(res.best), game)}   ·   depth ${res.depth}`
      : (gameOver() ? 'Game over' : '—');
  }
  if (ui.anaWhy) ui.anaWhy.textContent = res.best ? WCAN.explain(WCAI.moveToGame(res.best), game) : '';

  const lastIdx = game.history.length - 1;
  if (ui.lastQuality) {
    const q = quality[lastIdx];
    const who = lastIdx >= 0 && game.history[lastIdx] ? (game.history[lastIdx].color === 'white' ? 'White' : 'Black') : '';
    ui.lastQuality.innerHTML = q
      ? `<span class="q q-${q.key}">${q.mark} ${q.label}</span><span class="q-meta">${who}${q.loss > 12 ? ` · −${(q.loss / 100).toFixed(2)}` : ''}</span>`
      : '';
  }
  if (ui.accuracy) {
    const lw = [], lb = [];
    game.history.forEach((h, i) => {
      const q = quality[i]; if (!q) return;
      (h.color === 'white' ? lw : lb).push(q.loss);
    });
    const aw = WCAN.accuracy(lw), ab = WCAN.accuracy(lb);
    ui.accuracy.textContent = (aw != null || ab != null)
      ? `Accuracy · White ${aw != null ? aw + '%' : '–'} · Black ${ab != null ? ab + '%' : '–'}` : '';
  }
}

if (hintBtn) hintBtn.addEventListener('click', () => {
  if (gameOver()) return;
  if (hintMove) { hintMove = null; render(); return; }          // toggle off
  let best = (anaKey === game.history.length) ? anaBest : null;
  if (!best) {
    const res = WCAN.analyse(game, anaDepth(), 900);
    best = res.best;
    anaKey = game.history.length; anaStm = res.stmScore; anaBest = best;
    paintEval(res);
  }
  hintMove = best;
  render();
});
if (anaOnEl) anaOnEl.addEventListener('change', () => { anaKey = null; runAnalysis(); });
if (anaDepthEl) anaDepthEl.addEventListener('change', () => { anaKey = null; runAnalysis(); });

// ---- ladder, lobby and ratings --------------------------------------------
const lobbyEl = document.getElementById('lobby');
const botListEl = document.getElementById('botList');
const oppCardEl = document.getElementById('oppCard');
const eloChipEl = document.getElementById('eloChip');

let activeBot = null;        // ladder bot currently being played, or null
let ratedGame = false;       // does this game move your Elo?
let resultRecorded = false;  // guard: score each game exactly once

function paintProfile() {
  const p = WCLADDER.getProfile();
  if (eloChipEl) eloChipEl.textContent = '\u2605 ' + p.elo;
  const youElo = document.getElementById('youElo');
  const youRec = document.getElementById('youRecord');
  if (youElo) youElo.textContent = p.elo;
  if (youRec) youRec.textContent = p.wins + 'W \u00b7 ' + p.losses + 'L \u00b7 ' + p.draws + 'D';
}

function paintOppCard() {
  if (!oppCardEl) return;
  if (!activeBot) { oppCardEl.innerHTML = ''; oppCardEl.style.display = 'none'; return; }
  oppCardEl.style.display = 'flex';
  const st = WCLADDER.stakes(activeBot.id);
  const stakeText = ratedGame ? ('Rated \u00b7 win +' + st.win + ' / lose ' + st.loss) : 'Casual';
  oppCardEl.innerHTML =
    '<span class="oc-ico">' + activeBot.emoji + '</span>' +
    '<span class="oc-body"><span class="oc-name">' + activeBot.name +
    '<span class="oc-elo">' + activeBot.elo + '</span></span>' +
    '<span class="oc-style">' + activeBot.style + '</span>' +
    '<span class="oc-stakes">' + stakeText + '</span></span>';
}

function renderLobby() {
  paintProfile();
  if (!botListEl) return;
  const rows = WCLADDER.ranked();
  botListEl.innerHTML = rows.map(function (b) {
    const st = WCLADDER.stakes(b.id);
    const tag = Math.abs(b.gap) <= 120 ? 'even' : (b.gap > 0 ? 'harder' : 'easier');
    const tagText = tag === 'even' ? 'fair fight'
      : (b.gap > 0 ? ('+' + b.gap + ' above you') : (b.gap + ' below you'));
    return '<button class="bot-row" data-bot="' + b.id + '">' +
      '<span class="br-ico">' + b.emoji + '</span>' +
      '<span class="br-main">' +
        '<span class="br-top"><span class="br-name">' + b.name + '</span>' +
        '<span class="br-tag ' + tag + '">' + tagText + '</span></span>' +
        '<span class="br-style">' + b.style + '</span>' +
        '<span class="br-blurb">' + b.blurb + '</span>' +
      '</span>' +
      '<span class="br-right">' +
        '<span class="br-elo">' + b.elo + '</span>' +
        '<span class="br-odds">' + b.winChance + '% win</span>' +
        '<span class="br-stake">+' + st.win + ' / ' + st.loss + '</span>' +
      '</span></button>';
  }).join('');
}

function openLobby() { renderLobby(); lobbyEl.classList.add('show'); }
function closeLobby() { lobbyEl.classList.remove('show'); }

// Start a fresh rated game against a ladder bot. You are White, the bot is Black.
function startMatch(botId) {
  activeBot = WCLADDER.byId(botId);
  ratedGame = !!activeBot;
  resultRecorded = false;
  if (oppModeEl) oppModeEl.value = 'bot';
  if (botSideEl) botSideEl.value = 'black';
  resetGameState();
  closeLobby();
  paintOppCard();
  refreshBotUI(); refreshShareUI();
  runAnalysis(); sync(); render();
  maybeAI();
}

// Start an unrated mode: 'hotseat' (same screen) or 'link' (send a link).
function startCasual(kind) {
  activeBot = null; ratedGame = false; resultRecorded = false;
  if (oppModeEl) oppModeEl.value = (kind === 'hotseat') ? 'human' : 'link';
  resetGameState();
  closeLobby();
  paintOppCard();
  refreshBotUI(); refreshShareUI();
  runAnalysis(); sync(); render();
}

function resetGameState() {
  game.reset();
  selected = null; legal = []; hintMove = null;
  quality.length = 0; anaKey = null; linkPending = false;
  if (shareLinkEl) shareLinkEl.value = '';
  history.replaceState(null, '', location.pathname + location.search);
  ui.banner.classList.remove('show');
  setMode('normal');
}

// Score a finished rated game exactly once and return the rating change.
function settleResult() {
  if (!ratedGame || resultRecorded || !activeBot) return null;
  if (!gameOver()) return null;
  resultRecorded = true;
  const botColor = botSide();
  const youColor = botColor === 'white' ? 'black' : 'white';
  const score = game.winner === youColor ? 1 : (game.winner === botColor ? 0 : 0.5);
  const r = WCLADDER.recordResult(activeBot.id, score);
  paintProfile(); paintOppCard();
  return r;
}

const openLobbyBtn = document.getElementById('openLobby');
const closeLobbyBtn = document.getElementById('closeLobby');
const resetEloBtn = document.getElementById('resetElo');
if (openLobbyBtn) openLobbyBtn.addEventListener('click', openLobby);
if (closeLobbyBtn) closeLobbyBtn.addEventListener('click', closeLobby);
if (resetEloBtn) resetEloBtn.addEventListener('click', function () {
  if (confirm('Reset your rating to 500 and clear your record?')) {
    WCLADDER.resetProfile(); renderLobby(); paintProfile();
  }
});
if (botListEl) botListEl.addEventListener('click', function (e) {
  const row = e.target.closest('.bot-row');
  if (row) startMatch(row.dataset.bot);
});
document.querySelectorAll('.mode-card').forEach(function (el) {
  el.addEventListener('click', function () { startCasual(el.dataset.lobbymode); });
});
if (lobbyEl) lobbyEl.addEventListener('click', function (e) { if (e.target === lobbyEl) closeLobby(); });

// ---- play by link ---------------------------------------------------------
const sharePanelEl = document.getElementById('sharePanel');
const shareLinkEl = document.getElementById('shareLink');
const shareMsgEl = document.getElementById('shareMsg');
const copyLinkBtn = document.getElementById('copyLink');

function refreshShareUI() {
  if (!sharePanelEl) return;
  sharePanelEl.style.display = linkMode() ? 'block' : 'none';
  if (!linkMode()) { linkPending = false; return; }
  if (!linkPending) {
    shareMsgEl.textContent = gameOver() ? 'Game over — send the final position.' : 'Your turn. Move, then send the link.';
    if (!shareLinkEl.value) shareLinkEl.placeholder = 'link appears after your move';
  }
}

// Called after a move: in link mode, mint the link and hand the turn over.
function updateShare() {
  if (!linkMode()) return;
  try {
    const url = WCSHARE.linkFor(game);
    shareLinkEl.value = url;
    history.replaceState(null, '', '#g=' + WCSHARE.encode(game));
    linkPending = true;
    shareMsgEl.textContent = gameOver()
      ? 'Game over — send this link so they can see it.'
      : "Sent? Now it's their move. Paste their reply link in the address bar.";
  } catch (e) {
    shareMsgEl.textContent = 'Could not build a link: ' + e.message;
  }
}

if (copyLinkBtn) copyLinkBtn.addEventListener('click', async () => {
  if (!shareLinkEl.value) { shareLinkEl.value = WCSHARE.linkFor(game); }
  try {
    await navigator.clipboard.writeText(shareLinkEl.value);
    copyLinkBtn.textContent = 'Copied';
  } catch (e) {
    shareLinkEl.select();                       // clipboard blocked: let them Ctrl+C
    copyLinkBtn.textContent = 'Press Ctrl+C';
  }
  setTimeout(() => { copyLinkBtn.textContent = 'Copy link'; }, 1800);
});

// Pasting a friend's link into the address bar changes only the hash — no reload
// fires, so pick it up here.
window.addEventListener('hashchange', () => {
  try {
    if (!WCSHARE.fromLocation(game)) return;
    selected = null; legal = []; hintMove = null;
    quality.length = 0; anaKey = null; linkPending = false;
    if (oppModeEl) oppModeEl.value = 'link';
    ui.banner.classList.remove('show');
    runAnalysis(); sync(); render(); refreshBotUI(); refreshShareUI();
    if (shareMsgEl) shareMsgEl.textContent = "Your friend's move is loaded. Your turn.";
    if (shareLinkEl) shareLinkEl.value = '';
  } catch (e) {
    alert('That game link could not be read: ' + e.message);
  }
});

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
  game.reset();
  selected = null; legal = []; hintMove = null;
  quality.length = 0; anaKey = null;
  setMode('normal');
  ui.banner.classList.remove('show');
  linkPending = false;
  if (shareLinkEl) shareLinkEl.value = '';
  history.replaceState(null, '', location.pathname + location.search);
  runAnalysis(); sync(); render();
  refreshBotUI(); refreshShareUI(); maybeAI();
});

// ---- ui sync --------------------------------------------------------------
function renderLog() {
  ui.log.innerHTML = '';
  game.history.forEach((h, i) => {
    const d = document.createElement('div');
    d.className = 'logline ' + h.color;
    const q = quality[i];
    d.innerHTML = `<span class="ln">${i + 1}.</span> <span class="mv">${h.text}</span>` +
      (q ? ` <span class="q q-${q.key}" title="${q.label} (−${(q.loss / 100).toFixed(2)})">${q.mark}</span>` : '');
    ui.log.appendChild(d);
  });
  ui.log.scrollTop = ui.log.scrollHeight;
}

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
  renderLog();

  if (gameOver()) {
    const r = settleResult();
    let text = game.status === 'checkmate'
      ? ('Checkmate \u2014 ' + (game.winner === 'white' ? 'White' : 'Black') + ' wins')
      : (game.status === 'repetition' ? 'Draw by repetition' : 'Stalemate \u2014 draw');
    if (r) {
      const sign = r.delta >= 0 ? '+' : '';
      text += '  \u00b7  ' + r.before + ' \u2192 ' + r.after + ' (' + sign + r.delta + ')';
    }
    ui.bannerText.textContent = text;
    ui.banner.classList.add('show');
  }
}

// Boot: a #g=… link means a friend just sent us a position — load it and play.
let bootedFromLink = false;
try {
  if (WCSHARE.fromLocation(game)) {
    bootedFromLink = true;
    if (oppModeEl) oppModeEl.value = 'link';
  }
} catch (e) {
  console.warn('bad game link:', e.message);
  alert('That game link could not be read — starting a new game instead.');
}

paintProfile();
paintOppCard();
runAnalysis();
sync();
render();
refreshBotUI();
refreshShareUI();
if (!bootedFromLink) openLobby();
if (bootedFromLink && shareMsgEl) shareMsgEl.textContent = "Your friend's move is loaded. Your turn.";
if (!bootedFromLink) maybeAI();
