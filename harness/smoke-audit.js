// Regression checks for the v61 audit fixes. Headless; exits 1 on any failure.
//   node harness/smoke-audit.js [http://localhost:5180]
const { chromium, devices } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:5180';
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + JSON.stringify(detail) : '')); };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  const errors = [], warnings = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  // a 404 on a Supabase table that has not been created yet is environment, not a bug
  page.on('console', (m) => { if (m.type() === 'error') (/Failed to load resource/.test(m.text()) ? warnings : errors).push('console: ' + m.text()); });
  await page.goto(BASE + '/?audit=' + Date.now());
  await page.waitForTimeout(800);

  // --- #7 the welcome "How to play" tour counts as seen ---
  await page.evaluate(() => document.getElementById('welcomeHow').click());
  await page.waitForTimeout(200);
  await page.evaluate(() => document.getElementById('tutSkip').click());
  await page.waitForTimeout(200);
  const seenAfterHow = await page.evaluate(() => localStorage.getItem('wildcardchess.tut.v2'));
  await page.evaluate(() => document.getElementById('welcomeGuest').click());
  await page.waitForTimeout(400);
  const tourAgain = await page.evaluate(() => { const t = document.getElementById('tutorial'); return !!t && t.classList.contains('show'); });
  check('welcome tour marks tutorial seen; Play now does not replay it', seenAfterHow === '1' && !tourAgain, { seenAfterHow, tourAgain });
  const lobbyUp = await page.evaluate(() => document.getElementById('lobby').classList.contains('show'));
  check('lobby open after guest entry', lobbyUp);

  // --- #1 puzzle mode must not leak into a game started from the lobby ---
  await page.evaluate(() => document.querySelector('[data-lobbymode="puzzles"]').click());
  await page.waitForTimeout(900);
  const inPuzzles = await page.evaluate(() => ({ puzzleMode, cls: document.body.classList.contains('puzzle-mode'), lobby: document.getElementById('lobby').classList.contains('show') }));
  check('puzzle mode entered', inPuzzles.puzzleMode && inPuzzles.cls && !inPuzzles.lobby, inPuzzles);
  await page.evaluate(() => document.getElementById('openLobby').click());
  await page.waitForTimeout(300);
  await page.evaluate(() => document.getElementById('playBotNow').click());
  await page.waitForFunction(() => !document.getElementById('lobby').classList.contains('show'), null, { timeout: 15000 });
  await page.waitForTimeout(300);
  const afterMatch = await page.evaluate(() => ({ puzzleMode, cls: document.body.classList.contains('puzzle-mode'), plies: game.history.length, bot: typeof botEnabled === 'function' && botEnabled() }));
  check('starting a match from puzzles clears puzzle mode', !afterMatch.puzzleMode && !afterMatch.cls && afterMatch.bot, afterMatch);
  // the bot must actually move in this game (as White it moves first; as Black after ours)
  const humanSide = await page.evaluate(() => botSide() === 'white' ? 'black' : 'white');
  if (humanSide === 'white') {
    const box = await page.locator('#board').boundingBox();
    const sq = (c, r) => ({ x: box.x + (c + 0.5) / 8 * box.width, y: box.y + (7 - r + 0.5) / 8 * box.height });
    await page.mouse.click(sq(4, 1).x, sq(4, 1).y); await page.waitForTimeout(150); await page.mouse.click(sq(4, 3).x, sq(4, 3).y);
  }
  await page.waitForTimeout(3800);
  const botMoved = await page.evaluate(() => ({ plies: game.history.length, turn: game.turn, human: botSide() === 'white' ? 'black' : 'white' }));
  check('bot plays in the game started from puzzle mode', botMoved.plies >= (humanSide === 'white' ? 2 : 1), botMoved);

  // --- #2 "New game" is a full reset ---
  await page.evaluate(() => { resultRecorded = true; gameActs.push({ kind: 'm', from: { c: 0, r: 1 }, to: { c: 0, r: 2 } }); game.endReason = 'resignation'; });
  await page.evaluate(() => document.getElementById('newGame').click());
  await page.waitForTimeout(200);
  const afterNew = await page.evaluate(() => ({ resultRecorded, acts: gameActs.length, endReason: game.endReason, plies: game.history.length, thinking: aiThinking }));
  check('New game resets scoring flag, replay log, end reason', afterNew.resultRecorded === false && afterNew.acts === 0 && afterNew.endReason === null && afterNew.plies === 0, afterNew);

  // --- #6 puzzle reply timer is cancelled by leaving puzzle mode ---
  await page.evaluate(() => { pzReplyTimer = setTimeout(() => { window.__replyFired = true; }, 300); pzReplyPending = true; puzzleMode = true; leavePuzzleMode(); });
  await page.waitForTimeout(500);
  const timerState = await page.evaluate(() => ({ fired: !!window.__replyFired, pending: pzReplyPending, puzzleMode }));
  check('leaving puzzle mode cancels the scripted reply', !timerState.fired && !timerState.pending && !timerState.puzzleMode, timerState);

  // --- #5 account switch wipes puzzle progress ---
  await page.evaluate(() => { localStorage.setItem('hollowchess.puzzles.v1', JSON.stringify({ solved: { x: { at: 1, clean: true } } })); resetDeviceProfile(); });
  const pz = await page.evaluate(() => localStorage.getItem('hollowchess.puzzles.v1'));
  check('resetDeviceProfile clears puzzle progress', pz === null, { pz });

  // --- #10 timestamps survive the merge ---
  const merged = await page.evaluate(() => { const m = WCPUZZLE.mergeProgress({ solved: { p1: { at: 1757000000000, clean: true } } }); return m.solved.p1.at; });
  check('mergeProgress keeps ms timestamps intact', merged === 1757000000000, { merged });

  await page.close();

  // --- #8 inputs are 16px on touch devices (no iOS focus zoom) ---
  const ctx = await browser.newContext({ ...devices['iPhone 13'] });
  const mp = await ctx.newPage();
  await mp.goto(BASE + '/?audit2=' + Date.now(), { waitUntil: 'domcontentloaded', timeout: 20000 });
  await mp.waitForTimeout(600);
  const fs16 = await mp.evaluate(() => getComputedStyle(document.getElementById('emailInput')).fontSize);
  check('email input is 16px on a touch device', fs16 === '16px', { fs16 });
  await ctx.close();

  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  if (warnings.length) console.log('resource warnings (missing backend tables?):\n  ' + warnings.join('\n  '));
  console.log(errors.length ? 'ERRORS:\n  ' + errors.join('\n  ') : 'no page/console errors');
  console.log(failed || errors.length ? `AUDIT CHECKS FAILED (${failed})` : 'AUDIT CHECKS OK');
  process.exit(failed || errors.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
