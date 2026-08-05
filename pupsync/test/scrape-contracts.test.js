/**
 * Fixture contract tests — fail CI if expected SIAS HTML markers / parsers break.
 * Run: node test/scrape-contracts.test.js
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

const U = ctx.PUPUtils;
const P = ctx.PUPSYNC;
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

const gradesHtml = fs.readFileSync(
  path.join(__dirname, 'fixtures/grades-table.html'),
  'utf8'
);
const scheduleHtml = fs.readFileSync(
  path.join(__dirname, 'fixture-schedule.html'),
  'utf8'
);
const homeHtml = fs.readFileSync(
  path.join(__dirname, 'fixtures/sias-home.html'),
  'utf8'
);

// --- Real SIAS home: no GWA Overview (cache-only hub) ---
assert(/student\/home/i.test(homeHtml) || /<h1[^>]*>\s*Home/i.test(homeHtml), 'home fixture is SIAS home');
assert(
  !/GWA Overview/i.test(homeHtml),
  'home fixture documents that SIAS home has no GWA Overview'
);
assert(/Inbox/i.test(homeHtml), 'home fixture still has Inbox (page identity)');

// --- Grades → home snapshot (full cached card) ---
const sampleSemesters = [
  {
    label: 'School Year 2425 - First Semester',
    schoolYearCode: '2425',
    semester: 'First',
    subjects: [
      {
        subjectCode: 'COMP 001',
        units: '3.0',
        grade: 1.25,
        gradeText: '1.25',
        status: 'Passed'
      },
      {
        subjectCode: 'GEED 001',
        units: '3.0',
        grade: null,
        gradeText: 'DRP',
        status: 'Dropped'
      },
      {
        subjectCode: 'MATH 001',
        units: '3.0',
        grade: 5.0,
        gradeText: '5.00',
        status: 'Failed'
      }
    ]
  },
  {
    label: 'School Year 2425 - Second Semester',
    schoolYearCode: '2425',
    semester: 'Second',
    subjects: [
      {
        subjectCode: 'COMP 009',
        units: '3.0',
        grade: 1.5,
        gradeText: '1.50',
        status: 'Passed'
      }
    ]
  }
];

const snap = U.buildGradesHomeSnapshot(sampleSemesters);
assert(snap.gwa != null, 'home snapshot has GWA');
assert(snap.totalUnits > 0, 'home snapshot has units');
assert(snap.enrolled === 4, 'home snapshot enrolled count');
assert(snap.dropped === 1, 'home snapshot dropped count');
assert(snap.failed === 1, 'home snapshot failed count');
assert(
  /Second Semester/i.test(snap.subjectsAsOf || ''),
  'home snapshot subjectsAsOf is latest term'
);
assert(snap.unitsEarned != null, 'home snapshot unitsEarned string');

// --- Grades table markers ---
for (const h of P.GRADE_TABLE_HEADERS || []) {
  assert(
    gradesHtml.toLowerCase().includes(h.toLowerCase()),
    `grades fixture has header "${h}"`
  );
}
assert(/<table[\s>]/i.test(gradesHtml), 'grades fixture has table tag');
assert(/COMP 009/.test(gradesHtml), 'grades fixture has subject row');
assert(/1\.25/.test(gradesHtml), 'grades fixture has numeric final grade');

// --- Schedule table markers ---
for (const h of P.TABLE_HEADERS || []) {
  assert(
    scheduleHtml.toLowerCase().includes(h.toLowerCase()),
    `schedule fixture has header "${h}"`
  );
}
assert(/<table[\s>]/i.test(scheduleHtml), 'schedule fixture has table tag');
assert(/COMP 009/.test(scheduleHtml), 'schedule fixture has subject code');

// --- Empty-enlistment path ---
// The empty schedule page must stay distinguishable from an unreadable one: table and
// header row present, zero subject rows, term header still parseable for the hint.
const emptyScheduleHtml = fs.readFileSync(
  path.join(__dirname, 'fixtures/schedule-empty.html'),
  'utf8'
);
for (const h of P.TABLE_HEADERS || []) {
  assert(
    emptyScheduleHtml.toLowerCase().includes(h.toLowerCase()),
    `empty schedule fixture still has header "${h}"`
  );
}
assert(
  /<table[\s>]/i.test(emptyScheduleHtml),
  'empty schedule fixture has table tag'
);
assert(
  /no records found/i.test(emptyScheduleHtml),
  'empty schedule fixture has the SIAS placeholder row'
);
assert(
  P.TERM_HEADER_PATTERN.test(emptyScheduleHtml),
  'empty schedule fixture still carries a parseable term header'
);
const emptyTerm = U.buildTermInfo(
  U.findTermOnPage({
    querySelectorAll: () => [],
    body: { innerText: emptyScheduleHtml }
  })
);
assert(
  !!emptyTerm?.shortLabel,
  'empty schedule term resolves a shortLabel for the empty-state hint'
);

// The empty-vs-unreadable error string is duplicated across the three scrapers and the
// popup hint map (standalone-scrape cannot import shared constants). Keep them in sync.
const EMPTY_ERROR = 'No enlisted subjects yet';
for (const rel of [
  'content/standalone-scrape.js',
  'content/page-scrape.js',
  'content/parser.js',
  'popup/popup.js'
]) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  assert(src.includes(EMPTY_ERROR), `${rel} uses the "${EMPTY_ERROR}" string`);
}
for (const rel of [
  'content/standalone-scrape.js',
  'content/page-scrape.js',
  'content/parser.js'
]) {
  const src = fs.readFileSync(path.join(root, rel), 'utf8');
  assert(
    /codeRowCount/.test(src),
    `${rel} counts subject-code rows to tell empty from unreadable`
  );
}

console.log(`scrape-contracts: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
