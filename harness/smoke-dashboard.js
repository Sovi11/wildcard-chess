// Headless check of dashboard.html against the live stats function.
//   node harness/smoke-dashboard.js <passphrase> [http://localhost:5180] [screenshot.png]
const { chromium } = require('playwright');
const PASS = process.argv[2], BASE = process.argv[3] || 'http://localhost:5180', SHOT = process.argv[4];
if (!PASS) { console.error('usage: node harness/smoke-dashboard.js <passphrase> [base] [screenshot]'); process.exit(2); }
const out = []; const check = (n, ok, d) => { out.push(ok); console.log((ok ? 'PASS ' : 'FAIL ') + n + (d ? '  ' + JSON.stringify(d) : '')); };
(async () => {
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 1180, height: 900 } });
  const errs = []; p.on('pageerror', (e) => errs.push(e.message));
  await p.goto(BASE + '/dashboard.html?t=' + Date.now()); await p.waitForTimeout(500);
  check('gate shown without a passphrase', await p.isVisible('#gate') && !(await p.isVisible('#dash')));
  await p.fill('#pass', 'definitely-wrong'); await p.click('#gateForm button'); await p.waitForTimeout(2500);
  check('wrong passphrase is refused and not kept', (await p.textContent('#gateMsg')).includes('not accepted') && (await p.evaluate(() => localStorage.getItem('hc.dash.pass'))) === null);
  await p.fill('#pass', PASS); await p.click('#gateForm button');
  await p.waitForSelector('#dash:not([hidden]) .tile', { timeout: 20000 });
  for (const d of [7, 30, 90]) {
    await p.click('.pills button[data-days="' + d + '"]'); await p.waitForTimeout(2500);
    const s = await p.evaluate(() => ({ tiles: [...document.querySelectorAll('.tile .v')].map((e) => e.textContent), points: document.querySelectorAll('#dailyTable tbody tr').length, funnel: document.querySelectorAll('#funnel .hbar').length, refs: document.querySelectorAll('#refs .hbar').length, note: document.getElementById('rangeNote').textContent, overflow: document.documentElement.scrollWidth > innerWidth }));
    check(d + ' days renders', s.tiles.length === 6 && s.points === d && s.funnel === 5 && s.refs > 0 && !s.overflow, { tiles: s.tiles, days: s.points, refs: s.refs });
  }
  await p.click('.pills button[data-days="30"]'); await p.waitForTimeout(2500);
  const box = await p.locator('#dailyChart svg').boundingBox();
  await p.mouse.move(box.x + box.width * 0.6, box.y + box.height * 0.5); await p.waitForTimeout(200);
  check('hover tooltip shows a day', /visitors/.test(await p.textContent('#tip')) && (await p.evaluate(() => +getComputedStyle(document.getElementById('tip')).opacity)) > 0.5, { tip: (await p.textContent('#tip')).slice(0, 60) });
  if (SHOT) await p.screenshot({ path: SHOT, fullPage: true });
  await p.setViewportSize({ width: 390, height: 800 }); await p.waitForTimeout(400);
  check('no sideways scroll on a phone', !(await p.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1)));
  if (SHOT) await p.screenshot({ path: SHOT.replace('.png', '-phone.png'), fullPage: true });
  check('no page errors', errs.length === 0, errs);
  await b.close(); const bad = out.filter((x) => !x).length; console.log(bad ? 'DASHBOARD CHECKS FAILED (' + bad + ')' : 'DASHBOARD CHECKS OK'); process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
