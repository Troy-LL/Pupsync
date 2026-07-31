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

const GRADES_SCRIPT_FILES = [
  'shared/constants.js',
  'shared/utils.js',
  'content/grades-scrape.js'
];

function pickBestGradesResult(results) {
  let best = null;
  for (const entry of results || []) {
    const r = entry?.result;
    if (!r?.ok || !r.semesters?.length) continue;
    const n = r.semesters.reduce((a, s) => a + (s.subjects?.length || 0), 0);
    const bn = best
      ? best.semesters.reduce((a, s) => a + (s.subjects?.length || 0), 0)
      : -1;
    if (n > bn) best = r;
  }
  return best;
}

async function scrapeTabGrades(tabId) {
  const targets = [{ tabId, allFrames: true }, { tabId }];
  let lastResults = [];
  for (const target of targets) {
    try {
      await chrome.scripting.executeScript({
        target,
        files: GRADES_SCRIPT_FILES
      });
      const results = await chrome.scripting.executeScript({
        target,
        func: () =>
          typeof globalThis.__PUPSYNC_SCRAPE_GRADES__ === 'function'
            ? globalThis.__PUPSYNC_SCRAPE_GRADES__()
            : { ok: false, error: 'Grades scrape not loaded' }
      });
      lastResults = results;
      const best = pickBestGradesResult(results);
      if (best) return best;
    } catch {
      /* try next target */
    }
  }
  const err = (lastResults || []).map((e) => e?.result).find((r) => r?.error);
  return err || { ok: false, semesters: [], error: 'Grade tables not found' };
}

const IDENTITY_SCRIPT_FILES = [
  'shared/constants.js',
  'shared/utils.js',
  'content/identity-scrape.js'
];

async function scrapeTabIdentity(tabId) {
  const targets = [{ tabId, allFrames: true }, { tabId }];
  let lastResults = [];
  for (const target of targets) {
    try {
      await chrome.scripting.executeScript({
        target,
        files: IDENTITY_SCRIPT_FILES
      });
      const results = await chrome.scripting.executeScript({
        target,
        func: () =>
          typeof globalThis.__PUPSYNC_SCRAPE_IDENTITY__ === 'function'
            ? globalThis.__PUPSYNC_SCRAPE_IDENTITY__()
            : { ok: false, error: 'Identity scrape not loaded' }
      });
      lastResults = results;
      for (const entry of results || []) {
        const r = entry?.result;
        if (r?.ok && r.firstName) return r;
      }
    } catch {
      /* try next */
    }
  }
  const err = (lastResults || []).map((e) => e?.result).find((r) => r?.error);
  return err || { ok: false, error: 'Student name not found' };
}
