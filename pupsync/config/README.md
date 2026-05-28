# PUPSync config — academic calendar

Edit **`academic-calendar.csv`** whenever PUP publishes new term dates. No code changes required — reload the extension after saving.

## How dates are chosen

1. **Page parse** — SIAS heading e.g. `School Year 2526 - Second Semester` → code `2526`, semester `Second`.
2. **CSV override** — row with matching `school_year_code` + `semester` and filled `start_date` / `end_date`.
3. **CSV rule** — row with `school_year_code` = `*` and matching `semester` (month/day template + `sy_year_part`).
4. **Built-in fallback** — same templates hardcoded in `shared/semester-config.js` if the file fails to load.

## Override rows (you edit every term)

```csv
school_year_code,semester,start_date,end_date,...
2526,Second,2026-01-05,2026-05-31,...
```

| Column | Example | Meaning |
|--------|---------|---------|
| `school_year_code` | `2526` | PUP SY code (first two digits = start year, last two = end year) |
| `semester` | `Second` | Must match SIAS heading |
| `start_date` | `2026-01-05` | First day of classes (import recurrence starts from first Monday on/after this) |
| `end_date` | `2026-05-31` | Last day of term (`UNTIL` on calendar events) |

Add a new row when a new SY starts. Keep old rows for reference if you want.

## Rule rows (rarely changed)

Only edit if PUP changes their **pattern** (e.g. all 2nd semesters start in January). Do not put a specific SY here — use `*`.

| Column | Example |
|--------|---------|
| `sy_year_part` | `start` = use 20**25** from 2526; `end` = use 20**26** |
| `start_month` / `start_day` | 8 / 1 = August 1 |
| `end_month` / `end_day` | 5 / 31 = May 31 |

## School year code

| Code | Academic years |
|------|----------------|
| 2526 | 2025–2026 |
| 2627 | 2026–2027 |

## After editing

1. Save `academic-calendar.csv`
2. `chrome://extensions` → reload PUPSync
3. Re-open popup on SIAS schedule page

See [docs/CONFIG.md](../../docs/CONFIG.md) for full documentation.
