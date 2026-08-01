# No-class dates for calendar import

Date: 2026-08-01  
Status: approved for planning

## Problem

PUPSync imports each class slot as a weekly Google Calendar series from semester start to end. Holidays, vacations, and exam weeks still get regular lecture/lab events. Official no-class dates already exist in reference data for SY 2025–2026, but import never uses them. SY 2026–2027 was marked unreleased; the registrar calendar is now available.

## Goals

- Skip regular class events on no-class days when importing to Google Calendar.
- Drive lookups from the SIAS heading already parsed on the schedule page (`School Year 2627 - First Semester` → `2627` + `First`).
- Cover SY 2526 and 2627 now, with a config shape that needs only data edits for later years.
- Keep one recurring event per slot (same import shape as today).

## Non-goals

- Creating separate exam or holiday calendar events.
- Letting the user pick graduating vs non-graduating (union of both exam windows).
- Blocking import when no-class data is missing for a term.
- Suspending classes for commencement or academic council days (out of scope; holidays + vacations + exams only).

## Decisions

| Topic | Choice |
|-------|--------|
| What to skip | Holidays, vacations, and exam weeks |
| Exam windows | Union of graduating and non-graduating finals |
| Years | 2526 + 2627 seeded; future years via config only |
| Mechanism | `EXDATE` on existing weekly `RRULE`s |
| Term key | Parsed `school_year_code` + semester from SIAS |

## Architecture

```
SIAS heading → school_year_code + semester
                    ↓
         academic-calendar.csv  → semesterStart / semesterEnd
         no-class-dates.json    → holidays / vacations / exams
                    ↓
         flatten → Set<YYYY-MM-DD>
                    ↓
         buildCalendarEvents → RRULE + EXDATE (weekday ∩ range ∩ no-class)
                    ↓
         Google Calendar API / preview / dry-run
```

## Config

### Term bounds (unchanged role)

`pupsync/config/academic-calendar.csv` remains the source for `start_date` / `end_date`.

Add override rows for SY 2627 from the official calendar:

| SY | Semester | start | end |
|----|----------|-------|-----|
| 2627 | First | 2026-08-17 | 2026-12-22 |
| 2627 | Second | 2027-01-20 | 2027-05-30 |
| 2627 | Summer | 2027-06-07 | 2027-07-18 |

Keep existing 2526 rows.

### No-class file

Ship a dedicated JSON config (preferred over overloading the narrative `bsit-academic-calendar.json`), e.g. `pupsync/config/no-class-dates.json`.

Shape:

```json
{
  "2627": {
    "First": {
      "holidays": [
        { "date": "2026-11-01", "label": "All Saints' Day" }
      ],
      "vacations": [
        { "start": "2026-12-23", "end": "2027-01-05", "label": "Christmas Vacation" }
      ],
      "exams": [
        { "start": "2026-10-12", "end": "2026-10-17", "label": "Mid-term / Departmental" },
        { "start": "2026-12-07", "end": "2026-12-12", "label": "Finals (graduating)" },
        { "start": "2026-12-16", "end": "2026-12-16", "label": "Finals (non-graduating)" },
        { "start": "2026-12-22", "end": "2026-12-22", "label": "Finals (non-graduating)" }
      ]
    }
  }
}
```

Rules for authors:

- Inclusive ranges for vacations and exams.
- Single-day finals listed as `start` == `end`.
- Include university holidays that suspend classes (e.g. PUP Founding Anniversary) and national holidays that fall inside the term.
- Seed 2526 from the existing `bsit-academic-calendar.json` holidays, Christmas vacation, and exam week lists.
- Seed 2627 from the A.Y. 2026–2027 registrar graphics plus national holidays that land in each term (e.g. Ninoy Aquino Day, National Heroes Day for First Semester 2627).
- Dates outside `[semesterStart, semesterEnd]` are harmless if present; the builder intersects with the term window.

Register the JSON in `manifest.json` `web_accessible_resources` (same pattern as the CSV).

## Runtime behavior

1. Resolve term info as today (`SemesterConfig` / CSV / builtin).
2. Load no-class entries for that SY + semester.
3. Expand holidays + vacation ranges + exam ranges into a date set.
4. In `PUPUtils.buildCalendarEvents`, keep weekly `RRULE` + `UNTIL`.
5. For each event, add `EXDATE` entries for no-class dates that:
   - fall on that event’s weekday, and
   - fall on or after the first occurrence, and
   - fall on or before semester end.
6. Format EXDATEs in `Asia/Manila`, consistent with event `dateTime` / `timeZone`.
7. Preview and dry-run payloads must include the same recurrence array (including EXDATEs).
8. Missing no-class block for a term: import without exclusions; log a warning. Do not fail the import.

## UI

Extend the popup term status line:

- When exclusions load: show something like `· N no-class days`, where `N` is the size of the flattened date set for that term (not the per-event EXDATE count).
- When none: `· no exclusions`.

No new controls. Year/semester selection stays automatic from the page header.

## Testing

- Flatten ranges and single-day exams into a sorted unique date list.
- Weekday filter: Monday holiday appears only on Monday events.
- Graduating + non-graduating finals union for 2627 First (Dec 7–12, 16, 22).
- `buildCalendarEvents` recurrence includes `EXDATE` lines when config is present.
- CSV lookup still returns correct 2526 dates; new 2627 override rows resolve.
- Missing SY key → events still build, recurrence is RRULE-only.

## File touch list (implementation)

- `pupsync/config/no-class-dates.json` (new)
- `pupsync/config/academic-calendar.csv` (2627 rows)
- `pupsync/config/README.md` + `docs/CONFIG.md` (document no-class file)
- `pupsync/manifest.json` (expose JSON)
- `pupsync/shared/` loader (new small module or extend `semester-config.js`)
- `pupsync/shared/utils.js` (`buildCalendarEvents` EXDATE)
- `pupsync/popup/popup.js` (status line count)
- `pupsync/background/service_worker.js` if preview/import need to load config the same way as CSV
- `pupsync/test/parse-schedule.test.js` (exclusion cases)

## Open implementation detail

Exact EXDATE string form for the Calendar API (`EXDATE;TZID=Asia/Manila:YYYYMMDDTHHMMSS` vs date-only) should follow Google Calendar’s recurrence docs during implementation and be locked by a test against a known payload. The design requires exclusions to suppress occurrences; the wire format is an implementation detail.
