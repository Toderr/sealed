const path = require('path');
const { chromium } = require(path.join(__dirname, 'screenshot-tmp', 'node_modules', 'playwright-core'));
const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DECK_URL = 'file:///' + path.resolve(__dirname, 'Sealed Deck.html').replace(/\\/g, '/');
(async () => {
  const browser = await chromium.launch({ executablePath: CHROME, headless: true, args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(DECK_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);
  await page.evaluate((i) => { const s = document.querySelectorAll('.slide')[i]; if(s) s.scrollIntoView({behavior:'instant',block:'start'}); }, 3);
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(__dirname, 'screenshot-tmp', 'slide-04-preview.png') });
  await browser.close();
  console.log('done');
})().catch(e => { console.error(e); process.exit(1); });
