/**
 * render-deck.js
 * Captures each slide of Sealed Deck.html as a 1920×1080 PNG,
 * then compiles all slides into a single landscape PDF.
 *
 * Usage: node render-deck.js
 */

const path = require('path');
const fs   = require('fs');

const MODS_DIR   = path.join(__dirname, 'screenshot-tmp', 'node_modules');
const { chromium } = require(path.join(MODS_DIR, 'playwright-core'));
const { PDFDocument } = require(path.join(MODS_DIR, 'pdf-lib'));

const CHROME   = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const DECK_URL = 'file:///' + path.resolve(__dirname, 'Sealed Deck.html').replace(/\\/g, '/');
const OUT_DIR  = path.join(__dirname, 'screenshot-tmp');
const PDF_OUT  = path.join(__dirname, 'Sealed Deck.pdf');

async function main() {
  console.log('Launching Chrome headless…');
  const browser = await chromium.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  const page = await browser.newPage();
  await page.setViewportSize({ width: 1920, height: 1080 });

  console.log(`Loading deck: ${DECK_URL}`);
  await page.goto(DECK_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(1500); // fonts + entrance animations settle

  const slideCount = await page.evaluate(
    () => document.querySelectorAll('.slide').length
  );
  console.log(`Found ${slideCount} slides\n`);

  const pngPaths = [];

  for (let i = 0; i < slideCount; i++) {
    const num     = String(i + 1).padStart(2, '0');
    const outPath = path.join(OUT_DIR, `slide-${num}.png`);

    // Snap-scroll to this slide
    await page.evaluate((idx) => {
      const slide = document.querySelectorAll('.slide')[idx];
      if (slide) slide.scrollIntoView({ behavior: 'instant', block: 'start' });
    }, i);

    // Wait for scroll-snap + any CSS transitions
    await page.waitForTimeout(600);

    await page.screenshot({ path: outPath });
    const stat = fs.statSync(outPath);
    console.log(`  ✓ slide-${num}.png  (${(stat.size / 1024).toFixed(0)} KB)`);
    pngPaths.push(outPath);
  }

  await browser.close();
  console.log(`\nAll ${slideCount} slides captured.`);

  // ── Compile PDF ──────────────────────────────────────────────────────────
  console.log('\nCompiling PDF…');
  const pdfDoc = await PDFDocument.create();

  for (let i = 0; i < pngPaths.length; i++) {
    const pngBytes = fs.readFileSync(pngPaths[i]);
    const pngImage = await pdfDoc.embedPng(pngBytes);
    const { width, height } = pngImage;
    const pdfPage = pdfDoc.addPage([width, height]);
    pdfPage.drawImage(pngImage, { x: 0, y: 0, width, height });
    process.stdout.write(`  page ${i + 1}/${pngPaths.length}\r`);
  }

  const pdfBytes = await pdfDoc.save();
  const tmpOut = PDF_OUT + '.tmp';
  fs.writeFileSync(tmpOut, pdfBytes);
  // Atomic rename — avoids "file busy" if viewer has the PDF open
  try {
    if (fs.existsSync(PDF_OUT)) fs.unlinkSync(PDF_OUT);
    fs.renameSync(tmpOut, PDF_OUT);
  } catch {
    // If rename fails (cross-device), fall back to direct write with a new name
    const fallback = PDF_OUT.replace('.pdf', `-${Date.now()}.pdf`);
    fs.renameSync(tmpOut, fallback);
    console.log(`\n⚠ PDF was locked — saved as ${path.basename(fallback)}`);
    console.log(`  Pages : ${pdfDoc.getPageCount()}`);
    console.log(`  Size  : ${(pdfBytes.length / 1024 / 1024).toFixed(2)} MB`);
    return;
  }

  console.log(`\n✓ PDF saved → ${PDF_OUT}`);
  console.log(`  Pages : ${pdfDoc.getPageCount()}`);
  console.log(`  Size  : ${(pdfBytes.length / 1024 / 1024).toFixed(2)} MB`);
}

main().catch((e) => {
  console.error('\nFATAL:', e.message || e);
  process.exit(1);
});
