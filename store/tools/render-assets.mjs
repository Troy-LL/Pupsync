/**
 * Render real popup UI (dev preview + fake student Juan Dela Cruz) and build
 * the store screenshots, promo tile and homepage product images from it.
 *
 *   cd pupsync && npm install --no-save playwright@1 && npx playwright install chromium
 *   node ../store/tools/render-assets.mjs
 *
 * Starts the dev server on :5173 if it is not running. Writes:
 *   site/assets/product/*.png        popup renders at 2x (homepage + frames)
 *   store/screenshots/0N-*.png        1280x800 store frames (shots 2 and 5)
 *   store/promo/promo-tile-440x280.png
 * Shots 1, 3 and 4 need real Google Calendar captures (pupsync/dev/capture/).
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '..', '..');
const ext = path.join(repo, 'pupsync');
const require = createRequire(path.join(ext, 'package.json'));
const { chromium } = require('playwright');

const PRODUCT = path.join(repo, 'site', 'assets', 'product');
const SHOTS = path.join(repo, 'store', 'screenshots');
const PROMO = path.join(repo, 'store', 'promo');
for (const d of [PRODUCT, SHOTS, PROMO]) fs.mkdirSync(d, { recursive: true });

const BASE = 'http://127.0.0.1:5173';

function up() {
  return new Promise((resolve) => {
    http.get(`${BASE}/`, (r) => resolve(r.statusCode === 200)).on('error', () => resolve(false));
  });
}

let server = null;
if (!(await up())) {
  server = spawn(process.execPath, ['dev/server.js'], { cwd: ext, stdio: 'ignore' });
  for (let i = 0; i < 40 && !(await up()); i++) await new Promise((r) => setTimeout(r, 200));
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1100, height: 1400 }, deviceScaleFactor: 2 });
// Deterministic standing line ("Looking good, Juan. On track for ...").
await ctx.addInitScript(() => {
  Math.random = () => 0;
});
const page = await ctx.newPage();

async function fresh(query) {
  await page.goto(`${BASE}/${query}`);
  await page.evaluate(() => localStorage.clear());
  await page.goto(`${BASE}/${query}`);
  await page.waitForTimeout(1200);
}

async function shoot(name, selector = '.popup-frame') {
  const el = page.locator(selector).first();
  await el.screenshot({ path: path.join(PRODUCT, name), animations: 'disabled' });
  console.log('  product/', name);
}

// Popup renders
await fresh('?scene=schedule');
await shoot('popup-week-grid.png');
await shoot('popup-term-line.png', '.semester-section');
await shoot('popup-grid-only.png', '#schedule-grid-scroll');
await page.click('#btn-preview');
await page.waitForTimeout(300);
await shoot('popup-preview.png');
await page.click('#btn-preview');
await page.locator('g.schedule-block[data-code="COMP 013"]').first().click();
await page.waitForTimeout(300);
await shoot('popup-chip-edit.png');
await page.keyboard.press('Escape');
await page.click('#view-list');
await page.waitForTimeout(300);
await shoot('popup-list.png');
await page.click('#view-grid');
await page.click('#btn-import');
await page.waitForSelector('#state-d:not([hidden])', { timeout: 20000 });
await page.waitForTimeout(300);
await shoot('popup-import-success.png');
await page.click('#btn-again');
await page.click('#btn-import');
await page.waitForSelector('#state-d:not([hidden])', { timeout: 20000 });
await page.waitForTimeout(300);
await shoot('popup-reimport-unchanged.png');

await fresh('?scene=grades&fixture=magna');
await shoot('popup-gwa-magna.png');

// Exported week image (real export code)
await fresh('?scene=schedule');
const weekPng = await page.evaluate(async () => {
  const hrefs = [];
  HTMLAnchorElement.prototype.click = function () {
    hrefs.push(this.href);
  };
  document.getElementById('btn-export').click();
  await new Promise((r) => setTimeout(r, 1500));
  const buf = await (await fetch(hrefs[0])).arrayBuffer();
  let s = '';
  new Uint8Array(buf).forEach((x) => (s += String.fromCharCode(x)));
  return btoa(s);
});
fs.writeFileSync(path.join(PRODUCT, 'export-week.png'), Buffer.from(weekPng, 'base64'));
console.log('  product/ export-week.png');

// Fake SIAS table (the "before")
const sias = await ctx.newPage();
await sias.setViewportSize({ width: 900, height: 700 });
await sias.goto(`${BASE}/dev/capture/fake-sias-schedule.html`);
await sias.locator('body').screenshot({ path: path.join(PRODUCT, 'sias-table.png') });
console.log('  product/ sias-table.png');
await sias.close();

// Store frames
const FONTS =
  '<link href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,800&display=swap" rel="stylesheet">';
const dataUrl = (f) =>
  `data:image/png;base64,${fs.readFileSync(path.isAbsolute(f) ? f : path.join(PRODUCT, f)).toString('base64')}`;

async function frame(file, caption, images, { gap = 40 } = {}) {
  const imgs = images
    .map((i) => `<img src="${dataUrl(i.file)}" style="max-height:${i.maxH || 600}px;max-width:${i.maxW || 1180}px">`)
    .join('');
  const html = `<!doctype html><html><head>${FONTS}<style>
    *{margin:0;box-sizing:border-box}
    body{width:1280px;height:800px;background:#f7f2f3;overflow:hidden}
    .cap{height:160px;background:#faf8f8;display:flex;align-items:center;justify-content:center;border-bottom:1px solid #eadfe1}
    h1{font-family:'Bricolage Grotesque',system-ui,sans-serif;font-weight:800;font-size:56px;letter-spacing:-0.03em;color:#1c1214}
    .stage{height:640px;display:flex;align-items:center;justify-content:center;gap:${gap}px;padding:20px 40px}
    img{display:block;border-radius:12px;border:1px solid #e0cfd3;background:#fff;object-fit:contain;width:auto;height:auto}
  </style></head><body><div class="cap"><h1>${caption}</h1></div><div class="stage">${imgs}</div></body></html>`;
  const p = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 });
  await p.setContent(html, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.screenshot({ path: path.join(SHOTS, file) });
  await p.close();
  console.log('  screenshots/', file);
}

await frame('02-check-and-color.png', 'Check and color every class before you import', [
  { file: 'popup-week-grid.png', maxH: 610 }
]);
await frame('05-gwa.png', 'See your GWA and honors track', [{ file: 'popup-gwa-magna.png', maxH: 600 }]);

// Shots 1, 3 and 4: framed only once the real Google Calendar captures exist
// in store/screenshots/_raw/ (see pupsync/dev/capture/README.md).
const RAW = path.join(SHOTS, '_raw');
const raw = (f) => path.join(RAW, f);
const have = (...fs_) => fs_.every((f) => fs.existsSync(raw(f)));
if (have('01-calendar-week.png')) {
  await frame('01-week-in-calendar.png', 'Your PUPSIS schedule, now in Google Calendar', [
    { file: 'sias-table.png', maxH: 560, maxW: 520 },
    { file: raw('01-calendar-week.png'), maxH: 600, maxW: 660 }
  ], { gap: 28 });
} else console.log('  hold: 01 (no _raw/01-calendar-week.png)');
if (have('03-october.png')) {
  await frame('03-holidays.png', 'Holidays and exam days skipped for you', [
    { file: raw('03-october.png'), maxH: 610 }
  ]);
} else console.log('  hold: 03 (no _raw/03-october.png)');
if (have('04-popup-updated.png', '04-calendar-week.png')) {
  await frame('04-resync.png', 'Schedule changed? Import again, no duplicates', [
    { file: raw('04-popup-updated.png'), maxH: 600, maxW: 440 },
    { file: raw('04-calendar-week.png'), maxH: 600, maxW: 740 }
  ], { gap: 28 });
} else console.log('  hold: 04 (no _raw/04-popup-updated.png + _raw/04-calendar-week.png)');

// Promo tile
const logo = fs.readFileSync(path.join(ext, 'popup', 'logo.svg'), 'utf8');
const tile = `<!doctype html><html><head>${FONTS}<style>
  *{margin:0;box-sizing:border-box}
  body{width:440px;height:280px;background:#7a0019;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;color:#fff}
  .logo{width:72px;height:72px;color:#fff}
  .logo svg{width:100%;height:100%}
  h1{font-family:'Bricolage Grotesque',system-ui,sans-serif;font-weight:800;font-size:38px;line-height:1.05;letter-spacing:-0.03em;text-align:center;max-width:380px}
</style></head><body><div class="logo">${logo}</div><h1>PUPSIS to<br>Google Calendar</h1></body></html>`;
const tp = await browser.newPage({ viewport: { width: 440, height: 280 }, deviceScaleFactor: 1 });
await tp.setContent(tile, { waitUntil: 'networkidle' });
await tp.evaluate(() => document.fonts.ready);
await tp.screenshot({ path: path.join(PROMO, 'promo-tile-440x280.png') });
console.log('  promo/ promo-tile-440x280.png');

await browser.close();
if (server) server.kill();
