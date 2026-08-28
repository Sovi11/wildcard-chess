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
let flipped = false;        // true when the board is drawn from Black's side
let gameActs = [];          // every action this game, so it can be replayed later

// Piece symbols are namespaced by the active set: pc-classic-pawn, pc-gnome-rook…
WCTHEME.load();
WCTHEME.apply();
const symFor = (type) => 'pc-' + WCTHEME.get().pieces + '-' + type;
const mod2 = (n) => ((n % 2) + 2) % 2;

// ---- view: fit the board tightly; open a ring of expandable space only
// while a square is lifted (or a board-action hint points off-board), so the
// squares get the whole canvas the rest of the time.
function view() {
  const b = game.bounds();
  let pad = 0;
  if (mode === 'movecell' && selected) pad = 1;
  if (hintMove && hintMove.kind && hintMove.kind !== 'm') pad = 1;
  const minC = b.minC - pad, maxC = b.maxC + pad, minR = b.minR - pad, maxR = b.maxR + pad;
  return { minC, maxC, minR, maxR, cols: maxC - minC + 1, rows: maxR - minR + 1 };
}

function render() {
  const v = view();
  const M = 0.09;                       // thin frame inside the rounded container
  boardEl.setAttribute('viewBox', `${-M} ${-M} ${v.cols + 2 * M} ${v.rows + 2 * M}`);
  // Flipping swaps both axes so the side you play always sits at the bottom.
  const X = flipped ? (c) => v.maxC - c : (c) => c - v.minC;
  const Y = flipped ? (r) => r - v.minR : (r) => v.maxR - r;
  let svg = pieceDefs(WCTHEME.get().pieces);
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
    svg += `<use href="#${symFor(p.type)}" x="${X(c)}" y="${Y(r)}" width="1" height="1" class="pc ${p.color === 'white' ? 'w' : 'b'}"/>`;
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

  // labels live inside the edge squares so no canvas is spent on a gutter;
  // colour is the opposite square shade for contrast on any theme
  const b = game.bounds();
  const parity = (c, r) => (((c + r) % 2) + 2) % 2 === 1 ? 'on-lt' : 'on-dk';
  const fileRow = flipped ? b.maxR : b.minR;
  const rankCol = flipped ? b.maxC : b.minC;
  for (let c = b.minC; c <= b.maxC; c++) {
    if (!game.hasCell(c, fileRow)) continue;
    svg += `<text x="${X(c) + 0.92}" y="${Y(fileRow) + 0.94}" class="lbl insq ${parity(c, fileRow)}" text-anchor="end">${fileLabel(c)}</text>`;
  }
  for (let r = b.minR; r <= b.maxR; r++) {
    if (!game.hasCell(rankCol, r)) continue;
    svg += `<text x="${X(rankCol) + 0.07}" y="${Y(r) + 0.27}" class="lbl insq ${parity(rankCol, r)}">${rankLabel(r)}</text>`;
  }

  boardEl.innerHTML = svg;
}

// Anything that reaches innerHTML goes through this. Player names come from a
// text box and, online, from the other machine — neither is trustworthy markup.
function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function keyJS(c, r) { return c + ',' + r; }
function parseKeyJS(k) { const [c, r] = k.split(',').map(Number); return { c, r }; }

// The soft menu tune plays whenever no game demands attention: any full-screen
// overlay (welcome, lobby, profile, tutorial) or a finished game. It stops the
// moment live play resumes.
function updateAmbient() {
  const overlayOpen = ['welcome', 'lobby', 'profile', 'tutorial'].some(function (id) {
    const el = document.getElementById(id);
    return !!el && el.classList.contains('show');
  });
  WCSOUND.setAmbient(overlayOpen || gameOver());
}

// ---- interaction ----------------------------------------------------------
boardEl.addEventListener('click', (e) => {
  if (gameOver()) return;
  if (aiThinking) return;
  if (botEnabled() && game.turn === botSide()) return;
  if (linkMode() && linkPending) return;      // their turn — waiting on their link
  if (onlineActive && game.turn !== myColor) return;   // their move, over the wire
  const v = view();
  const rect = boardEl.getBoundingClientRect();
  // invert the viewBox mapping exactly, including the 0.09 frame margin
  const M = 0.09;
  const bx = ((e.clientX - rect.left) / rect.width) * (v.cols + 2 * M) - M;
  const by = ((e.clientY - rect.top) / rect.height) * (v.rows + 2 * M) - M;
  const fx = Math.floor(bx);
  const fy = Math.floor(by);
  const c = flipped ? v.maxC - fx : v.minC + fx;
  const r = flipped ? v.minR + fy : v.maxR - fy;
  const p = game.hasCell(c, r) ? game.get(c, r) : null;

  if (mode === 'addcell') { if (game.wildcardAddCell(c, r)) done({ kind: 'ac', cell: { c: c, r: r } }); return; }
  if (mode === 'removecell') { if (game.wildcardRemoveCell(c, r)) done({ kind: 'rc', cell: { c: c, r: r } }); return; }

  if (mode === 'movecell') {
    if (!selected) {
      if (game.hasCell(c, r) && !game.get(c, r)) { selected = { c, r }; render(); }
      return;
    }
    if (selected.c === c && selected.r === r) {          // tap it again: put it down
      setMode('normal'); render(); return;
    }
    if (game.wildcardMoveCell(selected.c, selected.r, c, r)) {
      done({ kind: 'mc', from: { c: selected.c, r: selected.r }, to: { c: c, r: r } }); return;
    }
    if (game.hasCell(c, r) && !game.get(c, r)) { selected = { c, r }; render(); }
    return;
  }

  if (selected) {
    if (game.makeMove(selected.c, selected.r, c, r)) {
      done({ kind: 'm', from: { c: selected.c, r: selected.r }, to: { c: c, r: r } }); return;
    }
    if (p && p.color === game.turn) { selected = { c, r }; legal = game.legalMoves(c, r); render(); return; }
    selected = null; legal = []; render(); return;
  }
  if (p && p.color === game.turn) { selected = { c, r }; legal = game.legalMoves(c, r); render(); return; }

  // Board turn, nothing selected, empty square: ONE click lifts it. A second
  // click on a dashed spot places it; clicking it again puts it back down.
  if (game.canWildcard() && game.hasCell(c, r) && !p) {
    setMode('movecell');
    selected = { c, r };
    WCSOUND.play('lift');
    ui.hint.textContent = 'Square lifted — click a dashed spot to place it, or click it again to cancel.';
    render();
  }
});

function done(gm) {
  if (gm) gameActs.push(gm);
  afterMove(); updateShare(); netBroadcast(gm); paintNetCard(); maybeAI();
}

// Sound + screen-shake for the action that just landed, read off the game
// state so it covers you, the bot, and the opponent over the wire alike.
// A board move is meant to FEEL different from a piece move: it gets a low
// stone-grind rumble and a little quake instead of a wooden thock.
function actionFX() {
  const last = game.history[game.history.length - 1];
  if (!last) return;
  if (game.lastAction && game.lastAction.kind !== 'move') {
    WCSOUND.play('terrain');
    const wrap = document.querySelector('.board-wrap');
    if (wrap) {
      wrap.classList.remove('quake');
      void wrap.offsetWidth;                    // restart the animation
      wrap.classList.add('quake');
    }
  } else if (last.text.indexOf('O-O') === 0) {
    WCSOUND.play('castle');
  } else if (last.text.indexOf('x') >= 0) {
    WCSOUND.play('capture');
  } else {
    WCSOUND.play('move');
  }
  if (!gameOver() && game.status === 'check') setTimeout(function () { WCSOUND.play('check'); }, 130);
}

