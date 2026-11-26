// Touch, drag and premove checks, driven with real touch events on an emulated
// phone (and a mouse on a desktop page). Plays the start of a bot game.
//   node harness/smoke-touch.js [http://localhost:5180]
const { chromium, devices } = require('playwright');
const BASE = process.argv[2] || 'http://localhost:5180';
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok }); console.log((ok ? 'PASS ' : 'FAIL ') + name + (ok || detail === undefined ? '' : '  ' + JSON.stringify(detail))); };

// screen position of the middle of a board square, in the layout on screen right now
const at = (page, c, r) => page.evaluate(([c, r]) => {
  const v = view(), rect = boardEl.getBoundingClientRect(), M = BOARD_M;
  const fx = flipped ? v.maxC - c : c - v.minC, fy = flipped ? r - v.minR : v.maxR - r;
  return { x: rect.left + (fx + M + 0.5) / (v.cols + 2 * M) * rect.width, y: rect.top + (fy + M + 0.5) / (v.rows + 2 * M) * rect.height };
}, [c, r]);
const state = (page) => page.evaluate(() => ({
  plies: game.history.length, turn: game.turn, mode: mode, premove: premove, preSel: preSel, sel: selected,
  thinking: aiThinking, scrollY: window.scrollY, last: game.lastAction ? game.lastAction.kind : null,
  marks: document.querySelectorAll('#board .premove').length,
}));
const pieceAt = (page, c, r) => page.evaluate(([c, r]) => { const p = game.hasCell(c, r) ? game.get(c, r) : null; return p ? p.color + ' ' + p.type : null; }, [c, r]);
const myTurn = (page) => page.waitForFunction(() => game.turn === 'white' && !aiThinking, null, { timeout: 25000 });

async function intoBotGame(page) {
  await page.goto(BASE + '/?touch=' + Date.now());
  await page.waitForFunction(() => { const t = document.getElementById('tutorial'); return t && t.classList.contains('show'); });
  await page.evaluate(() => document.getElementById('tutTry').click());
  await page.waitForFunction(() => typeof starterOn !== 'undefined' && starterOn && puzzleMode);
  await page.evaluate(() => { const a = WCPUZZLE.expected(); onSquare(a.from.c, a.from.r); onSquare(a.to.c, a.to.r); });
  await page.waitForTimeout(1600);
  await page.evaluate(() => document.getElementById('pzsPlay').click());
  await page.waitForFunction(() => !puzzleMode && game.history.length === 0 && botEnabled(), null, { timeout: 10000 });
  await page.waitForTimeout(500);
  await page.evaluate(() => window.scrollTo(0, 0));
}

