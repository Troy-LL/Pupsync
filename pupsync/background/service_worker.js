/**
 * PUPSync service worker — event generation, dry-run, Calendar API (Phase 2b).
 */
const DRY_RUN = PUPSYNC.DRY_RUN;
const MAX_RETRIES = 3;

importScripts('../shared/constants.js', '../shared/utils.js');

async function getAuthToken(interactive) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(token);
    });
  });
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
  const { subjects, semesterStart, semesterEnd, subjectColors } = message;
  const events = PUPUtils.buildCalendarEvents(
    subjects,
    semesterStart,
    semesterEnd,
    subjectColors || {}
  );
  const tabId = sender.tab?.id;
  const total = events.length;
  let created = 0;

  let token = null;
  if (!DRY_RUN) {
    try {
      token = await getAuthToken(true);
      await chrome.storage.local.set({
        [PUPSYNC.STORAGE_KEYS.OAUTH_TOKEN]: token
      });
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

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === PUPSYNC.MESSAGE_TYPES.IMPORT) {
    runImport(message, sender).then(sendResponse);
    return true;
  }

  if (message?.type === PUPSYNC.MESSAGE_TYPES.PREVIEW_EVENTS) {
    const events = PUPUtils.buildCalendarEvents(
      message.subjects,
      message.semesterStart,
      message.semesterEnd,
      message.subjectColors || {}
    );
    sendResponse({ events });
    return false;
  }

  return false;
});