function afterMove() {
  selected = null; legal = []; hintMove = null;
  setMode('normal');
  actionFX();
  runAnalysis();
  sync(); render();
}

// ---- bot opponent ---------------------------------------------------------
const oppModeEl = document.getElementById('oppMode');
const botSideEl = document.getElementById('botSide');
const botLevelEl = document.getElementById('botLevel');
const botBlurbEl = document.getElementById('botBlurb');
let aiThinking = false;
let aiGen = 0;              // bumped on every reset; stale bot timers see it and abort
let endSounded = false;     // play the game-over jingle exactly once per game

const linkMode = () => oppModeEl && oppModeEl.value === 'link';
let linkPending = false;          // true after your move: waiting on your friend
const botEnabled = () => oppModeEl && oppModeEl.value === 'bot';
const botSide = () => (botSideEl ? botSideEl.value : 'black');
function gameOver() { return !!game.winner || ['stalemate', 'repetition', 'fifty'].includes(game.status); }

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
  const myGen = aiGen;
  const lv = WCAI.levelById(botLevelEl ? botLevelEl.value : 3);
  ui.hint.textContent = `${activeBot ? activeBot.name : lv.name} is thinking…`;
  setTimeout(() => {
    // The game may have been reset or switched mode while we were queued.
    if (myGen !== aiGen || !botEnabled() || gameOver() || game.turn !== botSide()) {
      aiThinking = false;
      return;
    }
    // Search now, answer later: every bot replies on the same human-feeling
    // clock — roughly a second — whether its search took 5 ms or 1 s.
    // Instant replies read as a computer; wildly varying ones read as lag.
    const t0 = Date.now();
    let gmBot = null;
    try {
      const pos = activeBot
        ? WCAI.Pos.fromGame(game, WCLADDER.weightsFor(activeBot))
        : WCAI.Pos.fromGame(game);
      const res = activeBot
        ? WCAI.chooseMoveFor(pos, activeBot.search)
        : WCAI.chooseMove(pos, lv.id);
      gmBot = WCAI.moveToGame(res.move);
    } catch (e) { gmBot = null; }
    const wait = Math.max(0, 900 + Math.random() * 400 - (Date.now() - t0));
    setTimeout(() => {
      if (myGen !== aiGen || !botEnabled() || gameOver() || game.turn !== botSide()) {
        aiThinking = false;
        return;
      }
      try {
        if (gmBot && WCAI.applyToGame(game, gmBot)) {
          gameActs.push(gmBot);                       // keep the bot's action for replay
        } else {
          outer: for (const [k, p] of game.board) {
            if (p.color !== game.turn) continue;
            const [c, r] = k.split(',').map(Number);
            for (const m of game.legalMoves(c, r)) if (game.makeMove(c, r, m.c, m.r)) {
              gameActs.push({ kind: 'm', from: { c: c, r: r }, to: { c: m.c, r: m.r } });
              break outer;
            }
          }
        }
      } finally {
        aiThinking = false;
        afterMove();
        maybeAI();
      }
    }, wait);
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

// ---- orientation, resign, draw, dev mode ----------------------------------
const flipBtn = document.getElementById('flipBtn');
const drawBtn = document.getElementById('drawBtn');
const resignBtn = document.getElementById('resignBtn');
// the LIVE board's bar specifically — '.evalbar' alone would match the review
// board's bar first, since the profile overlay sits earlier in the DOM
const evalBarEl = document.querySelector('.board-row > .evalbar');

// Point the board at whoever the local player is.
function orientFor(color) {
  flipped = (color === 'black');
  render();
}

// The engine is invisible during live play, full stop — no eval, no best
// move, no grades until the game ends. ?dev=1 in the URL is the only override,
// for development. Analysis still runs each ply so the post-game report is
// complete.
const devOn = () => /[?&]dev=1/.test(location.search);
function analysisVisible() { return devOn() || gameOver(); }

function applyTutorVisibility() {
  const show = analysisVisible();
  if (evalBarEl) evalBarEl.style.display = show ? '' : 'none';
  if (hintBtn) { hintBtn.disabled = !show; hintBtn.style.opacity = show ? '' : '.4'; }
  if (ui.anaLine) ui.anaLine.style.display = show ? '' : 'none';
  if (ui.anaWhy) ui.anaWhy.style.display = show ? '' : 'none';
  if (ui.lastQuality) ui.lastQuality.style.display = show ? '' : 'none';
  if (ui.accuracy) ui.accuracy.style.display = show ? '' : 'none';
  if (!show && hintMove) { hintMove = null; render(); }
  const log = document.getElementById('log');
  if (log) log.classList.toggle('hide-grades', !show);
}

if (flipBtn) flipBtn.addEventListener('click', function () { flipped = !flipped; render(); });

const soundBtn = document.getElementById('soundBtn');
function paintSound() {
  if (!soundBtn) return;
  soundBtn.textContent = WCSOUND.isMuted() ? '🔇' : '🔊';
  soundBtn.title = WCSOUND.isMuted() ? 'Sound is off' : 'Sound is on';
}
if (soundBtn) soundBtn.addEventListener('click', function () {
  WCSOUND.toggle();
  paintSound();
  if (!WCSOUND.isMuted()) WCSOUND.play('move');    // audible confirmation
});
paintSound();

// Which colour does the person at this keyboard control?
function localColor() {
  if (onlineActive) return myColor;
  if (botEnabled()) return botSide() === 'white' ? 'black' : 'white';
  return game.turn;                       // hotseat: whoever is to move
}

function endGame(winner, reason) {
  game.winner = winner;
  game.status = winner ? 'checkmate' : 'stalemate';
  game.endReason = reason || null;
  sync(); render();
}

if (resignBtn) resignBtn.addEventListener('click', function () {
  if (gameOver()) return;
  const me = localColor();
  if (!confirm('Resign this game?')) return;
  if (netOnline()) WCNET.send({ t: 'resign' });
  endGame(me === 'white' ? 'black' : 'white', 'resignation');
});

if (drawBtn) drawBtn.addEventListener('click', function () {
  if (gameOver()) return;
  if (netOnline()) {
    WCNET.send({ t: 'drawoffer' });
    ui.hint.textContent = 'Draw offered \u2014 waiting for their answer.';
    return;
  }
  if (activeBot) {
    // The bot accepts only when the position is not going its way.
    const res = WCAN.analyse(game, 3, 700);
    const botColor = botSide();
    const botScore = botColor === 'white' ? res.whiteScore : -res.whiteScore;
    if (botScore < -60) { endGame(null, 'agreement'); }
    else { ui.hint.textContent = activeBot.name + ' declines the draw.'; }
    return;
  }
  if (confirm('Both players agree to a draw?')) endGame(null, 'agreement');
});

// ---- ladder, lobby and ratings --------------------------------------------
const lobbyEl = document.getElementById('lobby');
const botListEl = document.getElementById('botList');
const oppCardEl = document.getElementById('oppCard');
const eloChipEl = document.getElementById('eloChip');

let activeBot = null;        // ladder bot currently being played, or null
let ratedGame = false;       // does this game move your Elo?
let resultRecorded = false;  // guard: score each game exactly once

const youNameEl = document.getElementById('youName');
if (youNameEl) youNameEl.addEventListener('change', function () {
  const p = WCLADDER.getProfile();
  p.name = (youNameEl.value || '').trim().slice(0, 16) || 'You';
  WCLADDER.saveProfile(p);
  youNameEl.value = p.name;
  renderLeaderboard();
  syncProfileUp();
});

function myName() {
  const n = WCLADDER.getProfile().name;
  return (n && n !== 'You') ? n : 'Anonymous';
}

function paintProfile() {
  const p = WCLADDER.getProfile();
  if (youNameEl && document.activeElement !== youNameEl) youNameEl.value = p.name === 'You' ? '' : p.name;
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
    '<span class="oc-body"><span class="oc-name">' + esc(activeBot.name) +
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
    return '<div class="bot-row static">' +
      '<span class="br-ico">' + b.emoji + '</span>' +
      '<span class="br-main">' +
        '<span class="br-top"><span class="br-name">' + esc(b.name) + '</span>' +
        '<span class="br-tag ' + tag + '">' + tagText + '</span></span>' +
        '<span class="br-style">' + esc(b.style) + '</span>' +
        '<span class="br-blurb">' + esc(b.blurb) + '</span>' +
      '</span>' +
      '<span class="br-right">' +
        '<span class="br-elo">' + b.elo + '</span>' +
        '<span class="br-odds">' + b.winChance + '% win</span>' +
        '<span class="br-stake">+' + st.win + ' / ' + st.loss + '</span>' +
      '</span></div>';
  }).join('');
  const count = document.getElementById('poolCount');
  if (count) count.textContent = '(' + rows.length + ' rated players)';
}