(async () => {
  const browser = await chromium.launch();

  // ---------------- phone: fingers ----------------
  const ctx = await browser.newContext({ ...devices['Pixel 7'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map((p) => ({ x: Math.round(p.x), y: Math.round(p.y) })) });
  const tap = async (p) => { await touch('touchStart', [p]); await page.waitForTimeout(40); await touch('touchEnd', []); await page.waitForTimeout(120); };
  const glide = async (a, b, steps) => { for (let i = 1; i <= (steps || 8); i++) { await touch('touchMove', [{ x: a.x + (b.x - a.x) * i / (steps || 8), y: a.y + (b.y - a.y) * i / (steps || 8) }]); await page.waitForTimeout(16); } };
  const dragTo = async (a, b) => { await touch('touchStart', [a]); await page.waitForTimeout(40); await glide(a, b); await page.waitForTimeout(40); await touch('touchEnd', []); await page.waitForTimeout(150); };

  await intoBotGame(page);

  // 1. drag a pawn with a finger; the page must not scroll under it
  let s0 = await state(page);
  await dragTo(await at(page, 4, 1), await at(page, 4, 3));
  let s = await state(page);
  check('finger drag moves a piece (e2 to e4)', s.plies === 1 && (await pieceAt(page, 4, 3)) === 'white pawn', s);
  check('the page does not scroll while a piece is dragged', s.scrollY === s0.scrollY, { before: s0.scrollY, after: s.scrollY });

  // 2. premove by dragging while the bot thinks
  await dragTo(await at(page, 6, 0), await at(page, 5, 2));
  s = await state(page);
  check('a drag on the bot\'s turn queues a premove and marks both squares', !!s.premove && s.premove.from.c === 6 && s.premove.to.c === 5 && s.marks === 2 && s.plies === 1, s);
  await page.waitForFunction(() => game.history.length >= 3, null, { timeout: 25000 }).catch(() => {});
  s = await state(page);
  check('the premove is played as soon as the bot has moved', s.plies >= 3 && (await pieceAt(page, 5, 2)) === 'white knight' && !s.premove && s.marks === 0, s);

  // 3. on the board turn, drag an empty square to a dashed spot
  await myTurn(page);
  await page.waitForTimeout(300);
  const boardTurn = await page.evaluate(() => game.canWildcard());
  const cell = await page.evaluate(() => { for (const k of ['0,2', '7,2', '1,2', '6,2', '0,3', '7,3']) { const [c, r] = k.split(',').map(Number); if (game.cells.has(k) && !game.board.has(k)) return { c, r }; } return null; });
  if (boardTurn && cell) {
    const pliesBefore = (await state(page)).plies;
    const a = await at(page, cell.c, cell.r);
    await touch('touchStart', [a]); await page.waitForTimeout(40);
    await glide(a, { x: a.x + 30, y: a.y - 30 }, 4);                 // far enough to count as a drag: the square lifts
    const lifted = await state(page);
    const spot = await page.evaluate((k) => { const t = [...game._attachTargetsExcluding(k)].map((x) => x.split(',').map(Number)); const out = t.find((x) => !game.cells.has(x.join(','))) || t[0]; return { c: out[0], r: out[1] }; }, cell.c + ',' + cell.r);
    const b = await at(page, spot.c, spot.r);                          // measured AFTER the lift re-laid the board
    await glide({ x: a.x + 30, y: a.y - 30 }, b, 10);
    const ghost = await page.evaluate(() => !!document.querySelector('#board #dragGhost') && document.querySelector('#board #dragOver').style.display !== 'none');
    await touch('touchEnd', []); await page.waitForTimeout(200);
    s = await state(page);
    check('dragging an empty square lifts it and shows where it will land', lifted.mode === 'movecell' && ghost, { lifted: lifted.mode, ghost });
    check('dropping the square on a dashed spot is the board move', s.last === 'movecell' && s.plies === pliesBefore + 1 && (await page.evaluate((k) => game.cells.has(k), spot.c + ',' + spot.r)), s);
  } else {
    check('board turn reached with an empty square to carry', false, { boardTurn, cell });
  }

  // 4. plain taps still work: select, then move
  await myTurn(page);
  await page.waitForTimeout(300);
  const before = (await state(page)).plies;
  const mv = await page.evaluate(() => { for (const from of [[3, 1], [2, 1], [6, 1], [1, 1]]) { const l = game.legalMoves(from[0], from[1]); if (game.get(from[0], from[1]) && l.length) return { from: { c: from[0], r: from[1] }, to: { c: l[0].c, r: l[0].r } }; } return null; });
  await tap(await at(page, mv.from.c, mv.from.r));
  const picked = await state(page);
  await tap(await at(page, mv.to.c, mv.to.r));
  s = await state(page);
  check('tap, then tap, still moves a piece', !!picked.sel && s.plies === before + 1, { picked: picked.sel, plies: s.plies, before });

  // 5. premove by taps, then cancel it with a tap
  const pm = await page.evaluate(() => { for (const from of [[0, 1], [7, 1], [1, 1], [6, 1]]) { const p = game.get(from[0], from[1]); if (p && p.color === 'white' && game.hasCell(from[0], from[1] + 1) && !game.get(from[0], from[1] + 1)) return { from: { c: from[0], r: from[1] }, to: { c: from[0], r: from[1] + 1 } }; } return null; });
  await tap(await at(page, pm.from.c, pm.from.r));
  await tap(await at(page, pm.to.c, pm.to.r));
  s = await state(page);
  const queued = !!s.premove && s.marks === 2;
  await tap(await at(page, 4, 4));
  const after = await state(page);
  check('taps queue a premove on the bot\'s turn, and one more tap cancels it', queued && !after.premove && after.marks === 0, { queued: s.premove, after: after.premove, thinking: s.thinking });

  check('no page errors on the phone', errors.length === 0, errors);
  await ctx.close();

  // ---------------- desktop: mouse ----------------
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const dp = await dctx.newPage();
  const derr = [];
  dp.on('pageerror', (e) => derr.push(e.message));
  await intoBotGame(dp);
  const a = await at(dp, 4, 1), b = await at(dp, 4, 3);
  await dp.mouse.move(a.x, a.y); await dp.mouse.down(); await dp.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 }); await dp.mouse.move(b.x, b.y, { steps: 4 }); await dp.mouse.up();
  await dp.waitForTimeout(150);
  check('mouse drag still moves a piece', (await state(dp)).plies === 1 && (await pieceAt(dp, 4, 3)) === 'white pawn');
  // a click-click premove with the mouse, cancelled by a right-click
  const k1 = await at(dp, 6, 0), k2 = await at(dp, 5, 2);
  await dp.mouse.click(k1.x, k1.y); await dp.mouse.click(k2.x, k2.y);
  const q = await state(dp);
  await dp.mouse.click(k2.x, k2.y, { button: 'right' });
  const q2 = await state(dp);
  check('mouse clicks queue a premove and a right-click cancels it', !!q.premove && !q2.premove, { q: q.premove, q2: q2.premove, plies: q.plies });
  check('no page errors on desktop', derr.length === 0, derr);
  await browser.close();

  const failed = results.filter((r) => !r.ok);
  console.log(failed.length ? '\nTOUCH CHECKS FAILED: ' + failed.length : '\nTOUCH CHECKS OK');
  process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
