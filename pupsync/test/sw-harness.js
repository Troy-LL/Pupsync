/**
 * Loads background/service_worker.js in a sandbox with a fake chrome.* API
 * and the in-memory Google Calendar, so tests can send it the same messages
 * the popup sends and count every Calendar call it makes.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');

function fakeArea(initial = {}) {
  const data = JSON.parse(JSON.stringify(initial));
  const pick = (keys) => {
    if (keys == null) return { ...data };
    const list = Array.isArray(keys) ? keys : typeof keys === 'string' ? [keys] : Object.keys(keys);
    const out = {};
    for (const k of list) if (k in data) out[k] = JSON.parse(JSON.stringify(data[k]));
    return out;
  };
  return {
    data,
    async get(keys) {
      return pick(keys);
    },
    async set(obj) {
      for (const [k, v] of Object.entries(obj)) data[k] = JSON.parse(JSON.stringify(v));
    },
    async remove(keys) {
      for (const k of Array.isArray(keys) ? keys : [keys]) delete data[k];
    }
  };
}

/**
 * @param {object} opts
 * @param {object} opts.calendar PUPFakeCalendar instance
 * @param {object} [opts.local] initial chrome.storage.local
 * @param {object} [opts.session] initial chrome.storage.session
 */
function loadServiceWorker({ calendar, local = {}, session = {} }) {
  const listeners = [];
  const sent = [];
  const authFlows = [];
  let tokenSeq = 0;
  const storage = { local: fakeArea(local), session: fakeArea(session) };

  const noopEvent = { addListener() {} };
  const chrome = {
    storage,
    runtime: {
      id: 'pupsync-test',
      lastError: null,
      getManifest: () => ({
        version: '0.0.0-test',
        oauth2: { client_id: 'test-client.apps.googleusercontent.com', scopes: ['https://www.googleapis.com/auth/calendar.events'] }
      }),
      getURL: (p) => `chrome-extension://test/${p}`,
      onMessage: { addListener: (fn) => listeners.push(fn) },
      onInstalled: noopEvent,
      onStartup: noopEvent,
      setUninstallURL: async () => {},
      sendMessage: async (msg) => {
        sent.push(msg);
      }
    },
    identity: {
      getRedirectURL: () => 'https://test.chromiumapp.org/',
      launchWebAuthFlow({ url, interactive }, cb) {
        authFlows.push({ url, interactive });
        cb(`https://test.chromiumapp.org/#access_token=tok_${++tokenSeq}&expires_in=3600`);
      }
    },
    tabs: {
      sendMessage: async () => {},
      onUpdated: noopEvent,
      onActivated: noopEvent,
      onRemoved: noopEvent,
      create: async () => {},
      get: async () => null,
      query: async () => []
    },
    action: {},
    scripting: {}
  };

  const calendarFetch = async (url, init) => {
    if (String(url).startsWith('https://www.googleapis.com/calendar/')) return calendar.fetch(url, init);
    throw new Error(`Unexpected fetch in test: ${url}`);
  };

  const ctx = {
    console: { log() {}, debug() {}, warn() {}, error: console.error },
    URL,
    URLSearchParams,
    setTimeout: (fn) => setTimeout(fn, 0),
    clearTimeout,
    fetch: calendarFetch,
    chrome
  };
  ctx.globalThis = ctx;
  ctx.self = ctx;
  ctx.importScripts = (...files) => {
    for (const f of files) {
      const p = path.join(root, 'background', f);
      vm.runInContext(fs.readFileSync(p, 'utf8'), ctx, { filename: path.relative(root, p) });
    }
  };
  vm.createContext(ctx);
  const swPath = path.join(root, 'background/service_worker.js');
  vm.runInContext(fs.readFileSync(swPath, 'utf8'), ctx, { filename: 'background/service_worker.js' });

  /** Send a message the way the popup does; resolves with sendResponse's value. */
  function send(message, sender = { id: chrome.runtime.id }) {
    return new Promise((resolve, reject) => {
      let async = false;
      let answered = false;
      const respond = (v) => {
        answered = true;
        resolve(v);
      };
      for (const fn of listeners) {
        const r = fn(message, sender, respond);
        if (r === true) async = true;
      }
      if (!async && !answered) reject(new Error(`No response for ${message?.type}`));
    });
  }

  return { send, storage, sent, authFlows, ctx };
}

module.exports = { loadServiceWorker };
