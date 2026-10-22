/**
 * PUPSync service worker: event generation, Google sign-in, Calendar sync.
 * Sync rules live in shared/calendar-sync.js.
 */
importScripts(
  '../shared/constants.js',
  '../shared/utils.js',
  '../shared/calendar-sync.js',
  'scrape-tab.js'
);

const DRY_RUN = PUPSYNC.DRY_RUN;
const syncLock = PUPCalendarSync.createLock();

/** Tokens live in storage.session so they never touch disk. */
const tokenStore = chrome.storage.session || chrome.storage.local;

// Older versions kept the token in storage.local. Clear it once.
chrome.storage.local.remove(PUPSYNC.STORAGE_KEYS.OAUTH_TOKEN).catch?.(() => {});

async function clearCachedToken() {
  await tokenStore.remove(PUPSYNC.STORAGE_KEYS.OAUTH_TOKEN);
}

function buildAuthUrl(prompt) {
  const manifest = chrome.runtime.getManifest();
  const clientId = manifest.oauth2?.client_id;
  const scopes = (manifest.oauth2?.scopes || []).join(' ');
  if (!clientId || clientId.startsWith('YOUR_CLIENT_ID')) {
    throw new Error('Set oauth2.client_id in manifest.json');
  }
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('redirect_uri', chrome.identity.getRedirectURL());
  authUrl.searchParams.set('scope', scopes);
  if (prompt) authUrl.searchParams.set('prompt', prompt);
  return authUrl.href;
}

function runAuthFlow(url, interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow({ url, interactive }, (redirectedTo) => {
      if (chrome.runtime.lastError || !redirectedTo) {
        reject(new Error(chrome.runtime.lastError?.message || 'Google sign-in cancelled'));
        return;
      }
      const params = new URLSearchParams(new URL(redirectedTo).hash.replace(/^#/, ''));
      const accessToken = params.get('access_token');
      if (!accessToken) {
        reject(new Error(params.get('error') || 'No access_token in OAuth response'));
        return;
      }
      resolve({ accessToken, expiresIn: Number(params.get('expires_in') || 3600) });
    });
  });
}

/**
 * OAuth via launchWebAuthFlow (Web client + chromiumapp.org redirect).
 * Tries a silent refresh first (prompt=none). Only a user click passes
 * interactive=true, and even then Google only shows the consent screen if
 * access was never granted, instead of on every sign-in.
 */
async function getAuthToken(interactive) {
  const key = PUPSYNC.STORAGE_KEYS.OAUTH_TOKEN;
  const stored = await tokenStore.get(key);
  const cached = stored[key];
  if (cached?.accessToken && cached.expiresAt > Date.now() + 60_000) {
    return cached.accessToken;
  }

  let result = null;
  try {
    result = await runAuthFlow(buildAuthUrl('none'), false);
  } catch {
    result = null;
  }
  if (!result) {
    if (!interactive) throw new Error('Not signed in to Google');
    result = await runAuthFlow(buildAuthUrl(''), true);
  }

  await tokenStore.set({
    [key]: {
      accessToken: result.accessToken,
      expiresAt: Date.now() + result.expiresIn * 1000
    }
  });
  return result.accessToken;
}

function calendarClient(token) {
  return PUPCalendarSync.createClient({
    token,
    baseUrl: PUPSYNC.CALENDAR_API_EVENTS
  });
}

/**
 * Term key from the term the popup read off the SIAS page, and nothing else.
 * No stored LAST_TERM, no date range: '' means stop.
 */
function resolveTermKey(message) {
  return PUPCalendarSync.buildTermKey(message?.term);
}

/** Local map is scoped by term: { [termKey]: { [eventKey]: eventId } }. */
async function saveTermMap(termKey, map) {
  const k = PUPSYNC.STORAGE_KEYS.SYNCED_EVENTS_BY_TERM;
  const stored = await chrome.storage.local.get(k);
  const byTerm = stored[k] || {};
  if (map && Object.keys(map).length) byTerm[termKey] = map;
  else delete byTerm[termKey];
  await chrome.storage.local.set({ [k]: byTerm });
}

/**
 * Run fn(client) with a token. On a 401 before any write, drop the cached
 * token and try once more with a fresh one.
 */
async function withCalendar(interactive, fn) {
  let token = await getAuthToken(interactive);
  let result = await fn(calendarClient(token));
  if (result?.status === 401) {
    await clearCachedToken();
    if (result.aborted) {
      token = await getAuthToken(interactive);
      result = await fn(calendarClient(token));
      if (result?.status === 401) await clearCachedToken();
    }
  }
  return result;
}

