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
  HONOR_MIN_GRADE: 2.0
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

// Non-numeric grade is flagged as a disqualifier and skipped from GWA.
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

console.log('OK — computeAcademicStanding passes');
