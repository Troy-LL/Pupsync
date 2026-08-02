# Home GWA overview (cached full card)

Date: 2026-08-03  
Status: implemented (revised — cache-only; SIAS home has no overview)

## Problem

On `/student/home`, PUPSync only showed the simple landing. Real SIAS home HTML has **no GWA Overview** (name, inbox, guidelines only). Grades data already yields GWA, units, Latin standing, and subject outcome counts — and those numbers change infrequently.

## Goal

Make `/student/home` show a **full GWA overview card from the last grades sync** (`lastGrades` cache). If no cache yet, keep landing CTAs. Auto-open popup on home. Fixture contract tests in CI.

## Non-goals

- Live scrape of a home GWA Overview (SIAS does not expose it)
- Academic Status (Regular) — not in grade tables
- Live SIAS canary CI

## Product decisions (locked)

| Decision | Choice |
|----------|--------|
| Data | Cache from successful grades scrape only |
| UI | Full card (GWA, Latin, units, subjects-as-of, subject/dropped/failed counts) |
| No cache | Landing CTAs |
| Auto-open | `isSiasHomeUrl` included |
| CI | Fixture contracts for grades/schedule HTML + home snapshot builder; home fixture documents “no GWA Overview” |

## Behavior

```
on popup open at SIAS home:
  identity scrape (greeting)
  if lastGrades has gwa → render full cached card
  else → State A landing
```

Cache is written whenever grades scrape succeeds via `PUPUtils.buildGradesHomeSnapshot(semesters)`.

### Card fields

- Cumulative GWA  
- Latin line (from tier / qualifiesTier)  
- Units earned  
- Subjects as of (latest scraped term label)  
- Counts: Subjects / Dropped / Failed (from grade rows)  
- Source: “From last grades sync”

## Auto-open

`isAutoOpenUrl` = schedule \|\| grades \|\| home (unchanged from prior revision).

## Testing

- Dev: `?scene=off` (cached), `?scene=off&home=empty`  
- `npm test` includes scrape-contracts  
- Manual: visit Grades once → home shows full card; clear storage → landing  
