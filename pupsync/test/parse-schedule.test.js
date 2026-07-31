/**
 * Node-based smoke tests for schedule parsing and event expansion.
 * Run: node test/parse-schedule.test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const ctx = { console, URL };
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
    days: ['Saturday'],
    dayTokens: ['Saturday', 'Saturday'],
    hasLab: true,
    lec: '2.0',
    lab: '3.0',
    connectedLab: true
  },
  {
    name: 'M single slot',
    raw: '1N - BSIT 2-1N - M 06:00PM-09:00PM',
    days: ['Monday'],
    dayTokens: ['Monday'],
    hasLab: false,
    lec: '3.0',
    lab: '0.0'
  },
  {
    name: 'M/TH two slots',
    raw: '1N - BSIT 2-1N - M/TH 01:30PM-04:30PM/01:30PM-03:30PM',
    days: ['Monday', 'Thursday'],
    dayTokens: ['Monday', 'Thursday'],
    hasLab: true,
    lec: '2.0',
    lab: '3.0'
  },
  {
    name: 'T/F two slots',
    raw: '1N - BSIT 2-1N - T/F 04:30PM-06:30PM/04:30PM-07:30PM',
    days: ['Tuesday', 'Friday'],
    dayTokens: ['Tuesday', 'Friday'],
    hasLab: true,
    lec: '2.0',
    lab: '3.0'
  },
  {
    name: 'TH only',
    raw: '1N - BSIT 2-1N - TH 06:00PM-09:00PM',
    days: ['Thursday'],
    dayTokens: ['Thursday'],
    hasLab: false,
    lec: '3.0',
    lab: '0.0'
  }
];

for (const c of cases) {
  const r = U.parseScheduleString(c.raw);
  assert(!r.parseError, `${c.name}: no parse error (${r.parseError})`);
  assert(
    JSON.stringify(r.days) === JSON.stringify(c.days),
    `${c.name}: days ${JSON.stringify(r.days)} expected ${JSON.stringify(c.days)}`
  );
  const tokens = r.meetings.map((m) => m.day);
  assert(
    JSON.stringify(tokens) === JSON.stringify(c.dayTokens),
    `${c.name}: meeting days ${JSON.stringify(tokens)}`
  );
  assert(!!r.lectureTime, `${c.name}: lecture time`);
  assert(!!r.labTime === c.hasLab, `${c.name}: lab expectation`);

  const classified = U.parseScheduleWithHours(c.raw, c.lec, c.lab);
  assert(!classified.parseError, `${c.name}: classified parse`);
  if (c.connectedLab) {
    assert(
      classified.meetings.every((m) => m.type === 'Lab'),
      `${c.name}: connected same-day → lab`
    );
  } else if (c.hasLab && classified.meetings.length === 2) {
    assert(classified.meetings[0].type === 'Lecture', `${c.name}: first slot lec`);
    assert(classified.meetings[1].type === 'Lab', `${c.name}: second slot lab`);
  }
}

const inlineCell =
  '1N - BSIT 2-1N - M/TH 01:30PM-04:30PM/01:30PM-03:30PM\nFaculty: NAYRE, RACHEL';
const split = U.splitScheduleCell(inlineCell);
assert(split.faculty === 'NAYRE, RACHEL', 'inline faculty in schedule cell');
assert(!split.scheduleOnly.includes('Faculty'), 'schedule cell strips faculty');
const inlineParsed = U.parseScheduleString(split.scheduleOnly);
assert(!inlineParsed.parseError, 'inline schedule parses');

const inteParsed = U.parseScheduleWithHours(
  '1N - BSIT 2-1N - M/TH 01:30PM-04:30PM/01:30PM-03:30PM',
  '2.0',
  '3.0'
);
const sampleSubject = {
  subjectCode: 'INTE 202',
  description: 'Integrative Programming and Technologies 1',
  section: inteParsed.section,
  faculty: 'NAYRE, RACHEL',
  days: inteParsed.days,
  daysPart: inteParsed.daysPart,
  meetings: inteParsed.meetings,
  lectureTime: inteParsed.lectureTime,
  labTime: inteParsed.labTime,
  excluded: false,
  parseError: null
};

const events = U.buildCalendarEvents(
  [sampleSubject],
  '2026-08-10',
  '2026-12-12',
  { 'INTE 202': 'Peacock' }
);
assert(events.length === 2, `INTE 202 → Mon lec + Thu lab (got ${events.length})`);
assert(
  events.some((e) => e.day === 'Monday' && e.type === 'Lecture'),
  'INTE Monday lecture'
);
assert(
  events.some((e) => e.day === 'Thursday' && e.type === 'Lab'),
  'INTE Thursday lab'
);
assert(events[0].payload.recurrence[0].includes('BYDAY='), 'RRULE has BYDAY');
assert(events[0].payload.start.timeZone === 'Asia/Manila', 'timezone Asia/Manila');

const P = ctx.PUPSYNC;
assert(
  P.isSiasScheduleUrl('https://sis2.pup.edu.ph/student/schedule'),
  'sis2 schedule url'
);
assert(
  P.isSiasScheduleUrl('https://sis1.pup.edu.ph/student/schedule?x=1'),
  'sis1 schedule url with query'
);
assert(
  !P.isSiasScheduleUrl('https://sis2.pup.edu.ph/student/home'),
  'reject non-schedule path'
);
assert(
  !P.isSiasScheduleUrl('https://www.pup.edu.ph/student/schedule'),
  'reject non-sis host'
);

const termHeader = U.parseTermHeader('School Year 2526 - Second Semester');
assert(termHeader?.schoolYearCode === '2526', 'term: school year code');
assert(termHeader?.semester === 'Second', 'term: semester name');

const termInfo = U.deriveSemesterDatesFromTerm(termHeader);
assert(termInfo?.semesterStart === '2026-01-05', `term: 2nd sem start builtin (${termInfo?.semesterStart})`);
assert(termInfo?.semesterEnd === '2026-05-31', 'term: 2nd sem end builtin');
assert(termInfo?.shortLabel.includes('2526'), 'term: short label');

const firstTerm = U.deriveSemesterDatesFromTerm({
  schoolYearCode: '2526',
  semester: 'First'
});
assert(firstTerm?.semesterStart?.startsWith('2025-08'), `term: 1st sem start builtin (${firstTerm?.semesterStart})`);

const SC = ctx.SemesterConfig;
const sampleCsv = fs.readFileSync(
  path.join(root, 'config/academic-calendar.csv'),
  'utf8'
);
SC.parseCsv(sampleCsv);

const termFromCsv = U.buildTermInfo(termHeader);
assert(termFromCsv?.semesterStart === '2026-02-09', `term: 2nd sem start csv (${termFromCsv?.semesterStart})`);
assert(termFromCsv?.semesterEnd === '2026-06-21', 'term: 2nd sem end csv');
assert(termFromCsv?.dateSource === 'csv-override', 'term: csv override source');

const firstFromCsv = U.buildTermInfo({
  schoolYearCode: '2526',
  semester: 'First'
});
assert(firstFromCsv?.semesterStart === '2025-09-01', `term: 1st sem start csv (${firstFromCsv?.semesterStart})`);
const fromCsv = SC.lookup('2526', 'Second');
assert(fromCsv?.semesterStart === '2026-02-09', 'csv override start');
assert(fromCsv?.dateSource === 'csv-override', 'csv override source');
const fromRule = SC.lookup('9999', 'Second');
assert(fromRule?.dateSource === 'csv-rule' || fromRule?.dateSource === 'builtin', 'fallback rule');

const mockSubjects = [
  {
    subjectCode: 'COMP 009',
    days: ['Saturday', 'Sunday'],
    lectureTime: { start: '07:30', end: '10:30' },
    labTime: { start: '10:30', end: '12:30' },
    excluded: false,
    parseError: null
  },
  {
    subjectCode: 'COMP 013',
    days: ['Monday'],
    lectureTime: { start: '18:00', end: '21:00' },
    labTime: null,
    excluded: false,
    parseError: null
  }
];
const auto = U.autoAssignSubjectColors(mockSubjects, {}, 'SY 2526');
assert(auto['COMP 009'] && auto['COMP 013'], 'autoAssignSubjectColors assigns both');
assert(auto['COMP 009'] !== auto['COMP 013'], 'autoAssignSubjectColors distinct colors');

const grid = U.buildWeekGridModel(mockSubjects, auto);
assert(grid.blocks.length >= 4, 'grid blocks for lec+lab on two days');
assert(grid.totalHeight > 100, 'grid has height');
const satBlocks = grid.blocks.filter((b) => b.day === 'Saturday');
assert(satBlocks.length === 2, 'Saturday has lec and lab');

const named = U.parseSiasStudentName(
  'LAZARO, TROY LAUREN TAN (2024-03529-MN-0)'
);
assert(named?.firstName === 'Troy', 'parseSiasStudentName first given only');
assert(named?.lastName === 'LAZARO', 'parseSiasStudentName last name');
assert(!U.parseSiasStudentName('random text'), 'parseSiasStudentName rejects junk');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