function notifyProgress(tabId, current, total, counts = {}) {
  const msg = {
    type: PUPSYNC.MESSAGE_TYPES.IMPORT_PROGRESS,
    current,
    total,
    created: counts.created || 0,
    updated: counts.updated || 0
  };
  chrome.runtime.sendMessage(msg).catch(() => {});
  if (tabId) chrome.tabs.sendMessage(tabId, msg).catch(() => {});
}

function notifyComplete(tabId, result) {
  const msg = {
    type: PUPSYNC.MESSAGE_TYPES.IMPORT_COMPLETE,
    created: result.created,
    updated: result.updated,
    total: result.total,
    result
  };
  chrome.runtime.sendMessage(msg).catch(() => {});
  if (tabId) chrome.tabs.sendMessage(tabId, msg).catch(() => {});
}

function notifyError(tabId, error) {
  const msg = { type: PUPSYNC.MESSAGE_TYPES.IMPORT_ERROR, error };
  chrome.runtime.sendMessage(msg).catch(() => {});
  if (tabId) chrome.tabs.sendMessage(tabId, msg).catch(() => {});
}

function friendlyError(result) {
  if (result?.status === 401) {
    return 'Google sign-in expired. Import again to sign back in.';
  }
  if (result?.aborted) {
    return `Couldn't check Google Calendar, so nothing changed. ${result.error || ''}`.trim();
  }
  return result?.error || 'Unknown error';
}

async function runDryImport(events, tabId) {
  let created = 0;
  for (let i = 0; i < events.length; i++) {
    console.log('[PUPSync DRY_RUN] Event', i + 1, '/', events.length, events[i].payload);
    created++;
    notifyProgress(tabId, i + 1, events.length, { created });
    await new Promise((r) => setTimeout(r, 100));
  }
  const result = { created, updated: 0, unchanged: 0, removed: 0, total: events.length };
  notifyComplete(tabId, result);
  return result;
}

async function runImport(message, sender) {
  const tabId = sender.tab?.id;
  const events = PUPUtils.buildCalendarEvents(
    message.subjects,
    message.semesterStart,
    message.semesterEnd,
    message.subjectColors || {},
    message.noClassDates || [],
    { descriptionTemplate: message.descriptionTemplate }
  );
  const termKey = resolveTermKey(message);
  if (!termKey) {
    notifyError(tabId, PUPCalendarSync.NO_TERM_ERROR);
    return { error: PUPCalendarSync.NO_TERM_ERROR, noTerm: true };
  }
  if (DRY_RUN) return runDryImport(events, tabId);

  let result;
  try {
    result = await withCalendar(true, (client) =>
      PUPCalendarSync.syncTerm({
        client,
        events,
        termKey,
        semesterStart: message.semesterStart,
        semesterEnd: message.semesterEnd,
        scheduleSubjectCodes: message.scheduleSubjectCodes,
        keepSubjectCodes: message.keepSubjectCodes || [],
        onProgress: (done, total, counts) => notifyProgress(tabId, done, total, counts)
      })
    );
  } catch (err) {
    notifyError(tabId, err.message);
    return { error: err.message };
  }

  if (result.map) await saveTermMap(termKey, result.map);

  if (!result.ok) {
    const msg = result.partial
      ? `Synced ${result.done} of ${result.total} classes. Import again to finish. ${friendlyError(result)}`
      : friendlyError(result);
    notifyError(tabId, msg);
    return { error: msg, partial: !!result.partial, done: result.done, total: result.total };
  }

  await chrome.storage.local.set({
    [PUPSYNC.STORAGE_KEYS.LAST_CALENDAR_SYNC]: new Date().toISOString(),
    [PUPSYNC.STORAGE_KEYS.LAST_SYNCED_TERM]: termKey
  });
  const out = {
    created: result.created,
    updated: result.updated,
    unchanged: result.unchanged,
    removed: result.removed,
    removedClasses: result.removedClasses || 0,
    total: result.total,
    removableCount: result.removableCount,
    removalSkipped: !!result.removalSkipped,
    removalHeld: result.removalHeld || 0,
    termKey
  };
  notifyComplete(tabId, out);
  return out;
}

