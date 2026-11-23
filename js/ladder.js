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

    // ---- the wider pool (v105) ----------------------------------------------
    // Twelve residents meant the queue handed a 500-rated player the same three
    // faces all evening. These fill the gaps, thickest where most players sit
    // (300 to 1300). The low ones look one ply ahead and no further: they see
    // what a move wins right now and nothing of what it loses, which is how a
    // beginner plays. Each has one fixation so they do not all feel alike.
    // Seeds are placed by their search settings between calibrated neighbours;
    // like every bot they drift from there with results.
    {
      id: 'dizzy', name: 'Dizzy Dot', elo: 320, emoji: '🌀',
      blurb: 'Picks up squares and puts them down somewhere else, for no reason at all.',
      style: 'Feral · moves squares at random',
      search: { depth: 1, K: 3, movetime: 200, jitter: 420, blunder: 0.44 },
      weights: { tempo: 0, kindBias: { ac: -100, rc: -100, mc: 140 } },
    },
    {
      id: 'nibbles', name: 'Nibbles', elo: 370, emoji: '🐭',
      blurb: 'Takes every pawn on offer and never asks why it was offered.',
      style: 'One ply · pawn grabber',
      search: { depth: 1, K: 3, movetime: 220, jitter: 230, blunder: 0.38 },
      weights: { material: mat(230, 300, 310, 480, 900), kindBias: { ac: -160, rc: -160, mc: -160 } },
    },
    {
      id: 'shy', name: 'Shy Shah', elo: 450, emoji: '🫣',
      blurb: 'Only cares that the king feels safe. The rest of the army is on its own.',
      style: 'One ply · hides the king',
      search: { depth: 1, K: 3, movetime: 250, jitter: 180, blunder: 0.34 },
      weights: { kingRing: 34, mobility: -2, kindBias: { ac: 40, rc: -160, mc: -120 } },
    },
    {
      id: 'roamer', name: 'Queenie', elo: 490, emoji: '💅',
      blurb: 'Gets the big pieces out at once and wanders. Development is for other people.',
      style: 'One ply · roams early',
      search: { depth: 1, K: 4, movetime: 250, jitter: 160, blunder: 0.33 },
      weights: { mobility: 12, kingRing: -4, kindBias: { ac: -140, rc: -140, mc: -140 } },
    },
    {
      id: 'hops', name: 'Sir Hops-a-Lot', elo: 520, emoji: '🐸',
      blurb: 'Believes the knight is the best piece on the board and will not give one up.',
      style: 'One ply · knight lover',
      search: { depth: 1, K: 4, movetime: 280, jitter: 150, blunder: 0.31 },
      weights: { material: mat(100, 520, 300, 470, 900), kindBias: { ac: -150, rc: -150, mc: -150 } },
    },
    {
      id: 'digger', name: 'Digger', elo: 600, emoji: '⛏️',
      blurb: 'Lifts a square out every board turn. Which square is anyone\u2019s guess.',
      style: 'One ply · digs holes',
      search: { depth: 1, K: 5, movetime: 300, jitter: 120, blunder: 0.30 },
      weights: { kindBias: { ac: -100, rc: 230, mc: 60 } },
    },
    {
      id: 'mason', name: 'Mason', elo: 640, emoji: '🧰',
      blurb: 'Keeps laying new floor. Usually on the wrong side of the board.',
      style: 'One ply · adds squares',
      search: { depth: 1, K: 5, movetime: 300, jitter: 120, blunder: 0.28 },
      weights: { kindBias: { ac: 230, rc: -100, mc: 60 } },
    },
    {
      id: 'stormer', name: 'Pawn Stormer', elo: 690, emoji: '🌊',
      blurb: 'Every pawn goes forward, every move it can. The pieces watch from home.',
      style: 'One ply · pawn storm',
      search: { depth: 1, K: 5, movetime: 320, jitter: 110, blunder: 0.27 },
      weights: { pawnAdv: 20, mobility: 0, kindBias: { ac: 20, rc: -120, mc: -120 } },
    },
    {
      id: 'bob', name: 'Bishop Bob', elo: 720, emoji: '📐',
      blurb: 'Loves a long diagonal and gets upset when someone cuts a hole in it.',
      style: 'Novice · bishop pair',
      search: { depth: 2, K: 5, movetime: 450, jitter: 115, blunder: 0.27 },
      weights: { material: mat(100, 290, 480, 470, 900), kindBias: { ac: -90, rc: -90, mc: -90 } },
    },
    {
      id: 'joan', name: 'Trader Joan', elo: 800, emoji: '🔁',
      blurb: 'Swaps pieces whenever she can. Fewer pieces, fewer problems.',
      style: 'Novice · trades everything',
      search: { depth: 2, K: 6, movetime: 500, jitter: 90, blunder: 0.22 },
      weights: { material: mat(100, 340, 340, 400, 780), mobility: 1, kindBias: { ac: -80, rc: -80, mc: -80 } },
    },
    {
      id: 'turtle', name: 'The Turtle', elo: 850, emoji: '🐢',
      blurb: 'Pulls everything back around the king and waits for you to overreach.',
      style: 'Passive · shell',
      search: { depth: 2, K: 8, movetime: 600, jitter: 70, blunder: 0.18 },
      weights: { kingRing: 28, mobility: -1, pawnAdv: 0, kindBias: { ac: 60, rc: -80, mc: -40 } },
    },
    {
      id: 'slider', name: 'Slider', elo: 950, emoji: '🛷',
      blurb: 'Never adds, never removes: carries squares from one place to another all game.',
      style: 'Tricky · carries squares',
      search: { depth: 2, K: 12, movetime: 700, jitter: 55, blunder: 0.13 },
      weights: { kindBias: { ac: -60, rc: -60, mc: 210 } },
    },
    {
      id: 'greta', name: 'Greedy Greta', elo: 1050, emoji: '💰',
      blurb: 'Counts material and nothing else. Offer her a pawn and see what it costs her.',
      style: 'Materialist · takes what is offered',
      search: { depth: 2, K: 10, movetime: 850, jitter: 40, blunder: 0.08 },
      weights: { material: mat(118, 375, 385, 580, 1060), mobility: 0, kingRing: 0, kindBias: { ac: -60, rc: -40, mc: -40 } },
    },
    {
      id: 'hermit', name: 'The Hermit', elo: 1160, emoji: '🏝️',
      blurb: 'Cuts the squares around his own king and lives on the island. Bring a knight.',
      style: 'Odd · island builder',
      search: { depth: 2, K: 12, movetime: 900, jitter: 40, blunder: 0.05 },
      weights: { kingRing: 14, kindBias: { ac: -20, rc: 140, mc: 30 } },
    },
    {
      id: 'becky', name: 'Blitz Becky', elo: 1210, emoji: '⚡',
      blurb: 'Sees a lot and moves at once. Fast enough to miss the quiet move.',
      style: 'Quick · plays on instinct',
      search: { depth: 3, K: 8, movetime: 350, jitter: 65, blunder: 0.08 },
      weights: { mobility: 5 },
    },
    {
      id: 'surveyor', name: 'The Surveyor', elo: 1420, emoji: '📏',
      blurb: 'Measures the board before every move and shifts one square to exactly where it hurts.',
      style: 'Positional · precise terrain',
      search: { depth: 3, K: 12, movetime: 1100, jitter: 15, blunder: 0.02 },
      weights: { pawnAdv: 6, kindBias: { ac: 60, rc: 20, mc: 120 } },
    },
    {
      id: 'stone', name: 'Stonewall', elo: 1580, emoji: '🪨',
      blurb: 'Gives nothing away. No holes, no weaknesses, no jokes.',
      style: 'Solid · hard to break',
      search: { depth: 3, K: 12, movetime: 1200, jitter: 0, blunder: 0 },
      weights: { kingRing: 16, mobility: 3, kindBias: { ac: 20, rc: -70, mc: -40 } },
    },
    {
      id: 'reaper', name: 'The Reaper', elo: 1660, emoji: '☠️',
      blurb: 'Takes the floor from under your pieces first and the pieces second.',
      style: 'Aggressive · removes squares',
      search: { depth: 4, K: 10, movetime: 1150, jitter: 20, blunder: 0.02 },
      weights: { kingRing: -2, mobility: 5, kindBias: { ac: -20, rc: 150, mc: 50 } },
    },
    {
      id: 'oracle', name: 'The Oracle', elo: 1900, emoji: '🔮',
      blurb: 'Quiet, patient, and already knows where the board will be in three turns.',
      style: 'Strong · sees the terrain coming',
      search: { depth: 4, K: 16, movetime: 1300, jitter: 0, blunder: 0 },
      weights: { kindBias: { ac: 40, rc: 30, mc: 70 } },
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
