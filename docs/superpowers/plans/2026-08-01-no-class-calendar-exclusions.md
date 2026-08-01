# No-class calendar exclusions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Skip Google Calendar class occurrences on holidays, vacations, and exam weeks via `EXDATE`, keyed by the SIAS school year + semester.

**Architecture:** Ship `no-class-dates.json` (holidays / vacations / exams per SY + semester). `SemesterConfig` loads and flattens it. `buildCalendarEvents` adds weekday-filtered `EXDATE;TZID=Asia/Manila:...` lines matching each slot's start time. Popup passes the date list into import.

**Tech Stack:** Chrome MV3 extension, vanilla JS, Node `vm` tests, Google Calendar API recurrence.

## Global Constraints

- Skip: holidays + vacations + exam weeks (union of graduating and non-graduating finals).
- Mechanism: `EXDATE` on weekly `RRULE` (do not expand to individual events).
- Term key: parsed `school_year_code` + semester from SIAS (`School Year 2627 - First Semester`).
- Missing no-class data: import without exclusions; warn in console.
- Seed SY `2526` and `2627`; later years are data-only edits.

## File map

| File | Role |
|------|------|
| `pupsync/config/no-class-dates.json` | Exclusion data |
| `pupsync/config/academic-calendar.csv` | 2627 start/end overrides |
| `pupsync/shared/semester-config.js` | Load JSON, flatten, lookup |
| `pupsync/shared/utils.js` | `buildCalendarEvents` + EXDATE helpers |
| `pupsync/shared/constants.js` | `GET_NO_CLASS_JSON` message type |
| `pupsync/manifest.json` | Expose JSON resource |
| `pupsync/popup/popup.js` | Status line + pass dates on import |
| `pupsync/background/service_worker.js` | Accept `noClassDates` on import |
| `pupsync/test/parse-schedule.test.js` | Flatten + EXDATE tests |
| `pupsync/config/README.md`, `docs/CONFIG.md` | Author docs |

---

### Task 1: Config data (CSV + JSON)

**Files:**
- Create: `pupsync/config/no-class-dates.json`
- Modify: `pupsync/config/academic-calendar.csv`
- Modify: `pupsync/manifest.json`
- Modify: `pupsync/config/README.md`
- Modify: `docs/CONFIG.md`

- [ ] **Step 1: Add 2627 CSV overrides** (keep existing 2526 rows)

```csv
2627,First,2026-08-17,2026-12-22,,,,,,A.Y. 2026-2027 1st sem (registrar calendar)
2627,Second,2027-01-20,2027-05-30,,,,,,A.Y. 2026-2027 2nd sem (registrar calendar)
2627,Summer,2027-06-07,2027-07-18,,,,,,A.Y. 2026-2027 summer (registrar calendar)
```

- [ ] **Step 2: Create `no-class-dates.json`** with `2526` and `2627` blocks. Shape per term:

```json
{
  "2526": {
    "First": {
      "holidays": [{ "date": "YYYY-MM-DD", "label": "..." }],
      "vacations": [{ "start": "...", "end": "...", "label": "..." }],
      "exams": [{ "start": "...", "end": "...", "label": "..." }]
    }
  }
}
```

Seed `2526` from `bsit-academic-calendar.json` (holidays, Christmas vacation, midterm/final lists). Seed `2627` from registrar graphics + national holidays in-term (include PUP Founding Anniversary, Ninoy Aquino Day, National Heroes Day, EDSA, Holy Week, Manila Day, Independence Day). Exam finals = union of graduating and non-graduating windows.

- [ ] **Step 3: Manifest** — add `config/no-class-dates.json` next to the CSV in `web_accessible_resources`.

- [ ] **Step 4: Docs** — document the JSON in `pupsync/config/README.md` and `docs/CONFIG.md` (edit once per term; lookup by SIAS SY code).

- [ ] **Step 5: Commit**

```bash
git add pupsync/config/no-class-dates.json pupsync/config/academic-calendar.csv pupsync/manifest.json pupsync/config/README.md docs/CONFIG.md
git commit -m "Add no-class date config for SY 2526 and 2627."
```

---

### Task 2: Load + flatten no-class dates

**Files:**
- Modify: `pupsync/shared/semester-config.js`
- Modify: `pupsync/shared/constants.js`
- Modify: `pupsync/background/service_worker.js`
- Test: `pupsync/test/parse-schedule.test.js`

**Interfaces:**
- Produces: `SemesterConfig.flattenTermBlock(block) → string[]` (sorted unique `YYYY-MM-DD`)
- Produces: `SemesterConfig.lookupNoClassDates(schoolYearCode, semester) → string[]`
- Produces: `SemesterConfig.load()` also loads JSON (sets `noClassData`)

- [ ] **Step 1: Write failing tests** in `parse-schedule.test.js`:

