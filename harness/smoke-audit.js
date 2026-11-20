// Regression checks for the v61 audit fixes. Headless; exits 1 on any failure.
//   node harness/smoke-audit.js [http://localhost:5180]
const { chromium, devices } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:5180';
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (detail ? '  ' + JSON.stringify(detail) : '')); };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  // these checks exercise the welcome -> lobby path, i.e. a visitor who has been here before
  await page.addInitScript(() => { try { localStorage.setItem('hollowchess.first.v1', '1'); } catch (e) {} });
  const errors = [], warnings = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('dialog', (d) => d.accept());   // v73: leaving a live rated game asks first
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

  // --- v80: leaderboard is folded away; a finished game offers Home and Profile ---
  const v80 = await page.evaluate(() => {
    const lb = document.getElementById('leaderboard');
    const folded = !!lb.closest('details') && !lb.closest('details').open;
    game.winner = 'white'; game.status = 'checkmate'; sync();
    const shown = ui.banner.classList.contains('show');
    document.getElementById('bannerHomeBtn').click();
    const lobby = document.getElementById('lobby').classList.contains('show');
    closeLobby(); ui.banner.classList.add('show');
    document.getElementById('bannerProfileBtn').click();
    const prof = document.getElementById('profile').classList.contains('show');
    return { folded, shown, lobby, prof, wait: HUMAN_WAIT_MS };
  });
  check('leaderboard folded; game-over Home and Profile buttons work; human wait <= 8s', v80.folded && v80.shown && v80.lobby && v80.prof && v80.wait <= 8000, v80);

  await page.close();

  // --- v79: entering as a guest before cloud boot finishes must not bring the welcome screen back ---
  const fast = await browser.newPage({ viewport: { width: 420, height: 860 } });
  await fast.addInitScript(() => { try { localStorage.setItem('hollowchess.first.v1', '1'); } catch (e) {} });
  await fast.goto(BASE + '/?audit3=' + Date.now(), { waitUntil: 'domcontentloaded' });
  await fast.waitForFunction(() => !!document.getElementById('welcomeGuest') && typeof enterSite === 'function');
  await fast.evaluate(() => document.getElementById('welcomeGuest').click());      // well inside the boot window
  await fast.waitForTimeout(3000);                                                  // let cloud boot land
  const reshown = await fast.evaluate(() => document.getElementById('welcome').classList.contains('show'));
  check('welcome screen stays dismissed when cloud boot finishes after guest entry', !reshown, { reshown });
  await fast.close();

  // --- v82: puzzle challenge link, share text, review coach ---
  const pzp = await browser.newPage({ viewport: { width: 420, height: 860 } });
  const pzErrs = []; pzp.on('pageerror', (e) => pzErrs.push(e.message));
  await pzp.goto(BASE + '/?audit4=' + Date.now() + '#puzzle=hc-003', { waitUntil: 'domcontentloaded' });
  await pzp.waitForFunction(() => typeof puzzleMode !== 'undefined' && puzzleMode && WCPUZZLE.current(), null, { timeout: 15000 });
  await pzp.waitForTimeout(2500);
  const link = await pzp.evaluate(async () => {
    let copied = '';
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: (t) => { copied = t; return Promise.resolve(); } }, configurable: true });
    document.getElementById('pzShare').click();
    await new Promise((r) => setTimeout(r, 100));
    document.getElementById('shareCopy').click(); await new Promise((r) => setTimeout(r, 100));
    window.__x = document.querySelector('#shareSheet a[data-net="x"]').href; window.__sheet = document.getElementById('shareSheet').classList.contains('show'); closeShare();
    return { x: window.__x, sheet: window.__sheet, id: WCPUZZLE.current().id, welcome: document.getElementById('welcome').classList.contains('show'), coach: !document.getElementById('coach').hidden, copied, hash: location.hash };
  });
  check('a #puzzle= link opens that puzzle; Challenge a friend copies its link', link.id === 'hc-003' && !link.welcome && !link.coach && /#puzzle=hc-003$/.test(link.copied) && link.hash === '' && link.sheet && /^https:\/\/twitter\.com\/intent\/tweet\?text=.*puzzle%3Dhc-003$/.test(link.x), link);
  const rev = await pzp.evaluate(async () => {
    const m = (fc, fr, tc, tr) => ({ kind: 'm', from: { c: fc, r: fr }, to: { c: tc, r: tr } });
    openReview([m(4, 1, 4, 3), m(3, 6, 3, 4), m(3, 0, 6, 3), m(2, 7, 6, 3)], 'audit');      // 1.e4 d5 2.Qg4?? Bxg4
    for (let i = 0; i < 200 && !/^Accuracy/.test(document.getElementById('revAccuracy').textContent); i++) await new Promise((r) => setTimeout(r, 100));
    revSeek(0); revNextMistake();
    return { pos: revPos, info: document.getElementById('revMoveInfo').textContent, summary: document.getElementById('revSummary').textContent, best: revBest.length };
  });
  check('review coach: Next mistake finds the blunder and says what was better', rev.pos === 3 && /Better was/.test(rev.info) && /White: 1 blunder/.test(rev.summary), rev);
  // --- v86: no visible selects; pickers drive the hidden state; setup sheet starts a game ---
  const ui = await pzp.evaluate(async () => {
    exitPuzzles(); closeLobby();
    const visibleSelects = [...document.querySelectorAll('select')].filter((e) => e.offsetParent !== null).map((e) => e.id);
    openLobby(); document.querySelector('[data-lobbymode="computer"]').click();
    const open = document.getElementById('setupSheet').classList.contains('show');
    document.querySelector('#pickLevel .pick-opt[data-v="4"]').click();
    document.querySelector('#pickSide .pick-opt[data-v="black"]').click();
    document.querySelector('#pickTempo .pick-opt[data-v="3+2"]').click();
    document.getElementById('setupStart').click();
    await new Promise((r) => setTimeout(r, 300));
    const started = { level: document.getElementById('botLevel').value, botSide: botSide(), bot: botEnabled(), rated: ratedGame, clock: clock.key, lobby: document.getElementById('lobby').classList.contains('show'), sheet: document.getElementById('setupSheet').classList.contains('show') };
    document.getElementById('settingsBtn').click();
    document.querySelector('#pickBoard .pick-opt[data-v="slate"]').click();
    const board = WCTHEME.get().board;
    document.querySelector('#pickBoard .pick-opt[data-v="mono"]').click();
    document.querySelector('#pickAna .pick-opt[data-v="off"]').click(); const anaOff = !document.getElementById('anaOn').checked;
    document.querySelector('#pickAna .pick-opt[data-v="4"]').click(); const anaDeep = document.getElementById('anaOn').checked && document.getElementById('anaDepth').value === '4';
    document.querySelector('#pickAna .pick-opt[data-v="3"]').click();
    document.querySelector('#settingsSheet [data-close]').click();
    return { visibleSelects, open, started, board, anaOff, anaDeep };
  });
  check('v86: no visible dropdowns; setup sheet starts an unrated bot game; settings pickers work',
    ui.visibleSelects.length === 0 && ui.open && ui.started.level === '4' && ui.started.botSide === 'white' && ui.started.bot && !ui.started.rated && ui.started.clock === '3+2' && !ui.started.lobby && !ui.started.sheet && ui.board === 'slate' && ui.anaOff && ui.anaDeep, ui);
  await pzp.evaluate(() => { try { gameActs.length = 0; } catch (e) {} });

  // --- v88: same-screen games ask for a tempo; the Modern piece set is the default ---
  const hot = await pzp.evaluate(async () => {
    closeLobby(); openLobby();
    document.querySelector('[data-lobbymode="hotseat"]').click();
    const asked = document.getElementById('hotseatSheet').classList.contains('show') && !document.getElementById('lobby').classList.contains('show') === false;
    document.querySelector('#pickTempoHot .pick-opt[data-v="5+3"]').click();
    document.getElementById('hotseatStart').click();
    await new Promise((r) => setTimeout(r, 300));
    return { asked, clock: clock.key, white: clock.white, bot: botEnabled(), sheet: document.getElementById('hotseatSheet').classList.contains('show'), lobby: document.getElementById('lobby').classList.contains('show'),
      pieces: WCTHEME.get().pieces, sym: !!document.querySelector('#board use[href^="#pc-cburnett-"]') };
  });
  check('v88: same-screen asks for tempo and starts with that clock; Staunton pieces by default',
    hot.asked && hot.clock === '5+3' && hot.white === 300000 && !hot.bot && !hot.sheet && !hot.lobby && hot.pieces === 'cburnett' && hot.sym, hot);
  await pzp.evaluate(() => { try { gameActs.length = 0; } catch (e) {} });

  // --- v87: back. Header arrow opens the menu; Back links close panels; browser Back closes the top panel ---
  const back = await pzp.evaluate(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    const open = (id) => document.getElementById(id).classList.contains('show');
    closeLobby(); await wait(150);
    document.getElementById('homeBtn').click(); await wait(100);
    const menu = open('lobby');
    document.querySelector('[data-lobbymode="computer"]').click(); await wait(100);
    const both = open('lobby') && open('setupSheet');
    history.back(); await wait(250);
    const afterBack1 = { setup: open('setupSheet'), lobby: open('lobby') };
    history.back(); await wait(250);
    const afterBack2 = { lobby: open('lobby') };
    openProfile(); await wait(100);
    document.querySelector('#profile .ov-back').click(); await wait(250);
    return { menu, both, afterBack1, afterBack2, profileClosed: !open('profile'), href: location.pathname };
  });
  check('v87: header arrow, Back links and browser Back all close panels in order',
    back.menu && back.both && !back.afterBack1.setup && back.afterBack1.lobby && !back.afterBack2.lobby && back.profileClosed, back);

  // --- v83: profile — empty state, then form row, rename, filters ---
  const prof = await pzp.evaluate(async () => {
    exitPuzzles(); closeLobby(); showMatchList && showMatchList();
    openProfile();
    const empty = !!document.getElementById('profPlay') && document.getElementById('profForm').innerHTML === '';
    const pool = WCLADDER.livePool(); const m = (fc, fr, tc, tr) => ({ kind: 'm', from: { c: fc, r: fr }, to: { c: tc, r: tr } });
    [1, 0, 1, 1].forEach((sc, i) => WCLADDER.recordResult(pool[i].id, sc, { acts: [m(4, 1, 4, 3)], youColor: i % 2 ? 'black' : 'white', reason: 'checkmate', plies: 30 }));
    renderProfile();
    const rows = () => document.querySelectorAll('#matchList .match-row').length;
    const all = rows();
    document.querySelector('#profFilter button[data-f="loss"]').click(); const losses = rows();
    document.querySelector('#profFilter button[data-f="all"]').click();
    document.getElementById('profEdit').click();
    const inp = document.getElementById('profNameInput'); inp.value = 'AuditRook77'; inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    return { empty, all, losses, chips: document.querySelectorAll('.pf-chip').length, name: document.getElementById('profName').textContent, saved: WCLADDER.getProfile().name, summary: document.getElementById('profSummary').textContent };
  });
  check('profile: empty state, form row, loss filter, rename', prof.empty && prof.all === 4 && prof.losses === 1 && prof.chips === 4 && prof.name === 'AuditRook77' && prof.saved === 'AuditRook77' && /on the ladder/.test(prof.summary), prof);
  check('no page errors on the puzzle/review page', pzErrs.length === 0, pzErrs);
  await pzp.close();

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
