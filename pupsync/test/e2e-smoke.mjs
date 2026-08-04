/**
 * Smoke / e2e checks for Dev Preview + GWA share card.
 * Run: node test/e2e-smoke.mjs  (starts server if needed)
 */
import http from 'http';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const require = createRequire(import.meta.url);

let passed = 0;
let failed = 0;
function ok(cond, msg) {
  if (cond) {
    passed += 1;
    console.log(`  ✓ ${msg}`);
  } else {
    failed += 1;
    console.error(`  ✗ ${msg}`);
  }
}

function get(urlPath) {
  return new Promise((resolve, reject) => {
    http
      .get(`http://127.0.0.1:5173${urlPath}`, (res) => {
        let body = '';
        res.on('data', (c) => (body += c));
        res.on('end', () => resolve({ status: res.statusCode, body }));
      })
      .on('error', reject);
  });
}

async function waitForServer(ms = 8000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    try {
      const r = await get('/');
      if (r.status === 200) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}

async function main() {
  console.log('\n== Unit: standing + share helpers ==');
  globalThis.PUPSYNC = {
    GWA_EXCLUDED_PREFIXES: ['CWTS', 'ROTC', 'LTS', 'NSTP'],
    HONOR_TIERS: [
      { label: 'Summa Cum Laude', max: 1.15, medal: 'gold' },
      { label: 'Magna Cum Laude', max: 1.35, medal: 'silver' },
      { label: 'Cum Laude', max: 1.6, medal: 'bronze' }
    ],
    HONOR_MIN_GRADE: 2.5
  };
  require(path.join(root, 'shared', 'utils.js'));
  require(path.join(root, 'shared', 'gwa-share-image.js'));
  const U = globalThis.PUPUtils;
  const S = globalThis.PUPGwaShare;

  const magna = U.computeAcademicStanding([
    {
      subjects: [
        { subjectCode: 'A', units: 3, grade: 1.25 },
        { subjectCode: 'B', units: 3, grade: 1.3 }
      ]
    }
  ]);
  ok(magna.tier === 'Magna Cum Laude', 'Magna standing');

  const cum = U.computeAcademicStanding([
    {
      subjects: [
        { subjectCode: 'A', units: 3, grade: 1.5 },
        { subjectCode: 'B', units: 3, grade: 1.5 }
      ]
    }
  ]);
  ok(cum.tier === 'Cum Laude', 'Cum Laude standing');

  const pendingOk = U.computeAcademicStanding([
    {
      subjects: [
        { subjectCode: 'A', units: 3, grade: 1.0 },
        { subjectCode: 'B', units: 3, grade: null, gradeText: '—' }
      ]
    }
  ]);
  ok(
    pendingOk.tier === 'Summa Cum Laude' && !pendingOk.disqualified,
    'blank grades ignored for Latin'
  );
  ok(S.medalMeta(magna).medal === 'silver', 'Magna → silver theme');
  ok(S.themeFor(magna).leaf.length >= 3, 'silver leaf palette');
  ok(S.SIZE === 1080, 'share card is square 1080');

  const fools = U.computeAcademicStanding([
    {
      subjects: [
        { subjectCode: 'A', units: 3, grade: 1.0 },
        { subjectCode: 'B', units: 1, grade: 3.0 }
      ]
    }
  ]);
  ok(fools.disqualified && fools.qualifiesTier, 'fool standing flags');
  ok(S.medalMeta(fools).fools === true, 'fool medal meta');
  ok(
    S.shareLine(magna, 'Troy').includes('Troy'),
    'share line personalizes name'
  );

  console.log('\n== HTTP: Dev Preview scenes ==');
  let child = null;
  let up = await waitForServer(500);
  if (!up) {
    child = spawn(process.execPath, ['dev/server.js'], {
      cwd: root,
      stdio: 'ignore',
      detached: false
    });
    up = await waitForServer(10000);
  }
  ok(up, 'dev server reachable on :5173');

  if (up) {
    for (const p of [
      '/',
      '/?scene=grades',
      '/?scene=grades&fixture=summa',
      '/?scene=grades&fixture=foolsGold',
      '/?scene=grades&fixture=foolsSilver',
      '/?scene=grades&fixture=foolsBronze',
      '/?scene=off',
      '/shared/gwa-share-image.js',
      '/popup/popup.js'
    ]) {
      const r = await get(p);
      ok(r.status === 200, `${p} → 200`);
    }
    const grades = await get('/?scene=grades&fixture=summa');
    ok(grades.body.includes('btn-export-gwa'), 'grades has Export image CTA');
    ok(grades.body.includes('gwa-share-image.js'), 'gwa share script linked');
    ok(grades.body.includes('gwa-breakdown'), 'breakdown UI present');
  }

  console.log('\n== Browser: share card geometry (Playwright if available) ==');
  let browserRan = false;
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:5173/?scene=grades&fixture=summa', {
      waitUntil: 'networkidle'
    });
    await page.waitForSelector('#gwa-value');
    const gwa = await page.textContent('#gwa-value');
    ok(!!gwa && gwa !== '—', `GWA rendered (${gwa})`);
    const dims = await page.evaluate(async () => {
      const blob = await PUPGwaShare.exportPng({
        standing: {
          gwa: 1.09,
          totalUnits: 17,
          tier: 'Summa Cum Laude',
          disqualified: false
        },
        firstName: 'Troy'
      });
      const bmp = await createImageBitmap(blob);
      return { w: bmp.width, h: bmp.height, type: blob.type, size: blob.size };
    });
    ok(dims.w === dims.h, `export is square (${dims.w}x${dims.h})`);
    ok(dims.w >= 1080, 'export is high-res (≥1080)');
    ok(dims.type === 'image/png', 'export is PNG');
    ok(dims.size > 1000, 'export has content');

    await page.goto(
      'http://127.0.0.1:5173/?scene=grades&fixture=foolsBronze',
      { waitUntil: 'networkidle' }
    );
    await page.waitForSelector('#gwa-standing');
    const standing = await page.textContent('#gwa-standing');
    ok(!!standing && standing.length > 8, `fool standing copy present`);
    const medalHidden = await page.$eval('#gwa-medal', (el) => el.hidden);
    ok(medalHidden === false, 'fool medal visible');

    await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
    await page.waitForSelector('#schedule-grid-scroll');
    const hasSvg = await page.$eval('#schedule-grid-scroll', (el) =>
      Boolean(el.querySelector('svg.schedule-grid-svg'))
    );
    ok(hasSvg, 'week grid mounts SVG');

    await browser.close();
    browserRan = true;
  } catch (err) {
    console.log(`  · Playwright skipped (${err.message.split('\n')[0]})`);
  }
  if (!browserRan) {
    console.log('  · Install playwright for full browser e2e: npx playwright install chromium');
  }

  if (child) {
    child.kill('SIGTERM');
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
