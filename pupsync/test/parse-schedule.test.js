/**
 * Node-based smoke tests for schedule parsing and event expansion.
 * Run: node test/parse-schedule.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ctx = { console };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'shared/constants.js'), 'utf8'), ctx);
vm.runInContext(
  fs.readFileSync(path.join(root, 'shared/utils.js'), 'utf8') +
    '\nthis.PUPUtils = PUPUtils; this.PUPSYNC = PUPSYNC;',
  ctx
);
vm.runInContext(
  fs.readFileSync(path.join(root, 'shared/semester-config.js'), 'utf8') +
    '\nthis.SemesterConfig = SemesterConfig;',
  ctx
);

const U = ctx.PUPUtils;
let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('FAIL:', msg);
  }
}

const cases = [
  {
    name: 'S/S two slots',
    raw: '1N - BSIT 2-1N - S/S 07:30AM-10:30AM/10:30AM-12:30PM',
    days: ['Saturday', 'Sunday'],
    hasLab: true
  },
  {
    name: 'M single slot',
    raw: '1N - BSIT 2-1N - M 06:00PM-09:00PM',
    days: ['Monday'],
    hasLab: false
  },
  {
    name: 'M/TH two slots',
    raw: '1N - BSIT 2-1N - M/TH 01:30PM-04:30PM/01:30PM-03:30PM',
    days: ['Monday', 'Thursday'],
    hasLab: true
  },
  {
    name: 'T/F two slots',
    raw: '1N - BSIT 2-1N - T/F 04:30PM-06:30PM/04:30PM-07:30PM',
    days: ['Tuesday', 'Friday'],
    hasLab: true
  },
  {
    name: 'TH only',
    raw: '1N - BSIT 2-1N - TH 06:00PM-09:00PM',
    days: ['Thursday'],
    hasLab: false
  }
];

for (const c of cases) {
  const r = U.parseScheduleString(c.raw);
  assert(!r.parseError, `${c.name}: no parse error (${r.parseError})`);
  assert(
    JSON.stringify(r.days) === JSON.stringify(c.days),
    `${c.name}: days ${JSON.stringify(r.days)} expected ${JSON.stringify(c.days)}`
  );
  assert(!!r.lectureTime, `${c.name}: lecture time`);
  assert(!!r.labTime === c.hasLab, `${c.name}: lab expectation`);
}

const sampleSubject = {
  subjectCode: 'INTE 202',
  description: 'Integrative Programming and Technologies 1',
  section: '1N - BSIT 2-1N',
  faculty: 'NAYRE, RACHEL',
  days: ['Monday', 'Thursday'],
  lectureTime: { start: '13:30', end: '16:30' },
  labTime: { start: '13:30', end: '15:30' },
  excluded: false,
  parseError: null
};

const events = U.buildCalendarEvents(
  [sampleSubject],
  '2026-08-10',
  '2026-12-12',
  { 'INTE 202': 'Peacock' }
);
assert(events.length === 4, `INTE 202 expands to 4 events (got ${events.length})`);
assert(events[0].payload.recurrence[0].includes('BYDAY='), 'RRULE has BYDAY');
assert(events[0].payload.start.timeZone === 'Asia/Manila', 'timezone Asia/Manila');

const termHeader = U.parseTermHeader('School Year 2526 - Second Semester');
assert(termHeader?.schoolYearCode === '2526', 'term: school year code');
assert(termHeader?.semester === 'Second', 'term: semester name');

const termInfo = U.deriveSemesterDatesFromTerm(termHeader);
assert(termInfo?.semesterStart === '2026-01-05', `term: 2nd sem start (${termInfo?.semesterStart})`);
assert(termInfo?.semesterEnd === '2026-05-31', 'term: 2nd sem end');
assert(termInfo?.shortLabel.includes('2526'), 'term: short label');

const firstTerm = U.deriveSemesterDatesFromTerm({
  schoolYearCode: '2526',
  semester: 'First'
});
assert(firstTerm?.semesterStart?.startsWith('2025-08'), `term: 1st sem start (${firstTerm?.semesterStart})`);

const SC = ctx.SemesterConfig;
const sampleCsv = fs.readFileSync(
  path.join(root, 'config/academic-calendar.csv'),
  'utf8'
);
SC.parseCsv(sampleCsv);
const fromCsv = SC.lookup('2526', 'Second');
assert(fromCsv?.semesterStart === '2026-01-05', 'csv override start');
assert(fromCsv?.dateSource === 'csv-override', 'csv override source');
const fromRule = SC.lookup('9999', 'Second');
assert(fromRule?.dateSource === 'csv-rule' || fromRule?.dateSource === 'builtin', 'fallback rule');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