function openLobby() { renderLobby(); renderLeaderboard(); resetQueueUI(); lobbyEl.classList.add('show'); updateAmbient(); }

// Everyone in the pool plus you, ranked. Bot ratings drift, so this moves.
// Signed in, the cloud's registered players are BLENDED with the resident
// pool rather than replacing it — with two humans registered, a humans-only
// board is a very lonely place.
function lbRows(el, rows) {
  el.innerHTML = rows.map(function (r, i) {
    return '<div class="lb-row' + (r.you ? ' you' : '') + '">' +
      '<span class="lb-rank">' + (i + 1) + '</span>' +
      '<span class="lb-name">' + esc(r.name) +
        (r.human ? ' <span class="lb-tag">player</span>' : '') + '</span>' +
      '<span class="lb-elo">' + r.elo + '</span></div>';
  }).join('');
}

function renderLeaderboard() {
  const el = document.getElementById('leaderboard');
  if (!el) return;
  const me = WCLADDER.getProfile();
  const myName = (me.name && me.name !== 'You') ? me.name : 'You';
  const bots = WCLADDER.livePool()
    .map(function (b) { return { name: b.name, elo: b.elo, you: false, human: false }; });

  if (WCCLOUD.enabled()) {
    WCCLOUD.leaderboard(25).then(function (rows) {
      if (!rows || !rows.length) return;            // fall back to what is drawn below
      const humans = rows.map(function (r) {
        return { name: r.name, elo: r.elo, you: r.name === me.name, human: true };
      });
      const iAmListed = humans.some(function (h) { return h.you; });
      const all = humans
        .concat(bots)
        .concat(iAmListed ? [] : [{ name: myName, elo: me.elo, you: true, human: true }])
        .sort(function (a, b) { return b.elo - a.elo; });
      lbRows(el, all);
    }).catch(function () {});
  }
  lbRows(el, bots
    .concat([{ name: myName, elo: me.elo, you: true, human: true }])
    .sort(function (a, b) { return b.elo - a.elo; }));
}

// ---- online play (real-time, peer to peer) ---------------------------------
const roomBoxEl = document.getElementById('roomBox');
const roomStateEl = document.getElementById('roomState');
const roomLinkEl = document.getElementById('roomLink');
const joinCodeEl = document.getElementById('joinCode');
const netCardEl = document.getElementById('netCard');

let netSession = null;      // { cancel } for the active host/join/search
let onlineActive = false;   // a live game is running over the wire
let myColor = null;         // which side this browser controls
let oppLabel = null;        // what to show for the person on the other end

function netOnline() { return onlineActive && WCNET.connected(); }

function paintNetCard() {
  if (!netCardEl) return;
  if (!onlineActive) { netCardEl.style.display = 'none'; netCardEl.innerHTML = ''; return; }
  const live = WCNET.connected();
  const yourTurn = game.turn === myColor;
  netCardEl.style.display = 'flex';
  netCardEl.innerHTML =
    '<span class="nc-dot ' + (live ? 'live' : 'dead') + '"></span>' +
    '<span class="nc-body">' +
      '<span class="nc-name">' + esc(oppLabel || 'Opponent') + '</span>' +
      '<span class="nc-meta">' + (live
        ? ('You are ' + myColor + ' \u00b7 ' + (yourTurn ? 'your move' : 'their move'))
        : 'disconnected') + '</span>' +
    '</span>';
}

function showRoomBox(msg, link) {
  if (!roomBoxEl) return;
  roomBoxEl.classList.add('show');
  if (roomStateEl) roomStateEl.textContent = msg;
  if (roomLinkEl && link !== undefined) roomLinkEl.value = link;
}
function hideRoomBox() { if (roomBoxEl) roomBoxEl.classList.remove('show'); }

// Begin a networked game once the two peers are connected.
function startOnlineGame(isHost, label, forcedColor) {
  if (netSession && netSession.cancel && netSession.settled !== true) netSession.settled = true;
  onlineActive = true;
  activeBot = null;
  ratedGame = false;              // friendlies never touch your rating
  resultRecorded = false;
  myColor = forcedColor || (isHost ? 'white' : 'black');
  oppLabel = label || 'Online opponent';
  if (oppModeEl) oppModeEl.value = 'human';   // no local bot should ever move
  resetGameState();
  hideRoomBox();
  closeLobby();
  paintOppCard(); paintNetCard();
  refreshBotUI(); refreshShareUI();
  orientFor(myColor);
  applyTutorVisibility();
  runAnalysis(); sync(); render();
  WCSOUND.play('notify');
  // The host owns the opening position and tells the guest which side they got.
  WCNET.send({ t: 'hello', name: myName(), elo: WCLADDER.getProfile().elo });
  if (isHost) {
    WCNET.send({ t: 'start', state: WCSHARE.encode(game), youAre: myColor === 'white' ? 'black' : 'white' });
  }
}

// Push the move we just played to the other side.
function netBroadcast(gm) {
  if (!netOnline() || !gm) return;
  WCNET.send({ t: 'act', gm: gm, state: WCSHARE.encode(game) });
}

// Apply what the opponent sent. Trust their action, but verify against the
// position they claim to be in; on any mismatch, take their position as truth.
function netApply(msg) {
  if (!msg || !msg.t) return;
  if (msg.t === 'hello') {
    const nm = String(msg.name || '').slice(0, 16).replace(/[<>&]/g, '');
    oppLabel = nm || 'Anonymous';
    if (typeof msg.elo === 'number' && isFinite(msg.elo)) oppLabel += ' (' + Math.round(msg.elo) + ')';
    paintNetCard();
    return;
  }
  if (msg.t === 'start') {
    try { WCSHARE.decode(msg.state, game); } catch (e) {}
    if (msg.youAre === 'white' || msg.youAre === 'black') myColor = msg.youAre;
    quality.length = 0; anaKey = null;
    orientFor(myColor);
    runAnalysis(); sync(); render(); paintNetCard();
    return;
  }
  if (msg.t === 'act') {
    if (msg.gm) gameActs.push(msg.gm);
    let ok = false;
    try { ok = WCAI.applyToGame(game, msg.gm); } catch (e) { ok = false; }
    if (ok && msg.state && WCSHARE.encode(game) !== msg.state) ok = false;
    if (!ok) {
      try { WCSHARE.decode(msg.state, game); quality.length = 0; anaKey = null; }
      catch (e) { return; }
    }
    selected = null; legal = []; hintMove = null;
    setMode('normal');
    actionFX();
    runAnalysis(); sync(); render(); paintNetCard();
    return;
  }
  if (msg.t === 'resign') {
    endGame(myColor, 'resignation');
    return;
  }
  if (msg.t === 'drawoffer') {
    if (confirm('Your opponent offers a draw. Accept?')) {
      WCNET.send({ t: 'drawaccept' });
      endGame(null, 'agreement');
    } else {
      WCNET.send({ t: 'drawdecline' });
    }
    return;
  }
  if (msg.t === 'drawaccept') { endGame(null, 'agreement'); return; }
  if (msg.t === 'drawdecline') { ui.hint.textContent = 'Draw declined.'; return; }
}

