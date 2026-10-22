/**
 * Load this branch's unpacked extension in Playwright's Chromium and serve
 * the fake SIAS schedule (Juan Dela Cruz) at https://sis2.pup.edu.ph/student/schedule.
 *
 *   node dev/capture/launch.mjs           headed, for real Google Calendar captures
 *   node dev/capture/launch.mjs --check   headless check: the extension reads the
 *                                         fake page and sees the SIAS tab URL
 *                                         without the "tabs" permission
 *
 * Needs: npm install --no-save playwright@1 && npx playwright install chromium
 *
 * Google sign-in only works when the unpacked extension has the store
 * extension ID, because the OAuth client only allows that redirect. Set
 * PUPSYNC_MANIFEST_KEY to the store item's public key (Developer Dashboard,
 * Package, View public key; the base64 text without BEGIN/END lines). The key
 * is only written into a temp copy, never into the repo.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { chromium } from 'playwright';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const extRoot = path.resolve(__dirname, '..', '..');
const check = process.argv.includes('--check');
const fakePage = fs.readFileSync(path.join(__dirname, 'fake-sias-schedule.html'), 'utf8');

function stageExtension() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pupsync-ext-'));
  for (const d of ['background', 'content', 'popup', 'shared', 'icons', 'config', 'welcome']) {
    fs.cpSync(path.join(extRoot, d), path.join(dir, d), { recursive: true });
  }
  const manifest = JSON.parse(fs.readFileSync(path.join(extRoot, 'manifest.json'), 'utf8'));
  if (process.env.PUPSYNC_MANIFEST_KEY) manifest.key = process.env.PUPSYNC_MANIFEST_KEY.trim();
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return dir;
}

const ext = stageExtension();
const profile = process.env.PUPSYNC_PROFILE || fs.mkdtempSync(path.join(os.tmpdir(), 'pupsync-profile-'));
const context = await chromium.launchPersistentContext(profile, {
  headless: check,
  channel: 'chromium',
  viewport: null,
  args: [`--disable-extensions-except=${ext}`, `--load-extension=${ext}`]
});

await context.route('https://sis2.pup.edu.ph/student/schedule**', (route) =>
  route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: fakePage })
);

let [worker] = context.serviceWorkers();
if (!worker) worker = await context.waitForEvent('serviceworker');
const extensionId = new URL(worker.url()).host;
console.log(`Extension loaded: ${extensionId}${process.env.PUPSYNC_MANIFEST_KEY ? ' (store key)' : ''}`);

const page = context.pages().find((p) => !p.url().startsWith('chrome-extension://')) || (await context.newPage());
await page.goto('https://sis2.pup.edu.ph/student/schedule');
await page.bringToFront();

if (check) {
  await page.waitForTimeout(1500);
  const result = await worker.evaluate(async () => {
    const [tab] = await chrome.tabs.query({ url: '*://sis2.pup.edu.ph/*' });
    const perms = chrome.runtime.getManifest().permissions;
    const scrape = tab ? await scrapeTabSchedule(tab.id) : null;
    return {
      hasTabsPermission: perms.includes('tabs'),
      tabUrlVisible: tab?.url || null,
      autoOpenMatches: !!tab && isAutoOpenUrl(tab.url),
      subjects: scrape?.subjects?.length || 0,
      term: scrape?.term?.shortLabel || scrape?.termHeader || null,
      error: scrape?.error || null
    };
  });
  console.log(JSON.stringify(result, null, 2));
  const pages = context.pages().map((p) => p.url());
  console.log('Open pages:', pages.join(', '));
  await context.close();
  const ok = !result.hasTabsPermission && result.tabUrlVisible && result.autoOpenMatches && result.subjects === 8;
  process.exit(ok ? 0 : 1);
} else {
  console.log('Fake SIAS schedule is open. Click the PUPSync toolbar icon (or wait for auto-open), then Import.');
  console.log('Close the browser window to finish.');
  await new Promise((resolve) => context.on('close', resolve));
}
