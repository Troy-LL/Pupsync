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
const U = vm.runInContext('PUPUtils', ctx);
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

/** Codes as the popup lists them: every scraped subject, whatever its state. */
const scrapedCodes = (subjects) => [...new Set(subjects.map((s) => s.subjectCode.trim().toUpperCase()))];

/**
 * The import message the popup sends. `scraped` is every subject on the SIAS
 * page; `imported` is what becomes events (ticked, parsed). Defaults to all.
 */
function importMessage({ term, start, end }, scraped, imported = scraped) {
  return {
    type: T.IMPORT,
    subjects: imported,
    term,
    scheduleSubjectCodes: scrapedCodes(scraped),
    keepSubjectCodes: scraped.filter((s) => s.excluded).map((s) => s.subjectCode),
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

  // ---- K2: parse-error and no-meeting subjects are never removed as dropped ----

  const NSTP = subj('NSTP 002', 'Civic Welfare Training Service 2', 'Saturday', '08:00', '11:00');
  const idOf = (cal, code) =>
    [...cal.events.values()].find((e) => e.extendedProperties?.private?.pupsyncSubjectCode === code)?.id;

  // K2.1 Re-import where one class failed to parse, one has no meeting times, one was really dropped.
  {
    const cal = Fake.create();
    const sw = loadServiceWorker({ calendar: cal });
    const r1 = await sw.send(importMessage(T1, [COMP016, COMP017, GEED, NSTP]));
    assert(r1.created === 4, 'K2.1 setup: four classes imported');
    const ids = { comp017: idOf(cal, 'COMP 017'), geed: idOf(cal, 'GEED 004'), nstp: idOf(cal, 'NSTP 002') };
    const before = { comp017: JSON.stringify(cal.events.get(ids.comp017)), geed: JSON.stringify(cal.events.get(ids.geed)) };
    cal.resetCalls();
    const parseErr = { ...COMP017, meetings: [], parseError: 'Could not read schedule' };
    const noMeeting = { ...GEED, meetings: [] };
    // The popup leaves parse errors out of the import list; no-meeting subjects build no events.
    const r = await sw.send(importMessage(T1, [COMP016, parseErr, noMeeting], [COMP016, noMeeting]));
    const deletes = cal.calls.filter((c) => c.method === 'DELETE').map((c) => c.id);
    assert(r.removed === 1, `K2.1 only the dropped class is removed (removed ${r.removed})`);
    assert(deletes.length === 1 && deletes[0] === ids.nstp, `K2.1 the one DELETE is the dropped class (${deletes.join(',')})`);
    assert(JSON.stringify(cal.events.get(ids.comp017)) === before.comp017, 'K2.1 parse-error subject event kept unchanged');
    assert(JSON.stringify(cal.events.get(ids.geed)) === before.geed, 'K2.1 no-meeting subject event kept unchanged');
    assert(!cal.events.has(ids.nstp), 'K2.1 dropped class event gone');
    const done = sw.sent.filter((m) => m.type === T.IMPORT_COMPLETE).pop();
    assert(done && done.result.removed === 1, 'K2.1 IMPORT_COMPLETE carries removed: 1 for the popup');
  }

  // K2.2 Unticked subject is on the schedule, so it is not removed either.
  {
    const cal = Fake.create();
    const sw = loadServiceWorker({ calendar: cal });
    await sw.send(importMessage(T1, [COMP016, COMP017]));
    cal.resetCalls();
    const r = await sw.send(importMessage(T1, [COMP016, { ...COMP017, excluded: true }], [COMP016]));
    assert(r.removed === 0 && !cal.calls.some((c) => c.method === 'DELETE'), 'K2.2 unticked subject not removed');
  }

  // K2.3 A message with no schedule list (older popup) removes nothing.
  {
    const cal = Fake.create();
    const sw = loadServiceWorker({ calendar: cal });
    await sw.send(importMessage(T1, [COMP016, COMP017]));
    cal.resetCalls();
    const msg = importMessage(T1, [COMP016]);
    delete msg.scheduleSubjectCodes;
    const r = await sw.send(msg);
    assert(r.removed === 0 && !cal.calls.some((c) => c.method === 'DELETE'), 'K2.3 no schedule list: zero DELETEs');
  }

  // K2.4 The popup's summary says "Removed N".
  {
    const one = U.importSummaryText({ created: 0, updated: 0, unchanged: 2, removed: 1 });
    const mixed = U.importSummaryText({ created: 1, updated: 1, unchanged: 0, removed: 2 });
    assert(one === 'Your Google Calendar is up to date. Removed 1 event for classes no longer on your SIAS schedule.', `K2.4 summary, removed only (${one})`);
    assert(mixed === 'Your classes are in Google Calendar: 1 added, 1 updated. Removed 2 events for classes no longer on your SIAS schedule.', `K2.4 summary, mixed (${mixed})`);
  }

  // ---- Undo count matches what undo removes ----

  // U.1 An untermed v0.2.3 event in this term's window is in the map but not in the undo count.
  {
    const cal = Fake.create();
    const [legacy] = U.buildCalendarEvents([COMP017], T1.start, T1.end, {}, []);
    const legacyId = cal.seed(JSON.parse(JSON.stringify(legacy.payload)));
    const sw = loadServiceWorker({ calendar: cal });
    const imp = await sw.send(importMessage(T1, [COMP016, COMP017], [COMP016]));
    assert(imp.removableCount === 1, `U.1 import reports 1 removable (${imp.removableCount})`);
    const check = await sw.send(checkMessage(T1));
    assert(Object.keys(check.syncedEvents).length === 2, 'U.1 check map still lists the v0.2.3 event for update labels');
    assert(check.removableCount === 1, `U.1 check counts 1 removable (${check.removableCount})`);
    const undo = await sw.send(removeMessage(T1));
    assert(undo.ok && undo.removed + undo.alreadyGone === check.removableCount, `U.1 undo removed what the confirm said (${undo.removed})`);
    assert(cal.events.has(legacyId), 'U.1 v0.2.3 event left alone by undo');
  }

  // U.2 Events kept for a parse-error subject still count, since undo removes them.
  {
    const cal = Fake.create();
    const sw = loadServiceWorker({ calendar: cal });
    await sw.send(importMessage(T1, [COMP016, COMP017]));
    const parseErr = { ...COMP017, meetings: [], parseError: 'Could not read schedule' };
    const imp = await sw.send(importMessage(T1, [COMP016, parseErr], [COMP016]));
    assert(imp.removableCount === 2, `U.2 import counts the kept parse-error event (${imp.removableCount})`);
    const undo = await sw.send(removeMessage(T1));
    assert(undo.removed === 2, 'U.2 undo removes both');
  }

  // U.3 Confirm copy uses the count, and shows no number when it is unknown.
  {
    const one = U.undoConfirmText(1, 'SY 2627 · First');
    const unknown = U.undoConfirmText(null, 'SY 2627 · First');
    assert(one.startsWith('Remove the 1 class event PUPSync added for SY 2627 · First'), `U.3 confirm with count (${one})`);
    assert(!/\d+ class event/.test(unknown) && unknown.startsWith('Remove the class events'), `U.3 confirm without count (${unknown})`);
  }

  console.log(`service-worker: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
