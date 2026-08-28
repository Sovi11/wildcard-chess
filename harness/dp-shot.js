const path = require('path');
const { chromium } = require('playwright');
(async () => {
  const out = path.join(__dirname, '..', 'brand', 'out');
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 1200 }, deviceScaleFactor: 1 });
  await page.goto('http://localhost:5180/brand/dp.html');
  await page.waitForFunction('window.DP_READY === true');
  await page.waitForTimeout(300);
  await page.locator('#dp').screenshot({ path: path.join(out, 'instagram-dp-1080.png') });
  await browser.close();
  console.log('saved instagram-dp-1080.png');
})();
