// Hollow Chess — puzzle solver / prover.
//
// Why this exists when js/ai.js already searches: ai.js CANNOT be used to
// verify a puzzle. Its wildcardMoves(K) candidate-prunes board actions to a
// top-K by static score — square-moves are only the top-4 sources paired with
// the top-4 targets. That is the right call for a game engine (the branching
// factor is otherwise hopeless) and the wrong one for a proof: a pruned
// defence turns an unsound line into a "mate", and a pruned alternative turns
// a position with two solutions into a "unique" puzzle. A puzzle is a claim
// about ALL moves, so the generator here is full-width and unpruned.
//
// It leans on engine.js as the rules authority rather than mirroring them, so
// a puzzle can never be proved against rules the game does not actually play.
// That costs speed (engine.js clones per legality probe) — acceptable, because
// proving happens offline in the harness, not in front of a player.
//
// Node: require('./solver.js'). Browser: window.WCSOLVE.

(function (root, factory) {
  // engine.js declares `class Game` at the top level of a classic script, which
  // makes it a global lexical binding — visible as `Game`, but never on window.
  const eng = (typeof module !== 'undefined' && module.exports)
    ? require('./engine.js')
    : { Game: (typeof Game !== 'undefined' ? Game : root.Game), WHITE: 'white', BLACK: 'black' };
  const api = factory(eng);
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.WCSOLVE = api;
})(typeof self !== 'undefined' ? self : this, function (ENG) {
  'use strict';
  const Game = ENG.Game;

  const parse = (k) => { const [c, r] = k.split(',').map(Number); return { c, r }; };
  const keyOf = (c, r) => c + ',' + r;

  // ---- state -------------------------------------------------------------
  // A structural clone. history/repCount are carried because the engine's
  // draw rules read them, and a puzzle that ignores repetition could "prove"
  // a mate the real game would have called a draw first.
  function clone(g) {
    const n = Object.create(Game.prototype);
    n.cells = new Set(g.cells);
    n.board = new Map();
    for (const [k, p] of g.board) n.board.set(k, { type: p.type, color: p.color, hasMoved: p.hasMoved });
    n.turn = g.turn;
    n.moveCount = { white: g.moveCount.white, black: g.moveCount.black };
    n.history = g.history.slice();
    n.winner = g.winner;
    n.status = g.status;
    n.halfmoveClock = g.halfmoveClock;
    n.lastAction = g.lastAction;
    n.epTarget = g.epTarget ? { c: g.epTarget.c, r: g.epTarget.r } : null;
    n.rules = g.rules;
    n.wildUsed = { white: g.wildUsed.white, black: g.wildUsed.black };
    n.repCount = new Map(g.repCount);
    n.endReason = g.endReason || null;
    return n;
  }

  // ---- full-width action generation --------------------------------------
  // Every legal action for the side to move: piece moves at full width, plus —
  // on a board turn — every legal square-move. No scoring, no top-K, no
  // "ignore far quiet removes". That completeness is the whole point.
  function allActions(g) {
    const out = [];
    if (g.winner || g.status === 'stalemate' || g.status === 'repetition' || g.status === 'fifty') return out;
    for (const [k, p] of g.board) {
      if (p.color !== g.turn) continue;
      const { c, r } = parse(k);
      for (const m of g.legalMoves(c, r)) out.push({ kind: 'm', from: { c, r }, to: { c: m.c, r: m.r } });
    }
    if (g.canWildcard()) {
      const acts = g.rules.actions;
      if (!acts || acts.mc !== false) {
        // Fast legality for square-moves. engine.js's _trial clones the piece
        // Map for every probe, which dominates everything else here — but a
        // square-move does not touch a single piece. Only `cells` changes, and
        // a Set delete+add is exactly reversible, so the check is: mutate,
        // ask if the mover's king is now attacked, put it back. Same question
        // _trial answers, ~40x cheaper, and the enumeration below is run
        // hundreds of times per node.
        const me = g.turn, them = me === 'white' ? 'black' : 'white';
        const kp = g.findKing(me);
        // Snapshot: the probe below mutates `cells` and puts the lifted key
        // back, and a re-added key lands at the END of a Set's iteration
        // order — iterating the live Set would visit it again, forever.
        const cellList = [...g.cells];
        for (const k of cellList) {
          if (g.board.has(k)) continue;                 // only EMPTY squares lift
          const f = parse(k);
          for (const tk of g._attachTargetsExcluding(k)) {
            g.cells.delete(k); g.cells.add(tk);
            // The king never moves during a square-move, so its square is fixed
            // — but the square under it could be the one being lifted, which is
            // impossible (it is occupied), so kp stays valid.
            const safe = !!kp && !g.isAttacked(kp.c, kp.r, them);
            g.cells.add(k); g.cells.delete(tk);
            if (safe) out.push({ kind: 'mc', from: f, to: parse(tk) });
          }
        }
      }
      if (acts && acts.ac === true) {
        for (const t of g.addTargets())
          if (g._trial(g.turn, () => g.cells.add(keyOf(t.c, t.r)))) out.push({ kind: 'ac', cell: t });
      }
      if (acts && acts.rc === true) {
        for (const k of [...g.cells]) {
          if (g.board.has(k) || g.cells.size <= 1) continue;
          if (g._trial(g.turn, () => g.cells.delete(k))) out.push({ kind: 'rc', cell: parse(k) });
        }
      }
    }
    return out;
  }

  function apply(g, a) {
    if (a.kind === 'm') return g.makeMove(a.from.c, a.from.r, a.to.c, a.to.r);
    if (a.kind === 'mc') return g.wildcardMoveCell(a.from.c, a.from.r, a.to.c, a.to.r);
    if (a.kind === 'ac') return g.wildcardAddCell(a.cell.c, a.cell.r);
    if (a.kind === 'rc') return g.wildcardRemoveCell(a.cell.c, a.cell.r);
    return false;
  }

  const isBoardAction = (a) => a && a.kind !== 'm';
  const sameAction = (a, b) => !!a && !!b && a.kind === b.kind &&
    (a.cell ? (b.cell && a.cell.c === b.cell.c && a.cell.r === b.cell.r)
            : (b.from && a.from.c === b.from.c && a.from.r === b.from.r &&
               a.to.c === b.to.c && a.to.r === b.to.r));

  // A finished game that is NOT mate — the defender surviving by any of these
  // has refuted the line just as surely as by escaping.
  const isDraw = (g) => g.status === 'stalemate' || g.status === 'repetition' || g.status === 'fifty';

  // ---- mate proving ------------------------------------------------------
  // Can the side to move force mate within `n` of its own moves? Returns the
  // first action found that does, or null. Nodes are counted so the harness
  // can report what a proof actually cost.
  let nodes = 0;
  // A budget, because composing means asking this question of positions that
  // turn out to have no mate at all, and "prove there is no mate in 3" is the
  // expensive direction. Callers that are searching set a cap and treat the
  // abort as "not a puzzle"; the harness verifying a finished set runs uncapped.
  let budget = Infinity;
  const ABORT = { abort: true };
  function forcesMate(g, n) {
    if (n <= 0) return null;
    for (const a of allActions(g)) {
      if (forcesMateWith(g, a, n)) return a;
    }
    return null;
  }

  // Does this specific action force mate within n?
  function forcesMateWith(g, a, n) {
    if (++nodes > budget) throw ABORT;
    const g2 = clone(g);
    if (!apply(g2, a)) return false;
    if (g2.status === 'checkmate') return true;            // delivered now
    if (n <= 1) return false;
    if (isDraw(g2)) return false;                          // drew instead of winning
    const replies = allActions(g2);
    if (!replies.length) return false;                     // stalemate: not a mate
    for (const d of replies) {
      const g3 = clone(g2);
      if (!apply(g3, d)) continue;
      if (g3.status === 'checkmate') continue;             // defender self-mated: still lost
      if (isDraw(g3)) return false;                        // defender escaped into a draw
      if (!forcesMate(g3, n - 1)) return false;            // this reply survives
    }
    return true;
  }

  // Every action that forces mate within n. This is the uniqueness test: a
  // puzzle is only well-posed if exactly one does.
  function matingActions(g, n, stopAfter) {
    const hits = [];
    for (const a of allActions(g)) {
      if (forcesMateWith(g, a, n)) {
        hits.push(a);
        if (stopAfter && hits.length >= stopAfter) break;
      }
    }
    return hits;
  }

  // The defender's toughest reply: the one that survives longest, tie-broken
  // toward board actions so a puzzle shows off the mechanic rather than
  // hiding it, then toward captures (the human-looking try).
  function bestDefence(g, n) {
    const replies = allActions(g);
    let best = null, bestScore = -1;
    for (const d of replies) {
      const g3 = clone(g);
      if (!apply(g3, d)) continue;
      if (g3.status === 'checkmate') { const s = 0 + (isBoardAction(d) ? 0.5 : 0); if (s > bestScore) { bestScore = s; best = d; } continue; }
      // how many of our moves does it take to finish after this reply?
      let need = n + 1;                                    // "more than n" = it refuted the line
      for (let k = 1; k <= n; k++) if (forcesMate(g3, k)) { need = k; break; }
      const s = need * 10 + (isBoardAction(d) ? 2 : 0) + (d.kind === 'm' && g.board.has(keyOf(d.to.c, d.to.r)) ? 1 : 0);
      if (s > bestScore) { bestScore = s; best = d; }
    }
    return best;
  }

  // ---- the proof a puzzle ships with -------------------------------------
  // Uniqueness is checked at EVERY solver turn, not just the first: a puzzle
  // whose second move has two answers cannot be graded either. The stored
  // line is one principal variation — that is all the runtime needs, because
  // uniqueness means any deviation by the solver is simply wrong, and the
  // defender's replies are chosen by us.
  function proveePuzzle(g, n) {
    const line = [];
    let cur = clone(g);
    for (let step = n; step >= 1; step--) {
      const hits = matingActions(cur, step, 2);
      if (hits.length === 0) return { ok: false, reason: 'no forced mate in ' + step };
      if (hits.length > 1) return { ok: false, reason: 'solution not unique at move ' + (n - step + 1) };
      const solve = hits[0];
      line.push({ by: 'solver', action: solve });
      const after = clone(cur);
      apply(after, solve);
      if (after.status === 'checkmate') {
        return { ok: step === 1, reason: step === 1 ? null : 'mates too early (in ' + (n - step + 1) + ')', line, nodes };
      }
      const def = bestDefence(after, step - 1);
      if (!def) return { ok: false, reason: 'no defender reply' };
      line.push({ by: 'defender', action: def });
      apply(after, def);
      cur = after;
    }
    return { ok: false, reason: 'line did not end in mate' };
  }

  // ---- positions ---------------------------------------------------------
  // A puzzle position is terrain + pieces + side to move + the PLY PHASE.
  // The phase is not decoration: board-turn eligibility is every 3rd ply of
  // the game, so a position without it is a different puzzle.
  function fromSpec(spec) {
    const g = new Game();
    g.cells.clear();
    g.board.clear();
    for (const k of spec.cells) g.cells.add(k);
    for (const k of Object.keys(spec.pieces)) {
      const v = spec.pieces[k];                     // [type, color] or [type, color, hasMoved]
      g.board.set(k, { type: v[0], color: v[1], hasMoved: v[2] !== false });
    }
    g.turn = spec.turn;
    // ply = plies already played; the engine derives board-turn eligibility from
    // the total, so only the sum matters — but the parity has to agree with
    // whose turn it is or the puzzle claims a phase the game can never reach.
    const ply = spec.ply | 0;
    const expect = ply % 2 === 0 ? 'white' : 'black';
    if (expect !== spec.turn) {
      throw new Error(`puzzle spec: ply ${ply} means ${expect} to move, not ${spec.turn}`);
    }
    g.moveCount = { white: Math.ceil(ply / 2), black: Math.floor(ply / 2) };
    g.history = [];
    g.repCount = new Map();
    g.halfmoveClock = spec.halfmove || 0;
    g.epTarget = spec.ep || null;
    if (spec.rules) g.rules = Object.assign({}, g.rules, spec.rules);
    g._evaluate();
    return g;
  }

  function toSpec(g) {
    const pieces = {};
    for (const [k, p] of g.board) pieces[k] = [p.type, p.color, p.hasMoved];
    return {
      cells: [...g.cells].sort(),
      pieces,
      turn: g.turn,
      ply: g.moveCount.white + g.moveCount.black,
    };
  }

  function resetNodes() { nodes = 0; }
  function nodeCount() { return nodes; }
  function setBudget(n) { budget = (n == null ? Infinity : n); }
  // Run fn under a node cap; returns null instead of throwing if it blew it.
  function tryWithin(cap, fn) {
    const prevB = budget, prevN = nodes;
    budget = prevN + cap;
    try { return fn(); }
    catch (e) { if (e === ABORT) return null; throw e; }
    finally { budget = prevB; }
  }

  return {
    clone, allActions, apply, fromSpec, toSpec,
    forcesMate, forcesMateWith, matingActions, bestDefence,
    provePuzzle: proveePuzzle,
    isBoardAction, sameAction, isDraw,
    resetNodes, nodeCount, setBudget, tryWithin, ABORT,
  };
});
