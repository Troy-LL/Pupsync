/**
 * Regenerate dev/mock-data.js from parser + SIAS sample rows.
 * Run: node dev/build-mock-data.js
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const root = path.join(__dirname, '..');
const ctx = { console, URL };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'shared/constants.js'), 'utf8'), ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'shared/utils.js'), 'utf8'), ctx);

const U = ctx.PUPUtils;

const rows = [
  [
    'COMP 009',
    'Object Oriented Programming',
    '2.0',
    '3.0',
    '3.0',
    '1N - BSIT 2-1N - S/S 07:30AM-10:30AM/10:30AM-12:30PM',
    'BEDIS JR., SEVERINO'
  ],
  [
    'COMP 010',
    'Information Management',
    '2.0',
    '3.0',
    '3.0',
    '1N - BSIT 2-1N - T/F 04:30PM-06:30PM/04:30PM-07:30PM',
    'DASTAS, LYDINAR'
  ],
  [
    'COMP 012',
    'Network Administration',
    '2.0',
    '3.0',
    '3.0',
    '1N - BSIT 2-1N - T/F 01:30PM-03:30PM/01:30PM-04:30PM',
    'BASISTA, LEOVEN'
  ],
  [
    'COMP 013',
    'Human Computer Interaction',
    '3.0',
    '0.0',
    '3.0',
    '1N - BSIT 2-1N - M 06:00PM-09:00PM',
    'SAGUM, JANELLE KYRA'
  ],
  [
    'COMP 014',
    'Quantitative Methods with Modeling and Simulation',
    '3.0',
    '0.0',
    '3.0',
    '1N - BSIT 2-1N - TH 06:00PM-09:00PM',
    'MONTARIL, RANIL'
  ],
  [
    'INTE 202',
    'Integrative Programming and Technologies 1',
    '2.0',
    '3.0',
    '3.0',
    '1N - BSIT 2-1N - M/TH 01:30PM-04:30PM/01:30PM-03:30PM',
    'NAYRE, RACHEL'
  ],
  [
    'PATHFIT 4',
    'Physical Activity Towards Health and Fitness 4',
    '2.0',
    '0.0',
    '2.0',
    '1N - BSIT 2-1N - M 09:00AM-11:00AM',
    'MACALINTAL, CONNIE'
  ],
  [
    'STAT 023',
    'Probability and Statistics for CS/IT Students',
    '3.0',
    '0.0',
    '3.0',
    '1N - BSIT 2-1N - S 01:30PM-04:30PM',
    'DILLA, PERLYN MAE'
  ]
];

function js(val, indent) {
  return JSON.stringify(val, null, indent).replace(/"([^"]+)":/g, '$1:');
}

const subjects = rows.map(
  ([code, desc, lec, lab, unit, raw, faculty]) => {
    const p = U.parseScheduleWithHours(raw, lec, lab);
    return {
      subjectCode: code,
      description: desc,
      lectureHours: lec,
      labHours: lab,
      units: unit,
      section: p.section,
      daysPart: p.daysPart,
      days: p.days,
      meetings: p.meetings,
      lectureTime: p.lectureTime,
      labTime: p.labTime,
      faculty,
      rawSchedule: raw,
      excluded: false,
      parseError: null
    };
  }
);

const body = subjects
  .map((s) => '  ' + js(s, 2).replace(/\n/g, '\n  '))
  .join(',\n');

const file = `/**
 * Sample subjects — BSIT 2-1N SY 2526 2nd sem (matches live SIAS + parser output).
 * Regenerate: node dev/build-mock-data.js
 */
window.PUPSYNC_MOCK_SUBJECTS = [
${body}
];
`;

fs.writeFileSync(path.join(__dirname, 'mock-data.js'), file, 'utf8');
console.log('Wrote dev/mock-data.js (' + subjects.length + ' subjects)');
