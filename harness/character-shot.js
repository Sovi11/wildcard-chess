// Mascot candidates: static sheet (PNG) + animated talking demo (mp4 with voice).
// Needs: dev server on :5180, playwright, ffmpeg. Run character-line.py first for the voice.
//
//   node harness/character-shot.js sheet
//   node harness/character-shot.js anim
//   node harness/character-shot.js all

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const BASE = 'http://localhost:5180';
const OUT = path.join(ROOT, 'shorts', 'out', 'mascot');
const ffmpeg = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error'].concat(args), { stdio: 'inherit' });

async function sheet(browser) {
  const page = await browser.newPage({ viewport: { width: 1800, height: 1100 }, deviceScaleFactor: 1 });
  await page.goto(BASE + '/shorts/character.html');
  await page.waitForFunction('window.SHEET_READY === true');
  await page.waitForTimeout(300);
  await page.locator('#sheet').screenshot({ path: path.join(OUT, 'character-sheet.png') });
  await page.close();
  console.log('saved character-sheet.png');
}

async function anim(browser) {
  const W = 1080, H = 1920;
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1,
    recordVideo: { dir: OUT, size: { width: W, height: H } } });
  const page = await ctx.newPage();
  await page.goto(BASE + '/shorts/character.html?mode=anim');
  await page.waitForFunction('window.SCENE_DONE === true', null, { timeout: 60000 });
  await page.waitForTimeout(200);
  const video = page.video();
  await ctx.close();
  const raw = await video.path();
  const silent = path.join(OUT, 'character-demo-video.mp4');
  ffmpeg(['-i', raw, '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '19', '-an', silent]);
  fs.unlinkSync(raw);
  mux();
}

// mux the voice line, delayed by the scene's START offset (recording starts ~at page load);
// audio is padded so the video keeps its full length.
function mux() {
  const silent = path.join(OUT, 'character-demo-video.mp4');
  const line = JSON.parse(fs.readFileSync(path.join(OUT, 'character-line.json'), 'utf8'));
  const delayMs = Math.round((line.start || 0.9) * 1000);
  // apad + -shortest hangs with stream copy; cap with the video's own duration instead
  const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', silent]).toString().trim();
  ffmpeg(['-i', silent, '-i', path.join(OUT, 'character-line.mp3'),
    '-filter_complex', `[1:a]adelay=${delayMs}|${delayMs},volume=1.4,apad=whole_dur=${dur}[v]`,
    '-map', '0:v', '-map', '[v]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '160k', '-t', dur,
    path.join(OUT, 'character-demo.mp4')]);
  console.log('saved character-demo.mp4');
}

(async function main() {
  const what = process.argv[2] || 'all';
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    if (what === 'sheet' || what === 'all') await sheet(browser);
    if (what === 'anim' || what === 'all') await anim(browser);
    if (what === 'mux') mux();
  } finally { await browser.close(); }
})().catch((e) => { console.error(e); process.exit(1); });
