// Wildcard Chess — Elo ladder and bot roster.
// Your rating lives in localStorage. Bots are fixed rating anchors, each with a
// distinct playing personality driven by evaluation weights (not just depth),
// so climbing the ladder means meeting genuinely different opponents.
// Exposed as window.WCLADDER.

(function () {
  'use strict';

  const KEY = 'wildcardchess.profile.v1';
  const START_ELO = 500;

  const base = () => (window.WCAI ? window.WCAI.DEFAULT_WEIGHTS : {});
  // material order: pawn, knight, bishop, rook, queen, king
  const mat = (p, n, b, r, q) => [p, n, b, r, q, 0];

  // kindBias: root-only nudge (centipawns) toward each board action.
  //   ac = add square, rc = remove square, mc = move square
  const BOTS = [
    {
      id: 'pawnsy', name: 'Pawnsy', elo: 300, emoji: '🌱',
      blurb: 'Plays the first thing that looks fine. Barely notices the board can change.',
      style: 'Beginner · ignores wildcards',
      search: { depth: 1, K: 4, movetime: 300, jitter: 140, blunder: 0.34 },
      weights: { kindBias: { ac: -160, rc: -160, mc: -160 } },
    },
    {
      id: 'rusty', name: 'Rusty Rook', elo: 420, emoji: '🗼',
      blurb: 'Convinced rooks win games. Will trade almost anything for one.',
      style: 'Novice · rook-obsessed',
      search: { depth: 2, K: 6, movetime: 500, jitter: 80, blunder: 0.18 },
      weights: { material: mat(100, 260, 270, 640, 900), kindBias: { ac: -80, rc: -80, mc: -80 } },
    },
    {
      id: 'vandal', name: 'The Vandal', elo: 520, emoji: '🕳️',
      blurb: 'Would rather delete the board than play on it. Expect holes everywhere.',
      style: 'Chaotic · tears out squares',
      search: { depth: 2, K: 12, movetime: 700, jitter: 50, blunder: 0.10 },
      weights: { kindBias: { ac: -40, rc: 190, mc: 40 } },
    },
    {
      id: 'castle', name: 'Sir Castle', elo: 600, emoji: '🛡️',
      blurb: 'Builds a fortress and dares you to crack it. Hoards floor around his king.',
      style: 'Defensive · king safety',
      search: { depth: 2, K: 10, movetime: 800, jitter: 30, blunder: 0.06 },
      weights: { kingRing: 22, mobility: 2, kindBias: { ac: 70, rc: -60, mc: -20 } },
    },
    {
      id: 'gambit', name: 'Gambit', elo: 700, emoji: '⚔️',
      blurb: 'Attacks first and counts material later. Sacrifices happily.',
      style: 'Aggressive · loves complications',
      search: { depth: 2, K: 10, movetime: 900, jitter: 45, blunder: 0.05 },
      weights: { material: mat(110, 350, 360, 470, 980), kingRing: -4, mobility: 6, kindBias: { ac: -30, rc: 60, mc: 30 } },
    },
    {
      id: 'architect', name: 'The Architect', elo: 820, emoji: '🧱',
      blurb: 'Grows new ground and marches pawns across it. Plays the map, not the pieces.',
      style: 'Builder · adds squares',
      search: { depth: 3, K: 12, movetime: 1100, jitter: 20, blunder: 0.03 },
      weights: { pawnAdv: 11, kindBias: { ac: 170, rc: -40, mc: 50 } },
    },
    {
      id: 'kate', name: 'Chaos Kate', elo: 760, emoji: '🎲',
      blurb: 'Reshapes the terrain every chance she gets. Wildly inconsistent, occasionally brilliant.',
      style: 'Unpredictable · terrain shuffler',
      search: { depth: 3, K: 14, movetime: 1100, jitter: 90, blunder: 0.07 },
      weights: { kindBias: { ac: 90, rc: 90, mc: 160 } },
    },
    {
      id: 'ivan', name: 'Iron Ivan', elo: 1020, emoji: '⚙️',
      blurb: 'Pure chess, no theatrics. Punishes loose pieces and ignores the wildcards.',
      style: 'Solid · classical',
      search: { depth: 3, K: 8, movetime: 1300, jitter: 0, blunder: 0 },
      weights: { mobility: 4, kindBias: { ac: -120, rc: -120, mc: -120 } },
    },
    {
      id: 'vex', name: 'Grandmaster Vex', elo: 1200, emoji: '👑',
      blurb: 'Sees your plan two moves before you do. Uses the board when it actually helps.',
      style: 'Strong · all-round',
      search: { depth: 4, K: 12, movetime: 2000, jitter: 0, blunder: 0 },
      weights: {},
    },
    {
      id: 'void', name: 'THE VOID', elo: 1450, emoji: '🕯️',
      blurb: 'Eats the board one square at a time. You will run out of floor before it runs out of ideas.',
      style: 'Brutal · terrain master',
      search: { depth: 5, K: 16, movetime: 3200, jitter: 0, blunder: 0 },
      weights: { kindBias: { ac: 40, rc: 110, mc: 80 }, kingRing: 10 },
    },
  ];

  const byId = (id) => BOTS.find(b => b.id === id) || null;
  // Full weight set for a bot (its overrides merged onto the defaults).
  const weightsFor = (bot) => Object.assign({}, base(), bot.weights || {});

  // ---- Elo ----------------------------------------------------------------
  const expected = (a, b) => 1 / (1 + Math.pow(10, (b - a) / 400));
  // Provisional players move fast, settled players move slowly.
  const kFactor = (games) => (games < 10 ? 48 : games < 30 ? 32 : 20);

  function blankProfile() {
    return { name: 'You', elo: START_ELO, wins: 0, losses: 0, draws: 0, log: [] };
  }

  function getProfile() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return blankProfile();
      const p = JSON.parse(raw);
      if (typeof p.elo !== 'number' || !isFinite(p.elo)) return blankProfile();
      return Object.assign(blankProfile(), p);
    } catch (e) {
      return blankProfile();          // corrupt or storage blocked
    }
  }

  function saveProfile(p) {
    try { localStorage.setItem(KEY, JSON.stringify(p)); } catch (e) { /* private mode: keep in memory */ }
    return p;
  }

  function games(p) { return p.wins + p.losses + p.draws; }

  // score: 1 = player won, 0.5 = draw, 0 = player lost
  function recordResult(botId, score) {
    const bot = byId(botId);
    if (!bot) return null;
    const p = getProfile();
    const before = p.elo;
    const k = kFactor(games(p));
    const exp = expected(before, bot.elo);
    const after = Math.max(100, Math.round(before + k * (score - exp)));
    p.elo = after;
    if (score === 1) p.wins++; else if (score === 0) p.losses++; else p.draws++;
    p.log.unshift({ bot: bot.id, botName: bot.name, botElo: bot.elo, score, before, after, at: Date.now() });
    p.log = p.log.slice(0, 50);
    saveProfile(p);
    return { before, after, delta: after - before, expected: exp, bot };
  }

  function resetProfile() { return saveProfile(blankProfile()); }

  // Roster sorted by how close each bot is to your rating (fair fights first).
  function ranked() {
    const p = getProfile();
    return BOTS.map(b => ({
      ...b,
      gap: b.elo - p.elo,
      winChance: Math.round(expected(p.elo, b.elo) * 100),
    })).sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap));
  }

  // What one game would be worth, before you play it.
  function stakes(botId) {
    const bot = byId(botId);
    if (!bot) return null;
    const p = getProfile();
    const k = kFactor(games(p));
    const exp = expected(p.elo, bot.elo);
    return {
      win: Math.round(k * (1 - exp)),
      loss: Math.round(k * (0 - exp)),
      draw: Math.round(k * (0.5 - exp)),
      winChance: Math.round(exp * 100),
    };
  }

  window.WCLADDER = {
    BOTS, byId, weightsFor, getProfile, saveProfile, recordResult,
    resetProfile, ranked, stakes, expected, kFactor, games, START_ELO,
  };
})();
