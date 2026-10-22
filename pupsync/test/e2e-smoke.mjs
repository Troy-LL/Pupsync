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
    S.shareLine(magna, 'Juan').includes('Juan'),
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
    // The dev page pulls its markup from the real popup.html at load time.
    const popupHtml = await get('/popup/popup.html');
    ok(grades.body.includes("'/popup/popup.html'"), 'dev preview loads real popup markup');
    ok(popupHtml.body.includes('btn-export-gwa'), 'grades has Export image CTA');
    ok(grades.body.includes('gwa-share-image.js'), 'gwa share script linked');
    ok(popupHtml.body.includes('gwa-breakdown'), 'breakdown UI present');
    ok(popupHtml.body.includes('btn-undo'), 'undo control present');
  }

  console.log('\n== Browser: share card geometry (Playwright if available) ==');
  let browserRan = false;
  let chromium = null;
  try {
    ({ chromium } = await import('playwright'));
  } catch (err) {
    console.log(`  · Playwright skipped (${err.message.split('\n')[0]})`);
  }
  if (chromium) try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto('http://127.0.0.1:5173/?scene=grades&fixture=summa', {
      waitUntil: 'networkidle'
    });
    await page.waitForSelector('#gwa-value');
    const gwa = await page.textContent('#gwa-value');
    ok(!!gwa && gwa !== '–', `GWA rendered (${gwa})`);
    const dims = await page.evaluate(async () => {
      const blob = await PUPGwaShare.exportPng({
        standing: {
          gwa: 1.09,
          totalUnits: 17,
          tier: 'Summa Cum Laude',
          disqualified: false
        },
        firstName: 'Juan'
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

    // Popup wiring: click Import and read the IMPORT message the popup sends.
    // COMP 012 fails to parse, COMP 014 has no meeting times, STAT 023 gets unticked.
    const wire = await browser.newPage();
    await wire.addInitScript(() => {
      let subjects;
      Object.defineProperty(window, 'PUPSYNC_MOCK_SUBJECTS', {
        configurable: true,
        get: () => subjects,
        set: (list) => {
          subjects = (list || []).map((s) => {
            if (s.subjectCode === 'COMP 012') return { ...s, meetings: [], parseError: 'Could not read schedule' };
            if (s.subjectCode === 'COMP 014') return { ...s, meetings: [], days: [], daysPart: '' };
            return s;
          });
        }
      });
    });
    await wire.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
    await wire.waitForSelector('#btn-import');
    await wire.evaluate(() => {
      window.__importMessages = [];
      const send = chrome.runtime.sendMessage;
      chrome.runtime.sendMessage = function (message, ...rest) {
        if (message?.type === PUPSYNC.MESSAGE_TYPES.IMPORT) {
          window.__importMessages.push(JSON.parse(JSON.stringify(message)));
        }
        return send.call(this, message, ...rest);
      };
    });
    await wire.click('#view-list');
    await wire.locator('input[aria-label="Include STAT 023"]:not([disabled])').first().uncheck();
    await wire.click('#btn-import');
    await wire.waitForFunction(() => window.__importMessages.length > 0, null, { timeout: 5000 });
    const sent = await wire.evaluate(() => ({
      msg: window.__importMessages[0],
      scraped: window.PUPSYNC_MOCK_SUBJECTS.map((s) => s.subjectCode.trim().toUpperCase())
    }));
    const sched = [...(sent.msg.scheduleSubjectCodes || [])].sort();
    const imported = (sent.msg.subjects || []).map((s) => s.subjectCode).sort();
    const expectImport = sent.scraped.filter((c) => c !== 'COMP 012' && c !== 'STAT 023').sort();
    ok(
      sched.length === 8 && JSON.stringify(sched) === JSON.stringify([...sent.scraped].sort()),
      `import message schedule list is every scraped code (${sched.join(', ')})`
    );
    ok(
      ['COMP 012', 'COMP 014', 'STAT 023'].every((c) => sched.includes(c)),
      'schedule list has the parse-error, no-meeting and unticked subjects'
    );
    ok(
      JSON.stringify(imported) === JSON.stringify(expectImport),
      `import message subjects is the import list (${imported.join(', ')})`
    );
    ok(
      JSON.stringify(sent.msg.keepSubjectCodes) === JSON.stringify(['STAT 023']),
      'import message keeps the unticked subject'
    );
    await wire.close();

    // Rows that add nothing: COMP 012 parse error, COMP 014 no class times.
    const rows = await browser.newPage();
    await rows.addInitScript(() => {
      let subjects;
      Object.defineProperty(window, 'PUPSYNC_MOCK_SUBJECTS', {
        configurable: true,
        get: () => subjects,
        set: (list) => {
          subjects = (list || []).map((s) => {
            if (s.subjectCode === 'COMP 012') return { ...s, meetings: [], parseError: 'Could not read schedule' };
            if (s.subjectCode === 'COMP 014') return { ...s, meetings: [], days: [], daysPart: '' };
            return s;
          });
        }
      });
    });
    await rows.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
    await rows.waitForSelector('#btn-import');
    await rows.click('#view-list');
    const rowInfo = await rows.evaluate(() => {
      const info = (code) => {
        const row = document.querySelector(`#subject-list .subject-row[data-code="${code}"]`);
        const cb = row.querySelector('input[type="checkbox"]');
        return { text: row.innerText, checked: cb.checked, disabled: cb.disabled };
      };
      return { parse: info('COMP 012'), none: info('COMP 014'), normal: info('COMP 009') };
    });
    ok(!rowInfo.parse.checked && rowInfo.parse.disabled, 'parse-error row: checkbox unticked and disabled');
    ok(
      /skipped on import/.test(rowInfo.parse.text) && !/Could not parse schedule/.test(rowInfo.parse.text),
      'parse-error row: one line, not two'
    );
    ok(!rowInfo.none.checked && rowInfo.none.disabled, 'no-meeting row: checkbox unticked and disabled');
    ok(/No class times, nothing to add/.test(rowInfo.none.text), 'no-meeting row: says it adds nothing');
    ok(!/(^|\n)\s*·/.test(rowInfo.none.text), 'no-meeting row: no stray leading separator');
    ok(rowInfo.normal.checked && !rowInfo.normal.disabled, 'normal row: ticked and enabled');
    await rows.close();

    // Unknown semester: the scrape returns no term. No guessed dates, Import/Preview/Remove off.
    const noTerm = await browser.newPage();
    await noTerm.addInitScript(() => {
      let c;
      Object.defineProperty(window, 'chrome', {
        configurable: true,
        get: () => c,
        set: (v) => {
          c = v;
          const strip = (r) => (r && typeof r === 'object' ? { ...r, term: null, termHeader: null } : r);
          const send = v.runtime.sendMessage;
          v.runtime.sendMessage = function (msg, cb) {
            if (msg && msg.type === PUPSYNC.MESSAGE_TYPES.SCRAPE_TAB) {
              const p = send.call(this, msg, cb ? (r) => cb(strip(r)) : cb);
              return p && p.then ? p.then(strip) : p;
            }
            return send.apply(this, arguments);
          };
          const tabSend = v.tabs.sendMessage;
          v.tabs.sendMessage = function () {
            const p = tabSend.apply(this, arguments);
            return p && p.then ? p.then(strip) : p;
          };
        }
      });
    });
    await noTerm.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
    await noTerm.waitForSelector('#btn-import');
    await noTerm.waitForTimeout(400);
    const nt = await noTerm.evaluate(() => {
      const term = document.getElementById('term-detected');
      return {
        termText: term.hidden ? '' : term.innerText,
        importDisabled: document.getElementById('btn-import').disabled,
        previewDisabled: document.getElementById('btn-preview').disabled,
        undoDisabled: document.getElementById('btn-undo').disabled,
        datesShown: !document.getElementById('sem-toggle').hidden || !document.getElementById('sem-inputs').hidden
      };
    });
    ok(/could not read the semester/i.test(nt.termText), `unknown semester: warning shown before Import (${nt.termText})`);
    ok(!/\d{4}-\d{2}-\d{2}/.test(nt.termText) && !nt.datesShown, 'unknown semester: no guessed dates shown');
    ok(nt.importDisabled && nt.previewDisabled, 'unknown semester: Import and Preview disabled');
    ok(nt.undoDisabled, 'unknown semester: Remove PUPSync classes disabled');
    await noTerm.close();

    // Held result: a page with 1 of 4 synced classes. The done view must not look like a success.
    const heldCtx = await browser.newContext();
    const keepOnly = (codes) => {
      let subjects;
      Object.defineProperty(window, 'PUPSYNC_MOCK_SUBJECTS', {
        configurable: true,
        get: () => subjects,
        set: (list) => {
          subjects = (list || []).filter((s) => codes.includes(s.subjectCode));
        }
      });
    };
    const doneState = async (codes) => {
      const pg = await heldCtx.newPage();
      await pg.addInitScript(keepOnly, codes);
      await pg.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
      await pg.waitForSelector('#btn-import');
      await pg.click('#btn-import');
      await pg.waitForSelector('#state-d:not([hidden])', { timeout: 15000 });
      const out = await pg.evaluate(() => {
        const banner = document.querySelector('#state-d .success-banner');
        const icon = banner.querySelector('.success-icon');
        return {
          text: document.getElementById('success-text').innerText,
          held: banner.classList.contains('is-held'),
          icon: icon.textContent.trim(),
          pause: !!icon.querySelector('svg'),
          iconBg: getComputedStyle(icon).backgroundColor,
          badge: document.getElementById('header-badge').innerText.trim()
        };
      });
      await pg.close();
      return out;
    };
    const first = await doneState(['COMP 009', 'COMP 010', 'INTE 202', 'STAT 023']);
    ok(!first.held && first.icon === '✓', 'normal import done view uses the success check mark');
    const heldView = await doneState(['COMP 009']);
    ok(/left them alone/.test(heldView.text), `held import shows the held note (${heldView.text.slice(0, 60)})`);
    ok(heldView.held && heldView.icon !== '✓', `held done view has no check mark (icon ${heldView.icon})`);
    ok(heldView.iconBg !== first.iconBg, `held done view icon is not the success color (${heldView.iconBg} vs ${first.iconBg})`);
    ok(heldView.pause && heldView.iconBg === 'rgb(251, 238, 205)', `held done view uses the amber pause mark, not error red (${heldView.iconBg})`);
    ok(heldView.badge === 'Nothing changed' && first.badge === 'Done', `held header says Nothing changed (${heldView.badge}; normal: ${first.badge})`);
    await heldCtx.close();

    await browser.close();
    browserRan = true;
  } catch (err) {
    ok(false, `browser checks threw: ${err.message.split('\n')[0]}`);
    browserRan = true;
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
