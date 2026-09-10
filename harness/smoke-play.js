// Headless smoke test of the live play path: guest -> skip tutorial -> Play now ->
// e2-e4 -> bot replies. Fails loudly on any page error / console error.
//   node harness/smoke-play.js [http://localhost:5180]
const { chromium } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:5180';
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 420, height: 860 } });
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(BASE + '/?smoke=' + Date.now());
  await page.waitForTimeout(900);
  const step = async (label, fn) => { const r = await fn(); console.log(label + ':', typeof r === 'string' ? r : JSON.stringify(r)); return r; };
  await step('welcome shown', () => page.evaluate(() => document.getElementById('welcome').classList.contains('show')));
  await page.evaluate(() => document.getElementById('welcomeGuest').click());
  await page.waitForTimeout(400);
  await step('tutorial shown (first visit)', () => page.evaluate(() => { const t = document.getElementById('tutorial'); return !!t && t.classList.contains('show'); }));
  await page.evaluate(() => { const b = document.getElementById('tutSkip'); if (b) b.click(); });
  await page.waitForTimeout(400);
  await step('lobby shown', () => page.evaluate(() => document.getElementById('lobby').classList.contains('show')));
  await page.evaluate(() => document.getElementById('playBotNow').click());
  // "Play now" runs the staged search + match-found card (~2-4s) before the game starts
  await page.waitForFunction(() => !document.getElementById('lobby').classList.contains('show'), null, { timeout: 15000 });
  await page.waitForTimeout(300);
  await step('game view', () => page.evaluate(() => ({ lobby: document.getElementById('lobby').classList.contains('show'), turn: game.turn, plies: game.history.length })));
  const humanSide = await page.evaluate(() => (typeof botSide === 'function' && botSide() === 'white') ? 'black' : 'white');
  console.log('human plays:', humanSide);
  if (humanSide === 'black') await page.waitForTimeout(3500);       // bot moves first
  // click the pawn's square then its destination; the board is drawn from the human's side
  const box = await page.locator('#board').boundingBox();
  const flipped = humanSide === 'black';
  const sq = (c, r) => ({ x: box.x + ((flipped ? 7 - c : c) + 0.5) / 8 * box.width, y: box.y + ((flipped ? r : 7 - r) + 0.5) / 8 * box.height });
  const from = humanSide === 'white' ? sq(4, 1) : sq(4, 6), to = humanSide === 'white' ? sq(4, 3) : sq(4, 4);
  await page.mouse.click(from.x, from.y); await page.waitForTimeout(200);
  await page.mouse.click(to.x, to.y);
  await page.waitForTimeout(400);
  const afterMove = await step('after my move', () => page.evaluate(() => ({ plies: game.history.length, last: game.history.slice(-1)[0] && game.history.slice(-1)[0].text, turn: game.turn })));
  await page.waitForTimeout(3500);
  const afterBot = await step('after bot reply', () => page.evaluate(() => ({ plies: game.history.length, last: game.history.slice(-1)[0] && game.history.slice(-1)[0].text, turn: game.turn, status: game.status })));
  await step('overlays during play', () => page.evaluate(() => ['welcome', 'lobby', 'profile', 'tutorial', 'onboard'].filter((id) => { const e = document.getElementById(id); return e && e.classList.contains('show'); })));
  const mine = humanSide === 'white' ? 1 : 2;
  const ok = afterMove.plies >= mine && afterBot.plies >= afterMove.plies + 1 && errors.length === 0;
  console.log(errors.length ? 'ERRORS:\n  ' + errors.join('\n  ') : 'no page/console errors');
  console.log(ok ? 'SMOKE OK' : 'SMOKE FAILED');
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
