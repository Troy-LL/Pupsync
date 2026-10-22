/**
 * Smoke / e2e checks for Dev Preview + GWA share card.
 * Run: node test/e2e-smoke.mjs  (starts server if needed)
 */
import http from 'http';
import net from 'net';
import { spawn } from 'child_process';
import { createRequire } from 'module';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, '..');
const require = createRequire(import.meta.url);

/** Own dev server on a free port, so a server already on :5173 is never reused. */
let BASE = '';
function freePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.unref();
    srv.on('error', reject);
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
  });
}

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
      .get(`${BASE}${urlPath}`, (res) => {
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
  const port = await freePort();
  BASE = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, ['dev/server.js'], {
    cwd: root,
    stdio: 'ignore',
    detached: false,
    env: { ...process.env, PORT: String(port) }
  });
  process.on('exit', () => child.kill('SIGTERM'));
  const up = await waitForServer(10000);
  ok(up, `own dev server reachable on :${port}`);

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
    const why = err.message.split('\n')[0];
    if (process.env.SKIP_E2E === '1') {
      console.log(`  · Browser checks skipped: SKIP_E2E=1 (${why})`);
    } else {
      ok(false, `Playwright is not installed (${why}). Install it, or set SKIP_E2E=1 to skip the browser checks on purpose`);
    }
  }
  if (chromium) try {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    await page.goto(`${BASE}/?scene=grades&fixture=summa`, {
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
      `${BASE}/?scene=grades&fixture=foolsBronze`,
      { waitUntil: 'networkidle' }
    );
    await page.waitForSelector('#gwa-standing');
    const standing = await page.textContent('#gwa-standing');
    ok(!!standing && standing.length > 8, `fool standing copy present`);
    const medalHidden = await page.$eval('#gwa-medal', (el) => el.hidden);
    ok(medalHidden === false, 'fool medal visible');

    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await page.waitForSelector('#schedule-grid-scroll');
    const hasSvg = await page.$eval('#schedule-grid-scroll', (el) =>
      Boolean(el.querySelector('svg.schedule-grid-svg'))
    );
    ok(hasSvg, 'week grid mounts SVG');
    ok(await page.locator('#btn-skipped').isHidden(), 'no skipped note when every class imports');
    ok(await page.locator('#btn-reload-sias').isHidden(), 'no Reload SIAS page button when the semester is known');
    ok(await page.locator('#state-b .secondary-row').isVisible(), 'semester known: Preview strip shown');
    const strip = await page.evaluate(() => {
      const row = document.querySelector('#state-b .secondary-row');
      const tag = document.querySelector('#subject-list .subject-row[data-code="COMP 009"] .schedule-tag');
      return {
        h: Math.round(row.getBoundingClientRect().height),
        undoHidden: document.getElementById('undo-row').hidden,
        spans: [...tag.querySelectorAll('.nowrap')].map((n) => getComputedStyle(n).whiteSpace + ':' + n.textContent)
      };
    });
    ok(strip.undoHidden && strip.h === 36, `Preview alone: 36px strip (${strip.h}px)`);
    ok(
      strip.spans.length === 3 && strip.spans.every((x) => x.startsWith('nowrap:')),
      `class time ranges do not break inside (${strip.spans.join(' | ')})`
    );

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
    await wire.goto(`${BASE}/`, { waitUntil: 'networkidle' });
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

    // Import error: shown in the schedule view with the outlined triangle and a bold "Import stopped."
    const errPage = await browser.newPage();
    await errPage.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await errPage.waitForSelector('#btn-import');
    await errPage.evaluate(() => {
      const send = chrome.runtime.sendMessage;
      chrome.runtime.sendMessage = function (message, cb) {
        if (message?.type === PUPSYNC.MESSAGE_TYPES.IMPORT) {
          setTimeout(() => cb({ error: 'Google sign-in expired. Import again to sign back in.' }), 50);
          return undefined;
        }
        return send.apply(this, arguments);
      };
    });
    await errPage.click('#btn-import');
    await errPage.waitForSelector('#import-error:not([hidden])', { timeout: 5000 });
    const errView = await errPage.evaluate(() => {
      const el = document.getElementById('import-error');
      const path = el.querySelector('svg path');
      return {
        text: el.innerText.trim(),
        bold: el.querySelector('strong')?.innerText.trim(),
        icon: !!el.querySelector('svg.import-error-icon') && path?.getAttribute('fill') === 'none',
        inB: !document.getElementById('state-b').hidden,
        aboveActions: el.nextElementSibling?.classList.contains('actions')
      };
    });
    ok(
      errView.inB && errView.icon && errView.bold === 'Import stopped.' && errView.aboveActions,
      `import error: outlined triangle and bold Import stopped. above the actions (${errView.text})`
    );
    ok(!/\.\./.test(errView.text), 'import error: no double period');
    await errPage.close();

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
    await rows.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await rows.waitForSelector('#btn-import');
    await rows.click('#view-list');
    const rowInfo = await rows.evaluate(() => {
      const info = (code) => {
        const row = document.querySelector(`#subject-list .subject-row[data-code="${code}"]`);
        const cb = row.querySelector('input[type="checkbox"]');
        return {
          text: row.innerText,
          checked: cb.checked,
          disabled: cb.disabled,
          label: cb.getAttribute('aria-label'),
          skipped: row.classList.contains('is-skipped'),
          inputs: row.querySelectorAll('input:not([type="checkbox"]), .color-field, .btn-toggle-sched-editor').length
        };
      };
      const order = [...document.querySelectorAll('#subject-list .subject-row')].map((r) => r.dataset.code);
      return { parse: info('COMP 012'), none: info('COMP 014'), normal: info('COMP 009'), order };
    });
    ok(!rowInfo.parse.checked && rowInfo.parse.disabled, 'parse-error row: checkbox unticked and disabled');
    ok(
      /Can't read schedule/.test(rowInfo.parse.text) && !/Could not parse schedule|Skipped on import/.test(rowInfo.parse.text),
      'parse-error row: one line, not two'
    );
    ok(!rowInfo.none.checked && rowInfo.none.disabled, 'no-meeting row: checkbox unticked and disabled');
    ok(/No class times, nothing to add/.test(rowInfo.none.text), 'no-meeting row: says it adds nothing');
    ok(!/(^|\n)\s*·/.test(rowInfo.none.text), 'no-meeting row: no stray leading separator');
    ok(rowInfo.normal.checked && !rowInfo.normal.disabled && !rowInfo.normal.skipped, 'normal row: ticked and enabled');
    ok(
      rowInfo.parse.skipped && rowInfo.none.skipped && rowInfo.parse.inputs === 0 && rowInfo.none.inputs === 0,
      'skipped rows: is-skipped, no inputs, color or Edit'
    );
    ok(
      rowInfo.parse.label === 'COMP 012, skipped: schedule could not be read' &&
        rowInfo.none.label === 'COMP 014, skipped: has no class times',
      `skipped rows: checkbox says why (${rowInfo.parse.label}; ${rowInfo.none.label})`
    );
    ok(
      JSON.stringify(rowInfo.order.slice(-2).sort()) === JSON.stringify(['COMP 012', 'COMP 014']),
      `skipped rows sort last (${rowInfo.order.join(', ')})`
    );
    const chips = await rows.evaluate(() => {
      const icon = (code) => {
        const svg = document.querySelector(`#subject-list .subject-row[data-code="${code}"] .skip-chip svg`);
        return svg ? `${svg.getAttribute('class')}|${getComputedStyle(svg).color}` : '';
      };
      return { parse: icon('COMP 012'), none: icon('COMP 014') };
    });
    ok(
      /is-parse\|rgb\(163, 24, 32\)/.test(chips.parse) && /is-no-meeting\|rgb\(90, 69, 74\)/.test(chips.none),
      `skip chips carry their icon (${chips.parse}; ${chips.none})`
    );
    await rows.click('#view-grid');
    const note = await rows.evaluate(() => {
      const b = document.getElementById('btn-skipped');
      return { shown: !!b && !b.hidden && b.getClientRects().length > 0, text: b?.innerText.trim() };
    });
    ok(note.shown && note.text === '2 classes skipped, see List', `week grid says how many classes are skipped (${note.text})`);
    await rows.click('#btn-skipped');
    ok(!(await rows.locator('#subject-list-panel').isHidden()), 'skipped note switches to the List');
    const compact = await rows.evaluate(() => {
      const list = [...document.querySelectorAll('#subject-list .subject-row:not(.is-skipped)')];
      return {
        maxH: Math.max(...list.map((r) => r.getBoundingClientRect().height)),
        textInputs: document.querySelectorAll('#subject-list input[type="text"]').length,
        editLabels: [...new Set(list.map((r) => r.querySelector('.btn-toggle-sched-editor')?.textContent.trim()))],
        semMore: document.getElementById('sem-more')?.tagName,
        semOpen: document.getElementById('sem-more')?.open,
        semSummary: document.querySelector('#sem-more > summary')?.textContent.trim(),
        datesInside: !!document.querySelector('#sem-more #semester-start') && !!document.querySelector('#sem-more #desc-template'),
        gridHint: document.querySelectorAll('.schedule-grid-hint').length
      };
    });
    ok(compact.maxH <= 60 && compact.textInputs === 0, `list rows collapsed by default (tallest ${compact.maxH}px, ${compact.textInputs} text inputs)`);
    ok(compact.editLabels.length === 1 && compact.editLabels[0] === 'Edit', `each row has one Edit button (${compact.editLabels.join('/')})`);
    ok(
      compact.semMore === 'DETAILS' && compact.semOpen === false && compact.datesInside &&
        compact.semSummary === 'Dates and event details',
      `dates and event details folded into one closed disclosure (${compact.semSummary})`
    );
    ok(compact.gridHint === 0, 'no grid hint paragraph');
    await rows.click('#subject-list .subject-row[data-code="COMP 009"] .btn-toggle-sched-editor');
    const opened = await rows.evaluate(() => {
      const row = document.querySelector('#subject-list .subject-row[data-code="COMP 009"]');
      return {
        fields: row.querySelectorAll('.cal-title-input, .chip-label-input, .sched-slot-select').length >= 3,
        focused: document.activeElement?.classList.contains('cal-title-input'),
        expanded: row.querySelector('.btn-toggle-sched-editor').getAttribute('aria-expanded'),
        others: document.querySelectorAll('#subject-list .subject-edit').length
      };
    });
    ok(opened.fields && opened.focused && opened.expanded === 'true' && opened.others === 1, 'Edit opens title, grid label and time for that row only');
    await rows.click('#sem-more > summary');
    await rows.click('#btn-preview');
    await rows.waitForTimeout(200);
    const small = await rows.evaluate(() => {
      const out = new Set();
      for (const el of document.querySelectorAll('.popup-frame *')) {
        if (el.closest('svg, [aria-hidden="true"]') || !el.getClientRects().length) continue;
        const own = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
        if (!own) continue;
        if (parseFloat(getComputedStyle(el).fontSize) < 11) out.add(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
      }
      return [...out];
    });
    ok(small.length === 0, `popup text is 11px or larger with an editor, dates and preview open (${small.join(', ') || 'none smaller'})`);
    await rows.click('#btn-preview');
    await rows.click('#sem-more > summary');
    await rows.click('#subject-list .subject-row[data-code="COMP 009"] .btn-toggle-sched-editor');
    ok((await rows.locator('#subject-list .subject-edit').count()) === 0, 'Done closes the row editor');
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
    await noTerm.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await noTerm.waitForSelector('#btn-import', { state: 'attached' });
    await noTerm.waitForTimeout(400);
    const nt = await noTerm.evaluate(() => {
      const term = document.getElementById('term-detected');
      const err = document.getElementById('import-error');
      return {
        termText: term.hidden ? '' : term.innerText,
        errText: err.hidden ? '' : err.innerText.trim(),
        errBold: err.querySelector('strong')?.innerText.trim(),
        errIcon: !!err.querySelector('svg.import-error-icon'),
        previewShown: document.getElementById('btn-preview').getClientRects().length > 0,
        undoRowHidden: document.getElementById('undo-row').hidden,
        rowShown: document.querySelector('#state-b .secondary-row').getClientRects().length > 0,
        importDisabled: document.getElementById('btn-import').disabled,
        previewDisabled: document.getElementById('btn-preview').disabled,
        undoDisabled: document.getElementById('btn-undo').disabled,
        filled: [...document.querySelectorAll('#state-b .btn-import')]
          .filter((el) => el.getClientRects().length)
          .map((el) => el.id),
        datesShown: !document.getElementById('sem-more')?.hidden
      };
    });
    ok(
      nt.errIcon && nt.errBold === 'Semester not found.' && /Refresh your SIAS schedule \(F5\)/.test(nt.errText),
      `unknown semester: error tone with triangle and bold title before Import (${nt.errText})`
    );
    ok(nt.termText === '' && !nt.datesShown, 'unknown semester: term line hidden, no guessed dates shown');
    ok(!nt.previewShown, 'unknown semester: Preview hidden');
    ok(nt.undoRowHidden && !nt.rowShown, 'unknown semester, nothing to remove: no empty Preview / Remove strip');
    ok(nt.importDisabled && nt.previewDisabled, 'unknown semester: Import and Preview disabled');
    ok(nt.undoDisabled, 'unknown semester: Remove PUPSync classes disabled');
    ok(nt.filled.join() === 'btn-reload-sias', `unknown semester: Reload SIAS page is the one primary (${nt.filled.join()})`);
    // Scope: the tab is reloaded only when it is on a SIAS host.
    await noTerm.evaluate(() => {
      window.__realQuery = chrome.tabs.query;
      chrome.tabs.query = () => Promise.resolve([{ id: 7, url: 'https://pup.edu.ph.example.com/student/schedule' }]);
    });
    await noTerm.click('#btn-reload-sias');
    await noTerm.waitForTimeout(200);
    await noTerm.evaluate(() => {
      chrome.tabs.query = () => Promise.resolve([{ id: 8, url: 'https://www.google.com/' }]);
    });
    await noTerm.click('#btn-reload-sias');
    await noTerm.waitForTimeout(200);
    ok((await noTerm.evaluate(() => window.__PUPSYNC_TAB_RELOADS__ || 0)) === 0, 'Reload SIAS page: no reload on a non-SIAS host');
    await noTerm.evaluate(() => {
      chrome.tabs.query = window.__realQuery;
    });
    await noTerm.click('#btn-reload-sias');
    await noTerm.waitForTimeout(200);
    ok((await noTerm.evaluate(() => window.__PUPSYNC_TAB_RELOADS__ || 0)) === 1, 'unknown semester: Reload SIAS page reloads the SIAS tab');
    // Saved state from an earlier open (preview and dates open) must not bring back guessed dates.
    await noTerm.evaluate(() => {
      const all = JSON.parse(localStorage.getItem('pupsync-dev-storage') || '{}');
      all.popupUiState = { ...(all.popupUiState || {}), previewOpen: true, openDetails: ['sem-more'] };
      localStorage.setItem('pupsync-dev-storage', JSON.stringify(all));
    });
    await noTerm.reload({ waitUntil: 'networkidle' });
    await noTerm.waitForSelector('#btn-import', { state: 'attached' });
    await noTerm.waitForTimeout(500);
    const reopened = await noTerm.evaluate(() => ({
      previewShown: document.getElementById('preview-panel').getClientRects().length > 0,
      semShown: document.getElementById('sem-more').getClientRects().length > 0,
      dates: /\d{4}-\d{2}-\d{2}|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\w* \d/.test(
        document.getElementById('state-b').innerText
      )
    }));
    ok(
      !reopened.previewShown && !reopened.semShown && !reopened.dates,
      `unknown semester: saved preview and dates stay closed on reopen (${JSON.stringify(reopened)})`
    );
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
    const doneState = async (codes, after) => {
      const pg = await heldCtx.newPage();
      await pg.addInitScript(keepOnly, codes);
      await pg.goto(`${BASE}/`, { waitUntil: 'networkidle' });
      await pg.waitForSelector('#btn-import');
      await pg.click('#btn-import');
      await pg.waitForSelector('#state-d:not([hidden])', { timeout: 15000 });
      const out = await pg.evaluate(() => {
        const banner = document.querySelector('#state-d .success-banner');
        const icon = banner.querySelector('.success-icon');
        return {
          text: document.getElementById('success-text').innerText,
          title: (() => {
            const t = document.getElementById('success-title');
            return t && !t.hidden ? t.innerText.trim() : '';
          })(),
          bodyClass: document.getElementById('success-text').classList.contains('result-body'),
          held: banner.classList.contains('is-held'),
          icon: icon.textContent.trim(),
          pause: !!icon.querySelector('svg'),
          iconBg: getComputedStyle(icon).backgroundColor,
          badge: document.getElementById('header-badge').innerText.trim(),
          primary: [...document.querySelectorAll('#state-d .btn-import')].map((el) => el.id),
          review: (() => {
            const r = document.getElementById('review-ask');
            return {
              shown: !r.hidden,
              afterActions: r.previousElementSibling?.classList.contains('actions'),
              dismissOnLine: (() => {
                const l = document.getElementById('review-link').getBoundingClientRect();
                const x = document.getElementById('review-dismiss').getBoundingClientRect();
                return Math.abs((l.top + l.bottom) / 2 - (x.top + x.bottom) / 2) <= 1;
              })(),
              bg: getComputedStyle(r).backgroundColor
            };
          })(),
          again: document.getElementById('btn-again').innerText.trim(),
          wideActions:
            Math.abs(
              document.querySelector('#state-d .actions').getBoundingClientRect().width -
                document.getElementById('state-d').getBoundingClientRect().width
            ) < 2
        };
      });
      if (after) out.after = await after(pg);
      await pg.close();
      return out;
    };
    const first = await doneState(['COMP 009', 'COMP 010', 'INTE 202', 'STAT 023'], async (pg) => {
      await pg.click('#btn-again');
      await pg.waitForSelector('#state-b:not([hidden])');
      const shown = (id) => {
        const el = document.getElementById(id);
        return !!el && el.getClientRects().length > 0;
      };
      const before = await pg.evaluate((shownSrc) => {
        const shown = eval(shownSrc);
        const prev = document.getElementById('btn-preview');
        const undo = document.getElementById('btn-undo');
        const cs = getComputedStyle(prev);
        return {
          previewText: cs.backgroundColor === 'rgba(0, 0, 0, 0)' && cs.borderTopWidth === '0px',
          sameLine: Math.abs(prev.getBoundingClientRect().top - undo.getBoundingClientRect().top) < 4,
          undoShown: shown('btn-undo'),
          filled: [...document.querySelectorAll('#state-b .btn-import')].filter((el) => el.getClientRects().length).length
        };
      }, shown.toString());
      await pg.click('#btn-undo');
      const confirm = await pg.evaluate((shownSrc) => {
        const shown = eval(shownSrc);
        return { importShown: shown('btn-import'), previewShown: shown('btn-preview'), yesShown: shown('btn-undo-yes') };
      }, shown.toString());
      await pg.click('#btn-undo-no');
      const closed = await pg.evaluate((shownSrc) => eval(shownSrc)('btn-import'), shown.toString());
      return { before, confirm, closed };
    });
    ok(
      first.primary.join() === 'calendar-link' && first.again === 'Back to schedule',
      `done view: Open Google Calendar is the one primary, Back to schedule is a link (${first.primary.join()})`
    );
    ok(first.wideActions, 'done view: actions span the full width (no 320px cap)');
    ok(
      first.review.shown && first.review.afterActions && first.review.dismissOnLine && first.review.bg === 'rgba(0, 0, 0, 0)',
      `done view: review ask sits below the actions with no card (${JSON.stringify(first.review)})`
    );
    ok(first.iconBg === 'rgb(10, 107, 56)', `done view: success check is green, not maroon (${first.iconBg})`);
    ok(
      first.after.before.previewText && first.after.before.undoShown && first.after.before.sameLine && first.after.before.filled === 1,
      `schedule: Preview is a text button on one line with Remove, one filled button (${JSON.stringify(first.after.before)})`
    );
    ok(
      !first.after.confirm.importShown && !first.after.confirm.previewShown && first.after.confirm.yesShown && first.after.closed,
      `remove confirm: Import and Preview hidden while it is open (${JSON.stringify(first.after.confirm)})`
    );
    ok(!first.held && first.icon === '✓', 'normal import done view uses the success check mark');
    const heldView = await doneState(['COMP 009']);
    ok(
      heldView.title === 'Nothing changed' &&
        heldView.bodyClass &&
        heldView.text.trim() ===
          "3 classes in your calendar aren't on this page, so they were kept. Reload your SIAS schedule and import again. Dropped them? Undo, then import.",
      `held import: Nothing changed title, then the held note as the body (${heldView.title} | ${heldView.text})`
    );
    ok(first.title === '' && !first.bodyClass, `normal import: one line, no held title (${first.title})`);
    ok(heldView.held && heldView.icon !== '✓', `held done view has no check mark (icon ${heldView.icon})`);
    ok(heldView.iconBg !== first.iconBg, `held done view icon is not the success color (${heldView.iconBg} vs ${first.iconBg})`);
    ok(heldView.pause && heldView.iconBg === 'rgb(251, 238, 205)', `held done view uses the amber pause mark, not error red (${heldView.iconBg})`);
    ok(heldView.primary.join() === 'btn-again', `held done view: Back to schedule is the primary (${heldView.primary.join()})`);
    ok(heldView.badge === 'Nothing changed' && first.badge === 'Done', `held header says Nothing changed (${heldView.badge}; normal: ${first.badge})`);
    await heldCtx.close();

    // Remove done: own context so the held checks above keep their calendar.
    const undoCtx = await browser.newContext();
    const up = await undoCtx.newPage();
    await up.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await up.waitForSelector('#btn-import');
    await up.click('#btn-import');
    await up.waitForSelector('#state-d:not([hidden])', { timeout: 15000 });
    await up.click('#btn-again');
    await up.click('#btn-undo');
    await up.click('#btn-undo-yes');
    await up.waitForSelector('#undo-status:not([hidden])', { timeout: 10000 });
    const undone = await up.evaluate(() => {
      const el = document.getElementById('undo-status');
      return { text: el.innerText.trim(), icon: !!el.querySelector('svg'), align: getComputedStyle(el).textAlign };
    });
    ok(
      undone.icon && undone.align === 'left' && /^Removed \d+ class events?\.$/.test(undone.text),
      `remove done: check mark, left-aligned (${undone.text})`
    );
    await undoCtx.close();

    await browser.close();
    browserRan = true;
  } catch (err) {
    ok(false, `browser checks threw: ${err.message.split('\n')[0]}`);
    browserRan = true;
  }
  if (!browserRan) {
    console.log('  · Install playwright for full browser e2e: npm install --no-save playwright@1 && npx playwright install chromium');
  }

  child.kill('SIGTERM');

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
