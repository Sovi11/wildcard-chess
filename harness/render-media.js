// Render brand assets (PNG) and record the three shorts (webm -> mp4).
// Needs: the dev server on :5180, playwright (chromium), ffmpeg on PATH.
//
//   node harness/render-media.js brand      # screenshots from brand/stage.html
//   node harness/render-media.js shorts     # records shorts/shorts.html scenes
//   node harness/render-media.js all

const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const BASE = 'http://localhost:5180';
const BRAND_OUT = path.join(ROOT, 'brand', 'out');
const SHORTS_OUT = path.join(ROOT, 'shorts', 'out');

const ffmpeg = (args) => execFileSync('ffmpeg', ['-y', '-loglevel', 'error'].concat(args), { stdio: 'inherit' });

async function renderBrand(browser) {
  fs.mkdirSync(BRAND_OUT, { recursive: true });
  const page = await browser.newPage({ viewport: { width: 2700, height: 1600 }, deviceScaleFactor: 1 });
  await page.goto(BASE + '/brand/stage.html');
  await page.waitForFunction('window.STAGE_READY === true');
  await page.waitForTimeout(400);

  const shots = [
    ['#logo-1024', 'logo-1024.png', false],
    ['#logo-flat', 'logo-transparent.png', true],
    ['#wordmark-wide', 'wordmark-2000x560.png', false],
    ['#banner-yt', 'banner-youtube-2560x1440.png', false],
    ['#banner-social', 'banner-social-1500x500.png', false],
  ];
  for (const [sel, file, omitBg] of shots) {
    await page.locator(sel).screenshot({ path: path.join(BRAND_OUT, file), omitBackground: omitBg });
    console.log('brand:', file);
  }
  await page.close();
  // downscaled profile-picture variants
  ffmpeg(['-i', path.join(BRAND_OUT, 'logo-1024.png'), '-vf', 'scale=512:512', path.join(BRAND_OUT, 'logo-512.png')]);
  ffmpeg(['-i', path.join(BRAND_OUT, 'logo-1024.png'), '-vf', 'scale=192:192', path.join(BRAND_OUT, 'logo-192.png')]);
  console.log('brand: logo-512.png, logo-192.png');
}

async function recordScene(browser, scene) {
  const ctx = await browser.newContext({
    viewport: { width: 1080, height: 1920 },
    deviceScaleFactor: 1,
    recordVideo: { dir: SHORTS_OUT, size: { width: 1080, height: 1920 } },
  });
  const page = await ctx.newPage();
  await page.goto(BASE + '/shorts/shorts.html?scene=' + scene);
  await page.waitForFunction('window.SCENE_DONE === true', null, { timeout: 180000 });
  const beats = await page.evaluate('window.SCENE_BEATS || []');
  await page.waitForTimeout(300);
  const video = page.video();
  await ctx.close();                       // flushes the webm
  const raw = await video.path();
  const mp4 = path.join(SHORTS_OUT, scene + '-video.mp4');
  ffmpeg(['-i', raw, '-r', '30', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '19', '-an', mp4]);
  fs.unlinkSync(raw);
  fs.writeFileSync(path.join(SHORTS_OUT, scene + '.beats.json'), JSON.stringify(beats, null, 1));
  console.log('short recorded:', scene, '(' + beats.length + ' beats)');
}

const SCENES = ['rook', 'escape', 'cheese', 'morph'];

(async function main() {
  const what = process.argv[2] || 'all';
  fs.mkdirSync(SHORTS_OUT, { recursive: true });
  const browser = await chromium.launch();
  try {
    if (what === 'brand' || what === 'all') await renderBrand(browser);
    if (what === 'shorts' || what === 'all') {
      const only = process.argv[3];
      for (const scene of (only ? [only] : SCENES)) await recordScene(browser, scene);
    }
  } finally {
    await browser.close();
  }
  console.log('done. now run: node harness/mix-audio.js');
})().catch((e) => { console.error(e); process.exit(1); });
