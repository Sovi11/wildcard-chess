// itch.io listing art, made from the running site:
//   outreach/itch/cover-630x500.png      the cover image (itch's recommended size)
//   outreach/itch/shot-*.png             desktop screenshots, 1920x1290
// Usage: node harness/itch-assets.js [base]   (base defaults to http://localhost:5180)
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');

const BASE = process.argv[2] || 'http://localhost:5180';
const OUT = path.join(__dirname, '..', 'outreach', 'itch');
fs.mkdirSync(OUT, { recursive: true });

(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 }, deviceScaleFactor: 1.5 });
  const page = await ctx.newPage();
  let n = 0;
  const shot = async (name) => { n++; await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: path.join(OUT, 'shot-' + n + '-' + name + '.png') }); console.log('shot', name); };

  // 1. the starter puzzle with the square lifted
  await page.goto(BASE + '/?itch=' + Date.now());
  await page.waitForFunction(() => { const t = document.getElementById('tutorial'); return t && t.classList.contains('show'); });
  await page.evaluate(() => document.getElementById('tutTry').click());
  await page.waitForFunction(() => typeof starterOn !== 'undefined' && starterOn && puzzleMode);
  await page.evaluate(() => { const a = WCPUZZLE.expected(); onSquare(a.from.c, a.from.r); });
  await page.waitForTimeout(500);
  await shot('lift-a-square');

  // 2. a game against a bot, on a board turn with a square in hand
  await page.evaluate(() => { const a = WCPUZZLE.expected(); onSquare(a.to.c, a.to.r); });
  await page.waitForTimeout(1600);
  await page.evaluate(() => { const b = document.getElementById('pzsPlay'); if (b && b.offsetParent) b.click(); else if (typeof startVsAI === 'function') startVsAI(); });
  await page.waitForTimeout(700);
  const inGame = await page.evaluate(() => typeof game !== 'undefined' && !puzzleMode);
  if (inGame) {
    const waitBot = () => page.waitForFunction(() => game.turn === 'white' && !aiThinking, null, { timeout: 20000 });
    const play = (fc, fr, tc, tr) => page.evaluate(([fc, fr, tc, tr]) => {
      if (game.makeMove(fc, fr, tc, tr)) { done({ kind: 'm', from: { c: fc, r: fr }, to: { c: tc, r: tr } }); return true; }
      return false;
    }, [fc, fr, tc, tr]);
    await page.evaluate(() => { closeLobby && closeLobby(); });
    await play(4, 1, 4, 3); await page.waitForTimeout(400); await waitBot();
    await play(6, 0, 5, 2); await page.waitForTimeout(400); await waitBot();
    await page.waitForTimeout(600);
    await page.evaluate(() => {
      for (const key of ['0,2', '7,2', '1,2', '6,2', '0,3', '7,3']) {
        const [c, r] = key.split(',').map(Number);
        if (game.cells.has(key) && !game.board.has(key)) { onSquare(c, r); break; }
      }
    });
    await page.waitForTimeout(500);
    await shot('board-turn');
    await page.keyboard.press('Escape');
  }

  // 3. a king on an island (a puzzle that has already run as the daily)
  await page.evaluate(() => openPuzzleById('hc-176'));
  await page.waitForFunction(() => puzzleMode && WCPUZZLE.current() && WCPUZZLE.current().id === 'hc-176', null, { timeout: 15000 });
  await page.waitForTimeout(900);
  await shot('island-king');

  // 4. the menu
  await page.evaluate(() => { exitPuzzles(); openLobby(); });
  await page.waitForTimeout(800);
  await shot('menu');

  await ctx.close();

  // the cover: the mark and the name over the board move itself
  const cctx = await browser.newContext({ viewport: { width: 630, height: 500 }, deviceScaleFactor: 2 });
  const cp = await cctx.newPage();
  await cp.goto(BASE + '/?itchcover=' + Date.now());
  await cp.waitForFunction(() => window.WCTUT && WCTUT.demo);
  await cp.evaluate(() => {
    const mark = document.querySelector('.welcome-mark svg').outerHTML;
    const css = getComputedStyle(document.body);
    document.body.innerHTML =
      '<div id="cv"><div class="cv-t">' + mark + '<div><div class="cv-name">Hollow Chess</div><div class="cv-tag">Chess where you can move the squares</div></div></div>' +
      '<div class="cv-b">' + WCTUT.demo() + '</div></div>';
    const st = document.createElement('style');
    st.textContent = 'html,body{margin:0;overflow:hidden}#cv{position:fixed;inset:0;background:#0b0c0e;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;box-sizing:border-box;font-family:' + css.fontFamily.replace(/"/g, "'") + '}' +
      '.cv-t{display:flex;align-items:center;gap:18px}.cv-t>svg{width:92px;height:92px;flex:none}.cv-name{font-size:52px;font-weight:700;color:#f1efe9;letter-spacing:-.03em;line-height:1}' +
      '.cv-tag{font-size:19px;color:#a9adb5;margin-top:9px}.cv-b{width:440px;flex:none}.cv-b svg{width:100%;display:block}.cv-b .tut-cap{display:none}';
    document.head.appendChild(st);
    const s = document.querySelector('.cv-b svg'); s.setAttribute('viewBox', '0 0 5 3'); s.pauseAnimations(); s.setCurrentTime(4.6);
  });
  await cp.waitForTimeout(300);
  await cp.screenshot({ path: path.join(OUT, 'cover-630x500.png') });
  console.log('cover');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
