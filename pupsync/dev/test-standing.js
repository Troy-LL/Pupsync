/**
 * Self-check for PUPUtils.computeAcademicStanding. Run: node dev/test-standing.js
 */
const assert = require('assert');
const path = require('path');

// Minimal PUPSYNC config the standing calc reads.
globalThis.PUPSYNC = {
  GWA_EXCLUDED_PREFIXES: ['CWTS', 'ROTC', 'LTS', 'NSTP'],
  HONOR_TIERS: [
    { label: 'Summa Cum Laude', max: 1.25 },
    { label: 'Magna Cum Laude', max: 1.5 },
    { label: 'Cum Laude', max: 1.75 }
  ],
  HONOR_MIN_GRADE: 2.0,
  LISTER_TIERS: [
    { label: 'PL', name: "President's Lister", max: 1.5 },
    { label: 'DL', name: "Dean's Lister", max: 1.75 }
  ],
  LISTER_MIN_GRADE: 2.5
};
require(path.join(__dirname, '..', 'shared', 'utils.js'));
const U = globalThis.PUPUtils;

// All 3.0-unit, grades 1.00 -> GWA 1.00, Summa. CWTS excluded even if present.
let r = U.computeAcademicStanding([
  {
    label: 'SY 2425 First Semester',
    subjects: [
      { subjectCode: 'COMP 001', units: '3.0', grade: 1.0 },
      { subjectCode: 'GEED 004', units: '3.0', grade: 1.5 },
      { subjectCode: 'CWTS 001', units: '3.0', grade: 5.0 } // excluded
    ]
  }
]);
assert.strictEqual(r.totalUnits, 6, 'CWTS excluded from units');
assert.strictEqual(r.gwa, 1.25, 'weighted GWA'); // (3+4.5)/6 = 1.25
assert.strictEqual(r.tier, 'Summa Cum Laude');
assert.strictEqual(r.disqualified, false);

// A grade below 2.00 (numerically >2.0) disqualifies from honors.
r = U.computeAcademicStanding([
  {
    label: 's',
    subjects: [
      { subjectCode: 'A 1', units: '3', grade: 1.0 },
      { subjectCode: 'B 2', units: '3', grade: 2.5 }
    ]
  }
]);
assert.strictEqual(r.disqualified, true, 'grade 2.5 breaks eligibility');
assert.strictEqual(r.tier, null, 'no tier when disqualified');
assert.strictEqual(r.qualifiesTier, 'Cum Laude', 'GWA still lands a tier');
assert.ok(r.disqualifiers[0].includes('B 2'));

// INC is flagged as a disqualifier and skipped from GWA.
r = U.computeAcademicStanding([
  {
    label: 's',
    subjects: [
      { subjectCode: 'A 1', units: '3', grade: 1.0 },
      { subjectCode: 'B 2', units: '3', grade: null, gradeText: 'INC' }
    ]
  }
]);
assert.strictEqual(r.totalUnits, 3, 'INC subject not counted');
assert.strictEqual(r.gwa, 1.0);
assert.strictEqual(r.disqualified, true);

// Pending "—" (not posted yet) skips GWA without Latin DQ.
r = U.computeAcademicStanding([
  {
    label: 's',
    subjects: [
      { subjectCode: 'A 1', units: '3', grade: 1.0 },
      { subjectCode: 'COMP 015', units: '3', grade: null, gradeText: '—' },
      { subjectCode: 'COMP 016', units: '3', grade: null, gradeText: '-' }
    ]
  }
]);
assert.strictEqual(r.totalUnits, 3, 'pending subjects not counted');
assert.strictEqual(r.gwa, 1.0);
assert.strictEqual(r.disqualified, false, 'pending is not a Latin DQ');
assert.strictEqual(r.disqualifiers.length, 0);

// Pass (P) skips GWA without Latin DQ.
r = U.computeAcademicStanding([
  {
    label: 's',
    subjects: [
      { subjectCode: 'A 1', units: '3', grade: 1.0 },
      { subjectCode: 'PATHFIT 4', units: '2', grade: null, gradeText: 'P' }
    ]
  }
]);
assert.strictEqual(r.totalUnits, 3, 'Pass not counted in GWA');
assert.strictEqual(r.disqualified, false, 'Pass is not a Latin DQ');

// President's Lister: GWA ≤ 1.50, no grade worse than 2.50
let lb = U.computeListerBadge([
  { subjectCode: 'A 1', units: '3', grade: 1.25 },
  { subjectCode: 'B 2', units: '3', grade: 1.5 },
  { subjectCode: 'CWTS 001', units: '3', grade: 1.0 }
]);
assert.strictEqual(lb.badge, 'PL', 'PL when GWA ≤ 1.50');

// Dean's Lister band (above 1.50, ≤ 1.75)
lb = U.computeListerBadge([
  { subjectCode: 'A 1', units: '3', grade: 1.5 },
  { subjectCode: 'B 2', units: '3', grade: 2.0 }
]);
assert.strictEqual(lb.badge, 'DL', 'DL when 1.50 < GWA ≤ 1.75');

// Grade worse than 2.50 blocks lister even if GWA is fine
lb = U.computeListerBadge([
  { subjectCode: 'A 1', units: '3', grade: 1.0 },
  { subjectCode: 'B 2', units: '3', grade: 2.75 }
]);
assert.strictEqual(lb.badge, null, 'grade > 2.50 blocks PL/DL');

// Pending grades → no badge yet
lb = U.computeListerBadge([
  { subjectCode: 'A 1', units: '3', grade: 1.0 },
  { subjectCode: 'B 2', units: '3', grade: null, gradeText: '—' }
]);
assert.strictEqual(lb.badge, null, 'pending grades block PL/DL');

// Year breakdown attaches semester + year badges
const bd = U.buildGradesBreakdown([
  {
    label: 'SY 2425 First Semester',
    schoolYearCode: '2425',
    semester: 'First',
    subjects: [
      { subjectCode: 'A 1', units: '3', grade: 1.25 },
      { subjectCode: 'B 2', units: '3', grade: 1.5 }
    ]
  },
  {
    label: 'SY 2425 Second Semester',
    schoolYearCode: '2425',
    semester: 'Second',
    subjects: [
      { subjectCode: 'C 1', units: '3', grade: 1.75 },
      { subjectCode: 'D 2', units: '3', grade: 1.75 }
    ]
  }
]);
assert.strictEqual(bd.years[0].semesters[0].lister, 'PL');
assert.strictEqual(bd.years[0].semesters[1].lister, 'DL');
assert.strictEqual(bd.years[0].lister, 'DL', 'year GWA lands DL (~1.56)');

console.log('OK — computeAcademicStanding + lister badges pass');
