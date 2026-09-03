// Hollow Chess — puzzle mode.
//
// A puzzle is a position plus a PROVEN line: at every one of your turns
// exactly one action forces mate, so any deviation is simply wrong and the
// mode can grade you without an engine in the browser. The proof is done
// offline by harness/compose-puzzles.js against the full-width solver, and
// re-checked by harness/verify-puzzles.js — nothing here re-derives it, which
// is why puzzle mode costs nothing to run on a phone.
//
// The stored line is a single principal variation. That is sufficient BECAUSE
// of uniqueness: your move is either the one solution or a mistake, and the
// replies are ours to choose. The defence stored is the toughest one found.
//
// Exposed as window.WCPUZZLE.

(function () {
  'use strict';

  const KEY = 'hollowchess.puzzles.v1';
  // The service worker is cache-first for everything except navigations, on the
  // assumption that every static carries a ?v=. An unversioned puzzle set would
  // therefore be frozen in the cache forever — a new set would never reach
  // anyone who had already visited. So take the version off this script's own
  // src, and one bump in index.html ships new puzzles along with everything else.
  const VER = (function () {
    try {
      const src = (document.currentScript && document.currentScript.src) || '';
      const q = src.indexOf('?');
      return q >= 0 ? src.slice(q) : '';
    } catch (e) { return ''; }
  })();
  const DATA_URL = 'js/puzzle-data.json' + VER;

  let all = [];                 // loaded puzzle set
  let idx = -1;                 // index of the puzzle being solved
  let step = 0;                 // how many of MY actions have landed
  let host = null;              // { game, render, sync, onState }
  let failed = false;           // missed at least once on this puzzle
  let finished = false;

  function attach(h) { host = h; }

  // ---- progress (local only; puzzles are practice, not rating) ------------
  function readProgress() {
    try { return JSON.parse(localStorage.getItem(KEY)) || { solved: {}, streak: 0, best: 0 }; }
    catch (e) { return { solved: {}, streak: 0, best: 0 }; }
  }
  function writeProgress(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {} }
  function progress() { return readProgress(); }

  async function load() {
    if (all.length) return all;
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('puzzle set not found (' + res.status + ')');
    const j = await res.json();
    all = (j.puzzles || []).slice();
    // easiest first: fewer moves, then fewer pieces to read
    all.sort((a, b) => (a.mateIn - b.mateIn) ||
      (Object.keys(a.pieces).length - Object.keys(b.pieces).length));
    return all;
  }

  const list = () => all;
  const count = () => all.length;
  const current = () => (idx >= 0 && idx < all.length ? all[idx] : null);
  const active = () => idx >= 0 && !!host;

  // ---- setting up the position -------------------------------------------
  // The ply phase is loaded, not just the pieces: board-turn eligibility is
  // every 3rd ply of the game, so a puzzle that forgets its phase is a
  // different puzzle — the wildcard would not even be legal.
  function place(p) {
    const g = host.game;
    g.cells.clear();
    g.board.clear();
    for (const k of p.cells) g.cells.add(k);
    for (const k of Object.keys(p.pieces)) {
      const v = p.pieces[k];
      g.board.set(k, { type: v[0], color: v[1], hasMoved: v[2] !== false });
    }
    g.turn = p.turn;
    g.moveCount = { white: Math.ceil(p.ply / 2), black: Math.floor(p.ply / 2) };
    g.history = [];
    g.winner = null;
    g.status = 'playing';
    g.halfmoveClock = 0;
    g.lastAction = null;
    g.epTarget = null;
    g.wildUsed = { white: 0, black: 0 };
    g.repCount = new Map();
    g.endReason = null;
    g._evaluate();
  }

  function start(i) {
    if (!host || i < 0 || i >= all.length) return null;
    idx = i; step = 0; failed = false; finished = false;
    place(all[i]);
    return all[i];
  }

  function startById(id) {
    const i = all.findIndex((p) => p.id === id);
    return i < 0 ? null : start(i);
  }

  // First unsolved puzzle, else the one after the last solved.
  function nextUnsolved() {
    const done = readProgress().solved;
    const i = all.findIndex((p) => !done[p.id]);
    return start(i >= 0 ? i : (idx + 1) % all.length);
  }
  function next() { return start((idx + 1) % Math.max(1, all.length)); }

  // ---- grading ------------------------------------------------------------
  const sameAction = (a, b) => !!a && !!b && a.kind === b.kind &&
    (a.cell ? (!!b.cell && a.cell.c === b.cell.c && a.cell.r === b.cell.r)
            : (!!b.from && !!b.to && a.from.c === b.from.c && a.from.r === b.from.r &&
               a.to.c === b.to.c && a.to.r === b.to.r));

  // The action I am expected to find right now.
  function expected() {
    const p = current();
    if (!p) return null;
    const s = p.line[step * 2];
    return s && s.by === 'solver' ? s.action : null;
  }
  // The reply that follows it.
  function reply() {
    const p = current();
    if (!p) return null;
    const s = p.line[step * 2 + 1];
    return s && s.by === 'defender' ? s.action : null;
  }

  function applyAction(a) {
    const g = host.game;
    if (a.kind === 'm') return g.makeMove(a.from.c, a.from.r, a.to.c, a.to.r);
    if (a.kind === 'mc') return g.wildcardMoveCell(a.from.c, a.from.r, a.to.c, a.to.r);
    if (a.kind === 'ac') return g.wildcardAddCell(a.cell.c, a.cell.r);
    if (a.kind === 'rc') return g.wildcardRemoveCell(a.cell.c, a.cell.r);
    return false;
  }

  // Called with the action the player just made ON the board. The caller has
  // already applied it, so a miss is undone by rebuilding the position and
  // replaying the line up to here — cheaper to reason about than an unmake,
  // and the line is at most five plies.
  function submit(action) {
    const p = current();
    if (!p || finished) return { ok: false, state: 'idle' };
    const want = expected();
    if (!sameAction(action, want)) {
      failed = true;
      rewind();
      return { ok: false, state: 'wrong', message: missMessage(action, want) };
    }
    step++;
    // Their reply is handed back rather than applied here, so the caller can
    // let your move be seen before the board answers. A position that changes
    // twice in one frame reads as a bug.
    const d = p.line[(step - 1) * 2 + 1];
    if (d && d.by === 'defender') {
      return { ok: true, state: 'continue', pendingReply: d.action,
               message: replyMessage(d.action), moves: p.mateIn - step };
    }
    finished = true;
    record(p, !failed);
    return { ok: true, state: 'solved', message: 'Checkmate. Puzzle solved.' };
  }

  // Rebuild the position and replay the confirmed part of the line.
  function rewind() {
    const p = current();
    place(p);
    for (let i = 0; i < step * 2; i++) applyAction(p.line[i].action);
  }

  function missMessage(got, want) {
    if (!got) return 'Not the move.';
    if (want && got.kind === 'm' && want.kind !== 'm') {
      return 'Not the move — and the answer is not a piece move at all. The board is yours this turn.';
    }
    if (want && got.kind !== 'm' && want.kind !== 'm') return 'Right idea, wrong square.';
    return 'Not the move.';
  }
  function replyMessage(a) {
    return a.kind === 'm' ? 'They reply.' : 'They reshape the board in reply.';
  }

  // ---- hints --------------------------------------------------------------
  // Graduated so a hint does not just hand over the answer: what KIND of
  // action, then where it starts, then the move itself.
  function hint(level) {
    const want = expected();
    if (!want) return null;
    if (level <= 1) {
      return want.kind === 'm' ? 'It is a piece move.' : 'It is a board move — a square of the world has to move.';
    }
    if (level === 2) {
      const at = want.cell || want.from;
      return 'It starts at ' + sq(at.c, at.r) + '.';
    }
    return { reveal: want };
  }

  function fileLabel(c) { return c >= 0 && c <= 25 ? String.fromCharCode(97 + c) : '(' + c + ')'; }
  function sq(c, r) { return fileLabel(c) + (r + 1); }
  function actionText(a) {
    if (!a) return '';
    if (a.kind === 'm') return sq(a.from.c, a.from.r) + '-' + sq(a.to.c, a.to.r);
    if (a.kind === 'mc') return sq(a.from.c, a.from.r) + '>' + sq(a.to.c, a.to.r);
    return (a.kind === 'ac' ? '+' : '×') + sq(a.cell.c, a.cell.r);
  }

  function record(p, clean) {
    const pr = readProgress();
    const first = !pr.solved[p.id];
    pr.solved[p.id] = { at: Date.now(), clean: clean && (!pr.solved[p.id] || pr.solved[p.id].clean !== false) };
    if (clean) { pr.streak = (pr.streak || 0) + 1; pr.best = Math.max(pr.best || 0, pr.streak); }
    else pr.streak = 0;
    writeProgress(pr);
    return first;
  }

  // ---- account sync ---------------------------------------------------------
  // Progress rides along with the cloud profile as one JSON blob, the way the
  // rating does. Merging is a union: a puzzle solved on either device stays
  // solved, the earliest solve wins its timestamp, a first-try solve anywhere
  // counts as clean, and best-streak is the max. Nothing is ever lost by
  // signing in from a second device.
  function mergeProgress(remote) {
    if (!remote || typeof remote !== 'object') return readProgress();
    const local = readProgress();
    const solved = Object.assign({}, local.solved || {});
    for (const id of Object.keys(remote.solved || {})) {
      const r = remote.solved[id], l = solved[id];
      if (!r || typeof r !== 'object') continue;
      if (!l) { solved[id] = { at: r.at | 0, clean: !!r.clean }; continue; }
      solved[id] = { at: Math.min(l.at || Infinity, r.at || Infinity) || 0, clean: !!(l.clean || r.clean) };
    }
    const merged = {
      solved,
      best: Math.max(local.best | 0, remote.best | 0),
      // the streak belongs to whichever side solved something more recently
      streak: latest(local) >= latest(remote) ? (local.streak | 0) : (remote.streak | 0),
    };
    writeProgress(merged);
    return merged;
  }
  function latest(p) {
    let t = 0;
    for (const id of Object.keys((p && p.solved) || {})) t = Math.max(t, (p.solved[id] && p.solved[id].at) | 0);
    return t;
  }

  // Apply the reply submit() handed back. Separate so the UI owns the timing.
  function playReply(a) { return applyAction(a); }

  function exit() { idx = -1; step = 0; finished = false; failed = false; }

  // Progress through the current puzzle, for the UI.
  function state() {
    const p = current();
    if (!p) return null;
    return {
      id: p.id, mateIn: p.mateIn, tags: p.tags || [],
      movesLeft: p.mateIn - step, step, failed, finished,
      index: idx, total: all.length,
      solved: !!readProgress().solved[p.id],
    };
  }

  window.WCPUZZLE = {
    attach, load, list, count, start, startById, next, nextUnsolved,
    current, active, expected, submit, playReply, hint, state, progress, mergeProgress, exit,
    actionText, sameAction, retry: function () { const p = current(); if (p) { step = 0; failed = true; finished = false; place(p); } },
  };
})();
