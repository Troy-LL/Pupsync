/**
 * Calendar sync safety tests against an in-memory Google Calendar.
 * Run: node test/calendar-sync.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ctx = { console, URL, setTimeout, clearTimeout };
vm.createContext(ctx);
for (const f of ['shared/constants.js', 'shared/utils.js', 'shared/calendar-sync.js', 'dev/fake-calendar.js']) {
  vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8'), ctx, { filename: f });
}
const U = vm.runInContext('PUPUtils', ctx);
const S = vm.runInContext('PUPCalendarSync', ctx);
const Fake = vm.runInContext('PUPFakeCalendar', ctx);

let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    console.error('FAIL:', msg);
  }
}

const FIRST = { schoolYearCode: '2627', semester: 'First Semester' };
const SECOND = { schoolYearCode: '2627', semester: 'Second' };
const T1 = { term: FIRST, start: '2026-08-31', end: '2026-12-19' };
const T2 = { term: SECOND, start: '2027-01-20', end: '2027-05-29' };
const KEY1 = S.buildTermKey(T1.term);
const KEY2 = S.buildTermKey(T2.term);

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

const events = (subjects, t) => U.buildCalendarEvents(subjects, t.start, t.end, {}, []);
const client = (cal) => S.createClient({ fetchImpl: cal.fetch, token: 'test', sleep: async () => {} });
const sync = (cal, subjects, t, extra = {}) =>
  S.syncTerm({
    client: client(cal),
    events: events(subjects, t),
    termKey: S.buildTermKey(t.term),
    semesterStart: t.start,
    semesterEnd: t.end,
    ...extra
  });
const termOf = (ev) => ev.extendedProperties?.private?.pupsyncTerm;
const all = (cal) => [...cal.events.values()];

async function main() {
  // Term keys
  assert(KEY1 === '2627-first', `term key first sem (${KEY1})`);
  assert(KEY2 === '2627-second', `term key second sem (${KEY2})`);
  assert(S.buildTermKey(null, '2026-08-31', '2026-12-19') === '', 'term key: no date fallback when term is null');
  assert(S.buildTermKey(null) === '', 'term key empty when unknown');
  assert(S.buildTermKey({ schoolYearCode: '2627' }) === '', 'term key empty without a semester');
  assert(S.buildTermKey({ schoolYearCode: '2627', semester: 'Special' }) === '', 'term key empty for an unknown semester name');
  for (const [raw, want] of [
    ['First Semester', 'first'],
    ['FIRST', 'first'],
    ['1st Sem', 'first'],
    ['Second', 'second'],
    ['2nd Semester', 'second'],
    ['Third', 'third'],
    ['Summer', 'summer'],
    ['Midyear', 'midyear'],
    ['Mid-Year', 'midyear']
  ]) {
    assert(S.normalizeSemester(raw) === want, `semester "${raw}" -> ${want} (${S.normalizeSemester(raw)})`);
  }

  // 1. Same subject code in two terms
  {
    const cal = Fake.create();
    const r1 = await sync(cal, [COMP016], T1);
    const firstId = Object.values(r1.map)[0];
    cal.resetCalls();
    const r2 = await sync(cal, [COMP016], T2);
    assert(r1.ok && r1.created === 1, 'two terms: first term creates');
    assert(r2.ok && r2.created === 1 && r2.updated === 0, 'two terms: second term creates its own event');
    assert(!cal.writes().some((c) => c.id === firstId), 'two terms: first term event never written');
    assert(termOf(cal.events.get(firstId)) === KEY1, 'two terms: first term event keeps its term');
    assert(all(cal).length === 2, 'two terms: both events exist');
  }

  // 2. Student's own event with the same title and no marker
  {
    const cal = Fake.create();
    const mine = cal.seed({
      summary: '[COMP 016] Project due',
      start: { dateTime: '2026-09-07T09:00:00+08:00' },
      end: { dateTime: '2026-09-07T10:00:00+08:00' }
    });
    const r = await sync(cal, [COMP016], T1);
    assert(r.ok && r.created === 1, 'own event: class event created separately');
    assert(cal.events.get(mine).summary === '[COMP 016] Project due', 'own event: untouched');
    assert(!cal.writes().some((c) => c.id === mine), 'own event: no write to it');
    const undo = await S.removeTerm({ client: client(cal), termKey: KEY1, semesterStart: T1.start, semesterEnd: T1.end });
    assert(undo.ok && cal.events.has(mine), 'own event: survives undo');
  }

  // 3. Plain-text "Faculty:" lookalike in the description
  {
    const cal = Fake.create();
    const look = cal.seed({
      summary: '[COMP 016] Web Development',
      description: 'Faculty: SANTOS JR., RAMON\nSection: BSIT 2-1N\nType: Lecture',
      start: { dateTime: '2026-08-31T09:00:00+08:00' },
      end: { dateTime: '2026-08-31T12:00:00+08:00' },
      recurrence: ['RRULE:FREQ=WEEKLY;UNTIL=20261219T155959Z;BYDAY=MO']
    });
    const r = await sync(cal, [COMP016], T1);
    assert(r.ok && r.created === 1 && r.updated === 0, 'lookalike: not adopted');
    assert(!cal.writes().some((c) => c.id === look), 'lookalike: never written');
    assert(U.identifyCalendarEvent(cal.events.get(look), [COMP016]) === null, 'lookalike: identifyCalendarEvent ignores it');
  }

  // 4. Legacy migration (v0.2.3 tagged events without a term)
  {
    const cal = Fake.create();
    const [built] = events([COMP016], T1);
    const legacyNow = cal.seed(JSON.parse(JSON.stringify(built.payload)));
    const [old] = events([COMP016], { start: '2026-02-02', end: '2026-06-06' });
    const legacyOld = cal.seed(JSON.parse(JSON.stringify(old.payload)));
    const r = await sync(cal, [COMP016], T1);
    assert(r.ok && r.adopted === 1 && r.created === 0, 'legacy: in-window v0.2.3 event adopted, no duplicate');
    assert(termOf(cal.events.get(legacyNow)) === KEY1, 'legacy: adopted event tagged with term');
    assert(!cal.writes().some((c) => c.id === legacyOld), 'legacy: last term v0.2.3 event untouched');
    assert(termOf(cal.events.get(legacyOld)) === undefined, 'legacy: last term event not tagged');
    cal.resetCalls();
    const again = await sync(cal, [COMP016], T1);
    assert(again.ok && cal.writes().length === 0, 'legacy: next sync after adoption makes zero writes');
  }

  // 5. Re-sync twice: zero writes the second time
  {
    const cal = Fake.create();
    await sync(cal, [COMP016, COMP017, GEED], T1);
    cal.resetCalls();
    const r = await sync(cal, [COMP016, COMP017, GEED], T1);
    assert(r.ok && r.unchanged === 3, 'resync: 3 unchanged');
    assert(cal.writes().length === 0, 'resync: zero writes');
    cal.resetCalls();
    const recolored = await S.syncTerm({
      client: client(cal),
      events: U.buildCalendarEvents([COMP016, COMP017, GEED], T1.start, T1.end, { 'COMP 017': 'Tomato' }, []),
      termKey: KEY1,
      semesterStart: T1.start,
      semesterEnd: T1.end
    });
    assert(recolored.updated === 1 && cal.writes().length === 1, 'resync: only the changed class is written');
    assert(cal.writes()[0].method === 'PATCH', 'resync: update uses PATCH');
  }

  // 6. Dropped class removed in this term only
  {
    const cal = Fake.create();
    const onSchedule = (subjects) => ({ scheduleSubjectCodes: S.scheduleSubjectCodes(subjects) });
    await sync(cal, [COMP016, COMP017], T1);
    await sync(cal, [COMP016, COMP017, GEED], T2);
    const r = await sync(cal, [COMP016, GEED], T2, onSchedule([COMP016, GEED]));
    assert(r.ok && r.removed === 1, 'dropped: one class removed');
    const termCodes = () => all(cal).map((e) => `${termOf(e)}|${e.extendedProperties.private.pupsyncSubjectCode}`).sort();
    const left = termCodes();
    assert(!left.includes(`${KEY2}|COMP 017`), 'dropped: removed from this term');
    assert(left.includes(`${KEY1}|COMP 017`), 'dropped: same class in last term kept');
    const kept = await sync(cal, [COMP016], T2, { ...onSchedule([COMP016]), keepSubjectCodes: ['GEED 004'] });
    const afterKept = termCodes();
    assert(kept.ok && kept.removed === 0, 'dropped: unticked class sync removes nothing');
    assert(afterKept.includes(`${KEY2}|GEED 004`), 'dropped: unticked class still in calendar after that sync');
  }

  // 6b. No schedule list: nothing is removed (an older caller cannot delete by omission)
  {
    const cal = Fake.create();
    await sync(cal, [COMP016, COMP017], T1);
    cal.resetCalls();
    const r = await sync(cal, [COMP016], T1);
    assert(r.ok && r.removed === 0 && r.removalSkipped === true, 'dropped: no schedule list means no removal');
    assert(!cal.writes().some((c) => c.method === 'DELETE'), 'dropped: no schedule list makes no DELETE');
  }

  // 6c. Schedule codes are normalized and keep every state
  {
    const codes = S.scheduleSubjectCodes([
      { subjectCode: ' comp  016 ' },
      { subjectCode: 'COMP 017', parseError: 'Could not read schedule' },
      { subjectCode: 'GEED 004', meetings: [] },
      { subjectCode: 'PATHFIT 3', excluded: true },
      { subjectCode: '' },
      { subjectCode: 'COMP 016' }
    ]);
    assert(
      JSON.stringify(codes) === JSON.stringify(['COMP 016', 'COMP 017', 'GEED 004', 'PATHFIT 3']),
      `schedule codes: all states kept, normalized, unique (${JSON.stringify(codes)})`
    );
  }

  // 7. Undo after the student edited an event
  {
    const cal = Fake.create();
    const r = await sync(cal, [COMP016, COMP017], T1);
    await sync(cal, [COMP016], T2);
    const own = cal.seed({ summary: '[COMP 016] Quiz', start: { dateTime: '2026-09-10T09:00:00+08:00' } });
    const id = r.map['COMP 016__0'];
    const ev = cal.events.get(id);
    ev.summary = 'Web Dev (room 312)';
    ev.description = 'my notes';
    const undo = await S.removeTerm({ client: client(cal), termKey: KEY1, semesterStart: T1.start, semesterEnd: T1.end });
    assert(undo.ok && undo.removed === 2, 'undo: both first term classes removed');
    assert(!cal.events.has(id), 'undo: edited event still removed (matched by tag, not title)');
    assert(cal.events.has(own), 'undo: student event kept');
    assert(all(cal).some((e) => termOf(e) === KEY2), 'undo: other term kept');
  }

  // 8. Undo over more than one page
  {
    const cal = Fake.create({ pageSize: 2 });
    const many = Array.from({ length: 7 }, (_, i) => subj(`ELEC ${100 + i}`, `Elective ${i}`, 'Tuesday', '08:00', '09:00'));
    await sync(cal, many, T1);
    cal.seed({ summary: 'Birthday', start: { dateTime: '2026-09-01T00:00:00+08:00' } });
    const undo = await S.removeTerm({ client: client(cal), termKey: KEY1, semesterStart: T1.start, semesterEnd: T1.end });
    assert(undo.ok && undo.removed === 7, `undo paged: removed 7 (${undo.removed})`);
    assert(all(cal).length === 1, 'undo paged: only the unrelated event remains');
    const gets = cal.calls.filter((c) => c.method === 'GET').length;
    assert(gets >= 4, 'undo paged: walked every page');
  }

  // 9. 404 / 410 on delete
  {
    const cal = Fake.create();
    const r = await sync(cal, [COMP016, COMP017, GEED], T1);
    const ids = Object.values(r.map);
    cal.failNext({ method: 'DELETE', id: ids[0], status: 404 });
    cal.failNext({ method: 'DELETE', id: ids[1], status: 410 });
    const undo = await S.removeTerm({ client: client(cal), termKey: KEY1, semesterStart: T1.start, semesterEnd: T1.end });
    assert(undo.ok && undo.alreadyGone === 2 && undo.removed === 1, '404/410: treated as already removed');
  }

  // 10. Lookup 401 or 500 aborts with no writes
  for (const status of [401, 500]) {
    const cal = Fake.create();
    cal.failNext({ method: 'GET', status });
    const r = await sync(cal, [COMP016, COMP017], T1);
    assert(!r.ok && r.aborted && r.status === status, `lookup ${status}: aborted`);
    assert(cal.writes().length === 0 && all(cal).length === 0, `lookup ${status}: nothing created`);
    cal.failNext({ method: 'GET', status });
    const undo = await S.removeTerm({ client: client(cal), termKey: KEY1, semesterStart: T1.start, semesterEnd: T1.end });
    assert(!undo.ok && undo.aborted, `lookup ${status}: undo aborted`);
  }

  // 11. Mid-run failure keeps progress
  {
    const cal = Fake.create();
    cal.failNext({ method: 'POST', status: 500, after: 2 });
    const r = await sync(cal, [COMP016, COMP017, GEED], T1);
    assert(!r.ok && r.partial && r.done === 2 && r.total === 3, `partial: reports 2 of 3 (${r.done}/${r.total})`);
    assert(Object.keys(r.map).length === 2, 'partial: progress map has the 2 created');
    const again = await sync(cal, [COMP016, COMP017, GEED], T1);
    assert(again.ok && again.created === 1 && again.unchanged === 2, 'partial: retry only creates the missing one');
    assert(all(cal).length === 3, 'partial: no duplicates after retry');
  }

  // 429 retry
  {
    const cal = Fake.create();
    cal.failNext({ method: 'POST', status: 429 });
    const r = await sync(cal, [COMP016], T1);
    assert(r.ok && r.created === 1 && all(cal).length === 1, '429: retried once and created');
  }

  // Unknown term refuses to sync
  {
    const cal = Fake.create();
    const r = await S.syncTerm({ client: client(cal), events: events([COMP016], T1), termKey: '' });
    assert(!r.ok && r.error === S.NO_TERM_ERROR && cal.calls.length === 0, 'no term: refuses before any call');
    const u = await S.removeTerm({ client: client(cal), termKey: '' });
    assert(!u.ok && u.error === S.NO_TERM_ERROR && cal.calls.length === 0, 'no term: undo refuses before any call');
  }

  // Lock: one run at a time
  {
    const lock = S.createLock();
    let release;
    const first = lock.run(() => new Promise((r) => (release = r)));
    const second = await lock.run(async () => 'ran');
    assert(second.busy === true, 'lock: second run refused while first is busy');
    release('done');
    assert((await first) === 'done' && !lock.busy, 'lock: released after first finishes');
  }

  // Hash is stable and ignores itself
  {
    const [ev] = events([COMP016], T1);
    const a = S.tagPayload(ev.payload, KEY1);
    const b = S.tagPayload(ev.payload, KEY1);
    assert(a.extendedProperties.private.pupsyncHash === b.extendedProperties.private.pupsyncHash, 'hash stable');
    assert(S.tagPayload(ev.payload, KEY2).extendedProperties.private.pupsyncHash !== a.extendedProperties.private.pupsyncHash, 'hash differs by term');
  }

  console.log(`calendar-sync: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