function netHandlers(labelWhenJoined) {
  return {
    onOpen: function (info) {
      showRoomBox('Room open \u2014 send this link to your friend. Waiting for them to join\u2026', info.link);
    },
    onPeer: function (info) {
      let color;
      if (info.host) {
        const pick = document.getElementById('roomSide');
        const want = pick ? pick.value : 'random';
        color = want === 'random' ? (Math.random() < 0.5 ? 'white' : 'black') : want;
      }
      startOnlineGame(info.host, labelWhenJoined, color);
    },
    onData: netApply,
    onClose: function () {
      onlineActive = false; paintNetCard();
      ui.hint.textContent = 'Your opponent disconnected.';
    },
    onError: function (e) {
      showRoomBox('Could not connect: ' + (e && e.message ? e.message : 'unknown error') +
                  '. Check the code, or try again.', roomLinkEl ? roomLinkEl.value : '');
    },
  };
}

function hostRoom() {
  if (!WCNET.available()) {
    showRoomBox('Online play needs the network library, which failed to load. Check your connection and reload.', '');
    return;
  }
  if (netSession && netSession.cancel) netSession.cancel();
  showRoomBox('Opening a room\u2026', '');
  netSession = WCNET.host(netHandlers('Your friend'));
}

function joinRoom(code) {
  if (!WCNET.available() || !code) return;
  if (netSession && netSession.cancel) netSession.cancel();
  showRoomBox('Connecting to ' + code + '\u2026', '');
  netSession = WCNET.join(code, netHandlers('Your friend'));
}

const copyRoomBtn = document.getElementById('copyRoom');
const joinRoomBtn = document.getElementById('joinRoom');
const cancelRoomBtn = document.getElementById('cancelRoom');
if (copyRoomBtn) copyRoomBtn.addEventListener('click', async function () {
  if (!roomLinkEl || !roomLinkEl.value) return;
  try { await navigator.clipboard.writeText(roomLinkEl.value); copyRoomBtn.textContent = 'Copied'; }
  catch (e) { roomLinkEl.select(); copyRoomBtn.textContent = 'Ctrl+C'; }
  setTimeout(function () { copyRoomBtn.textContent = 'Copy'; }, 1600);
});
if (joinRoomBtn) joinRoomBtn.addEventListener('click', function () {
  joinRoom((joinCodeEl.value || '').trim().toLowerCase());
});
if (cancelRoomBtn) cancelRoomBtn.addEventListener('click', function () {
  if (netSession && netSession.cancel) netSession.cancel();
  netSession = null; hideRoomBox();
});


// ---- appearance -----------------------------------------------------------
const themeBoardEl = document.getElementById('themeBoard');
const themePiecesEl = document.getElementById('themePieces');
const themeHintEl = document.getElementById('themeHint');

function initAppearance() {
  if (!themeBoardEl || !themePiecesEl) return;
  const cur = WCTHEME.get();
  themeBoardEl.innerHTML = Object.entries(WCTHEME.BOARD_THEMES)
    .map(function (kv) { return '<option value="' + kv[0] + '"' + (kv[0] === cur.board ? ' selected' : '') + '>' + kv[1].name + '</option>'; })
    .join('');
  themePiecesEl.innerHTML = Object.entries(PIECE_SETS)
    .map(function (kv) { return '<option value="' + kv[0] + '"' + (kv[0] === cur.pieces ? ' selected' : '') + '>' + kv[1].name + '</option>'; })
    .join('');
  paintThemeHint();
  themeBoardEl.addEventListener('change', applyAppearance);
  themePiecesEl.addEventListener('change', applyAppearance);
}

function paintThemeHint() {
  if (!themeHintEl) return;
  const t = WCTHEME.BOARD_THEMES[WCTHEME.get().board];
  themeHintEl.textContent = t ? t.desc : '';
}

function applyAppearance() {
  WCTHEME.apply(themeBoardEl.value, themePiecesEl.value);
  paintThemeHint();
  render();
  if (typeof revActs !== 'undefined' && revActs.length &&
      profileEl.classList.contains('show') && profReviewEl.classList.contains('show')) {
    revSeek(revPos);                   // repaint the review board in the new skin
  }
}
initAppearance();

// ---- accounts and cloud sync ----------------------------------------------
// All optional. With no Supabase keys configured every call here is a no-op and
// the game keeps using local ratings and peer-to-peer matchmaking.
const authBtn = document.getElementById('authBtn');
const authStateEl = document.getElementById('authState');
let cloudReady = false;

