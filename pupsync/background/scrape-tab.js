/**
 * Scrape schedule from a tab via chrome.scripting (used by service worker).
 */
const SCRAPE_SCRIPT_FILES = [
  'shared/constants.js',
  'shared/utils.js',
  'content/standalone-scrape.js'
];

function pickBestScrapeResult(results) {
  let best = null;
  for (const entry of results || []) {
    const r = entry?.result;
    if (!r?.ok || !r.subjects?.length) continue;
    if (!best || r.subjects.length > best.subjects.length) best = r;
  }
  return best;
}

function pickBestError(results) {
  let err = null;
  for (const entry of results || []) {
    const r = entry?.result;
    if (r?.error && !err) err = r;
    if (r?.ok === false && r?.error) err = r;
  }
  return err;
}

async function runStandaloneScrape(target) {
  await chrome.scripting.executeScript({
    target,
    files: SCRAPE_SCRIPT_FILES
  });
  const results = await chrome.scripting.executeScript({
    target,
    func: () => {
      if (typeof globalThis.__PUPSYNC_STANDALONE__ === 'function') {
        return globalThis.__PUPSYNC_STANDALONE__();
      }
      return { ok: false, error: 'Standalone scrape not loaded' };
    }
  });
  return results;
}

async function scrapeTabSchedule(tabId) {
  const targets = [
    { tabId, allFrames: true },
    { tabId }
  ];

  let lastResults = [];
  for (const target of targets) {
    try {
      const results = await runStandaloneScrape(target);
      lastResults = results;
      const best = pickBestScrapeResult(results);
      if (best) return best;
    } catch {
      /* try next target */
    }
  }

  const err = pickBestError(lastResults);
  if (err?.error === 'Schedule table not found' && err.tableCount === 0) {
    return {
      ok: false,
      subjects: [],
      error: 'Content script not available'
    };
  }
  return (
    err || {
      ok: false,
      subjects: [],
      error: 'Schedule table not found'
    }
  );
}
