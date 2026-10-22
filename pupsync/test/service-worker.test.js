/**
 * Service worker tests: real background/service_worker.js, fake chrome.* and
 * an in-memory Google Calendar. Messages are shaped like the popup's.
 * Run: node test/service-worker.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { loadServiceWorker } = require('./sw-harness');

const root = path.join(__dirname, '..');
const ctx = { console, URL, setTimeout, clearTimeout };
vm.createContext(ctx);
for (const f of ['shared/constants.js', 'shared/utils.js', 'shared/calendar-sync.js', 'dev/fake-calendar.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}
const PUPSYNC = vm.runInContext('PUPSYNC', ctx);
const S = vm.runInContext('PUPCalendarSync', ctx);
const Fake = vm.runInContext('PUPFakeCalendar', ctx);
const K = PUPSYNC.STORAGE_KEYS;
const T = PUPSYNC.MESSAGE_TYPES;

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    console.error('FAIL:', msg);
  }
}

const FIRST = { schoolYearCode: '2627', semester: 'First' };
const SECOND = { schoolYearCode: '2627', semester: 'Second' };
const T1 = { term: FIRST, start: '2026-08-31', end: '2026-12-19' };
const T2 = { term: SECOND, start: '2027-01-20', end: '2027-05-29' };

const subj = (code, title, day, start, end) => ({
  subjectCode: code,
  description: title,
  faculty: 'SANTOS JR., RAMON',
  section: 'BSIT 2-1N',
  meetings: [{ day, time: { start, end }, type: 'Lecture' }]
});
const COMP016 = subj('COMP 016', 'Web Development', 'Monday', '09:00', '12:00');
const COMP017 = subj('COMP 017', 'Data Structures', 'Wednesday', '13:00', '16:00');
const GEED = subj('GEED 004', 'Mathematics in the Modern World', 'Friday', '07:30', '10:30');

/** The import message the popup sends. */
function importMessage({ term, start, end }, subjects) {
  return {
    type: T.IMPORT,
    subjects,
    term,
    keepSubjectCodes: [],
    semesterStart: start,
    semesterEnd: end,
    subjectColors: {},
    noClassDates: []
  };
}
const removeMessage = ({ term, start, end }) => ({ type: T.REMOVE_TERM_EVENTS, term, semesterStart: start, semesterEnd: end });
const checkMessage = ({ term, start, end }) => ({ type: T.CHECK_SYNCED_EVENTS, term, semesterStart: start, semesterEnd: end });

/** True only for the real, non-empty no-term error. */
const isNoTermError = (e) => typeof S.NO_TERM_ERROR === 'string' && S.NO_TERM_ERROR.length > 0 && e === S.NO_TERM_ERROR;

const snapshot = (cal) => JSON.stringify([...cal.events.entries()].sort());
const codesOf = (cal) =>
  [...cal.events.values()]
    .map((e) => `${e.extendedProperties?.private?.pupsyncTerm}|${e.extendedProperties?.private?.pupsyncSubjectCode}`)
    .sort();

