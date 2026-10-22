/**
 * Term data sanity checks. Warns (does not fail) when the bundled dates run out soon.
 * Run: node test/term-data.test.js
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
let passed = 0;
let failed = 0;
function assert(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    console.error('FAIL:', msg);
  }
}

const csv = fs.readFileSync(path.join(root, 'config/academic-calendar.csv'), 'utf8');
const rows = csv
  .split(/\r?\n/)
  .filter((l) => /^\d{4},/.test(l))
  .map((l) => l.split(','));
const ends = rows.map((r) => r[3]).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
assert(ends.length > 0, 'csv has dated term rows');
for (const r of rows) {
  if (r[2] && r[3]) assert(r[2] < r[3], `term ${r[0]} ${r[1]} starts before it ends`);
}

const noClass = JSON.parse(fs.readFileSync(path.join(root, 'config/no-class-dates.json'), 'utf8'));
for (const [sy, terms] of Object.entries(noClass)) {
  assert(/^\d{4}$/.test(sy), `no-class key ${sy} is a SY code`);
  for (const [term, value] of Object.entries(terms)) {
    const list = Array.isArray(value) ? value : value?.dates || [];
    assert(Array.isArray(list), `no-class ${sy} ${term} has a date list`);
  }
}

const lastEnd = ends.sort().pop();
const soon = new Date();
soon.setMonth(soon.getMonth() + 6);
if (lastEnd && lastEnd < soon.toISOString().slice(0, 10)) {
  console.warn(
    `WARN: bundled term dates end ${lastEnd}. Add the next school year (see docs/ANNUAL-UPKEEP.md).`
  );
}

console.log(`term-data: ${passed} passed, ${failed} failed (data through ${lastEnd})`);
process.exit(failed ? 1 : 0);
