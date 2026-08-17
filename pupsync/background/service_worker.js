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

async function updateEventOnCalendar(token, eventId, payload) {
  const url = `${PUPSYNC.CALENDAR_API_EVENTS}/${encodeURIComponent(eventId)}`;
  const res = await fetch(url, {
    method: 'PUT',
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
  if (res.status === 404) {
    const err = new Error('Not found');
    err.status = 404;
    throw err;
  }
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Calendar API ${res.status}: ${body}`);
  }
  return res.json();
}

async function fetchExistingPupsyncEvents(token, subjects = [], semesterStart, semesterEnd) {
  try {
    const taggedUrl = new URL(PUPSYNC.CALENDAR_API_EVENTS);
    taggedUrl.searchParams.set('privateExtendedProperty', 'pupsync=true');
    taggedUrl.searchParams.set('maxResults', '250');

    const listUrl = new URL(PUPSYNC.CALENDAR_API_EVENTS);
    listUrl.searchParams.set('singleEvents', 'false');
    listUrl.searchParams.set('maxResults', '250');
    if (semesterStart) {
      try {
        const d = new Date(semesterStart);
        if (!isNaN(d.getTime())) {
          d.setDate(d.getDate() - 14);
          listUrl.searchParams.set('timeMin', d.toISOString());
        }
      } catch {}
    }
    if (semesterEnd) {
      try {
        const d = new Date(semesterEnd);
        if (!isNaN(d.getTime())) {
          d.setDate(d.getDate() + 14);
          listUrl.searchParams.set('timeMax', d.toISOString());
        }
      } catch {}
    }

    const [taggedRes, listRes] = await Promise.all([
      fetch(taggedUrl.toString(), {
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => null),
      fetch(listUrl.toString(), {
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => null)
    ]);

    const allItems = [];
    if (taggedRes && taggedRes.ok) {
      const data = await taggedRes.json();
      if (Array.isArray(data.items)) allItems.push(...data.items);
    }
    if (listRes && listRes.ok) {
      const data = await listRes.json();
      if (Array.isArray(data.items)) allItems.push(...data.items);
    }

    const map = {};
    for (const item of allItems) {
      const identified = PUPUtils.identifyCalendarEvent(item, subjects);
      if (identified && item.id) {
        const key = `${identified.subjectCode}__${identified.meetingIndex}`;
        map[key] = item.id;
      }
    }
    return map;
  } catch (err) {
    console.warn('[PUPSync] Could not query existing calendar events', err);
    return {};
  }
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

async function updateWithRetry(token, eventId, payload, attempt = 0) {
  try {
    return await updateEventOnCalendar(token, eventId, payload);
  } catch (err) {
    if (err.status === 429 && attempt < MAX_RETRIES) {
      const delay = Math.pow(2, attempt) * 500;
      await new Promise((r) => setTimeout(r, delay));
      return updateWithRetry(token, eventId, payload, attempt + 1);
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

function notifyComplete(tabId, result) {
  chrome.runtime.sendMessage({
    type: PUPSYNC.MESSAGE_TYPES.IMPORT_COMPLETE,
    created: typeof result === 'object' ? result.created : result,
    updated: typeof result === 'object' ? result.updated : 0,
    total: typeof result === 'object' ? result.total : result,
    result
  }).catch(() => {});
  if (tabId) {
    chrome.tabs.sendMessage(tabId, {
      type: PUPSYNC.MESSAGE_TYPES.IMPORT_COMPLETE,
      created: typeof result === 'object' ? result.created : result,
      updated: typeof result === 'object' ? result.updated : 0,
      total: typeof result === 'object' ? result.total : result,
      result
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
  let updated = 0;

  const syncKey = PUPSYNC.STORAGE_KEYS.SYNCED_CALENDAR_EVENTS;
  const stored = await chrome.storage.local.get(syncKey);
  let syncedMap = stored[syncKey] || {};

  let token = null;
  if (!DRY_RUN) {
    try {
      token = await getAuthToken(true);
      const remoteMap = await fetchExistingPupsyncEvents(
        token,
        subjects,
        semesterStart,
        semesterEnd
      );
      syncedMap = { ...syncedMap, ...remoteMap };
    } catch (err) {
      notifyError(tabId, err.message);
      return { error: err.message };
    }
  }

  for (let i = 0; i < events.length; i++) {
    const ev = events[i];
    const eventKey = ev.eventKey || `${ev.subjectCode}__${ev.meetingIndex ?? 0}`;
    const existingId = syncedMap[eventKey];

    notifyProgress(tabId, i + 1, total);
    chrome.runtime.sendMessage({
      type: PUPSYNC.MESSAGE_TYPES.IMPORT_PROGRESS,
      current: i + 1,
      total,
      created,
      updated
    }).catch(() => {});

    if (DRY_RUN) {
      if (existingId) {
        console.log('[PUPSync DRY_RUN] Updating event', i + 1, '/', total, existingId, ev.payload);
        updated++;
      } else {
        console.log('[PUPSync DRY_RUN] Creating event', i + 1, '/', total, ev.payload);
        syncedMap[eventKey] = 'mock_evt_' + Math.random().toString(36).slice(2);
        created++;
      }
      await new Promise((r) => setTimeout(r, 100));
      continue;
    }

    try {
      if (existingId) {
        try {
          await updateWithRetry(token, existingId, ev.payload);
          updated++;
        } catch (updateErr) {
          if (updateErr.status === 404) {
            const newEv = await createWithRetry(token, ev.payload);
            if (newEv?.id) syncedMap[eventKey] = newEv.id;
            created++;
          } else {
            throw updateErr;
          }
        }
      } else {
        const newEv = await createWithRetry(token, ev.payload);
        if (newEv?.id) syncedMap[eventKey] = newEv.id;
        created++;
      }
    } catch (err) {
      console.error('[PUPSync] Failed sync for event', ev.subjectCode, err);
      notifyError(tabId, err.message);
      return { error: err.message };
    }
  }

  await chrome.storage.local.set({
    [syncKey]: syncedMap,
    [PUPSYNC.STORAGE_KEYS.LAST_CALENDAR_SYNC]: new Date().toISOString()
  });

  const result = { created, updated, total };
  notifyComplete(tabId, result);
  return result;
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

  if (message?.type === PUPSYNC.MESSAGE_TYPES.CHECK_SYNCED_EVENTS) {
    getAuthToken(false)
      .then((token) =>
        fetchExistingPupsyncEvents(
          token,
          message.subjects || [],
          message.semesterStart,
          message.semesterEnd
        )
      )
      .then((map) => {
        if (map && Object.keys(map).length) {
          const syncKey = PUPSYNC.STORAGE_KEYS.SYNCED_CALENDAR_EVENTS;
          chrome.storage.local.get(syncKey, (stored) => {
            const current = stored[syncKey] || {};
            const merged = { ...current, ...map };
            chrome.storage.local.set({ [syncKey]: merged });
          });
        }
        sendResponse({ ok: true, syncedEvents: map || {} });
      })
      .catch(() => {
        sendResponse({ ok: false, syncedEvents: {} });
      });
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