```js
const flat = SC.flattenTermBlock({
  holidays: [{ date: '2026-11-01', label: 'All Saints' }],
  vacations: [{ start: '2026-12-23', end: '2026-12-24', label: 'Xmas' }],
  exams: [
    { start: '2026-12-16', end: '2026-12-16', label: 'Finals' },
    { start: '2026-12-22', end: '2026-12-22', label: 'Finals' }
  ]
});
assert(flat.includes('2026-11-01'), 'holiday');
assert(flat.includes('2026-12-23') && flat.includes('2026-12-24'), 'vacation range');
assert(flat.includes('2026-12-16') && flat.includes('2026-12-22'), 'single-day exams');

SC.noClassData = {
  '2627': {
    First: {
      holidays: [{ date: '2026-11-01', label: 'All Saints' }],
      vacations: [],
      exams: [{ start: '2026-12-07', end: '2026-12-08', label: 'Finals' }]
    }
  }
};
assert(SC.lookupNoClassDates('2627', 'First Semester').includes('2026-11-01'), 'lookup First');
assert(SC.lookupNoClassDates('2627', 'First').includes('2026-12-08'), 'exam union day');
assert(SC.lookupNoClassDates('9999', 'First').length === 0, 'missing SY empty');
```

- [ ] **Step 2: Run tests — expect FAIL**

Run: `node pupsync/test/parse-schedule.test.js`  
Expected: FAIL on `flattenTermBlock` / `lookupNoClassDates`

- [ ] **Step 3: Implement in `semester-config.js`**

Add `noClassData: null`. Implement `flattenTermBlock`, `lookupNoClassDates` (normalize semester like `lookup`). Extend `load()` to fetch `config/no-class-dates.json` (same URL/background pattern as CSV). Add `GET_NO_CLASS_JSON` to `MESSAGE_TYPES` and handle it in the service worker like `GET_ACADEMIC_CSV`.

On missing JSON: `noClassData = {}`, `console.warn`, do not throw.

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "Load and flatten no-class dates by school year."
```

---

### Task 3: EXDATE in `buildCalendarEvents`

**Files:**
- Modify: `pupsync/shared/utils.js`
- Modify: `pupsync/popup/popup.js`
- Modify: `pupsync/background/service_worker.js`
- Modify: `pupsync/dev/mock-chrome.js` (if it calls `buildCalendarEvents`)
- Test: `pupsync/test/parse-schedule.test.js`

**Interfaces:**
- Consumes: `noClassDates: string[]` (optional 5th arg or options object — prefer 5th arg `noClassDates = []` to match existing call sites)
- Produces: `payload.recurrence = [rrule, exdateLine?]` where  
  `EXDATE;TZID=Asia/Manila:YYYYMMDDTHHMMSS,...` and `HHMMSS` matches slot start time

- [ ] **Step 1: Failing test**

```js
const subjects = [{
  subjectCode: 'TEST 101',
  description: 'Test',
  faculty: 'X',
  section: '1',
  days: ['Monday'],
  lectureTime: { start: '09:00', end: '12:00' },
  labTime: null,
  excluded: false,
  parseError: null
}];
const noClass = ['2026-11-02', '2026-11-01', '2026-10-13']; // Sun, Sat, Tue — only filter by weekday
// Use a Monday holiday:
const mondayHoliday = ['2026-08-31']; // National Heroes Day 2026 is Monday
const events = U.buildCalendarEvents(subjects, '2026-08-17', '2026-12-22', {}, mondayHoliday);
const rec = events[0].payload.recurrence;
assert(rec[0].startsWith('RRULE:'), 'has RRULE');
assert(rec.some((r) => r.includes('EXDATE') && r.includes('20260831T090000')), 'EXDATE Monday 9am');
const tue = U.buildCalendarEvents(
  [{ ...subjects[0], days: ['Tuesday'] }],
  '2026-08-17', '2026-12-22', {}, mondayHoliday
);
assert(!tue[0].payload.recurrence.some((r) => r.includes('EXDATE')), 'Tuesday ignores Monday holiday');
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement**

In `utils.js`:
- `filterNoClassDatesForSlot(noClassDates, dayName, firstOccDate, semesterEndISO) → string[]`
- `buildExdateLine(isoDates, time24) → string | null`
- `buildCalendarEvents(..., subjectColors, noClassDates = [])` appends EXDATE when filtered list non-empty

Wire popup: after term apply, `state.noClassDates = SemesterConfig.lookupNoClassDates(...)`. Update `renderTermLabel` with `· N no-class days` or `· no exclusions`. Pass `noClassDates` in `buildPreviewEvents` and IMPORT message. Service worker `runImport` / `PREVIEW_EVENTS` forward the array into `buildCalendarEvents`.

- [ ] **Step 4: Run full test file — expect PASS**

- [ ] **Step 5: Commit**

```bash
git commit -m "Exclude no-class days from calendar import via EXDATE."
```

---

### Task 4: Smoke + finish

- [ ] **Step 1:** Run `node pupsync/test/parse-schedule.test.js` — all pass
- [ ] **Step 2:** Confirm `2627` CSV lookup in tests
- [ ] **Step 3:** Hand off via finishing-a-development-branch (verify, offer merge/PR options)

---

## Spec coverage

| Spec requirement | Task |
|------------------|------|
| Holidays + vacations + exams | 1 |
| Exam window union | 1 (data) |
| 2526 + 2627 + future via config | 1 |
| EXDATE on RRULE | 3 |
| SIAS SY parse as key | 2–3 |
| Popup count | 3 |
| Missing data soft-fail | 2 |
| Tests | 2–3 |
