/**
 * Minimal Chrome extension API mock for popup Dev preview.
 */
(function () {
  const STORAGE_KEY = 'pupsync-dev-storage';
  const params = new URLSearchParams(window.location.search);
  /** @type {'schedule'|'grades'|'off'} */
  let scene = 'schedule';
  if (params.get('scene') === 'off') scene = 'off';
  else if (params.get('scene') === 'grades') scene = 'grades';

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

  function mockGradesPayload() {
    const base = structuredClone(window.PUPSYNC_MOCK_GRADES || { ok: false, semesters: [] });
    if (base.ok && base.semesters?.length && typeof PUPUtils?.computeAcademicStanding === 'function') {
      base.standing = PUPUtils.computeAcademicStanding(base.semesters);
    }
    return Promise.resolve(base);
  }

  async function simulateImport(message, callback) {
    const { subjects, semesterStart, semesterEnd, subjectColors, noClassDates } =
      message;
    const events = PUPUtils.buildCalendarEvents(
      subjects,
      semesterStart,
      semesterEnd,
      subjectColors || {},
      noClassDates || []
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

  function sceneToSearch(next, fixture) {
    const q = new URLSearchParams();
    if (next === 'off') q.set('scene', 'off');
    else if (next === 'grades') {
      q.set('scene', 'grades');
      const f = fixture || params.get('fixture') || 'magna';
      if (f && f !== 'magna') q.set('fixture', f);
    }
    const s = q.toString();
    return s ? `?${s}` : '';
  }

  window.__PUPSYNC_DEV__ = {
    setScene(next, fixture) {
      scene = next;
      window.location.search = sceneToSearch(next, fixture);
    },
    setGradeFixture(fixtureId) {
      this.setScene('grades', fixtureId);
    },
    getScene() {
      return scene;
    },
    getGradeFixture() {
      return window.PUPSYNC_MOCK_GRADE_FIXTURE_ID || 'magna';
    },
    /** @deprecated use setScene */
    setOnSias(value) {
      this.setScene(value ? 'schedule' : 'off');
    },
    isOnSias() {
      return scene === 'schedule';
    },
    reload() {
      window.location.reload();
    }
  };

  function tabUrlForScene() {
    if (scene === 'grades') return 'https://sis2.pup.edu.ph/student/grades';
    if (scene === 'off') return 'https://sis2.pup.edu.ph/student/home';
    return 'https://sis2.pup.edu.ph/student/schedule';
  }

  window.chrome = {
    runtime: {
      id: 'pupsync-dev',
      lastError: null,
      getURL(path) {
        return '/' + String(path || '').replace(/^\//, '');
      },
      onMessage: {
        addListener(fn) {
          messageListeners.push(fn);
        }
      },
      sendMessage(message, callback) {
        chrome.runtime.lastError = null;

        if (message?.type === PUPSYNC.MESSAGE_TYPES.GET_ACADEMIC_CSV) {
          return fetch('/config/academic-calendar.csv')
            .then((r) => r.text())
            .then((text) => {
              if (callback) callback({ text });
              return { text };
            })
            .catch((err) => {
              if (callback) callback({ error: err.message });
              return { error: err.message };
            });
        }

        if (message?.type === PUPSYNC.MESSAGE_TYPES.GET_NO_CLASS_JSON) {
          return fetch('/config/no-class-dates.json')
            .then((r) => r.text())
            .then((text) => {
              if (callback) callback({ text });
              return { text };
            })
            .catch((err) => {
              if (callback) callback({ error: err.message });
              return { error: err.message };
            });
        }

        if (message?.type === PUPSYNC.MESSAGE_TYPES.SCRAPE_TAB) {
          const done = (result) => {
            if (callback) callback(result);
            return result;
          };
          if (scene !== 'schedule') {
            const err = {
              ok: false,
              subjects: [],
              error: 'Content script not available'
            };
            return Promise.resolve(done(err));
          }
          return mockSchedulePayload().then(done);
        }

        if (message?.type === PUPSYNC.MESSAGE_TYPES.SCRAPE_GRADES) {
          const done = (result) => {
            if (callback) callback(result);
            return result;
          };
          if (scene !== 'grades') {
            return Promise.resolve(
              done({ ok: false, semesters: [], error: 'Not on grades page' })
            );
          }
          return mockGradesPayload().then(done);
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
        const tab = { id: 1, url: tabUrlForScene() };
        return Promise.resolve([tab]);
      },
      sendMessage(_tabId, message) {
        if (message?.type === PUPSYNC.MESSAGE_TYPES.GET_SCHEDULE) {
          if (scene !== 'schedule') {
            return Promise.reject(new Error('Not on SIAS schedule'));
          }
          return mockSchedulePayload();
        }
        return Promise.resolve({});
      }
    }
  };
})();