async function runRemoveTerm(message) {
  const termKey = resolveTermKey(message);
  if (!termKey) return { ok: false, noTerm: true, error: PUPCalendarSync.NO_TERM_ERROR };
  if (DRY_RUN) return { ok: true, removed: 0, alreadyGone: 0, total: 0 };
  let result;
  try {
    result = await withCalendar(true, (client) =>
      PUPCalendarSync.removeTerm({
        client,
        termKey,
        semesterStart: message.semesterStart,
        semesterEnd: message.semesterEnd
      })
    );
  } catch (err) {
    return { ok: false, error: err.message };
  }
  if (result.ok) {
    await saveTermMap(termKey, null);
    const stored = await chrome.storage.local.get(PUPSYNC.STORAGE_KEYS.LAST_SYNCED_TERM);
    if (stored[PUPSYNC.STORAGE_KEYS.LAST_SYNCED_TERM] === termKey) {
      await chrome.storage.local.remove([
        PUPSYNC.STORAGE_KEYS.LAST_SYNCED_TERM,
        PUPSYNC.STORAGE_KEYS.LAST_CALENDAR_SYNC
      ]);
    }
    return result;
  }
  return { ...result, error: result.partial ? `Removed ${result.removed} of ${result.total}, then stopped: ${friendlyError(result)}` : friendlyError(result) };
}

/** Silent check used when the popup opens. Never prompts, never writes to Calendar. */
async function checkSyncedEvents(message) {
  if (DRY_RUN) return { ok: false, syncedEvents: {} };
  const termKey = resolveTermKey(message);
  if (!termKey) return { ok: false, noTerm: true, syncedEvents: {} };
  const token = await getAuthToken(false);
  let items;
  try {
    items = await calendarClient(token).listTagged();
  } catch (err) {
    if (err?.status === 401) await clearCachedToken();
    return { ok: false, syncedEvents: {} };
  }
  const classified = PUPCalendarSync.classifyTaggedEvents(items, {
    termKey,
    semesterStart: message.semesterStart,
    semesterEnd: message.semesterEnd
  });
  const { matched, adoptable } = classified;
  // The map includes adoptable v0.2.3 events (an import updates them), but
  // the undo count is only what Remove PUPSync classes would really delete.
  const map = {};
  for (const [k, ev] of Object.entries({ ...adoptable, ...matched })) map[k] = ev.id;
  await saveTermMap(termKey, map);
  return {
    ok: true,
    termKey,
    syncedEvents: map,
    removableCount: PUPCalendarSync.removableEvents(classified).length,
    legacyLookalikes: await countLegacyLookalikes(token, message)
  };
}

/**
 * Warn-only: how many untagged v0.2.2-or-older class series sit in this
 * term. Read-only; any error just means no warning.
 */
async function countLegacyLookalikes(token, message) {
  const win = PUPCalendarSync.legacyScanWindow(message.semesterStart, message.semesterEnd);
  if (!win || !Array.isArray(message.scheduleSubjectCodes) || !message.scheduleSubjectCodes.length) return 0;
  try {
    const items = await calendarClient(token).listWindow(win);
    return PUPCalendarSync.findLegacyLookalikes(items, {
      subjectCodes: message.scheduleSubjectCodes,
      semesterStart: message.semesterStart,
      semesterEnd: message.semesterEnd
    }).length;
  } catch {
    return 0;
  }
}

