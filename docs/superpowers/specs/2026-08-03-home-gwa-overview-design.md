# Home GWA overview (hybrid rich / slim / landing)

Date: 2026-08-03  
Status: approved for planning (pending user review of this file)

## Problem

On `/student/home`, PUPSync only shows the simple landing (greeting + Schedule / Grades links). SIAS already paints a **GWA Overview** on that page, and users who have scraped grades before have a useful GWA/Latin snapshot sitting unused (`lastGrades` key exists but is not written/read for home). Home also does not auto-open the popup today (schedule and grades do).

## Goal

Make `/student/home` the extension’s useful “idle” surface:

1. Prefer a **live** scrape of the SIAS GWA Overview when present (**rich** card).
2. Else fall back to **cached grades** (**slim** card).
3. Else keep today’s **simple landing CTAs**.
4. Auto-open the popup on `/student/home` the same way as schedule/grades.
5. Add **fixture contract tests in CI** so scraper HTML assumptions fail the build when we break them.

## Non-goals

- Live CI against authenticated SIAS (cookie canaries).
- Side panel or injected in-page UI.
- Changing schedule or grades primary flows beyond writing/reading grades cache and extending auto-open.
- Pixel-perfect clone of every SIAS chrome chrome around the overview (PUPSync styling; SIAS field set when rich).

## Product decisions (locked)

| Decision | Choice |
|----------|--------|
| Data strategy | Hybrid: live home scrape → `lastGrades` cache → landing CTAs |
| UI density | Rich when live overview works; slim when only cache; landing when neither |
| Latin on rich card | Enrich with one Latin/standing line from cache when available |
| Wiring | Popup-orchestrated scrape (mirror grades/identity) |
| Auto-open | Include `isSiasHomeUrl` in existing auto-open helper |
| CI | Fixture-based HTML/selector contract tests (not live SIAS) |

## Behavior on popup open (home URL)

```
if active tab is SIAS home:
  identity scrape (greeting) as today
  try SCRAPE_HOME_OVERVIEW
  if overview ok → render rich card
       + Latin line from lastGrades if present
  else if lastGrades present → render slim card (GWA + Latin)
  else → existing State A landing (greeting + CTAs)
```

Schedule and grades URLs keep current behavior. Home does not replace the grades view.

### Rich card (live)

Show available fields from the home overview, typically:

- Cumulative GWA
- Academic status (e.g. Regular)
- Units earned
- Subjects as-of (term label)
- Enrolled / dropped / failed counts

Partial success is OK: render rich with fields that parsed; only a total scrape miss falls through to cache/landing.

Source label: **Live from SIAS home**.

### Slim card (cache)

- Cumulative GWA
- Latin standing / track line from cached standing

Source label: **From last grades sync**.

### Landing

Unchanged: greeting + Open Schedule / Open Grades when neither live nor cache.

## Cache (`lastGrades`)

- **Write:** when a grades scrape succeeds (existing grades path), persist a standing snapshot: GWA, Latin/standing fields needed for slim + enrich, and a timestamp.
- **Read:** home path only for slim card and Latin enrich on rich.
- Do not invent enrolled/dropped/failed from grades cache for the slim card.

## Architecture

Follow existing message + inject pattern:

| Piece | Role |
|-------|------|
| `content/home-overview-scrape.js` | `__PUPSYNC_SCRAPE_HOME_OVERVIEW__()` → `{ ok, overview }` or `{ ok: false }` |
| `background/scrape-tab.js` + SW | `MESSAGE_TYPES.SCRAPE_HOME_OVERVIEW` inject/execute |
| `popup/popup.js` + CSS/HTML | Home branch: rich / slim / landing |
| `shared/constants.js` | Message type; reuse `STORAGE_KEYS.LAST_GRADES` |
| `dev/mock-chrome.js` + fixtures | `?scene=off` variants: rich, slim, empty |
| `background/service_worker.js` | `isAutoOpenUrl` also true for `PUPSYNC.isSiasHomeUrl` |

### Overview payload (live)

Logical fields (names can match implementation):

- `cumulativeGwa` (number or string as scraped)
- `academicStatus` (optional string)
- `unitsEarned` / units display (optional)
- `subjectsAsOf` (optional string)
- `enrolled`, `dropped`, `failed` (optional numbers)

### Cache payload (grades write)

Enough for slim + Latin enrich (align with existing standing object where possible): e.g. cumulative GWA, honor/standing label or code, `savedAt` ISO timestamp.

## Auto-open

Supersedes the “home is a non-goal” line in `2026-08-01-auto-open-popup-design.md` for this route only.

Extend `isAutoOpenUrl` to:

`isSiasScheduleUrl || isSiasGradesUrl || isSiasHomeUrl`

Keep existing debounce (~500ms), active-tab checks, and swallow `openPopup` errors.

## Errors

- No loud error banner for “overview not on page”; silent fallthrough to cache then landing.
- Optional soft hint only if useful in dev; production home stays calm.
- Scrape inject failures treated as miss → fallthrough.

## CI / fixture contracts

- Commit static HTML fixtures capturing the SIAS structures scrapers depend on (home overview required; grades/schedule fixtures included or extended in the same effort if not already covered).
- Unit tests load fixtures, run scrape helpers (or DOM parse entry points), assert required tags/fields.
- Wire into existing npm test / GitHub Actions so PRs fail when selectors break.
- **Limit:** fixtures do not detect a live SIAS redesign until someone captures new HTML after a break. They stop shipping broken parsers and document the expected DOM.

## Dev preview

- `?scene=off` (or dedicated fixture query) supports at least: rich live mock, slim cache mock, empty landing.
- Toolbar chips optional if already used for grades fixtures.

## Testing (manual + automated)

- Manual: on home with overview → rich + auto-open; Latin line if grades visited earlier.
- Manual: home without overview but after grades visit → slim.
- Manual: fresh install, home, no cache → landing.
- Manual: schedule/grades still auto-open and function.
- Automated: fixture contract tests green in CI.

## Files (expected touch list)

- `pupsync/content/home-overview-scrape.js` (new)
- `pupsync/background/scrape-tab.js`
- `pupsync/background/service_worker.js`
- `pupsync/shared/constants.js`
- `pupsync/popup/popup.html` / `popup.js` / `popup.css`
- `pupsync/dev/*` mocks/fixtures
- `pupsync/test/*` fixture HTML + contract tests
- CI workflow / `package.json` scripts if not already running these tests
- Docs: short note in architecture/product if they already describe State A

## Out of scope follow-ups

- Scheduled live canary against SIAS
- Export image from the home card
- Editing or deep-linking into grade breakdown from the home card beyond existing Grades CTA
