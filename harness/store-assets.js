// Play Store listing art, made from the running site:
//   app/store/screens/*.png      phone screenshots, 1080x2160
//   app/store/feature-1024x500.png
// Usage: node harness/store-assets.js [base]   (base defaults to http://localhost:5180)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:5180';
const OUT = path.join(__dirname, '..', 'app', 'store'), SHOTS = path.join(OUT, 'screens');
fs.mkdirSync(SHOTS, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 360, height: 720 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  // the app has no site footer; nothing here may write to the live database (localhost never does)
  const asApp = () => page.evaluate(() => document.documentElement.classList.add('native'));
  let n = 0;
  const shot = async (name) => { n++; await page.screenshot({ path: path.join(SHOTS, String(n).padStart(2, '0') + '-' + name + '.png') }); console.log('shot', name); };

  // 1. the intro card, on its checkmate frame
  await page.goto(BASE + '/?store=' + Date.now());
  await page.waitForFunction(() => { const t = document.getElementById('tutorial'); return t && t.classList.contains('show'); });
  await asApp();
  await page.evaluate(() => { const s = document.querySelector('#tutArt svg'); s.pauseAnimations(); s.setCurrentTime(4.6); });
  await shot('intro');

  // 2. the starter puzzle with the square lifted, 3. solved
  await page.evaluate(() => document.getElementById('tutTry').click());
  await page.waitForFunction(() => typeof starterOn !== 'undefined' && starterOn && puzzleMode);
  await page.evaluate(() => { const a = WCPUZZLE.expected(); onSquare(a.from.c, a.from.r); window.scrollTo(0, 0); });
  await page.waitForTimeout(500);
  await shot('puzzle-lift');
  await page.evaluate(() => { const a = WCPUZZLE.expected(); onSquare(a.to.c, a.to.r); });
  await page.waitForTimeout(1600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('puzzle-mate');

  // 4. a game against the bot, on a board turn with a square in hand
  await page.evaluate(() => document.getElementById('pzsPlay').click());
  await page.waitForTimeout(500);
  const waitBot = () => page.waitForFunction(() => game.turn === 'white' && !aiThinking, null, { timeout: 20000 });
  const play = (fc, fr, tc, tr) => page.evaluate(([fc, fr, tc, tr]) => {
    if (game.makeMove(fc, fr, tc, tr)) { done({ kind: 'm', from: { c: fc, r: fr }, to: { c: tc, r: tr } }); return true; }
    return false;
  }, [fc, fr, tc, tr]);
  await play(4, 1, 4, 3); await page.waitForTimeout(400); await waitBot();
  await play(6, 0, 5, 2); await page.waitForTimeout(400); await waitBot();
  await page.waitForTimeout(600);
  await page.evaluate(() => {
    // lift an empty square from White's back area, away from the action
    for (const key of ['0,2', '7,2', '1,2', '6,2', '0,3', '7,3']) {
      const [c, r] = key.split(',').map(Number);
      if (game.cells.has(key) && !game.board.has(key)) { onSquare(c, r); break; }
    }
    window.scrollTo(0, 0);
  });
  await page.waitForTimeout(500);
  await shot('board-turn');
  await page.keyboard.press('Escape');

  // 5. the menu
  await page.evaluate(() => { openLobby(); });
  await page.waitForTimeout(700);
  await shot('menu');

  // 6. the daily puzzle
  await page.evaluate(() => { closeLobby(); openDaily(); });
  await page.waitForFunction(() => dailyOn && WCPUZZLE.current(), null, { timeout: 15000 });
  await page.waitForTimeout(800);
  await page.evaluate(() => window.scrollTo(0, 0));
  await shot('daily');

  // 7. the Sunday Arena, with made-up sample standings (no real player names)
  await page.evaluate(() => { exitPuzzles(); openArena(); });
  await page.waitForTimeout(2500);                 // let the real standings request land first, then draw over it
  await page.evaluate(() => {
    const real = Date.now; Date.now = () => ARENA_T0 + 3 * WEEK_MS + 1500000;
    arenaFetch = function () {};
    arenaData = { live: true, week: 4, players: 6, registered: 14, reg: null, rows: [
      { name: 'NightKnight', pts: 9, games: 5, wins: 4, you: false }, { name: 'PawnStar', pts: 8, games: 5, wins: 4, you: false },
      { name: 'Guest', pts: 6, games: 4, wins: 3, you: true }, { name: 'Rook_and_Roll', pts: 5, games: 4, wins: 2, you: false },
      { name: 'Endgame', pts: 3, games: 3, wins: 1, you: false }, { name: 'e4e5', pts: 2, games: 3, wins: 1, you: false }],
      you: { pts: 6, games: 4, wins: 3, rank: 3 } };
    paintArena(); paintArenaCard();
    window.__restore = () => { Date.now = real; };
  });
  await page.waitForTimeout(400);
  await shot('arena');
  await ctx.close();

  // the feature graphic: the mark, the name, the line, and the board move itself
  const fctx = await browser.newContext({ viewport: { width: 1024, height: 500 }, deviceScaleFactor: 1 });
  const fp = await fctx.newPage();
  await fp.goto(BASE + '/?store2=' + Date.now());
  await fp.waitForFunction(() => window.WCTUT && WCTUT.demo);
  await fp.evaluate(() => {
    const mark = document.querySelector('.welcome-mark svg').outerHTML;
    const css = getComputedStyle(document.body);
    document.body.innerHTML =
      '<div id="fg"><div class="fg-l">' + mark + '<div><div class="fg-name">Hollow Chess</div><div class="fg-tag">Chess where you can<br>move the squares</div></div></div>' +
      '<div class="fg-r">' + WCTUT.demo() + '</div></div>';
    const st = document.createElement('style');
    st.textContent = 'html,body{margin:0;overflow:hidden}#fg{position:fixed;inset:0;background:#0b0c0e;display:flex;align-items:center;justify-content:space-between;padding:0 56px;box-sizing:border-box;font-family:' + css.fontFamily.replace(/"/g, "'") + '}' +
      '.fg-l{display:flex;align-items:center;gap:26px}.fg-l>svg{width:150px;height:150px;flex:none}.fg-name{font-size:62px;font-weight:700;color:#f1efe9;letter-spacing:-.03em;line-height:1}' +
      '.fg-tag{font-size:26px;color:#a9adb5;margin-top:14px;line-height:1.25}.fg-r{width:410px;flex:none}.fg-r svg{width:100%;display:block}.fg-r .tut-cap{display:none}';
    document.head.appendChild(st);
    const s = document.querySelector('.fg-r svg'); s.setAttribute('viewBox', '0 0 5 3'); s.pauseAnimations(); s.setCurrentTime(4.6);
  });
  await fp.waitForTimeout(300);
  await fp.screenshot({ path: path.join(OUT, 'feature-1024x500.png') });
  console.log('feature graphic');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
