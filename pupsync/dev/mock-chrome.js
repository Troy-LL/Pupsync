/**
 * Minimal Chrome extension API mock for popup dev preview.
 */
(function () {
  const STORAGE_KEY = 'pupsync-dev-storage';
  const params = new URLSearchParams(window.location.search);
  let onSias = params.get('scene') !== 'off';

  const messageListeners = [];

  function readStorage() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    } catch {
      return {};
    }
  }

  function writeStorage(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function delay(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  function emitMessage(message) {
    messageListeners.forEach((fn) => {
      try {
        fn(message);
      } catch (err) {
        console.error('[dev mock]', err);
      }
    });
  }

  function mockSchedulePayload() {
    return (window.__PUPSYNC_MOCK_TERM_READY__ || Promise.resolve()).then(() => ({
      ok: true,
      subjects: structuredClone(window.PUPSYNC_MOCK_SUBJECTS),
      term: window.PUPSYNC_MOCK_TERM
        ? structuredClone(window.PUPSYNC_MOCK_TERM)
        : null,
      termHeader: { schoolYearCode: '2526', semester: 'Second' },
      error: null
    }));
  }

  async function simulateImport(message, callback) {
    const { subjects, semesterStart, semesterEnd, subjectColors } = message;
    const events = PUPUtils.buildCalendarEvents(
      subjects,
      semesterStart,
      semesterEnd,
      subjectColors || {}
    );
    const total = events.length;

    for (let i = 0; i < total; i++) {
      await delay(100);
      emitMessage({
        type: PUPSYNC.MESSAGE_TYPES.IMPORT_PROGRESS,
        current: i + 1,
        total
      });
    }

    console.log('[PUPSync DEV] Generated events:', events);
    callback({ created: total });
  }

  window.__PUPSYNC_DEV__ = {
    setOnSias(value) {
      onSias = value;
      window.location.search = value ? '' : '?scene=off';
    },
    isOnSias() {
      return onSias;
    },
    reload() {
      window.location.reload();
    }
  };

  window.chrome = {
    runtime: {
      lastError: null,
      onMessage: {
        addListener(fn) {
          messageListeners.push(fn);
        }
      },
      sendMessage(message, callback) {
        chrome.runtime.lastError = null;

        if (message?.type === PUPSYNC.MESSAGE_TYPES.SCRAPE_TAB) {
          const done = (result) => {
            if (callback) callback(result);
            return result;
          };
          if (!onSias) {
            const err = {
              ok: false,
              subjects: [],
              error: 'Content script not available'
            };
            return Promise.resolve(done(err));
          }
          return mockSchedulePayload().then(done);
        }

        if (message?.type === PUPSYNC.MESSAGE_TYPES.SCRAPE_IDENTITY) {
          const id = {
            ok: true,
            firstName: 'Troy',
            lastName: 'LAZARO',
            raw: 'LAZARO, TROY LAUREN TAN (2024-03529-MN-0)'
          };
          if (callback) callback(id);
          return Promise.resolve(id);
        }

        if (message?.type === PUPSYNC.MESSAGE_TYPES.IMPORT) {
          simulateImport(message, callback || (() => {}));
          return;
        }

        if (callback) callback(undefined);
        return Promise.resolve(undefined);
      }
    },
    storage: {
      local: {
        get(keys) {
          const all = readStorage();
          return Promise.resolve().then(() => {
            if (keys == null) return { ...all };
            const list = Array.isArray(keys) ? keys : [keys];
            const out = {};
            for (const key of list) {
              if (Object.prototype.hasOwnProperty.call(all, key)) {
                out[key] = all[key];
              }
            }
            return out;
          });
        },
        set(items) {
          const all = readStorage();
          Object.assign(all, items);
          writeStorage(all);
          return Promise.resolve();
        }
      }
    },
    tabs: {
      query(_queryInfo) {
        const tab = {
          id: 1,
          url: onSias
            ? 'https://sis2.pup.edu.ph/student/schedule'
            : 'https://sis2.pup.edu.ph/student/home'
        };
        return Promise.resolve([tab]);
      },
      sendMessage(_tabId, message) {
        if (message?.type === PUPSYNC.MESSAGE_TYPES.GET_SCHEDULE) {
          if (!onSias) {
            return Promise.reject(new Error('Not on SIAS'));
          }
          return mockSchedulePayload();
        }
        return Promise.resolve({});
      }
    }
  };
})();
