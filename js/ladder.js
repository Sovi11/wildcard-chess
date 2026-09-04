// Wildcard Chess — Elo ladder and bot roster.
// Your rating lives in localStorage. Bots are fixed rating anchors, each with a
// distinct playing personality driven by evaluation weights (not just depth),
// so climbing the ladder means meeting genuinely different opponents.
// Exposed as window.WCLADDER.

(function () {
  'use strict';

  const KEY = 'wildcardchess.profile.v1';
  const BOTKEY = 'wildcardchess.pool.v2';   // v2: seeds recalibrated vs real Stockfish
  const START_ELO = 500;

  const base = () => (window.WCAI ? window.WCAI.DEFAULT_WEIGHTS : {});
  // material order: pawn, knight, bishop, rook, queen, king
  const mat = (p, n, b, r, q) => [p, n, b, r, q, 0];

  // kindBias: root-only nudge (centipawns) toward each board action.
  //   ac = add square, rc = remove square, mc = move square
  const BOTS = [
    // The gutter of the ladder: bots built to LOSE. Cooked evals (all pieces
    // worth a pawn; eval installed upside-down) plus huge jitter/blunder means
    // shit openings, hung queens, and a soft landing for new players.
    {
      id: 'tumble', name: 'Tumbleweed Tim', elo: 250, emoji: '🌾',
      blurb: 'Might play the best move. Entirely by accident.',
      style: 'Feral · basically random',
      search: { depth: 1, K: 3, movetime: 200, jitter: 9999, blunder: 0.50 },
      // every piece is worth a pawn to Tim — he trades his queen for anything
      weights: { material: mat(100, 100, 100, 100, 100), mobility: 0, kingRing: 0, pawnAdv: 0, tempo: 0, kindBias: { ac: -200, rc: -200, mc: -200 } },
    },
    {
      id: 'bella', name: 'Backwards Bella', elo: 400, emoji: '🙃',
      blurb: 'Her evaluation is installed upside-down. Develops nothing, walls in her own king, marches the rook pawns.',
      style: 'Confused · cooked eval',
      search: { depth: 1, K: 3, movetime: 250, jitter: 170, blunder: 0.32 },
      // negative mobility/kingRing/pawnAdv: she prefers cramped, exposed, passive
      weights: { mobility: -4, kingRing: -10, pawnAdv: -6, tempo: 0, kindBias: { ac: -120, rc: -120, mc: -120 } },
    },
    {
      id: 'pawnsy', name: 'Pawnsy', elo: 550, emoji: '🌱',
      blurb: 'Plays the first thing that looks fine. Barely notices the board can change.',
      style: 'Beginner · ignores wildcards',
      search: { depth: 1, K: 4, movetime: 300, jitter: 140, blunder: 0.34 },
      weights: { kindBias: { ac: -160, rc: -160, mc: -160 } },
    },
    {
      id: 'rusty', name: 'Rusty Rook', elo: 750, emoji: '🗼',
      blurb: 'Convinced rooks win games. Will trade almost anything for one.',
      style: 'Novice · rook-obsessed',
      search: { depth: 2, K: 6, movetime: 500, jitter: 100, blunder: 0.25 },
      weights: { material: mat(100, 260, 270, 640, 900), kindBias: { ac: -80, rc: -80, mc: -80 } },
    },
    {
      id: 'vandal', name: 'The Vandal', elo: 900, emoji: '🕳️',
      blurb: 'Would rather delete the board than play on it. Expect holes everywhere.',
      style: 'Chaotic · tears out squares',
      search: { depth: 2, K: 12, movetime: 700, jitter: 60, blunder: 0.15 },
      weights: { kindBias: { ac: -40, rc: 190, mc: 40 } },
    },
    {
      id: 'castle', name: 'Sir Castle', elo: 1000, emoji: '🛡️',
      blurb: 'Builds a fortress and dares you to crack it. Hoards floor around his king.',
      style: 'Defensive · king safety',
      search: { depth: 2, K: 10, movetime: 800, jitter: 40, blunder: 0.10 },
      weights: { kingRing: 22, mobility: 2, kindBias: { ac: 70, rc: -60, mc: -20 } },
    },
    {
      id: 'gambit', name: 'Gambit', elo: 1100, emoji: '⚔️',
      blurb: 'Attacks first and counts material later. Sacrifices happily.',
      style: 'Aggressive · loves complications',
      search: { depth: 2, K: 10, movetime: 900, jitter: 45, blunder: 0.05 },
      weights: { material: mat(110, 350, 360, 470, 980), kingRing: -4, mobility: 6, kindBias: { ac: -30, rc: 60, mc: 30 } },
    },
    {
      id: 'architect', name: 'The Architect', elo: 1350, emoji: '🧱',
      blurb: 'Grows new ground and marches pawns across it. Plays the map, not the pieces.',
      style: 'Builder · adds squares',
      search: { depth: 3, K: 12, movetime: 1100, jitter: 20, blunder: 0.03 },
      weights: { pawnAdv: 11, kindBias: { ac: 170, rc: -40, mc: 50 } },
    },
    {
      id: 'kate', name: 'Chaos Kate', elo: 1250, emoji: '🎲',
      blurb: 'Reshapes the terrain every chance she gets. Wildly inconsistent, occasionally brilliant.',
      style: 'Unpredictable · terrain shuffler',
      search: { depth: 3, K: 14, movetime: 1100, jitter: 90, blunder: 0.07 },
      weights: { kindBias: { ac: 90, rc: 90, mc: 160 } },
    },
    {
      id: 'ivan', name: 'Iron Ivan', elo: 1500, emoji: '⚙️',
      blurb: 'Pure chess, no theatrics. Punishes loose pieces and ignores the wildcards.',
      style: 'Solid · classical',
      search: { depth: 3, K: 8, movetime: 1100, jitter: 0, blunder: 0 },
      weights: { mobility: 4, kindBias: { ac: -120, rc: -120, mc: -120 } },
    },
    {
      id: 'vex', name: 'Grandmaster Vex', elo: 1750, emoji: '👑',
      blurb: 'Sees your plan two moves before you do. Uses the board when it actually helps.',
      style: 'Strong · all-round',
      search: { depth: 4, K: 12, movetime: 1200, jitter: 0, blunder: 0 },
      weights: {},
    },
    {
      id: 'void', name: 'THE VOID', elo: 2050, emoji: '🕯️',
      blurb: 'Eats the board one square at a time. You will run out of floor before it runs out of ideas.',
      style: 'Brutal · terrain master',
      search: { depth: 5, K: 16, movetime: 1300, jitter: 0, blunder: 0 },
      weights: { kindBias: { ac: 40, rc: 110, mc: 80 }, kingRing: 10 },
    },
  ];

  const byId = (id) => BOTS.find(b => b.id === id) || null;

  // ---- the pool ------------------------------------------------------------
  // Bots are treated as players sitting in the queue: their ratings drift with
  // results the same way yours does, so the pool stays honest over time.
  function poolRatings() {
    try {
      const raw = localStorage.getItem(BOTKEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function savePool(map) {
    try { localStorage.setItem(BOTKEY, JSON.stringify(map)); } catch (e) { /* storage blocked */ }
  }
  // Live rating for a bot: its drifted value if it has one, else its seed.
  function botElo(id) {
    const seeded = byId(id);
    if (!seeded) return null;
    const v = poolRatings()[id];
    return (typeof v === 'number' && isFinite(v)) ? v : seeded.elo;
  }
  function setBotElo(id, elo) {
    const m = poolRatings();
    m[id] = Math.max(100, Math.round(elo));
    savePool(m);
    return m[id];
  }
  // A bot with its CURRENT rating (what the rest of the app should use).
  function liveBot(id) {
    const b = byId(id);
    return b ? Object.assign({}, b, { elo: botElo(id), seedElo: b.elo }) : null;
  }
  const livePool = () => BOTS.map(b => liveBot(b.id));
  // Full weight set for a bot (its overrides merged onto the defaults).
  const weightsFor = (bot) => Object.assign({}, base(), (bot && bot.weights) || {});

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
  // extra: { acts, youColor, reason, opponentName, opponentElo, rated }
  function recordResult(botId, score, extra) {
    const bot = liveBot(botId);
    if (!bot) return null;
    const p = getProfile();
    const before = p.elo;
    const k = kFactor(games(p));
    const exp = expected(before, bot.elo);
    const after = Math.max(100, Math.round(before + k * (score - exp)));
    p.elo = after;
    if (score === 1) p.wins++; else if (score === 0) p.losses++; else p.draws++;
    p.log.unshift(Object.assign({
      bot: bot.id, botName: bot.name, botElo: bot.elo,
      score, before, after, at: Date.now(), rated: true,
    }, extra || {}));
    p.log = p.log.slice(0, 40);          // move lists are stored, so keep fewer
    saveProfile(p);
    // the opponent's rating moves too — smaller K, they play far more games
    const botBefore = bot.elo;
    const botAfter = setBotElo(botId, botBefore + 12 * ((1 - score) - (1 - exp)));
    return { before, after, delta: after - before, expected: exp, bot, botBefore, botAfter };
  }

  // Record a game that does not affect rating (friendlies, hotseat, online).
  function recordCasual(entry) {
    const p = getProfile();
    p.log.unshift(Object.assign({ at: Date.now(), rated: false }, entry || {}));
    p.log = p.log.slice(0, 40);
    saveProfile(p);
    return p;
  }

  // Fold the account's cloud history into the local log. Union by `at` (the
  // sync key), newest first; nothing local is ever dropped by a sync, and the
  // local cap stays — the cloud keeps everything, this is the working set.
  function mergeLog(remote) {
    const p = getProfile();
    const seen = new Set((p.log || []).map((e) => e.at));
    let added = 0;
    for (const e of remote || []) {
      if (!e || !e.at || seen.has(e.at)) continue;
      seen.add(e.at); p.log.push(e); added++;
    }
    if (added) {
      p.log.sort((a, b) => (b.at || 0) - (a.at || 0));
      p.log = p.log.slice(0, 40);
      saveProfile(p);
    }
    return added;
  }

  function clearHistory() {
    const p = getProfile();
    p.log = [];
    return saveProfile(p);
  }

  function resetProfile() { savePool({}); return saveProfile(blankProfile()); }

  // Roster sorted by how close each bot is to your rating (fair fights first).
  function ranked() {
    const p = getProfile();
    return livePool().map(b => ({
      ...b,
      gap: b.elo - p.elo,
      winChance: Math.round(expected(p.elo, b.elo) * 100),
    })).sort((a, b) => Math.abs(a.gap) - Math.abs(b.gap));
  }

  // What one game would be worth, before you play it.
  function stakes(botId) {
    const bot = liveBot(botId);
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
    BOTS, byId, liveBot, livePool, botElo, setBotElo, weightsFor,
    getProfile, saveProfile, recordResult, recordCasual, mergeLog, clearHistory, resetProfile, ranked, stakes,
    expected, kFactor, games, START_ELO,
  };
})();
