/**
 * Full-page homepage previews at 1440, 390 and 320 wide, plus a sideways
 * scroll check. Usage (from pupsync/, Playwright installed):
 *   node ../store/tools/render-site-preview.mjs [outDir]
 */
import fs from 'fs';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(__dirname, '..', '..');
const site = path.join(repo, 'site');
const out = path.resolve(process.argv[2] || path.join(repo, 'dist', 'site-preview'));
fs.mkdirSync(out, { recursive: true });
const require = createRequire(path.join(repo, 'pupsync', 'package.json'));
const { chromium } = require('playwright');

const types = { '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p.endsWith('/')) p += 'index.html';
  const f = path.join(site, p);
  if (!f.startsWith(site) || !fs.existsSync(f)) return res.writeHead(404).end();
  res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}/`;

const browser = await chromium.launch();
let failed = false;
for (const w of [1440, 390, 320]) {
  const page = await browser.newPage({ viewport: { width: w, height: 900 }, deviceScaleFactor: w < 500 ? 2 : 1 });
  await page.goto(base, { waitUntil: 'networkidle' });
  const sw = await page.evaluate(async () => {
    document.querySelectorAll('img[loading="lazy"]').forEach((i) => (i.loading = 'eager'));
    await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
    await document.fonts.ready;
    return document.documentElement.scrollWidth;
  });
  const ok = sw <= w;
  failed ||= !ok;
  console.log(`${w}px: scrollWidth ${sw} ${ok ? 'ok' : 'OVERFLOW'}`);
  await page.screenshot({ path: path.join(out, `home-${w}.png`), fullPage: true });
  await page.close();
}
await browser.close();
server.close();
process.exit(failed ? 1 : 0);