function paintAuth() {
  if (!authBtn) return;
  if (!WCCLOUD.configured()) {          // no backend deployed
    authBtn.style.display = 'none';
    if (authStateEl) authStateEl.textContent = '';
    return;
  }
  authBtn.style.display = '';
  const u = WCCLOUD.currentUser();
  if (!u && !WCCLOUD.hasGoogle()) authBtn.textContent = 'Sign in with email';
  if (u) {
    authBtn.textContent = 'Sign out';
    if (authStateEl) {
      const who = (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || u.email || 'signed in';
      authStateEl.textContent = esc(who) + ' \u00b7 rating synced';
    }
  } else {
    authBtn.textContent = WCCLOUD.hasGoogle() ? 'Sign in with Google' : 'Sign in with email';
    if (authStateEl) authStateEl.textContent = 'Rating is saved on this device only';
  }
}

// On sign-in the cloud profile is authoritative; if the account is brand new we
// seed it from whatever was already on this device.
async function syncProfileDown() {
  if (!WCCLOUD.enabled() || !WCCLOUD.currentUser()) return;
  let remote = null;
  try {
    remote = await WCCLOUD.loadProfile();
    const local = WCLADDER.getProfile();
    if (remote) {
      WCLADDER.saveProfile({
        name: remote.name || local.name,
        elo: remote.elo,
        wins: remote.wins, losses: remote.losses, draws: remote.draws,
        dob: remote.dob || local.dob, chessLevel: remote.chess_level || local.chessLevel,
        log: local.log || [],
      });
    } else {
      await WCCLOUD.saveProfile(local);
    }
  } catch (e) { console.warn('[cloud] sync down failed:', e && e.message); }
  paintProfile(); renderLeaderboard();
  maybeOnboard(remote);
}

// ---- post-sign-in onboarding ----------------------------------------------
// Once per account: display name, date of birth, and chess familiarity. The
// familiarity answer seeds the starting rating (the ladder is calibrated, so
// "rated player" starting at 500 would stomp the gutter bots for ten games).
const OB_SEED = { new: 350, casual: 500, club: 800, rated: 1100 };
const obEl = document.getElementById('onboard');
const OBSKIP = 'wildcardchess.onboard.v1';

function maybeOnboard(remote) {
  if (!obEl || !WCCLOUD.currentUser()) return;
  const local = WCLADDER.getProfile();
  const done = (remote && remote.chess_level) || local.chessLevel;
  let skipped = false;
  try { skipped = localStorage.getItem(OBSKIP) === '1'; } catch (e) {}
  if (done || skipped) return;
  const dobEl = document.getElementById('obDob');
  if (dobEl && !dobEl.max) dobEl.max = new Date().toISOString().slice(0, 10);
  const nameEl = document.getElementById('obName');
  if (nameEl && !nameEl.value) {
    const u = WCCLOUD.currentUser();
    nameEl.value = (local.name && local.name !== 'You') ? local.name
      : ((u.email || '').split('@')[0] || '').slice(0, 16);
  }
  obEl.classList.add('show');
}

bindClick('obSkip', function () {
  try { localStorage.setItem(OBSKIP, '1'); } catch (e) {}
  obEl.classList.remove('show');
});
bindClick('obSave', function () {
  const p = WCLADDER.getProfile();
  const name = (document.getElementById('obName').value || '').trim().slice(0, 16);
  const dob = document.getElementById('obDob').value || '';
  const level = document.getElementById('obLevel').value || '';
  if (!level) { document.getElementById('obMsg').textContent = 'Pick your chess level — it sets your starting rating.'; return; }
  if (name) p.name = name;
  if (dob) p.dob = dob;
  p.chessLevel = level;
  // seed the rating only for fresh accounts — never clobber earned Elo
  if ((p.wins + p.losses + p.draws) === 0 && OB_SEED[level]) p.elo = OB_SEED[level];
  WCLADDER.saveProfile(p);
  try { localStorage.setItem(OBSKIP, '1'); } catch (e) {}
  obEl.classList.remove('show');
  paintProfile(); renderLeaderboard();
  syncProfileUp();
});
if (obEl) obEl.addEventListener('click', function (e) { if (e.target === obEl) obEl.classList.remove('show'); });

function syncProfileUp() {
  if (!WCCLOUD.enabled() || !WCCLOUD.currentUser()) return;
  WCCLOUD.saveProfile(WCLADDER.getProfile());
}

// A proper sign-in surface: Google when the project has it, an email
// magic-link either way. No prompt() dialogs anywhere.
const authModalEl = document.getElementById('authModal');
const googleBtn = document.getElementById('googleBtn');
const emailInput = document.getElementById('emailInput');
const emailSend = document.getElementById('emailSend');
const authMsgEl = document.getElementById('authMsg');

function openAuthModal() {
  if (!authModalEl) return;
  if (googleBtn) googleBtn.style.display = WCCLOUD.hasGoogle() ? '' : 'none';
  if (authMsgEl) authMsgEl.textContent = "We'll email you a one-tap sign-in link. No password.";
  if (emailSend) { emailSend.disabled = false; emailSend.textContent = 'Send link'; }
  authModalEl.classList.add('show');
  if (!WCCLOUD.hasGoogle() && emailInput) setTimeout(function () { emailInput.focus(); }, 60);
}
function closeAuthModal() { if (authModalEl) authModalEl.classList.remove('show'); }

if (authBtn) authBtn.addEventListener('click', async function () {
  if (!WCCLOUD.enabled()) return;
  if (WCCLOUD.currentUser()) { await WCCLOUD.signOut(); paintAuth(); return; }
  openAuthModal();
});

if (googleBtn) googleBtn.addEventListener('click', async function () {
  googleBtn.disabled = true;
  await WCCLOUD.signIn();               // navigates away to Google
});

async function sendEmailLink() {
  const email = (emailInput.value || '').trim();
  if (!email || email.indexOf('@') < 1) {
    authMsgEl.textContent = 'That does not look like an email address.';
    emailInput.focus();
    return;
  }
  emailSend.disabled = true; emailSend.textContent = 'Sending\u2026';
  const r = await WCCLOUD.signInWithEmail(email);
  if (r.ok) {
    authMsgEl.textContent = 'Sent. Open the link in your email \u2014 it signs you in right here.';
    emailSend.textContent = 'Sent \u2713';
  } else {
    authMsgEl.textContent = 'Could not send: ' + r.error;
    emailSend.disabled = false; emailSend.textContent = 'Send link';
  }
}
if (emailSend) emailSend.addEventListener('click', sendEmailLink);
if (emailInput) emailInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') sendEmailLink(); });
const closeAuthBtn = document.getElementById('closeAuth');
if (closeAuthBtn) closeAuthBtn.addEventListener('click', closeAuthModal);
if (authModalEl) authModalEl.addEventListener('click', function (e) { if (e.target === authModalEl) closeAuthModal(); });
WCCLOUD.onChange(function (u) { if (u) closeAuthModal(); });

// ---- welcome screen and tutorial ------------------------------------------
// Signed-out visitors land on a welcome screen with a real sign-in button
// (one tap to skip — no login wall). First-timers then get the walkthrough.
// Never shown when arriving on a room or game link: nothing gets between a
// player and their friend's game.
const welcomeEl = document.getElementById('welcome');
const TUTKEY = 'wildcardchess.tut.v1';
const tutSeen = function () { try { return localStorage.getItem(TUTKEY) === '1'; } catch (e) { return true; } };
const markTutSeen = function () { try { localStorage.setItem(TUTKEY, '1'); } catch (e) {} };

function closeWelcome() { if (welcomeEl) welcomeEl.classList.remove('show'); }
// Entering the site — via guest or a completed sign-in — owes first-timers the
// walkthrough, unskippably queued before anything else. The lobby follows it.
function enterSite() {
  closeWelcome();
  if (!tutSeen()) { markTutSeen(); WCTUT.open(openLobby); }
  else openLobby();
  updateAmbient();
}
function bindClick(id, fn) { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); }
bindClick('welcomeGuest', enterSite);
bindClick('welcomeSignin', function () { openAuthModal(); });
bindClick('welcomeHow', function () { WCTUT.open(updateAmbient); updateAmbient(); });
bindClick('howBtn', function () { WCTUT.open(updateAmbient); updateAmbient(); });

WCCLOUD.onChange(function (u) {
  if (u && welcomeEl && welcomeEl.classList.contains('show')) enterSite();
});

