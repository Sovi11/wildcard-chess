// Phone layout sweep. Opens every screen on real phone viewports and fails on
// sideways scroll, controls that poke out of the screen, or tap targets too
// small to hit. Also checks game links and the Puzzles tab of the profile.
//   node harness/smoke-mobile.js [http://localhost:5180] [--shots=dir]
const { chromium, devices } = require('playwright');
const path = require('path');
const BASE = (process.argv[2] && !process.argv[2].startsWith('--')) ? process.argv[2] : 'http://localhost:5180';
const SHOTS = (process.argv.find((a) => a.startsWith('--shots=')) || '').split('=')[1];
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || !detail ? '' : '  ' + JSON.stringify(detail))); };

// what is wrong with the layout that is on screen right now
const probe = () => {
  const vw = document.documentElement.clientWidth;
  const out = { vw, scrollW: document.documentElement.scrollWidth, off: [], small: [] };
  const vis = (el) => { const s = getComputedStyle(el); if (s.display === 'none' || s.visibility === 'hidden' || +s.opacity === 0) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  // the topmost open panel is the screen; if none, the app itself
  const panels = [...document.querySelectorAll('.lobby.show')];
  const root = panels.length ? panels[panels.length - 1] : document.querySelector('.app');
  const name = (el) => (el.id ? '#' + el.id : el.tagName.toLowerCase() + (el.className && el.className.baseVal === undefined ? '.' + String(el.className).split(' ')[0] : '')) + ' "' + (el.textContent || '').trim().slice(0, 18) + '"';
  for (const el of root.querySelectorAll('button, a, input, select, [role="button"]')) {
    if (!vis(el) || el.closest('[hidden]')) continue;
    let p = el, clipped = false;                    // inside a scroller or behind a closed <details>: not on screen
    while ((p = p.parentElement)) { if (p.tagName === 'DETAILS' && !p.open && !el.closest('summary')) clipped = true; }
    if (clipped) continue;
    const r = el.getBoundingClientRect();
    if (r.right > vw + 1 || r.left < -1) out.off.push(name(el) + ' ' + Math.round(r.left) + '..' + Math.round(r.right));
    if ((r.width < 28 || r.height < 28) && el.tagName !== 'A' && el.type !== 'checkbox') out.small.push(name(el) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height));
  }
  return out;
};

(async () => {
  const browser = await chromium.launch();
  for (const dev of ['iPhone SE', 'iPhone 13', 'Pixel 7']) {
    const ctx = await browser.newContext({ ...devices[dev] });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('dialog', (d) => d.accept());
    page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errors.push(m.text()); });
    const screen = async (label) => {
      await page.waitForTimeout(350);
      const p = await page.evaluate(probe);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, dev.replace(/\s/g, '') + '-' + label.replace(/\W+/g, '_') + '.png') });
      check(dev + ' · ' + label + ': fits the screen', p.scrollW <= p.vw + 1 && !p.off.length, { vw: p.vw, scrollW: p.scrollW, off: p.off.slice(0, 5) });
      check(dev + ' · ' + label + ': tap targets', !p.small.length, p.small.slice(0, 6));
    };

    // first visit: straight onto a board
    await page.goto(BASE + '/?mob=' + Date.now());
    await page.waitForTimeout(1200);
    await screen('first visit');
    await page.evaluate(() => { try { localStorage.setItem('hollowchess.first.v1', '1'); } catch (e) {} });

    // returning visitor: welcome, menu, each sheet
    await page.goto(BASE + '/?mob2=' + Date.now());
    await page.waitForTimeout(1000);
    await screen('welcome');
    await page.evaluate(() => document.getElementById('welcomeGuest').click());
    await screen('menu');
    await page.evaluate(() => document.querySelector('[data-lobbymode="computer"]').click());
    await screen('computer setup');
    await page.evaluate(() => document.getElementById('setupStart').click());
    await page.waitForTimeout(500);
    await screen('game vs bot');
    await page.evaluate(() => document.querySelector('#actionBar [data-do="more"]').click());
    await screen('more menu');
    await page.evaluate(() => document.querySelector('#actionBar [data-do="settings"]').click());
    await screen('settings');
    await page.evaluate(() => document.querySelector('#settingsSheet [data-close]').click());

    // a short same-screen game, then its link
    await page.evaluate(() => { openLobby(); document.querySelector('[data-lobbymode="hotseat"]').click(); });
    await screen('hotseat setup');
    await page.evaluate(() => document.getElementById('hotseatStart').click());
    await page.waitForTimeout(400);
    const link = await page.evaluate(() => {
      const mv = (a, b, c, d) => { if (game.makeMove(a, b, c, d)) done({ kind: 'm', from: { c: a, r: b }, to: { c: c, r: d } }); };
      mv(4, 1, 4, 3); mv(4, 6, 4, 4); mv(6, 0, 5, 2); mv(1, 7, 2, 5);
      document.getElementById('shareBtn').click();
      return { n: gameActs.length, url: document.getElementById('shareUrl').value, title: document.getElementById('shareTitle').textContent };
    });
    check(dev + ' · share during a game hands out a link to that game', link.n === 4 && /#replay=\w{20}$/.test(link.url) && /game/i.test(link.title), link);
    await screen('share sheet');
    await page.evaluate(() => document.getElementById('shareClose').click());

    // open that link cold
    const p2 = await ctx.newPage();
    p2.on('pageerror', (e) => errors.push(e.message));
    await p2.goto(BASE + '/?mob3=' + Date.now() + link.url.slice(link.url.indexOf('#')));
    await p2.waitForTimeout(1500);
    const rep = await p2.evaluate(() => ({ review: document.getElementById('profReview').classList.contains('show'),
      moves: document.querySelectorAll('#revLog .logline').length, title: document.getElementById('reviewTitle').textContent,
      welcome: document.getElementById('welcome').classList.contains('show'), hash: location.hash }));
    check(dev + ' · a game link opens that game on the review board', rep.review && rep.moves === 4 && !rep.welcome && rep.hash === '', rep);
    await p2.close();

    // profile, both tabs
    await page.evaluate(() => { openProfile(); });
    await screen('profile games');
    await page.evaluate(() => document.querySelector('#profTabs [data-t="puzzles"]').click());
    await page.waitForTimeout(600);
    const pz = await page.evaluate(() => ({ tiles: document.querySelectorAll('#pzStats .prof-tile').length, rows: document.querySelectorAll('#pzProg .pzp-row').length, days: document.querySelectorAll('#pzDays .pzd').length, links: document.querySelectorAll('#profLinks .ext-add').length }));
    check(dev + ' · profile Puzzles tab shows stats, progress and activity', pz.tiles === 4 && pz.rows >= 2 && pz.days === 14 && pz.links === 2, pz);
    await screen('profile puzzles');
    await page.evaluate(() => { closeProfile(); openLobby(); document.querySelector('[data-lobbymode="puzzles"]').click(); });
    await page.waitForTimeout(900);
    await screen('puzzle');

    check(dev + ' · no page errors', !errors.length, errors.slice(0, 4));
    await ctx.close();
  }
  await browser.close();
  const bad = results.filter((r) => !r.ok);
  console.log(bad.length ? '\nMOBILE CHECKS FAILED: ' + bad.length : '\nMOBILE CHECKS OK');
  process.exit(bad.length ? 1 : 0);
})();
