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
  let hinted = false;           // asked for a hint on this puzzle
  let startedAt = 0;
  let lastSettle = null;        // the rating game this attempt produced, if any
  let cloudRatings = {};        // puzzle id -> live rating from the server

  function attach(h) { host = h; }

  // ---- progress (local only; puzzles are practice, not rating) ------------
  const FRESH = () => ({ solved: {}, streak: 0, best: 0, rating: 1000, rated: {} });
  function readProgress() {
    try {
      const p = JSON.parse(localStorage.getItem(KEY)) || FRESH();
      if (!p.rated) p.rated = {};
      if (!(p.rating > 0)) p.rating = 1000;
      return p;
    } catch (e) { return FRESH(); }
  }
  function writeProgress(p) { try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) {} }
  function progress() { return readProgress(); }

  async function load() {
    if (all.length) return all;
    const res = await fetch(DATA_URL, { cache: 'no-cache' });
    if (!res.ok) throw new Error('puzzle set not found (' + res.status + ')');
    const j = await res.json();
    all = order((j.puzzles || []).slice());
    return all;
  }

  // Sorting strictly easiest-first meant every mate-in-1 came before any
  // mate-in-2 — eight identical-feeling puzzles before the first real one. So
  // the tiers are interleaved in proportion: within a tier, fewer pieces
  // first; across tiers, spread evenly, so the difficulty climbs rather than
  // steps.
  function order(list) {
    const tiers = {};
    for (const p of list) (tiers[p.mateIn] = tiers[p.mateIn] || []).push(p);
    const keys = Object.keys(tiers).map(Number).sort((a, b) => a - b);
    for (const k of keys) tiers[k].sort((a, b) => Object.keys(a.pieces).length - Object.keys(b.pieces).length);
    const out = [];
    const total = list.length;
    const taken = {};
    for (let i = 0; i < total; i++) {
      // pick the tier furthest behind its fair share so far
      let best = null, bestGap = -Infinity;
      for (const k of keys) {
        const done = taken[k] || 0;
        if (done >= tiers[k].length) continue;
        const gap = (i + 1) * (tiers[k].length / total) - done;
        if (gap > bestGap) { bestGap = gap; best = k; }
      }
      out.push(tiers[best][taken[best] = (taken[best] || 0) + 1, taken[best] - 1]);
    }
    // ...but always open on the gentlest tier, whatever the proportions say
    const first = out.findIndex((p) => p.mateIn === keys[0]);
    if (first > 0) { const t = out[0]; out[0] = out[first]; out[first] = t; }
    return out;
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
    idx = i; step = 0; failed = false; finished = false; hinted = false;
    lastSettle = null; startedAt = Date.now();
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

  // ---- rating -------------------------------------------------------------
  // Two ratings play each other, chess.com-style. Yours starts at 1000; each
  // puzzle's starts at a seed computed offline and drifts as people attempt it
  // (that part lives on the server — see sql/puzzles.sql). An attempt is rated
  // ONCE, at its first decisive moment: a wrong move or a hint is a loss, a
  // clean finish is a win. Later attempts at the same puzzle change nothing,
  // so nothing can be farmed. When signed out the same maths runs locally
  // against the seed; when signed in the server's answer overwrites it.
  const K_PLAYER = 32;
  const ratingOf = (p) => (p && (cloudRatings[p.id] || p.rating)) || 1000;
  const rating = () => readProgress().rating;
  function setRating(n) { if (n > 0) { const pr = readProgress(); pr.rating = Math.round(n); writeProgress(pr); } }
  function setPuzzleRatings(map) { cloudRatings = map || {}; }
  function setPuzzleRating(id, r) { if (id && r > 0) cloudRatings[id] = r; }

  function settle(score) {
    const p = current();
    if (!p) return null;
    const pr = readProgress();
    if (pr.rated[p.id]) return null;                    // first attempt only
    const rp = pr.rating, rq = ratingOf(p);
    const expected = 1 / (1 + Math.pow(10, (rq - rp) / 400));
    const delta = Math.round(K_PLAYER * (score - expected));
    pr.rating = Math.max(100, rp + delta);
    pr.rated[p.id] = { score, at: Date.now() };
    writeProgress(pr);
    lastSettle = {
      puzzleId: p.id, seed: p.rating || 1000, score, delta,
      rating: pr.rating, puzzleRating: rq,
      solved: score === 1, clean: !failed, hinted, ms: Date.now() - startedAt,
    };
    return lastSettle;
  }

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
      return { ok: false, state: 'wrong', message: missMessage(action, want), rated: settle(0) };
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
    // a clean, unhinted solve is the win; anything else already settled as a loss
    const rated = (!failed && !hinted) ? settle(1) : null;
    return { ok: true, state: 'solved', message: 'Checkmate. Puzzle solved.', rated };
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
    hinted = true;
    const rated = settle(0);                              // the first hint is the loss; null after
    if (level <= 1) {
      return { text: want.kind === 'm' ? 'It is a piece move.' : 'It is a board move — a square of the world has to move.', rated };
    }
    if (level === 2) {
      const at = want.cell || want.from;
      return { text: 'It starts at ' + sq(at.c, at.r) + '.', rated };
    }
    return { reveal: want, rated };
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
      // the account's rating is authoritative once it has one
      rating: remote.rating > 0 ? remote.rating : local.rating,
      rated: Object.assign({}, remote.rated || {}, local.rated || {}),
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
      hinted, rating: readProgress().rating, puzzleRating: ratingOf(p),
      settle: lastSettle,
      alreadyRated: !!readProgress().rated[p.id],
    };
  }

  window.WCPUZZLE = {
    attach, load, list, count, start, startById, next, nextUnsolved,
    current, active, expected, submit, playReply, hint, state, progress, mergeProgress, exit,
    rating, setRating, ratingOf, setPuzzleRatings, setPuzzleRating,
    actionText, sameAction, retry: function () { const p = current(); if (p) { step = 0; failed = true; finished = false; hinted = false; place(p); } },
  };
})();