async function getAcademicCalendarCsv() {
  const url = chrome.runtime.getURL('config/academic-calendar.csv');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function getNoClassDatesJson() {
  const url = chrome.runtime.getURL('config/no-class-dates.json');
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === PUPSYNC.MESSAGE_TYPES.SCRAPE_TAB) {
    const tabId = message.tabId;
    if (!tabId) {
      sendResponse({ ok: false, error: 'No tab id' });
      return false;
    }
    scrapeTabSchedule(tabId).then(sendResponse);
    return true;
  }

  if (message?.type === PUPSYNC.MESSAGE_TYPES.SCRAPE_GRADES) {
    const tabId = message.tabId;
    if (!tabId) {
      sendResponse({ ok: false, error: 'No tab id' });
      return false;
    }
    scrapeTabGrades(tabId).then(sendResponse);
    return true;
  }

  if (message?.type === PUPSYNC.MESSAGE_TYPES.SCRAPE_IDENTITY) {
    const tabId = message.tabId;
    if (!tabId) {
      sendResponse({ ok: false, error: 'No tab id' });
      return false;
    }
    scrapeTabIdentity(tabId).then(sendResponse);
    return true;
  }

  if (message?.type === PUPSYNC.MESSAGE_TYPES.GET_ACADEMIC_CSV) {
    getAcademicCalendarCsv()
      .then((text) => sendResponse({ text }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message?.type === PUPSYNC.MESSAGE_TYPES.GET_NO_CLASS_JSON) {
    getNoClassDatesJson()
      .then((text) => sendResponse({ text }))
      .catch((err) => sendResponse({ error: err.message }));
    return true;
  }

  if (message?.type === PUPSYNC.MESSAGE_TYPES.IMPORT) {
    syncLock.run(() => runImport(message, sender)).then((res) =>
      sendResponse(res?.busy ? { error: res.error } : res)
    );
    return true;
  }

  if (message?.type === PUPSYNC.MESSAGE_TYPES.REMOVE_TERM_EVENTS) {
    syncLock.run(() => runRemoveTerm(message)).then(sendResponse);
    return true;
  }

  if (message?.type === PUPSYNC.MESSAGE_TYPES.PREVIEW_EVENTS) {
    const events = PUPUtils.buildCalendarEvents(
      message.subjects,
      message.semesterStart,
      message.semesterEnd,
      message.subjectColors || {},
      message.noClassDates || [],
      { descriptionTemplate: message.descriptionTemplate }
    );
    sendResponse({ events });
    return false;
  }

  if (message?.type === PUPSYNC.MESSAGE_TYPES.CHECK_SYNCED_EVENTS) {
    checkSyncedEvents(message)
      .then(sendResponse)
      .catch(() => sendResponse({ ok: false, syncedEvents: {} }));
    return true;
  }

  return false;
});

/** Debounce auto-open so one navigation does not fire twice. */
let autoOpenTimer = null;
const AUTO_OPEN_DEBOUNCE_MS = 500;

function isAutoOpenUrl(url) {
  return (
    !!url &&
    (PUPSYNC.isSiasScheduleUrl(url) ||
      PUPSYNC.isSiasGradesUrl(url) ||
      PUPSYNC.isSiasHomeUrl(url))
  );
}

/**
 * Auto-open at most once per SIAS tab per browser session, and never when
 * the student turned it off. Tab URLs are readable here without the "tabs"
 * permission because SIAS pages match the *.pup.edu.ph host permission.
 */
async function maybeOpenPopupForTab(tabId) {
  if (typeof chrome.action?.openPopup !== 'function') return;
  if (tabId == null) return;

  try {
    const prefs = await chrome.storage.local.get(PUPSYNC.STORAGE_KEYS.AUTO_OPEN_ENABLED);
    if (prefs[PUPSYNC.STORAGE_KEYS.AUTO_OPEN_ENABLED] === false) return;

    const tab = await chrome.tabs.get(tabId);
    if (!tab?.active || !isAutoOpenUrl(tab.url)) return;

    const [active] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    if (!active || active.id !== tabId) return;

    const key = PUPSYNC.STORAGE_KEYS.AUTO_OPENED_TABS;
    const seen = (await tokenStore.get(key))[key] || [];
    if (seen.includes(tabId)) return;

    await chrome.action.openPopup();
    await tokenStore.set({ [key]: [...seen.slice(-50), tabId] });
  } catch (err) {
    // Already open, no focused window, or unsupported. Ignore.
    console.debug('[PUPSync] openPopup skipped:', err?.message || err);
  }
}

function scheduleAutoOpen(tabId) {
  if (autoOpenTimer) clearTimeout(autoOpenTimer);
  autoOpenTimer = setTimeout(() => {
    autoOpenTimer = null;
    maybeOpenPopupForTab(tabId);
  }, AUTO_OPEN_DEBOUNCE_MS);
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete') return;
  if (!tab?.active) return;
  if (!isAutoOpenUrl(tab.url || changeInfo.url)) return;
  scheduleAutoOpen(tabId);
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  scheduleAutoOpen(activeInfo.tabId);
});

chrome.tabs.onRemoved.addListener(async (tabId) => {
  const key = PUPSYNC.STORAGE_KEYS.AUTO_OPENED_TABS;
  const seen = (await tokenStore.get(key))[key] || [];
  if (seen.includes(tabId)) {
    await tokenStore.set({ [key]: seen.filter((id) => id !== tabId) });
  }
});

function applyUninstallUrl() {
  if (PUPSYNC.UNINSTALL_FORM_URL && chrome.runtime.setUninstallURL) {
    chrome.runtime.setUninstallURL(PUPSYNC.UNINSTALL_FORM_URL).catch?.(() => {});
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  applyUninstallUrl();
  if (details.reason === 'install') {
    chrome.tabs.create({ url: chrome.runtime.getURL('welcome/welcome.html') }).catch?.(() => {});
  }
});

chrome.runtime.onStartup?.addListener(applyUninstallUrl);
