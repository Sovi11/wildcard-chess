// Wildcard Chess — tutor / analysis layer.
// Wraps the search engine to produce: a white-POV evaluation, the best action
// in a position, and a chess.com-style quality grade for the move just played.
// Exposed as window.WCAN.

(function () {
  'use strict';

  const MATE = 100000;
  const MATE_EDGE = MATE - 1000;          // scores beyond this mean forced mate
  const CLAMP = 2000;                     // cap scores when measuring a mistake

  // Grades by centipawn loss, mover's point of view.
  const TIERS = [
    { max: 12,       key: 'best',       label: 'Best move',  mark: '★'  },
    { max: 35,       key: 'excellent',  label: 'Excellent',  mark: '✓'  },
    { max: 80,       key: 'good',       label: 'Good',       mark: '·'  },
    { max: 160,      key: 'inaccuracy', label: 'Inaccuracy', mark: '?!' },
    { max: 320,      key: 'mistake',    label: 'Mistake',    mark: '?'  },
    { max: Infinity, key: 'blunder',    label: 'Blunder',    mark: '??' },
  ];

  const clamp = (s) => Math.max(-CLAMP, Math.min(CLAMP, s));

  // cpLoss = how much worse than best the played move was (mover POV).
  function classify(cpLoss) {
    const loss = Math.max(0, cpLoss);
    const tier = TIERS.find(t => loss < t.max) || TIERS[TIERS.length - 1];
    return { ...tier, loss: Math.round(loss) };
  }

  function isMate(score) { return Math.abs(score) > MATE_EDGE; }

  // Human-readable score, always from White's point of view.
  function fmtScore(whiteCp) {
    if (isMate(whiteCp)) {
      const n = Math.max(1, Math.ceil((MATE - Math.abs(whiteCp)) / 2));
      return (whiteCp > 0 ? '+M' : '-M') + n;
    }
    const v = whiteCp / 100;
    return (v > 0 ? '+' : '') + v.toFixed(1);
  }

  // White's share of the eval bar, 0..100.
  function evalToPct(whiteCp) {
    if (isMate(whiteCp)) return whiteCp > 0 ? 100 : 0;
    return 50 + 50 * Math.tanh(whiteCp / 500);
  }

  // Describe an action in the game's own notation. `game` must still be in the
  // position BEFORE the action (needed to look up the moving piece).
  function describe(gm, game) {
    if (!gm) return '—';
    if (gm.kind === 'm') {
      const p = game.get(gm.from.c, gm.from.r);
      const cap = game.get(gm.to.c, gm.to.r) ? '×' : '–';
      return `${p ? L(p.type) : ''} ${sq(gm.from.c, gm.from.r)}${cap}${sq(gm.to.c, gm.to.r)}`.trim();
    }
    if (gm.kind === 'ac') return `✚ add square ${sq(gm.cell.c, gm.cell.r)}`;
    if (gm.kind === 'rc') return `✖ remove square ${sq(gm.cell.c, gm.cell.r)}`;
    return `➤ move square ${sq(gm.from.c, gm.from.r)}→${sq(gm.to.c, gm.to.r)}`;
  }

  // Short plain-English reason a board action is good — the tutor's voice.
  function explain(gm, game) {
    if (!gm) return '';
    if (gm.kind === 'rc') return 'Tearing out a square can cut a line, trap a piece, or freeze a pawn.';
    if (gm.kind === 'ac') return 'New ground can open your own lines, give the king air, or push a promotion further away.';
    if (gm.kind === 'mc') return 'Relocating a square does two jobs at once: it leaves a hole behind and creates ground elsewhere.';
    const p = game.get(gm.from.c, gm.from.r);
    if (p && game.get(gm.to.c, gm.to.r)) return 'Wins material.';
    return '';
  }

  // Search the current position. Returns side-to-move and white-POV scores.
  function analyse(game, depth, movetime) {
    const pos = WCAI.Pos.fromGame(game);
    const res = pos.search({ depth: depth || 3, K: 12, movetime: movetime || 800, jitter: 0 });
    const stm = res.score;
    return {
      stmScore: stm,
      whiteScore: game.turn === 'white' ? stm : -stm,
      best: res.move,
      depth: res.depth,
      nodes: res.nodes,
    };
  }

  // Chess.com-ish accuracy from a list of centipawn losses.
  function accuracy(losses) {
    if (!losses || !losses.length) return null;
    const avg = losses.reduce((a, b) => a + b, 0) / losses.length;
    return Math.max(0, Math.min(100, Math.round(103 * Math.exp(-avg / 180) - 3)));
  }

  window.WCAN = { classify, fmtScore, evalToPct, describe, explain, analyse, accuracy, clamp, isMate, TIERS, MATE };
})();
