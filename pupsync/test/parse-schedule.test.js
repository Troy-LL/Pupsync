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

// hslToHex generates the picker's shade ramp (extension popups can't use
// <input type="color"> — the OS chooser steals focus and closes the popup).
assert(U.hslToHex(0, 100, 50) === '#FF0000', 'hslToHex pure red');
assert(U.hslToHex(0, 0, 100) === '#FFFFFF', 'hslToHex white');
assert(U.hslToHex(210, 0, 0) === '#000000', 'hslToHex black');

const ramp = [];
for (const l of [78, 62, 46, 30]) {
  for (let i = 0; i < 10; i++) ramp.push(U.hslToHex(i * 36, 65, l));
  ramp.push(U.hslToHex(0, 0, l));
}
assert(ramp.length === 44, 'ramp is 11 columns x 4 shades');
assert(
  ramp.every((hex) => /^#[0-9A-F]{6}$/.test(hex)),
  'every ramp swatch is a valid hex'
);
assert(new Set(ramp).size === ramp.length, 'ramp has no duplicate swatches');
assert(
  ramp.every((hex) => P.COLORS.some((c) => c.colorId === U.resolveColor(hex).colorId)),
  'every ramp swatch maps to a real Google colorId'
);

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

const named = U.parseSiasStudentName(
  'LAZARO, TROY LAUREN TAN (2024-03529-MN-0)'
);
assert(named?.firstName === 'Troy', 'parseSiasStudentName first given only');
assert(named?.lastName === 'LAZARO', 'parseSiasStudentName last name');
assert(!U.parseSiasStudentName('random text'), 'parseSiasStudentName rejects junk');

// --- Schedule Day & Time Overrides ---
assert(
  P.STORAGE_KEYS.SUBJECT_SCHEDULE_OVERRIDES === 'subjectScheduleOverrides',
  'STORAGE_KEYS has SUBJECT_SCHEDULE_OVERRIDES'
);

const singleSubj = {
  subjectCode: 'COMP 013',
  description: 'Operating Systems',
  section: 'BSIT 2-1',
  meetings: [
    { day: 'Monday', time: { start: '18:00', end: '21:00' }, type: 'Lecture' }
  ],
  days: ['Monday'],
  lectureTime: { start: '18:00', end: '21:00' },
  labTime: null
};

// getSubjectMeetings
const extractedMeetings = U.getSubjectMeetings(singleSubj);
assert(extractedMeetings.length === 1, 'getSubjectMeetings extracts 1 meeting');
assert(extractedMeetings[0].day === 'Monday', 'getSubjectMeetings day matches');

// applySubjectScheduleOverrides on single meeting
const overridesSingle = {
  0: { day: 'Wednesday', start: '09:00', end: '12:00' }
};
const overriddenSingle = U.applySubjectScheduleOverrides(singleSubj, overridesSingle);
assert(overriddenSingle.meetings[0].day === 'Wednesday', 'overridden day is Wednesday');
assert(overriddenSingle.meetings[0].time.start === '09:00', 'overridden start is 09:00');
assert(overriddenSingle.meetings[0].time.end === '12:00', 'overridden end is 12:00');
assert(overriddenSingle.meetings[0].isOverridden === true, 'meeting isOverridden flag');
assert(overriddenSingle.hasScheduleOverride === true, 'subject hasScheduleOverride flag');
assert(overriddenSingle.days[0] === 'Wednesday', 'subject.days updated to Wednesday');
assert(overriddenSingle.lectureTime.start === '09:00', 'subject.lectureTime updated');

// applyAllScheduleOverrides across multiple subjects
const multiSubjects = [
  mockSubjects[0], // COMP 009 (Sat/Sun)
  singleSubj       // COMP 013 (Mon)
];
const allOverrides = {
  'COMP 013': { 0: { day: 'Friday', start: '13:00', end: '16:00' } }
};
const appliedAll = U.applyAllScheduleOverrides(multiSubjects, allOverrides);
const comp013Applied = appliedAll.find((s) => s.subjectCode === 'COMP 013');
const comp009Applied = appliedAll.find((s) => s.subjectCode === 'COMP 009');
assert(comp013Applied.meetings[0].day === 'Friday', 'applyAllScheduleOverrides applied override');
assert(!comp009Applied.hasScheduleOverride, 'un-overridden subject remains intact');

// expandScheduleBlocks preserves meetingIndex & applies overrides
const expandedBlocks = U.expandScheduleBlocks(appliedAll, auto);
const friBlock = expandedBlocks.find((b) => b.subjectCode === 'COMP 013');
assert(friBlock.day === 'Friday', 'expandScheduleBlocks puts block on Friday');
assert(friBlock.startMin === 13 * 60, 'expandScheduleBlocks startMin is 13:00');
assert(friBlock.endMin === 16 * 60, 'expandScheduleBlocks endMin is 16:00');
assert(friBlock.meetingIndex === 0, 'expandScheduleBlocks attaches meetingIndex');
assert(friBlock.isOverridden === true, 'expandScheduleBlocks carries isOverridden');

// buildCalendarEvents with overridden schedule
const overrideCalEvents = U.buildCalendarEvents(
  appliedAll,
  '2026-08-01',
  '2026-12-22',
  auto
);
const calEvent013 = overrideCalEvents.find((e) => e.subjectCode === 'COMP 013');
assert(calEvent013.day === 'Friday', 'calendar event day is Friday');
assert(calEvent013.payload.start.dateTime.includes('T13:00:00+08:00'), 'calendar event start time 13:00');
assert(calEvent013.payload.end.dateTime.includes('T16:00:00+08:00'), 'calendar event end time 16:00');
assert(calEvent013.payload.recurrence[0].includes('BYDAY=FR'), 'calendar event recurrence BYDAY=FR');

// --- formatLastSyncTime tests ---
const fixedNow = new Date('2026-08-17T14:30:00.000');

assert(U.formatLastSyncTime(null) === null, 'formatLastSyncTime returns null for null');
assert(U.formatLastSyncTime('') === null, 'formatLastSyncTime returns null for empty string');
assert(U.formatLastSyncTime('invalid-date') === null, 'formatLastSyncTime returns null for invalid date');

// Just now (< 1 min)
const justNow = new Date('2026-08-17T14:29:45.000');
assert(U.formatLastSyncTime(justNow, fixedNow) === 'just now', 'formatLastSyncTime just now');

// Minutes ago (5m ago)
const minsAgo = new Date('2026-08-17T14:25:00.000');
assert(U.formatLastSyncTime(minsAgo, fixedNow) === '5m ago', 'formatLastSyncTime 5m ago');

// Today earlier (> 1 hour)
const earlierToday = new Date('2026-08-17T09:15:00.000');
assert(U.formatLastSyncTime(earlierToday, fixedNow) === 'today at 9:15 AM', 'formatLastSyncTime today at 9:15 AM');

// Yesterday
const yesterdayDate = new Date('2026-08-16T20:45:00.000');
assert(U.formatLastSyncTime(yesterdayDate, fixedNow) === 'yesterday at 8:45 PM', 'formatLastSyncTime yesterday at 8:45 PM');

// Same year earlier
const sameYear = new Date('2026-08-10T11:00:00.000');
assert(U.formatLastSyncTime(sameYear, fixedNow) === 'Aug 10 at 11:00 AM', 'formatLastSyncTime Aug 10 at 11:00 AM');

// Previous year
const prevYear = new Date('2025-12-20T16:20:00.000');
assert(U.formatLastSyncTime(prevYear, fixedNow) === 'Dec 20, 2025 at 4:20 PM', 'formatLastSyncTime Dec 20, 2025 at 4:20 PM');

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
