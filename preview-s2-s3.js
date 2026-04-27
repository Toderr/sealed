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
  for (const [idx, name] of [[1,'slide-02-preview'],[2,'slide-03-preview']]) {
    await page.evaluate((i) => { const s = document.querySelectorAll('.slide')[i]; if(s) s.scrollIntoView({behavior:'instant',block:'start'}); }, idx);
    await page.waitForTimeout(700);
    await page.screenshot({ path: path.join(__dirname,'screenshot-tmp', name+'.png') });
    console.log('saved ' + name);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
