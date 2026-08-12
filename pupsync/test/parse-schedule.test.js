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

const sy2627First = SC.lookup('2627', 'First');
assert(sy2627First?.semesterStart === '2026-08-17', `2627 First start (${sy2627First?.semesterStart})`);
assert(sy2627First?.semesterEnd === '2026-12-22', '2627 First end');

const flat = SC.flattenTermBlock({
  holidays: [{ date: '2026-11-01', label: 'All Saints' }],
  vacations: [{ start: '2026-12-23', end: '2026-12-24', label: 'Xmas' }],
  exams: [
    { start: '2026-12-16', end: '2026-12-16', label: 'Finals' },
    { start: '2026-12-22', end: '2026-12-22', label: 'Finals' }
  ]
});
assert(flat.includes('2026-11-01'), 'flatten holiday');
assert(flat.includes('2026-12-23') && flat.includes('2026-12-24'), 'flatten vacation range');
assert(flat.includes('2026-12-16') && flat.includes('2026-12-22'), 'flatten single-day exams');

SC.noClassData = JSON.parse(
  fs.readFileSync(path.join(root, 'config/no-class-dates.json'), 'utf8')
);
assert(
  SC.lookupNoClassDates('2627', 'First Semester').includes('2026-11-01'),
  'lookup 2627 First holiday'
);
assert(
  SC.lookupNoClassDates('2627', 'First').includes('2026-12-08'),
  'lookup 2627 First exam/holiday day'
);
assert(
  SC.lookupNoClassDates('2627', 'First').includes('2026-12-16'),
  'lookup 2627 First non-grad finals'
);
assert(SC.lookupNoClassDates('9999', 'First').length === 0, 'missing SY empty');

const mondaySubject = [
  {
    subjectCode: 'TEST 101',
    description: 'Test',
    faculty: 'X',
    section: '1',
    days: ['Monday'],
    lectureTime: { start: '09:00', end: '12:00' },
    labTime: null,
    excluded: false,
    parseError: null
  }
];
const mondayHoliday = ['2026-08-31'];
const monEvents = U.buildCalendarEvents(
  mondaySubject,
  '2026-08-17',
  '2026-12-22',
  {},
  mondayHoliday
);
assert(monEvents[0].payload.recurrence[0].startsWith('RRULE:'), 'EXDATE path keeps RRULE');
assert(
  monEvents[0].payload.recurrence.some(
    (r) => r.includes('EXDATE') && r.includes('20260831T090000')
  ),
  'EXDATE Monday 9am'
);
const tueEvents = U.buildCalendarEvents(
  [{ ...mondaySubject[0], days: ['Tuesday'] }],
  '2026-08-17',
  '2026-12-22',
  {},
  mondayHoliday
);
assert(
  !tueEvents[0].payload.recurrence.some((r) => r.includes('EXDATE')),
  'Tuesday ignores Monday holiday'
);
const noSkip = U.buildCalendarEvents(
  mondaySubject,
  '2026-08-17',
  '2026-12-22',
  {},
  []
);
assert(noSkip[0].payload.recurrence.length === 1, 'no exclusions → RRULE only');

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

// Custom colors: stored value is a preset label OR a #RRGGBB hex.
assert(U.resolveColor('Tomato').colorId === '11', 'resolveColor preset label');
assert(U.resolveColor('#FF0000').hex === '#FF0000', 'resolveColor keeps custom hex');
assert(U.resolveColor('#FF0000').colorId === '11', 'resolveColor snaps red to Tomato');
assert(U.resolveColor('#0b8043').colorId === '10', 'resolveColor snaps to Basil');
assert(
  U.resolveColor('nonsense').label === P.DEFAULT_COLOR_LABEL,
  'resolveColor falls back to default'
);
assert(
  U.resolveColor('').label === P.DEFAULT_COLOR_LABEL,
  'resolveColor handles empty'
);

// HSL round-trip backs the inline picker (extension popups can't use
// <input type="color"> — the OS chooser steals focus and closes the popup).
// h/s/l are rounded to integer slider steps, so a round-trip lands within a
// couple of 8-bit levels rather than exactly back on the original hex.
const channels = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
for (const hex of ['#7B2D3F', '#039BE5', '#000000', '#FFFFFF', '#00FF00']) {
  const { h, s, l } = U.hexToHsl(hex);
  const back = U.hslToHex(h, s, l);
  const drift = channels(hex).map((v, i) => Math.abs(v - channels(back)[i]));
  assert(Math.max(...drift) <= 3, `hsl round-trip ${hex} -> ${back}`);
}
assert(U.hexToHsl('#FF0000').h === 0, 'hexToHsl red hue');
assert(U.hexToHsl('#808080').s === 0, 'hexToHsl gray has no saturation');

const hexColors = { ...auto, 'COMP 009': '#7B2D3F' };
const hexGrid = U.buildWeekGridModel(mockSubjects, hexColors);
assert(
  hexGrid.blocks.some((b) => b.colorHex === '#7B2D3F'),
  'grid renders custom hex'
);
const hexEvents = U.buildCalendarEvents(
  mockSubjects,
  '2025-08-01',
  '2025-12-01',
  hexColors
);
const customEvent = hexEvents.find((e) => e.subjectCode === 'COMP 009');
assert(customEvent.colorHex === '#7B2D3F', 'event keeps custom hex locally');
assert(
  P.COLORS.some((c) => c.colorId === customEvent.payload.colorId),
  'event payload colorId is a valid Google preset'
);

// Manual grid range widens the view but never clips a block.
const wide = U.buildWeekGridModel(mockSubjects, auto, {
  startHour: 5,
  endHour: 23
});
assert(wide.spanMin > grid.spanMin, 'manual hour range widens the grid');

const named = U.parseSiasStudentName(
  'LAZARO, TROY LAUREN TAN (2024-03529-MN-0)'
);
assert(named?.firstName === 'Troy', 'parseSiasStudentName first given only');
assert(named?.lastName === 'LAZARO', 'parseSiasStudentName last name');
assert(!U.parseSiasStudentName('random text'), 'parseSiasStudentName rejects junk');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