// The welcome screen must be there the instant the page paints — cloud init is
// an await away, so decide synchronously from supabase-js's cached session in
// localStorage. bootCloud corrects the guess if it was wrong.
const bootOnInvite = /[#&](room|g)=/.test(location.hash || '');
function hasCachedSession() {
  try {
    return Object.keys(localStorage).some(function (k) {
      return k.indexOf('sb-') === 0 && String(localStorage.getItem(k)).indexOf('access_token') >= 0;
    });
  } catch (e) { return false; }
}
if (!bootOnInvite && welcomeEl && !hasCachedSession()) { welcomeEl.classList.add('show'); updateAmbient(); }

(async function bootCloud() {
  try {
    cloudReady = await WCCLOUD.init();
  } catch (e) { cloudReady = false; }
  WCCLOUD.onChange(function () { paintAuth(); syncProfileDown(); });
  paintAuth();
  if (cloudReady && WCCLOUD.currentUser()) syncProfileDown();

  if (bootOnInvite) { closeWelcome(); return; }
  if (WCCLOUD.currentUser()) {
    // already signed in: skip the welcome, but first-timers still get the tour
    closeWelcome();
    if (!tutSeen()) { markTutSeen(); WCTUT.open(openLobby); }
  } else if (welcomeEl) {
    const sb = document.getElementById('welcomeSignin');
    if (sb) sb.style.display = cloudReady ? '' : 'none';   // cloud down: guest only
    welcomeEl.classList.add('show');                       // cached-session guess was wrong
  }
})();

// ---- queue ----------------------------------------------------------------
const findBtn = document.getElementById('findMatch');
const searchStateEl = document.getElementById('searchState');
const searchLineEl = document.getElementById('searchLine');
const searchBandEl = document.getElementById('searchBand');
const cancelSearchBtn = document.getElementById('cancelSearch');
const matchFoundEl = document.getElementById('matchFound');
let cancelSearch = null;

function resetQueueUI() {
  if (findBtn) findBtn.style.display = '';
  if (searchStateEl) searchStateEl.classList.remove('show');
  if (matchFoundEl) matchFoundEl.classList.remove('show');
  if (cancelSearch) { cancelSearch(); cancelSearch = null; }
}

function beginSearch() {
  if (cancelSearch) return;
  const elo = WCLADDER.getProfile().elo;
  if (findBtn) findBtn.style.display = 'none';
  if (matchFoundEl) matchFoundEl.classList.remove('show');
  if (searchStateEl) searchStateEl.classList.add('show');
  if (searchLineEl) searchLineEl.textContent = 'Searching for an opponent\u2026';
  if (searchBandEl) searchBandEl.textContent = 'Looking near ' + elo;

  // Phase 0: if there is a backend and we are signed in, use the real queue.
  // It persists, so an opponent who queued minutes ago is still reachable.
  if (WCCLOUD.enabled() && WCCLOUD.currentUser() && WCNET.available()) {
    if (searchLineEl) searchLineEl.textContent = 'Searching the queue\u2026';
    cloudQueueSearch(elo);
    return;
  }

  // Phase 1: no backend, so look for a peer directly for 10 seconds.
  if (WCNET.available()) {
    if (searchLineEl) searchLineEl.textContent = 'Searching for a player\u2026';
    let handedOff = false;
    netSession = WCNET.findHuman(elo, 10000, {
      onTick: function (st) {
        if (!searchBandEl) return;
        searchBandEl.textContent = st.phase === 'waiting'
          ? 'Waiting in the ' + st.bucket + '+ queue\u2026'
          : 'Checking the ' + st.bucket + '+ queue\u2026';
      },
      onPeer: function (info) {
        if (handedOff) return;
        handedOff = true;
        cancelSearch = null;
        startOnlineGame(info.host, 'Online player');
      },
      onNoHuman: function () {
        if (handedOff) return;
        handedOff = true;
        netSession = null;
        if (searchLineEl) searchLineEl.textContent = 'No one online right now \u2014 finding you an opponent\u2026';
        searchPool(elo);
      },
    });
    cancelSearch = function () { if (netSession && netSession.cancel) netSession.cancel(); netSession = null; };
    return;
  }
  searchPool(elo);
}


// Look through the persistent queue for an opponent; publish ourselves if the
// queue is empty so the next person to search finds us. Falls through to the
// local pool if nothing turns up inside the budget.
async function cloudQueueSearch(elo) {
  let stopped = false;
  cancelSearch = function () { stopped = true; WCCLOUD.leaveQueue(); WCNET.destroy(); };

  try {
    const waiting = await WCCLOUD.findWaiting(elo, 250);
    if (stopped) return;

    if (waiting && waiting.peer_id) {
      // Someone is already waiting: connect straight to them.
      netSession = WCNET.join(waiting.peer_id, netHandlers('Online player'));
      await WCCLOUD.leaveQueue();
      return;
    }

    // Nobody waiting. Advertise ourselves and hold the slot.
    const mySession = WCNET.host(Object.assign(netHandlers('Online player'), {
      onOpen: async function (info) {
        if (stopped) return;
        await WCCLOUD.joinQueue(elo, 'wcxr-' + info.code);
        if (searchBandEl) searchBandEl.textContent = 'Waiting in the queue\u2026';
      },
    }));
    netSession = mySession;

    setTimeout(async function () {
      if (stopped || onlineActive) return;
      await WCCLOUD.leaveQueue();
      if (mySession && mySession.cancel) mySession.cancel();
      netSession = null;
      if (searchLineEl) searchLineEl.textContent = 'No one in the queue \u2014 finding you an opponent\u2026';
      searchPool(elo);
    }, 10000);
  } catch (e) {
    console.warn('[cloud] queue search failed:', e && e.message);
    if (!stopped) searchPool(elo);
  }
}

// Phase 2: fall back to the resident pool.
function searchPool(elo) {
  cancelSearch = WCMATCH.find(elo, {
    onTick: function (st) {
      if (searchBandEl) {
        searchBandEl.textContent = 'Rating range ' + Math.max(100, elo - st.band) + '\u2013' + (elo + st.band);
      }
      if (searchLineEl && st.ticks >= 3) {
        searchLineEl.textContent = WCMATCH.hasHumans()
          ? 'Still searching\u2026 widening the range'
          : 'Widening the range\u2026';
      }
    },
    onFound: function (opp, isHuman) {
      cancelSearch = null;
      showFound(opp, isHuman);
    },
  });
}

function showFound(opp, isHuman) {
  if (searchStateEl) searchStateEl.classList.remove('show');
  if (matchFoundEl) {
    document.getElementById('mfIco').textContent = opp.emoji || '\u265f';
    document.getElementById('mfName').textContent = opp.name;   // textContent: safe
    document.getElementById('mfMeta').textContent = isHuman ? 'online player' : opp.style;
    document.getElementById('mfElo').textContent = opp.elo;
    matchFoundEl.classList.add('show');
  }
  WCSOUND.play('notify');
  // short beat so the match-found card is actually readable
  setTimeout(function () { startMatch(opp.id); }, 900);
}

if (findBtn) findBtn.addEventListener('click', beginSearch);
if (cancelSearchBtn) cancelSearchBtn.addEventListener('click', resetQueueUI);
function closeLobby() { if (cancelSearch) { cancelSearch(); cancelSearch = null; } lobbyEl.classList.remove('show'); updateAmbient(); }

// Start a fresh rated game against a ladder bot. You are White, the bot is Black.
function startMatch(botId) {
  if (netSession && netSession.cancel) { netSession.cancel(); netSession = null; }
  WCNET.destroy(); onlineActive = false; myColor = null;
  activeBot = WCLADDER.liveBot(botId);
  ratedGame = !!activeBot;
  resultRecorded = false;
  if (oppModeEl) oppModeEl.value = 'bot';
  // Ranked games assign colours like a real pairing would, so you play both sides.
  if (botSideEl) botSideEl.value = Math.random() < 0.5 ? 'black' : 'white';
  resetGameState();
  closeLobby();
  paintOppCard();
  orientFor(botSide() === 'white' ? 'black' : 'white');
  applyTutorVisibility();
  refreshBotUI(); refreshShareUI();
  runAnalysis(); sync(); render();
  maybeAI();
}

// Start an unrated mode: 'hotseat' (same screen) or 'link' (send a link).
function startCasual(kind) {
  if (netSession && netSession.cancel) { netSession.cancel(); netSession = null; }
  WCNET.destroy(); onlineActive = false; myColor = null;
  activeBot = null; ratedGame = false; resultRecorded = false;
  if (oppModeEl) oppModeEl.value = (kind === 'hotseat') ? 'human' : 'link';
  resetGameState();
  closeLobby();
  paintOppCard();
  flipped = false;
  applyTutorVisibility();
  refreshBotUI(); refreshShareUI();
  runAnalysis(); sync(); render();
}

function resetGameState() {
  aiGen++;                   // invalidate any bot move still sitting on a timer
  aiThinking = false;
  endSounded = false;
  WCSOUND.setAmbient(false); // a game is starting: the menu tune stops NOW
  game.reset();
  game.endReason = null;
  paintNetCard();
  selected = null; legal = []; hintMove = null;
  quality.length = 0; anaKey = null; linkPending = false; gameActs = [];
  if (shareLinkEl) shareLinkEl.value = '';
  history.replaceState(null, '', location.pathname + location.search);
  ui.banner.classList.remove('show');
  setMode('normal');
}

// Score a finished rated game exactly once and return the rating change.
function settleResult() {
  if (resultRecorded || !gameOver()) return null;
  if (!ratedGame || !activeBot) {
    // Friendly: no rating change, but still worth keeping for review.
    if (gameActs.length) {
      resultRecorded = true;
      const me = onlineActive ? myColor : (botEnabled() ? (botSide() === 'white' ? 'black' : 'white') : 'white');
      WCLADDER.recordCasual({
        botName: onlineActive ? (oppLabel || 'Online player') : 'Friendly game',
        score: game.winner === me ? 1 : (game.winner ? 0 : 0.5),
        acts: gameActs.slice(), youColor: me,
        reason: game.endReason || game.status, plies: game.history.length,
      });
    }
    return null;
  }
  resultRecorded = true;
  const botColor = botSide();
  const youColor = botColor === 'white' ? 'black' : 'white';
  const score = game.winner === youColor ? 1 : (game.winner === botColor ? 0 : 0.5);
  const r = WCLADDER.recordResult(activeBot.id, score, {
    acts: gameActs.slice(),
    youColor: youColor,
    reason: game.endReason || game.status,
    plies: game.history.length,
  });
  paintProfile(); paintOppCard(); renderLeaderboard();
  syncProfileUp();
  return r;
}

const openLobbyBtn = document.getElementById('openLobby');
const closeLobbyBtn = document.getElementById('closeLobby');

if (openLobbyBtn) openLobbyBtn.addEventListener('click', openLobby);
if (closeLobbyBtn) closeLobbyBtn.addEventListener('click', closeLobby);
document.querySelectorAll('.mode-card').forEach(function (el) {
  el.addEventListener('click', function () {
    const kind = el.dataset.lobbymode;
    if (kind === 'online') { hostRoom(); return; }
    startCasual(kind);
  });
});
if (lobbyEl) lobbyEl.addEventListener('click', function (e) { if (e.target === lobbyEl) closeLobby(); });


// ---- profile and game review ----------------------------------------------
const profileEl = document.getElementById('profile');
const matchListEl = document.getElementById('matchList');
const profListEl = document.getElementById('profList');
const profReviewEl = document.getElementById('profReview');

function openProfile() { renderProfile(); showMatchList(); profileEl.classList.add('show'); updateAmbient(); }
function closeProfile() { profileEl.classList.remove('show'); updateAmbient(); }
function showMatchList() { profListEl.style.display = ''; profReviewEl.classList.remove('show'); }
function showReview() { profListEl.style.display = 'none'; profReviewEl.classList.add('show'); }

function renderProfile() {
  const p = WCLADDER.getProfile();
  document.getElementById('profName').textContent = (p.name && p.name !== 'You') ? p.name : 'Your profile';
  document.getElementById('profElo').textContent = p.elo;
  const total = p.wins + p.losses + p.draws;
  const pct = total ? Math.round((p.wins / total) * 100) : 0;
  document.getElementById('profSummary').textContent =
    total ? (total + ' games \u00b7 ' + p.wins + 'W ' + p.losses + 'L ' + p.draws + 'D \u00b7 ' + pct + '% won')
          : 'No games yet \u2014 play one and it will show up here.';
  const peak = (p.log || []).reduce(function (m, e) { return Math.max(m, e.after || 0); }, p.elo);
  document.getElementById('profPeak').textContent = 'peak ' + peak;

  if (!matchListEl) return;
  const log = p.log || [];
  if (!log.length) {
    matchListEl.innerHTML = '<div class="match-empty">Nothing here yet.</div>';
    return;
  }
  matchListEl.innerHTML = log.map(function (e, i) {
    const res = e.score === 1 ? 'win' : (e.score === 0 ? 'loss' : 'draw');
    const delta = (typeof e.after === 'number' && typeof e.before === 'number')
      ? (e.after - e.before) : null;
    const when = new Date(e.at).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    const canReview = !!(e.acts && e.acts.length);
    return '<button class="match-row ' + res + '" data-idx="' + i + '"' + (canReview ? '' : ' disabled') + '>' +
      '<span class="mr-res ' + res + '">' + res.toUpperCase() + '</span>' +
      '<span class="mr-main">' +
        '<span class="mr-opp">' + esc(e.botName || 'Opponent') +
          (e.botElo ? ' <span class="mr-oelo">' + e.botElo + '</span>' : '') + '</span>' +
        '<span class="mr-meta">' + (e.reason || '') + (e.plies ? ' \u00b7 ' + e.plies + ' plies' : '') +
          (e.rated === false ? ' \u00b7 friendly' : '') + '</span>' +
      '</span>' +
      '<span class="mr-right">' +
        (delta !== null ? '<span class="mr-delta ' + (delta >= 0 ? 'up' : 'down') + '">' +
          (delta >= 0 ? '+' : '') + delta + '</span>' : '<span class="mr-delta">\u2014</span>') +
        '<span class="mr-when">' + when + '</span>' +
      '</span></button>';
  }).join('');
}

// ---- replay -----------------------------------------------------------------
let revGame = null, revActs = [], revPos = 0, revEvals = [], revQuality = [], revMoves = [];

function reviewMatch(idx) {
  const p = WCLADDER.getProfile();
  const entry = (p.log || [])[idx];
  if (!entry || !entry.acts || !entry.acts.length) return;

  revActs = entry.acts;
  revPos = 0;
  revEvals = [];
  revQuality = [];
  document.getElementById('reviewTitle').textContent =
    'vs ' + (entry.botName || 'Opponent') + ' \u00b7 ' +
    (entry.score === 1 ? 'you won' : entry.score === 0 ? 'you lost' : 'draw');

  // Replay from the start, scoring each position as we go.
  const g = new Game();
  const evals = [];
  let prevStm = null;
  const first = WCAN.analyse(g, 2, 260);
  evals.push(first.whiteScore);
  prevStm = first.stmScore;
  for (let i = 0; i < revActs.length; i++) {
    if (!WCAI.applyToGame(g, revActs[i])) break;
    const res = WCAN.analyse(g, 2, 260);
    evals.push(res.whiteScore);
    // grade the move that produced this position
    revQuality.push(WCAN.classify(WCAN.clamp(prevStm) - WCAN.clamp(-res.stmScore)));
    prevStm = res.stmScore;
  }
  revEvals = evals;
  revMoves = g.history.map(function (h) { return { text: h.text, color: h.color }; });

  const lw = [], lb = [];
  g.history.forEach(function (h, i) {
    const q = revQuality[i]; if (!q) return;
    (h.color === 'white' ? lw : lb).push(q.loss);
  });
  const aw = WCAN.accuracy(lw), ab = WCAN.accuracy(lb);
  document.getElementById('revAccuracy').textContent =
    'Accuracy \u00b7 White ' + (aw != null ? aw + '%' : '\u2013') + ' \u00b7 Black ' + (ab != null ? ab + '%' : '\u2013');

  revSeek(0);
  showReview();
}

// Rebuild the position at ply n and draw it.
function revSeek(n) {
  revPos = Math.max(0, Math.min(revActs.length, n));
  const g = new Game();
  for (let i = 0; i < revPos; i++) {
    if (!WCAI.applyToGame(g, revActs[i])) break;
  }
  revGame = g;
  drawReviewBoard(g);

  const ev = revEvals[revPos];
  if (typeof ev === 'number') {
    document.getElementById('revEvalFill').style.height = WCAN.evalToPct(ev) + '%';
    const numEl = document.getElementById('revEvalNum');
    numEl.textContent = WCAN.fmtScore(ev);
    numEl.className = 'evalbar-num ' + (ev >= 0 ? 'pos' : 'neg');
  }

  const info = document.getElementById('revMoveInfo');
  if (revPos === 0) {
    info.innerHTML = 'Start position';
  } else {
    const h = revMoves[revPos - 1];
    const q = revQuality[revPos - 1];
    info.innerHTML = '<b>' + revPos + '.</b> ' + esc(h ? h.text : '') +
      (q ? ' <span class="q q-' + q.key + '">' + q.mark + ' ' + q.label + '</span>' : '');
  }

  const logEl = document.getElementById('revLog');
  logEl.innerHTML = revMoves.map(function (h, i) {
    const q = revQuality[i];
    return '<div class="logline ' + h.color + (i === revPos - 1 ? ' cur' : '') +
      (i >= revPos ? ' ahead' : '') + '" data-ply="' + (i + 1) + '">' +
      '<span class="ln">' + (i + 1) + '.</span> <span class="mv">' + esc(h.text) + '</span>' +
      (q ? ' <span class="q q-' + q.key + '">' + q.mark + '</span>' : '') + '</div>';
  }).join('');
  const cur = logEl.querySelector('.cur');
  if (cur) cur.scrollIntoView({ block: 'nearest' });
}

// Minimal read-only renderer for the review board.
function drawReviewBoard(g) {
  const el = document.getElementById('revBoard');
  const b = g.bounds();
  const minC = b.minC, maxC = b.maxC, minR = b.minR, maxR = b.maxR;
  const cols = maxC - minC + 1, rows = maxR - minR + 1;
  el.setAttribute('viewBox', '-0.09 -0.09 ' + (cols + 0.18) + ' ' + (rows + 0.18));
  const X = function (c) { return c - minC; }, Y = function (r) { return maxR - r; };
  let svg = pieceDefs(WCTHEME.get().pieces);
  for (const k of g.cells) {
    const q = k.split(',').map(Number);
    const light = (((q[0] + q[1]) % 2) + 2) % 2 === 1;
    svg += '<rect x="' + X(q[0]) + '" y="' + Y(q[1]) + '" width="1" height="1" class="sq ' + (light ? 'lt' : 'dk') + '"/>';
  }
  for (const [k, pc] of g.board) {
    const q = k.split(',').map(Number);
    svg += '<use href="#' + symFor(pc.type) + '" x="' + X(q[0]) + '" y="' + Y(q[1]) +
           '" width="1" height="1" class="pc ' + (pc.color === 'white' ? 'w' : 'b') + '"/>';
  }
  el.innerHTML = svg;
}

if (matchListEl) matchListEl.addEventListener('click', function (e) {
  const row = e.target.closest('.match-row');
  if (row && !row.disabled) reviewMatch(+row.dataset.idx);
});
const bind = function (id, fn) { const el = document.getElementById(id); if (el) el.addEventListener('click', fn); };
bind('openProfile', function () { closeLobby(); openProfile(); });
bind('openProfileTop', openProfile);
bind('closeProfile', closeProfile);
bind('reviewBack', showMatchList);
const revLogEl = document.getElementById('revLog');
if (revLogEl) revLogEl.addEventListener('click', function (e) {
  const row = e.target.closest('.logline');
  if (row && row.dataset.ply) revSeek(+row.dataset.ply);
});
bind('revFirst', function () { revSeek(0); });
bind('revPrev', function () { revSeek(revPos - 1); });
bind('revNext', function () { revSeek(revPos + 1); });
bind('revLast', function () { revSeek(revActs.length); });
bind('clearHistory', function () {
  if (confirm('Delete your game history? Your rating is kept.')) { WCLADDER.clearHistory(); renderProfile(); }
});
if (profileEl) profileEl.addEventListener('click', function (e) { if (e.target === profileEl) closeProfile(); });
document.addEventListener('keydown', function (e) {
  if (!profileEl.classList.contains('show') || !profReviewEl.classList.contains('show')) return;
  if (e.key === 'ArrowLeft') { revSeek(revPos - 1); e.preventDefault(); }
  if (e.key === 'ArrowRight') { revSeek(revPos + 1); e.preventDefault(); }
});

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
  // A room link pasted into an already-open tab only changes the hash, so the
  // boot-time join never runs. Pick it up here.
  try {
    const room = WCNET.roomFromLocation();
    if (room) { openLobby(); joinRoom(room); return; }
  } catch (e) {}
  try {
    if (!WCSHARE.fromLocation(game)) return;
    selected = null; legal = []; hintMove = null;
    quality.length = 0; anaKey = null; linkPending = false; gameActs = [];
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
  movecell: 'Click an empty square to lift it, then a dashed spot to place it.',
};
function setMode(m) {
  mode = m; selected = null; legal = [];
  for (const b of document.querySelectorAll('.wild-btn')) b.classList.toggle('active', b.dataset.mode === m);
  if (m === 'normal') ui.hint.textContent = game.canWildcard()
    ? '✦ Board turn — move a piece, or click an empty square to lift it.'
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
  endSounded = false;
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
  // board turns look different from across the room: the whole board glows
  document.body.classList.toggle('wild-turn', eligible && !gameOver());

  ui.state.textContent = game.status === 'check' ? 'Check!' : '';
  ui.state.style.display = game.status === 'check' ? 'inline-flex' : 'none';

  setMode('normal');
  renderLog();
  const over = gameOver();
  if (resignBtn) resignBtn.disabled = over;
  if (drawBtn) drawBtn.disabled = over;

  if (gameOver()) {
    applyTutorVisibility();
    if (!endSounded) {
      endSounded = true;
      if (!game.winner) WCSOUND.play('draw');
      else if (botEnabled() || onlineActive) WCSOUND.play(game.winner === localColor() ? 'win' : 'lose');
      else WCSOUND.play('win');            // hotseat: somebody at this screen won
    }
    const r = settleResult();
    const reason = game.endReason;
    let text;
    if (reason === 'resignation') {
      text = (game.winner === 'white' ? 'White' : 'Black') + ' wins by resignation';
    } else if (reason === 'agreement') {
      text = 'Draw agreed';
    } else {
      text = game.status === 'checkmate'
        ? ('Checkmate \u2014 ' + (game.winner === 'white' ? 'White' : 'Black') + ' wins')
        : (game.status === 'repetition' ? 'Draw by repetition'
          : game.status === 'fifty' ? 'Draw \u2014 50-move rule' : 'Stalemate \u2014 draw');
    }
    if (r) {
      const sign = r.delta >= 0 ? '+' : '';
      text += '  \u00b7  ' + r.before + ' \u2192 ' + r.after + ' (' + sign + r.delta + ')';
    }
    ui.bannerText.textContent = text;
    ui.banner.classList.add('show');
  }
  updateAmbient();
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
applyTutorVisibility();
runAnalysis();
sync();
render();
refreshBotUI();
refreshShareUI();
const bootRoom = (typeof WCNET !== 'undefined' && WCNET.roomFromLocation) ? WCNET.roomFromLocation() : null;
if (bootRoom) {
  openLobby();
  joinRoom(bootRoom);
} else if (!bootedFromLink) {
  // the welcome screen owns the first paint; enterSite() opens the lobby after
  const w = document.getElementById('welcome');
  if (!w || !w.classList.contains('show')) openLobby();
}
if (bootedFromLink && shareMsgEl) shareMsgEl.textContent = "Your friend's move is loaded. Your turn.";
if (!bootedFromLink) maybeAI();
