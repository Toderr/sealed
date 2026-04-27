/**
 * capture-landing.js
 * Captures Problem, Solution, and HowItWorks sections from the landing page
 * at 1920×1080 viewport. Saves to screenshot-tmp/.
 */
const path = require('path');
const { chromium } = require(path.join(__dirname, 'screenshot-tmp', 'node_modules', 'playwright-core'));

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL    = 'http://localhost:3000';
const OUT    = path.join(__dirname, 'screenshot-tmp');

async function captureSection(page, selector, filename, yOffset = 0) {
  await page.evaluate(({ sel, offset }) => {
    const el = document.querySelector(sel);
    if (el) {
      el.scrollIntoView({ behavior: 'instant', block: 'start' });
      window.scrollBy(0, offset);
    }
  }, { sel: selector, offset: yOffset });
  await page.waitForTimeout(800);
  const outPath = path.join(OUT, filename);
  await page.screenshot({ path: outPath });
  const fs = require('fs');
  const kb = (fs.statSync(outPath).size / 1024).toFixed(0);
  console.log(`  ✓ ${filename}  (${kb} KB)`);
}

(async () => {
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500);

  console.log('Capturing landing page sections...\n');

  // Problem — no ID; find by heading text
  await captureSection(page, 'section.border-t', 'landing-problem.png');

  // Solution
  await captureSection(page, '#solution', 'landing-solution.png');

  // How It Works
  await captureSection(page, '#how', 'landing-howitworks.png');

  await browser.close();
  console.log('\nDone.');
})().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
