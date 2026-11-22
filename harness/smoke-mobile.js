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
    await screen('first visit intro');
    // Try it: the starter puzzle, a mate in 1 by a board move, then the offer of a game
    const st = await page.evaluate(async () => {
      document.getElementById('tutTry').click();
      for (let i = 0; i < 40 && !(puzzleMode && starterOn); i++) await new Promise((r) => setTimeout(r, 150));
      const before = { id: WCPUZZLE.current() && WCPUZZLE.current().id, msg: document.getElementById('pzMsg').textContent, box: document.getElementById('pzDaily').hidden };
      const a = WCPUZZLE.expected(); WCPUZZLE.playReply(a); done(a);
      await new Promise((r) => setTimeout(r, 2000));           // an ordinary puzzle would have moved on by now
      return { before, kind: a.kind, still: WCPUZZLE.current().id, box: document.getElementById('pzDaily').innerText, msg: document.getElementById('pzMsg').textContent };
    });
    check(dev + ' · Try it opens the starter puzzle; solving it offers a game', st.before.id === 'hc-001' && /board move/.test(st.before.msg) && st.before.box && st.kind === 'mc' &&
      st.still === 'hc-001' && /Play a game/.test(st.box) && /Checkmate/.test(st.msg), st);
    await screen('starter solved');
    await page.evaluate(() => document.getElementById('pzsPlay').click()); await page.waitForTimeout(400);
    const fg = await page.evaluate(() => ({ pz: puzzleMode, first: firstGame, lvl: botLevelEl.value, coach: !document.getElementById('coach').hidden }));
    check(dev + ' · Play a game starts the first game against the Casual bot', !fg.pz && fg.first && fg.lvl === '2' && fg.coach, fg);
    await screen('first visit');
    // the tour: every slide's picture and buttons are on screen without scrolling
    await page.evaluate(() => document.getElementById('coachTour').click());
    for (let i = 0; i < 5; i++) {
      await page.waitForTimeout(350);
      const t = await page.evaluate(() => { const vh = innerHeight, vw = document.documentElement.clientWidth; const box = (q) => { const e = document.querySelector(q); if (!e || !e.offsetParent) return null; const r = e.getBoundingClientRect(); return { t: Math.round(r.top), b: Math.round(r.bottom), l: Math.round(r.left), r: Math.round(r.right) }; };
        const art = box('#tutArt'), next = box('.tut-next'); return { vh, vw, art, next, ok: !!next && next.b <= vh && next.r <= vw && (!art || (art.t >= 0 && art.r <= vw && art.l >= 0)) }; });
      check(dev + ' · tour slide ' + (i + 1) + ': picture and Next button on screen', t.ok, t);
      if (SHOTS) await page.screenshot({ path: path.join(SHOTS, dev.replace(/\s/g, '') + '-tour' + i + '.png') });
      await page.evaluate(() => document.querySelector('.tut-next').click());
    }
    await page.waitForTimeout(300);
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
    await page.waitForFunction(() => /#r=/.test(document.getElementById('shareUrl').value), null, { timeout: 12000 }).catch(() => {});   // the short link comes from the server
    link.url = await page.evaluate(() => document.getElementById('shareUrl').value);
    check(dev + ' · share during a game hands out a short link to that game', link.n === 4 && /#r=[\w-]{8}$/.test(link.url) && /game/i.test(link.title), link);
    await screen('share sheet');
    await page.evaluate(() => document.getElementById('shareClose').click());

    // open that link cold
    const p2 = await ctx.newPage();
    p2.on('pageerror', (e) => errors.push(e.message));
    await p2.goto(BASE + '/?mob3=' + Date.now() + link.url.slice(link.url.indexOf('#')));
    await p2.waitForFunction(() => document.getElementById('profReview').classList.contains('show'), null, { timeout: 12000 }).catch(() => {});
    await p2.waitForTimeout(400);
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

    // the daily: its own link, a clock, a result that stays up, a share text with the time
    await page.goto(BASE + '/?mob4=' + Date.now() + '#daily');
    await page.waitForFunction(() => typeof dailyOn !== 'undefined' && dailyOn && WCPUZZLE.current(), null, { timeout: 15000 });
    await screen('daily puzzle');
    const dly = await page.evaluate(async () => {
      const id = WCPUZZLE.current().id, want = WCPUZZLE.dailyId(dailyNo()), label = document.getElementById('pzCount').textContent;
      for (let i = 0; i < 4 && !WCPUZZLE.state().finished; i++) { const a = WCPUZZLE.expected(); WCPUZZLE.playReply(a); done(a); await new Promise((r) => setTimeout(r, 700)); }
      await new Promise((r) => setTimeout(r, 1900));           // an ordinary puzzle would have moved on by now
      document.getElementById('pzdShare').click();
      const out = { id, want, label, still: WCPUZZLE.current().id, on: dailyOn, box: document.getElementById('pzDaily').innerText,
        text: document.getElementById('shareText').textContent, url: document.getElementById('shareUrl').value, hash: location.hash };
      document.getElementById('shareClose').click();
      return out;
    });
    check(dev + ' · #daily opens today\'s puzzle and its result stays up with a share text', dly.id === dly.want && dly.still === dly.id && dly.on && /^Daily #\d+/.test(dly.label) &&
      /Solved first try/.test(dly.box) && /Daily #\d+: solved first try in \d+:\d\d/.test(dly.text) && /#daily$/.test(dly.url) && dly.hash === '', dly);
    await screen('daily solved');
    await page.evaluate(() => exitPuzzles());
    const card = await page.evaluate(() => document.getElementById('dailyTag').textContent);
    check(dev + ' · the lobby card says the daily is solved', /^solved in \d+:\d\d$/.test(card), card);

    // the Sunday Arena: countdown before, standings and Play now during
    await page.goto(BASE + '/?mob5=' + Date.now() + '#arena');
    await page.waitForFunction(() => document.getElementById('arenaSheet').classList.contains('show'), null, { timeout: 15000 });
    await screen('arena');
    const ar = await page.evaluate(() => {
      const before = { status: document.getElementById('arenaStatus').innerText, go: document.getElementById('arenaGo').innerText, tag: document.getElementById('arenaTag').textContent, hash: location.hash };
      const real = Date.now; Date.now = () => ARENA_T0 + 3 * WEEK_MS + 600000;          // ten minutes into arena #4
      arenaData = { live: true, week: 4, players: 2, rows: [{ name: 'Asha', pts: 4, games: 2, wins: 2, you: false }, { name: 'Guest', pts: 2, games: 1, wins: 1, you: true }], you: { pts: 2, games: 1, wins: 1, rank: 2 } };
      paintArena(); paintArenaCard();
      const live = { status: document.getElementById('arenaStatus').innerText, rows: document.getElementById('arenaRows').innerText, you: document.getElementById('arenaYou').textContent, go: document.getElementById('arenaGo').innerText, tag: document.getElementById('arenaTag').textContent };
      Date.now = real;
      return { before, live };
    });
    check(dev + ' · #arena shows the countdown, and standings with Play now while live', /Arena #\d+ starts/.test(ar.before.status) && /Invite/.test(ar.before.go) && /^(in|live)/.test(ar.before.tag) && ar.before.hash === '' &&
      /Arena #4 is live\. 50 min left/.test(ar.live.status) && /Asha/.test(ar.live.rows) && /You/.test(ar.live.rows) && /2nd of 2 with 2 points/.test(ar.live.you) && /Play now/.test(ar.live.go) && /^live · 50 min left$/.test(ar.live.tag), ar);
    await screen('arena live');
    // registering: no notifications in this browser, so it falls back to the calendar
    const rg = await page.evaluate(async () => {
      arenaData = null; arenaRegSet(''); paintArena();
      const before = { btn: !document.getElementById('arenaReg').hidden, note: document.getElementById('arenaRegNote').innerText };
      const perm = Notification.requestPermission; Notification.requestPermission = () => Promise.resolve('denied');
      arenaRegister();
      await new Promise((r) => setTimeout(r, 300));
      Notification.requestPermission = perm;
      const note = document.getElementById('arenaRegNote');
      const after = { btn: !document.getElementById('arenaReg').hidden, note: note.innerText, state: arenaReg(),
        g: (note.querySelector('a[href*="calendar.google.com"]') || {}).href || '', ics: decodeURIComponent((note.querySelector('a[download]') || {}).href || '') };
      note.querySelector('[data-arenaoff]').click();
      const off = { btn: !document.getElementById('arenaReg').hidden, state: arenaReg() };
      return { before, after, off };
    });
    check(dev + ' · arena registration falls back to calendar links and can be turned off', rg.before.btn && !rg.after.btn && rg.after.state === 'cal' && /You are registered/.test(rg.after.note) &&
      /dates=\d{8}T143000Z\/\d{8}T153000Z/.test(rg.after.g) && /TRIGGER:-PT1H/.test(rg.after.ics) && /RRULE:FREQ=WEEKLY/.test(rg.after.ics) && rg.off.btn && rg.off.state === '', rg);
    await page.evaluate(() => closeArena());

    check(dev + ' · no page errors', !errors.length, errors.slice(0, 4));
    await ctx.close();
  }
  await browser.close();
  const bad = results.filter((r) => !r.ok);
  console.log(bad.length ? '\nMOBILE CHECKS FAILED: ' + bad.length : '\nMOBILE CHECKS OK');
  process.exit(bad.length ? 1 : 0);
})();
