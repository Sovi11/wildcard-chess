// Headless smoke test of the front door: a first visit lands on a board against
// the beginner bot (no welcome wall, no tour, no lobby), you move, the bot replies,
// the coach explains the board turn, and a second visit gets the welcome screen.
//   node harness/smoke-play.js [http://localhost:5180]
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:5180';
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 420, height: 860 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push('console: ' + m.text()); });
  const fails = [];
  const check = (label, ok, detail) => { if (!ok) fails.push(label); console.log((ok ? 'PASS ' : 'FAIL ') + label + (detail ? '  ' + JSON.stringify(detail) : '')); };
  const overlays = () => page.evaluate(() => ['welcome', 'lobby', 'profile', 'tutorial', 'onboard'].filter((id) => { const e = document.getElementById(id); return e && e.classList.contains('show'); }));

  await page.goto(BASE + '/?smoke=' + Date.now());
  await page.waitForTimeout(3500);                         // past cloud boot: nothing may come back
  const first = await page.evaluate(() => ({ coach: !document.getElementById('coach').hidden, text: document.getElementById('coachText').textContent.slice(0, 40), bot: botEnabled(), botSide: botSide(), clock: clockActive(), rated: ratedGame, turn: game.turn }));
  check('first visit lands on a board with no overlay', (await overlays()).length === 0, await overlays());
  check('coach is showing, beginner bot as Black, no clock, unrated', first.coach && first.bot && first.botSide === 'black' && !first.clock && !first.rated, first);

  const box = await page.locator('#board').boundingBox();
  const sq = (c, r) => ({ x: box.x + (c + 0.5) / 8 * box.width, y: box.y + (7 - r + 0.5) / 8 * box.height });
  const move = async (fc, fr, tc, tr) => { await page.mouse.click(sq(fc, fr).x, sq(fc, fr).y); await page.waitForTimeout(250); await page.mouse.click(sq(tc, tr).x, sq(tc, tr).y); await page.waitForTimeout(400); };
  const waitBot = () => page.waitForFunction(() => game.turn === 'white' && !aiThinking, null, { timeout: 15000 });
  await move(4, 1, 4, 3);                                  // 1. e2-e4
  check('my move lands', (await page.evaluate(() => game.history.length)) >= 1);
  await waitBot();
  check('bot replies', (await page.evaluate(() => game.history.length)) === 2, await page.evaluate(() => game.history.map((h) => h.text)));
  // 2nd move: any legal pawn push, made through the game loop (the bot's board move may have reshaped the board)
  await page.evaluate(() => {
    for (const [k, p] of game.board) {
      if (p.color !== 'white' || p.type !== 'pawn') continue;
      const [c, r] = k.split(',').map(Number), m = game.legalMoves(c, r)[0];
      if (m && game.makeMove(c, r, m.c, m.r)) { done({ kind: 'm', from: { c, r }, to: { c: m.c, r: m.r } }); return; }
    }
  });
  await waitBot();
  const bt = await page.evaluate(() => ({ plies: game.history.length, wild: game.canWildcard(), coach: document.getElementById('coachText').textContent.slice(0, 11) }));
  check('coach announces the board turn on move 3', bt.plies === 4 && bt.wild && bt.coach === 'Board turn.', bt);
  check('still no overlay during play', (await overlays()).length === 0, await overlays());

  await page.evaluate(() => document.getElementById('coachMenu').click()); await page.waitForTimeout(300);
  check('Menu opens the lobby', (await overlays()).includes('lobby'));

  // a second visit resumes the game or shows the welcome screen; it never starts another "first game"
  await page.goto(BASE + '/?smoke2=' + Date.now()); await page.waitForTimeout(2500);
  const second = await page.evaluate(() => ({ coachHidden: document.getElementById('coach').hidden, firstVisit: firstVisit(), plies: game.history.length, welcome: document.getElementById('welcome').classList.contains('show') }));
  check('second visit does not restart the first game', second.coachHidden && !second.firstVisit && (second.plies === 4 || second.welcome), second);

  console.log(errors.length ? 'ERRORS:\n  ' + errors.join('\n  ') : 'no page/console errors');
  const ok = !fails.length && !errors.length;
  console.log(ok ? 'SMOKE OK' : 'SMOKE FAILED');
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
