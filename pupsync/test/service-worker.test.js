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

  // K2.5 An empty schedule list is not a schedule: zero DELETEs, removalSkipped.
  {
    const cal = Fake.create();
    const sw = loadServiceWorker({ calendar: cal });
    await sw.send(importMessage(T1, [COMP016, COMP017, GEED, NSTP]));
    const before = snapshot(cal);
    cal.resetCalls();
    const msg = importMessage(T1, [COMP016]);
    msg.scheduleSubjectCodes = [];
    const r = await sw.send(msg);
    const deletes = cal.calls.filter((c) => c.method === 'DELETE').length;
    assert(deletes === 0, `K2.5 empty schedule list: zero DELETEs (${deletes})`);
    assert(r.removed === 0 && r.removalSkipped === true, `K2.5 empty schedule list: removed 0 and removalSkipped (${r.removed}, ${r.removalSkipped})`);
    assert(snapshot(cal) === before, 'K2.5 empty schedule list: all four events unchanged');
  }

  // K2.6 A schedule list missing a code that is being imported is incomplete: skip removal.
  {
    const cal = Fake.create();
    const sw = loadServiceWorker({ calendar: cal });
    await sw.send(importMessage(T1, [COMP016, COMP017, GEED, NSTP]));
    const before = snapshot(cal);
    cal.resetCalls();
    const msg = importMessage(T1, [COMP016, COMP017, GEED]);
    msg.scheduleSubjectCodes = ['COMP 017', 'GEED 004'];
    const r = await sw.send(msg);
    const deletes = cal.calls.filter((c) => c.method === 'DELETE').length;
    assert(deletes === 0, `K2.6 list missing imported COMP 016: zero DELETEs (${deletes})`);
    assert(r.removed === 0 && r.removalSkipped === true, `K2.6 list missing an imported code: removed 0 and removalSkipped (${r.removed}, ${r.removalSkipped})`);
    assert(snapshot(cal) === before, 'K2.6 list missing an imported code: NSTP 002 kept, nothing changed');
  }

  // K2.7 Removal that would take every class this term has in Calendar is held.
  {
    const cal = Fake.create();
    const sw = loadServiceWorker({ calendar: cal });
    await sw.send(importMessage(T1, [COMP016, COMP017]));
    cal.resetCalls();
    const r = await sw.send(importMessage(T1, [GEED]));
    const deletes = cal.calls.filter((c) => c.method === 'DELETE').length;
    assert(deletes === 0, `K2.7 all existing classes missing: zero DELETEs (${deletes})`);
    assert(r.removed === 0 && r.removalSkipped === true && r.removalHeld === 2, `K2.7 all missing: removed 0, removalSkipped, removalHeld 2 (${r.removed}, ${r.removalSkipped}, ${r.removalHeld})`);
    assert(idOf(cal, 'COMP 016') && idOf(cal, 'COMP 017'), 'K2.7 both old classes still in Calendar');
    assert(r.created === 1, 'K2.7 the new class is still added');
  }

  // K2.8 Half-rendered SIAS table: 3 of 4 classes missing is more than half, so removal is held.
  {
    const cal = Fake.create();
    const sw = loadServiceWorker({ calendar: cal });
    await sw.send(importMessage(T1, [COMP016, COMP017, GEED, NSTP]));
    const before = snapshot(cal);
    cal.resetCalls();
    const r = await sw.send(importMessage(T1, [COMP016]));
    const deletes = cal.calls.filter((c) => c.method === 'DELETE').length;
    assert(deletes === 0, `K2.8 3 of 4 missing: zero DELETEs (${deletes})`);
    assert(r.removed === 0 && r.removalSkipped === true && r.removalHeld === 3, `K2.8 3 of 4 missing: removed 0, removalSkipped, removalHeld 3 (${r.removed}, ${r.removalSkipped}, ${r.removalHeld})`);
    assert(snapshot(cal) === before, 'K2.8 3 of 4 missing: calendar unchanged');
    const done = sw.sent.filter((m) => m.type === T.IMPORT_COMPLETE).pop();
    assert(done && done.result.removalHeld === 3, 'K2.8 IMPORT_COMPLETE carries removalHeld: 3 for the popup');
    const text = U.importSummaryText(r);
    assert(
      text ===
        'Nothing was added or changed. 3 classes in Google Calendar are not on this SIAS page, so PUPSync left them alone. Reopen your SIAS schedule page, let it load fully, and import again. If you dropped them, click Undo below, then import again.',
      `K2.8 popup tells the student to reopen SIAS and import again (${text})`
    );
  }

  // K2.9 A normal single drop (1 of 4) still removes, with no held note.
  {
    const cal = Fake.create();
    const sw = loadServiceWorker({ calendar: cal });
    await sw.send(importMessage(T1, [COMP016, COMP017, GEED, NSTP]));
    const nstp = idOf(cal, 'NSTP 002');
    cal.resetCalls();
    const r = await sw.send(importMessage(T1, [COMP016, COMP017, GEED]));
    const deletes = cal.calls.filter((c) => c.method === 'DELETE').map((c) => c.id);
    assert(deletes.length === 1 && deletes[0] === nstp, `K2.9 single drop: one DELETE, the dropped class (${deletes.join(',')})`);
    assert(r.removed === 1 && r.removalSkipped === false && !r.removalHeld, `K2.9 single drop: removed 1, not skipped, nothing held (${r.removed}, ${r.removalSkipped}, ${r.removalHeld})`);
    const text = U.importSummaryText(r);
    assert(text === 'Your Google Calendar is up to date. Removed 1 event for classes no longer on your SIAS schedule.', `K2.9 summary has no held note (${text})`);
  }

  // K2.10 Held note wording, one class, after other changes.
  {
    const text = U.importSummaryText({ created: 1, updated: 0, unchanged: 0, removed: 0, removalHeld: 1 });
    assert(
      text ===
        'Your classes are in Google Calendar: 1 added. 1 class in Google Calendar is not on this SIAS page, so PUPSync left it alone. Reopen your SIAS schedule page, let it load fully, and import again. If you dropped it, click Undo below, then import again.',
      `K2.10 held note, singular (${text})`
    );
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

  // ---- Pre-0.2.3 duplicate risk: warn only, never adopt by title ----

  // L.1 Untagged v0.2.2 class series are counted on popup open and never written.
  {
    const cal = Fake.create();
    const untag = (ev) => {
      const p = JSON.parse(JSON.stringify(ev.payload));
      delete p.extendedProperties;
      return p;
    };
    const [old016] = U.buildCalendarEvents([COMP016], T1.start, T1.end, {}, []);
    const [old017] = U.buildCalendarEvents([COMP017], T1.start, T1.end, {}, []);
    const [lastSem] = U.buildCalendarEvents([COMP016], '2026-02-02', '2026-06-06', {}, []);
    const ids = [cal.seed(untag(old016)), cal.seed(untag(old017))];
    const otherId = cal.seed(untag(lastSem));
    const ownId = cal.seed({ summary: '[COMP 016] Project due', start: { dateTime: '2026-09-07T09:00:00+08:00' } });
    const notOnSchedule = cal.seed({
      ...untag(U.buildCalendarEvents([GEED], T1.start, T1.end, {}, [])[0])
    });
    const sw = loadServiceWorker({ calendar: cal });
    await sw.send(importMessage(T1, [COMP016]));
    const before = JSON.stringify([ids, otherId, ownId, notOnSchedule].flat().map((id) => cal.events.get(id)));
    cal.resetCalls();
    const check = await sw.send({ ...checkMessage(T1), scheduleSubjectCodes: ['COMP 016', 'COMP 017'] });
    assert(check.ok && check.legacyLookalikes === 2, `L.1 two v0.2.2 series counted (${check.legacyLookalikes})`);
    assert(cal.writes().length === 0, 'L.1 the check makes zero writes');
    cal.resetCalls();
    const imp = await sw.send(importMessage(T1, [COMP016, COMP017]));
    const touched = cal.writes().filter((c) => ids.includes(c.id) || c.id === otherId || c.id === ownId || c.id === notOnSchedule);
    assert(touched.length === 0, 'L.1 import never writes an untagged event (no title adoption)');
    assert(imp.created === 1 && imp.unchanged === 1, 'L.1 import creates its own COMP 017 event next to the old one');
    const after = JSON.stringify([ids, otherId, ownId, notOnSchedule].flat().map((id) => cal.events.get(id)));
    assert(after === before, 'L.1 untagged events byte-identical after check and import');
  }

  // L.2 Copy for the warning.
  {
    assert(U.legacyWarningText(0) === '', 'L.2 no warning at 0');
    const two = U.legacyWarningText(2);
    assert(two.startsWith('2 weekly events in your Google Calendar look like classes from PUPSync 0.2.2 or older.'), `L.2 warning text (${two})`);
    assert(!two.includes('\u2014'), 'L.2 no em dash');
  }

  // ---- Service worker glue ----
  const KEY1 = S.buildTermKey(T1.term);
  const validToken = (t) => ({ [K.OAUTH_TOKEN]: { accessToken: t, expiresAt: Date.now() + 3600_000 } });

  // G.1 A 401 on the lookup clears the cached token, signs in again silently and retries once.
  {
    const cal = Fake.create();
    const sw = loadServiceWorker({ calendar: cal, session: validToken('stale'), local: { [K.OAUTH_TOKEN]: { accessToken: 'old-local' } } });
    assert(!(K.OAUTH_TOKEN in sw.storage.local.data), 'G.1 token left in storage.local by older versions is cleared on load');
    cal.failNext({ method: 'GET', status: 401 });
    const r = await sw.send(importMessage(T1, [COMP016]));
    assert(r.created === 1, `G.1 import succeeds after one retry (${JSON.stringify(r)})`);
    const tok = sw.storage.session.data[K.OAUTH_TOKEN];
    assert(tok && tok.accessToken !== 'stale', 'G.1 stale token replaced');
    assert(sw.authFlows.length === 1 && sw.authFlows[0].interactive === false && /prompt=none/.test(sw.authFlows[0].url), 'G.1 re-auth tried silently (prompt=none) first');
  }

  // G.2 A second 401 leaves no cached token and says the sign-in expired.
  {
    const cal = Fake.create();
    const sw = loadServiceWorker({ calendar: cal, session: validToken('stale') });
    cal.failNext({ method: 'GET', status: 401 });
    cal.failNext({ method: 'GET', status: 401 });
    const r = await sw.send(importMessage(T1, [COMP016]));
    assert(/sign-in expired/i.test(r.error || ''), `G.2 error says the sign-in expired (${r.error})`);
    assert(!(K.OAUTH_TOKEN in sw.storage.session.data), 'G.2 token cleared');
    assert(cal.writes().length === 0, 'G.2 nothing written');
  }

  // G.3 A 401 on the silent popup-open check clears the token too.
  {
    const cal = Fake.create();
    const sw = loadServiceWorker({ calendar: cal, session: validToken('stale') });
    cal.failNext({ method: 'GET', status: 401 });
    const r = await sw.send(checkMessage(T1));
    assert(r.ok === false && !(K.OAUTH_TOKEN in sw.storage.session.data), 'G.3 check 401 clears the token');
  }

  // G.4 The local map is saved per term and cleared by undo.
  {
    const cal = Fake.create();
    const sw = loadServiceWorker({ calendar: cal });
    await sw.send(importMessage(T2, [GEED]));
    await sw.send(importMessage(T1, [COMP016, COMP017]));
    const byTerm = sw.storage.local.data[K.SYNCED_EVENTS_BY_TERM];
    const map1 = byTerm[KEY1] || {};
    assert(
      JSON.stringify(Object.keys(map1).sort()) === JSON.stringify(['COMP 016__0', 'COMP 017__0']),
      `G.4 map saved under ${KEY1} (${JSON.stringify(map1)})`
    );
    assert(Object.values(map1).every((id) => cal.events.has(id)), 'G.4 map ids are real event ids');
    assert(Object.keys(byTerm).length === 2, 'G.4 other term map kept');
    assert(sw.storage.local.data[K.LAST_SYNCED_TERM] === KEY1, 'G.4 last synced term saved');
    await sw.send(removeMessage(T1));
    const after = sw.storage.local.data[K.SYNCED_EVENTS_BY_TERM];
    assert(!(KEY1 in after) && Object.keys(after).length === 1, 'G.4 undo drops only this term from the map');
    assert(!(K.LAST_SYNCED_TERM in sw.storage.local.data), 'G.4 undo clears last synced term');
  }

  // G.5 A failure mid-run says "Synced n of m" and saves the n that went through.
  {
    const cal = Fake.create();
    const sw = loadServiceWorker({ calendar: cal });
    cal.failNext({ method: 'POST', status: 500, after: 2 });
    const r = await sw.send(importMessage(T1, [COMP016, COMP017, GEED]));
    assert(r.partial === true && r.done === 2 && r.total === 3, `G.5 partial 2 of 3 (${JSON.stringify(r)})`);
    assert(/^Synced 2 of 3 classes, then stopped: /.test(r.error || ''), `G.5 n-of-m message (${r.error})`);
    assert(/Click Import again to finish/.test(r.error || ''), 'G.5 message says how to finish');
    const map = sw.storage.local.data[K.SYNCED_EVENTS_BY_TERM][KEY1];
    assert(Object.keys(map).length === 2, 'G.5 the two finished classes are saved');
    const progress = sw.sent.filter((m) => m.type === T.IMPORT_PROGRESS).map((m) => `${m.current}/${m.total}`);
    assert(JSON.stringify(progress) === JSON.stringify(['1/3', '2/3']), `G.5 progress messages (${progress})`);
    const err = sw.sent.filter((m) => m.type === T.IMPORT_ERROR).pop();
    assert(err && err.error === r.error, 'G.5 popup gets the same message');
    assert(!(K.LAST_SYNCED_TERM in sw.storage.local.data), 'G.5 a partial run is not recorded as a finished sync');
  }

  console.log(`service-worker: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