async function main() {
  // ---- K1: a missing term stops with an error and never falls back ----

  // K1.1 Second-sem import, SIAS header unparsed (term null), stale LAST_TERM from first sem.
  {
    const cal = Fake.create();
    const sw = loadServiceWorker({ calendar: cal });
    const r1 = await sw.send(importMessage(T1, [COMP016, COMP017]));
    assert(r1.created === 2, 'K1.1 setup: first sem imported');
    await sw.storage.local.set({ [K.LAST_TERM]: FIRST });
    const before = snapshot(cal);
    cal.resetCalls();
    const authBefore = sw.authFlows.length;
    const moved = { ...COMP016, meetings: [{ day: 'Tuesday', time: { start: '10:00', end: '13:00' }, type: 'Lecture' }] };
    const r = await sw.send(importMessage({ ...T2, term: null }, [moved, GEED]));
    assert(isNoTermError(r.error), `K1.1 null term: explicit error (${r.error})`);
    assert(cal.calls.length === 0, `K1.1 null term: zero Calendar calls (${cal.calls.map((c) => c.method).join(',')})`);
    assert(sw.authFlows.length === authBefore, 'K1.1 null term: no Google sign-in started');
    assert(snapshot(cal) === before, 'K1.1 null term: first sem events untouched');
    const errMsg = sw.sent.find((m) => m.type === T.IMPORT_ERROR);
    assert(errMsg && isNoTermError(errMsg.error), 'K1.1 null term: popup gets IMPORT_ERROR with the same text');
  }

  // K1.2 Null term, no LAST_TERM: must not invent a dates- key and create events.
  {
    const cal = Fake.create();
    const sw = loadServiceWorker({ calendar: cal });
    const r = await sw.send(importMessage({ ...T2, term: null }, [COMP016, GEED]));
    assert(isNoTermError(r.error), 'K1.2 null term, dates only: explicit error');
    assert(cal.calls.length === 0 && cal.events.size === 0, 'K1.2 null term, dates only: zero Calendar calls, nothing created');
    const map = (await sw.storage.local.get(K.SYNCED_EVENTS_BY_TERM))[K.SYNCED_EVENTS_BY_TERM] || {};
    assert(Object.keys(map).length === 0, 'K1.2 null term, dates only: no local map saved');
  }

  // K1.3 Remove PUPSync classes with a null term and a stale LAST_TERM.
  {
    const cal = Fake.create();
    const sw = loadServiceWorker({ calendar: cal });
    await sw.send(importMessage(T1, [COMP016, COMP017]));
    await sw.storage.local.set({ [K.LAST_TERM]: FIRST });
    const before = snapshot(cal);
    cal.resetCalls();
    const r = await sw.send(removeMessage({ ...T2, term: null }));
    assert(r.ok === false && isNoTermError(r.error), `K1.3 remove, null term: explicit error (${r.error})`);
    assert(cal.calls.length === 0, 'K1.3 remove, null term: zero Calendar calls');
    assert(snapshot(cal) === before, 'K1.3 remove, null term: first sem events kept');
  }

  // K1.4 Silent popup-open check with a null term does not query Calendar for a stale term.
  {
    const cal = Fake.create();
    const sw = loadServiceWorker({ calendar: cal });
    await sw.send(importMessage(T1, [COMP016]));
    await sw.storage.local.set({ [K.LAST_TERM]: FIRST });
    cal.resetCalls();
    const r = await sw.send(checkMessage({ ...T2, term: null }));
    assert(r.ok === false && cal.calls.length === 0, 'K1.4 check, null term: zero Calendar calls');
  }

  // K1.5 Term objects that do not name a known semester are refused too.
  for (const bad of [
    { schoolYearCode: '2627', semester: '' },
    { schoolYearCode: '2627', semester: 'Special' },
    { schoolYearCode: '', semester: 'First' },
    { schoolYearCode: '26-27', semester: 'First' }
  ]) {
    const cal = Fake.create();
    const sw = loadServiceWorker({ calendar: cal });
    const r = await sw.send(importMessage({ ...T1, term: bad }, [COMP016]));
    assert(isNoTermError(r.error) && cal.calls.length === 0, `K1.5 term ${JSON.stringify(bad)}: refused with zero Calendar calls`);
  }

  // K1.6 Semester names normalize to fixed values, so the same sem written two ways is one term.
  {
    const cal = Fake.create();
    const sw = loadServiceWorker({ calendar: cal });
    const r1 = await sw.send(importMessage({ ...T1, term: { schoolYearCode: '2627', semester: 'First Semester' } }, [COMP016, COMP017]));
    cal.resetCalls();
    const r2 = await sw.send(importMessage({ ...T1, term: { schoolYearCode: '2627', semester: 'FIRST' } }, [COMP016, COMP017]));
    assert(r1.created === 2 && r1.termKey === '2627-first', `K1.6 "First Semester" -> 2627-first (${r1.termKey})`);
    assert(r2.unchanged === 2 && cal.writes().length === 0, 'K1.6 "FIRST" is the same term: zero writes');
  }

  console.log(`service-worker: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
