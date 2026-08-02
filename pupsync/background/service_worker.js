/**
 * PUPSync service worker — event generation, dry-run, Calendar API (Phase 2b).
 */
importScripts(
  '../shared/constants.js',
  '../shared/utils.js',
  'scrape-tab.js'
);

const DRY_RUN = PUPSYNC.DRY_RUN;
const MAX_RETRIES = 3;

/**
 * OAuth via launchWebAuthFlow (Web client + chromiumapp.org redirect).
 * getAuthToken hits "Custom URI scheme is not supported on Chrome apps" for many setups.
 */
async function getAuthToken(interactive) {
  const key = PUPSYNC.STORAGE_KEYS.OAUTH_TOKEN;
  const stored = await chrome.storage.local.get(key);
  const cached = stored[key];
  if (
    cached &&
    typeof cached === 'object' &&
    cached.accessToken &&
    cached.expiresAt > Date.now() + 60_000
  ) {
    return cached.accessToken;
  }
  if (typeof cached === 'string' && cached) {
    // Legacy plain-string token from getAuthToken era — force re-auth
  }
  if (!interactive) {
    throw new Error('Not signed in to Google');
  }

  const manifest = chrome.runtime.getManifest();
  const clientId = manifest.oauth2?.client_id;
  const scopes = (manifest.oauth2?.scopes || []).join(' ');
  if (!clientId || clientId.startsWith('YOUR_CLIENT_ID')) {
    throw new Error('Set oauth2.client_id in manifest.json');
  }

  const redirectUri = chrome.identity.getRedirectURL();
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', scopes);
  authUrl.searchParams.set('prompt', 'consent');

  const responseUrl = await new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      { url: authUrl.href, interactive: true },
      (redirectedTo) => {
        if (chrome.runtime.lastError || !redirectedTo) {
          reject(
            new Error(
              chrome.runtime.lastError?.message || 'Google sign-in cancelled'
            )
          );
          return;
        }
        resolve(redirectedTo);
      }
    );
  });

  const params = new URLSearchParams(new URL(responseUrl).hash.replace(/^#/, ''));
  const accessToken = params.get('access_token');
  const expiresIn = Number(params.get('expires_in') || 3600);
  if (!accessToken) {
    throw new Error('No access_token in OAuth response');
  }

  await chrome.storage.local.set({
    [key]: {
      accessToken,
      expiresAt: Date.now() + expiresIn * 1000
    }
  });
  return accessToken;
}

async function createEventOnCalendar(token, payload) {
  const res = await fetch(PUPSYNC.CALENDAR_API_EVENTS, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });
  if (res.status === 429) {
    const err = new Error('Rate limited');
    err.status = 429;
    throw err;
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Calendar API ${res.status}: ${body}`);
  }
  return res.json();
}

async function createWithRetry(token, payload, attempt = 0) {
  try {
    return await createEventOnCalendar(token, payload);
  } catch (err) {
    if (err.status === 429 && attempt < MAX_RETRIES) {
      const delay = Math.pow(2, attempt) * 500;
      await new Promise((r) => setTimeout(r, delay));
      return createWithRetry(token, payload, attempt + 1);
    }
    throw err;
  }
}

function notifyProgress(tabId, current, total) {
  if (!tabId) return;
  chrome.tabs.sendMessage(tabId, {
    type: PUPSYNC.MESSAGE_TYPES.IMPORT_PROGRESS,
    current,
    total
  }).catch(() => {});
}

function notifyComplete(tabId, created) {
  chrome.runtime.sendMessage({
    type: PUPSYNC.MESSAGE_TYPES.IMPORT_COMPLETE,
    created
  }).catch(() => {});
  if (tabId) {
    chrome.tabs.sendMessage(tabId, {
      type: PUPSYNC.MESSAGE_TYPES.IMPORT_COMPLETE,
      created
    }).catch(() => {});
  }
}

function notifyError(tabId, error) {
  chrome.runtime.sendMessage({
    type: PUPSYNC.MESSAGE_TYPES.IMPORT_ERROR,
    error
  }).catch(() => {});
  if (tabId) {
    chrome.tabs.sendMessage(tabId, {
      type: PUPSYNC.MESSAGE_TYPES.IMPORT_ERROR,
      error
    }).catch(() => {});
  }
}

async function runImport(message, sender) {
  const { subjects, semesterStart, semesterEnd, subjectColors, noClassDates } =
    message;
  const events = PUPUtils.buildCalendarEvents(
    subjects,
    semesterStart,
    semesterEnd,
    subjectColors || {},
    noClassDates || []
  );
  const tabId = sender.tab?.id;
  const total = events.length;
  let created = 0;

  let token = null;
  if (!DRY_RUN) {
    try {
      token = await getAuthToken(true);
    } catch (err) {
      notifyError(tabId, err.message);
      return { error: err.message };
    }
  }

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    notifyProgress(tabId, i + 1, total);
    chrome.runtime.sendMessage({
      type: PUPSYNC.MESSAGE_TYPES.IMPORT_PROGRESS,
      current: i + 1,
      total
    }).catch(() => {});

    if (DRY_RUN) {
      console.log('[PUPSync DRY_RUN] Event', i + 1, '/', total, ev.payload);
      await new Promise((r) => setTimeout(r, 120));
      created++;
      continue;
    }

    try {
      await createWithRetry(token, ev.payload);
      created++;
    } catch (err) {
      console.error('[PUPSync] Failed event', ev.subjectCode, err);
      notifyError(tabId, err.message);
      return { error: err.message };
    }
  }

  notifyComplete(tabId, created);
  return { created };
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
    runImport(message, sender).then(sendResponse);
    return true;
  }

  if (message?.type === PUPSYNC.MESSAGE_TYPES.PREVIEW_EVENTS) {
    const events = PUPUtils.buildCalendarEvents(
      message.subjects,
      message.semesterStart,
      message.semesterEnd,
      message.subjectColors || {},
      message.noClassDates || []
    );
    sendResponse({ events });
    return false;
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

async function maybeOpenPopupForTab(tabId) {
  if (typeof chrome.action?.openPopup !== 'function') return;
  if (tabId == null) return;

  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab?.active || !isAutoOpenUrl(tab.url)) return;

    const [active] = await chrome.tabs.query({
      active: true,
      currentWindow: true
    });
    if (!active || active.id !== tabId) return;

    await chrome.action.openPopup();
  } catch (err) {
    // Already open, no focused window, or unsupported — ignore.
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
