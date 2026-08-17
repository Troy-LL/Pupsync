/**
 * Minimal Chrome extension API mock for popup Dev preview.
 */
(function () {
  const STORAGE_KEY = 'pupsync-dev-storage';
  const params = new URLSearchParams(window.location.search);
  /** @type {'schedule'|'grades'|'off'|'empty'} — 'empty' = on the schedule page, nothing enlisted */
  let scene = 'schedule';
  if (params.get('scene') === 'off') scene = 'off';
  else if (params.get('scene') === 'grades') scene = 'grades';
  else if (params.get('scene') === 'empty') scene = 'empty';

  /** @type {'ontrack'|'offtrack'|'empty'} — home GWA card from grades cache */
  let homeFixture = 'ontrack';
  const homeParam = (params.get('home') || '').toLowerCase();
  if (homeParam === 'empty') homeFixture = 'empty';
  else if (homeParam === 'offtrack' || homeParam === 'failed') {
    homeFixture = 'offtrack';
  } else if (
    homeParam === 'ontrack' ||
    homeParam === 'cached' ||
    homeParam === 'rich' ||
    homeParam === 'slim'
  ) {
    // cached/rich/slim aliases kept so old preview links still work
    homeFixture = 'ontrack';
  }

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

  function homeSnapshotFromGradeFixture(gradeFixtureId) {
    const fix = window.PUPSYNC_MOCK_GRADE_FIXTURES?.[gradeFixtureId];
    if (
      fix?.semesters?.length &&
      typeof PUPUtils?.buildGradesHomeSnapshot === 'function'
    ) {
      return {
        ...PUPUtils.buildGradesHomeSnapshot(fix.semesters),
        savedAt: new Date().toISOString()
      };
    }
    return null;
  }

  function seedHomeCache() {
    if (scene !== 'off') return;
    const key = PUPSYNC.STORAGE_KEYS.LAST_GRADES;
    const all = readStorage();
    if (homeFixture === 'empty') {
      delete all[key];
      writeStorage(all);
      return;
    }
    const gradeId = homeFixture === 'offtrack' ? 'offtrack' : 'magna';
    const snap = homeSnapshotFromGradeFixture(gradeId);
    if (snap) {
      all[key] = snap;
    } else if (homeFixture === 'offtrack') {
      all[key] = {
        gwa: 1.65,
        totalUnits: 15,
        unitsEarned: '15',
        tier: null,
        qualifiesTier: 'Cum Laude',
        disqualified: true,
        subjectsAsOf: 'School Year 2425 - Second Semester',
        enrolled: 7,
        dropped: 1,
        failed: 1,
        savedAt: new Date().toISOString()
      };
    } else {
      all[key] = {
        gwa: 1.45,
        totalUnits: 98,
        unitsEarned: '98',
        tier: 'Magna Cum Laude',
        qualifiesTier: 'Magna Cum Laude',
        disqualified: false,
        subjectsAsOf: 'School Year 2425 - Second Semester',
        enrolled: 42,
        dropped: 0,
        failed: 0,
        savedAt: new Date().toISOString()
      };
    }
    writeStorage(all);
  }

  seedHomeCache();

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

    const all = readStorage();
    const syncKey = PUPSYNC.STORAGE_KEYS.SYNCED_CALENDAR_EVENTS;
    const syncedMap = all[syncKey] || {};
    let created = 0;
    let updated = 0;

    for (let i = 0; i < total; i++) {
      const ev = events[i];
      const key = ev.eventKey || `${ev.subjectCode}__${ev.meetingIndex ?? 0}`;
      if (syncedMap[key]) {
        updated++;
      } else {
        syncedMap[key] = 'mock_evt_' + Math.random().toString(36).slice(2);
        created++;
      }
      await delay(80);
      emitMessage({
        type: PUPSYNC.MESSAGE_TYPES.IMPORT_PROGRESS,
        current: i + 1,
        total,
        created,
        updated
      });
    }

    all[syncKey] = syncedMap;
    all[PUPSYNC.STORAGE_KEYS.LAST_CALENDAR_SYNC] = new Date().toISOString();
    writeStorage(all);

    const result = { created, updated, total };
    console.log('[PUPSync DEV] Synced events result:', result, events);
    emitMessage({
      type: PUPSYNC.MESSAGE_TYPES.IMPORT_COMPLETE,
      ...result,
      result
    });
    if (callback) callback(result);
  }

  function sceneToSearch(next, fixture, home) {
    const q = new URLSearchParams();
    if (next === 'off') {
      q.set('scene', 'off');
      const h = home || homeFixture || 'ontrack';
      if (h === 'empty') q.set('home', 'empty');
      else if (h === 'offtrack') q.set('home', 'offtrack');
    } else if (next === 'empty') {
      q.set('scene', 'empty');
    } else if (next === 'grades') {
      q.set('scene', 'grades');
      const f = fixture || params.get('fixture') || 'magna';
      if (f && f !== 'magna') q.set('fixture', f);
    }
    const s = q.toString();
    return s ? `?${s}` : '';
  }

  window.__PUPSYNC_DEV__ = {
    setScene(next, fixture, home) {
      scene = next;
      window.location.search = sceneToSearch(next, fixture, home);
    },
    setGradeFixture(fixtureId) {
      this.setScene('grades', fixtureId);
    },
    setHomeFixture(fixtureId) {
      const raw = String(fixtureId || '').toLowerCase();
      const id =
        raw === 'empty'
          ? 'empty'
          : raw === 'offtrack' || raw === 'failed'
            ? 'offtrack'
            : 'ontrack';
      homeFixture = id;
      this.setScene('off', null, homeFixture);
    },
    getScene() {
      return scene;
    },
    getHomeFixture() {
      return homeFixture;
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

  function applyDevNavUrl(url) {
    const s = String(url || '');
    if (/\/student\/grades/i.test(s)) {
      window.__PUPSYNC_DEV__.setScene('grades');
    } else if (/\/student\/schedule/i.test(s)) {
      window.__PUPSYNC_DEV__.setScene('schedule');
    } else if (/\/student\/home/i.test(s)) {
      window.__PUPSYNC_DEV__.setScene('off');
    }
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
          if (scene === 'empty') {
            return Promise.resolve(
              done({
                ok: false,
                subjects: [],
                termHeader: { schoolYearCode: '2526', semester: 'Second' },
                error: 'No enlisted subjects yet'
              })
            );
          }
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

        if (message?.type === PUPSYNC.MESSAGE_TYPES.CHECK_SYNCED_EVENTS) {
          const all = readStorage();
          const syncKey = PUPSYNC.STORAGE_KEYS.SYNCED_CALENDAR_EVENTS;
          const syncedEvents = all[syncKey] || {};
          const res = { ok: true, syncedEvents };
          if (callback) callback(res);
          return Promise.resolve(res);
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
      update(_tabId, props) {
        applyDevNavUrl(props?.url);
        return Promise.resolve({ id: _tabId, url: props?.url || tabUrlForScene() });
      },
      create(props) {
        applyDevNavUrl(props?.url);
        return Promise.resolve({ id: 2, url: props?.url || tabUrlForScene() });
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
