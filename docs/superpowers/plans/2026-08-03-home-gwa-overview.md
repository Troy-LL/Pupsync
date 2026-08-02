# Home GWA Overview Implementation Plan

> **Superseded (2026-08-03):** SIAS home has no GWA Overview. Shipped design is **cache-only full card** from grades (`buildGradesHomeSnapshot`) — see updated `docs/superpowers/specs/2026-08-03-home-gwa-overview-design.md`. Steps below describe the earlier hybrid/live approach and are historical.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** On `/student/home`, show a hybrid GWA card (live rich → cached slim → landing), auto-open the popup, and add fixture contract tests in CI.

**Architecture:** Popup-orchestrated `SCRAPE_HOME_OVERVIEW` (same inject pattern as grades/identity). Persist `lastGrades` on successful grades scrape. Extend `isAutoOpenUrl` with `isSiasHomeUrl`. Fixture HTML + Node tests assert scrape contracts; GitHub Actions runs `npm test`.

**Tech Stack:** Chrome MV3 extension (vanilla JS), Node test runner (existing style), GitHub Actions.

## Global Constraints

- Hybrid: live home scrape → `lastGrades` → landing CTAs
- Rich live + slim cache UI; Latin enrich on rich when cache has it
- Silent fallthrough on scrape miss (no loud home error)
- Fixture CI only (not live SIAS)
- Auto-open home with existing debounce/active-tab rules
- Match existing maroon popup styling; keep Schedule/Grades CTAs under the card

## File map

| File | Responsibility |
|------|----------------|
| `pupsync/content/home-overview-scrape.js` | `__PUPSYNC_SCRAPE_HOME_OVERVIEW__` + `PUPUtils.parseHomeOverviewText` helper path |
| `pupsync/shared/utils.js` | `parseHomeOverviewText(text)` pure parser for scrape + tests |
| `pupsync/shared/constants.js` | `SCRAPE_HOME_OVERVIEW` message type |
| `pupsync/background/scrape-tab.js` | `scrapeTabHomeOverview(tabId)` |
| `pupsync/background/service_worker.js` | Message handler + `isAutoOpenUrl` includes home |
| `pupsync/popup/popup.html` | Home overview card markup inside State A |
| `pupsync/popup/popup.css` | Rich/slim card styles |
| `pupsync/popup/popup.js` | Home branch, cache read/write, render |
| `pupsync/dev/mock-chrome.js` | Home scrape + `lastGrades` + home fixtures |
| `pupsync/dev/index.html` | Home fixture toolbar chips |
| `pupsync/test/fixtures/home-gwa-overview.html` | SIAS-like overview HTML |
| `pupsync/test/fixtures/grades-table.html` | Minimal grades table HTML |
| `pupsync/test/scrape-contracts.test.js` | Fixture contract tests |
| `pupsync/package.json` | `test` script includes contracts |
| `.github/workflows/ci.yml` | Run `npm test` in `pupsync/` |

---

### Task 1: Pure overview parser + fixture contract tests

**Files:**
- Create: `pupsync/shared` helper in `utils.js` — `parseHomeOverviewText(text)`
- Create: `pupsync/test/fixtures/home-gwa-overview.html`
- Create: `pupsync/test/fixtures/grades-table.html`
- Create: `pupsync/test/scrape-contracts.test.js`
- Modify: `pupsync/package.json` scripts
- Create: `.github/workflows/ci.yml`

**Interfaces:**
- Produces: `PUPUtils.parseHomeOverviewText(text) → { ok, overview? }` where overview has `cumulativeGwa`, optional `academicStatus`, `unitsEarned`, `subjectsAsOf`, `enrolled`, `dropped`, `failed`
- Produces: contract test exit 0 when fixtures parse

- [ ] **Step 1: Add `parseHomeOverviewText` to `shared/utils.js`**

Label-oriented parser on flattened text (works with `element.innerText` or HTML stripped to text). Require at least a cumulative GWA number for `ok: true`.

- [ ] **Step 2: Add HTML fixtures**

Home fixture must include tags/text: `GWA Overview`, `Cumulative GWA`, `Academic Status`, `Units Earned`, subjects-as-of, Enrolled/Dropped/Failed with sample values.

Grades fixture: one semester table with Subject Code / Units / Final Grade headers + rows (existing scrape markers).

- [ ] **Step 3: Write `scrape-contracts.test.js`**

Load fixtures; assert required substrings/tags; strip tags → `parseHomeOverviewText`; for grades, inject scrape into a minimal DOM via `linkedom` **or** strip + assert table headers present and run grades scrape under a tiny DOM shim.

Prefer zero new deps: assert home via `parseHomeOverviewText` on stripped text; assert grades fixture contains `GRADE_TABLE_HEADERS` and a sample row; load `grades-scrape.js` only if DOM available — otherwise header/row contract + separate unit for parser.

Practical zero-dep path:
1. Home: strip tags → `parseHomeOverviewText` → assert fields
2. Grades: assert fixture contains `Subject Code`, `Units`, `Final Grade`, and at least one grade row pattern
3. Schedule: assert `fixture-schedule.html` still contains `TABLE_HEADERS`

- [ ] **Step 4: Wire `npm test` + CI**

```json
"test": "node test/parse-schedule.test.js && node test/scrape-contracts.test.js"
```

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: pupsync
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: npm test
```

- [ ] **Step 5: Run tests — expect PASS for parser+fixtures once implemented**

- [ ] **Step 6: Commit**

---

### Task 2: Home overview content scrape + background wiring

**Files:**
- Create: `pupsync/content/home-overview-scrape.js`
- Modify: `pupsync/shared/constants.js` — add `SCRAPE_HOME_OVERVIEW`
- Modify: `pupsync/background/scrape-tab.js` — `scrapeTabHomeOverview`
- Modify: `pupsync/background/service_worker.js` — handler + `isAutoOpenUrl`

**Interfaces:**
- Consumes: `PUPUtils.parseHomeOverviewText`
- Produces: `__PUPSYNC_SCRAPE_HOME_OVERVIEW__() → { ok, overview } | { ok: false, error }`
- Produces: SW message `SCRAPE_HOME_OVERVIEW` → same shape

- [ ] **Step 1: Implement content scrape**

Find a scoped root containing “GWA Overview” (smallest reasonable element), take `innerText`, call `parseHomeOverviewText`. Fallback: full `document.body.innerText`.

- [ ] **Step 2: Wire message type + scrapeTabHomeOverview + SW listener** (mirror grades)

- [ ] **Step 3: Extend `isAutoOpenUrl`**

```js
function isAutoOpenUrl(url) {
  return (
    !!url &&
    (PUPSYNC.isSiasScheduleUrl(url) ||
      PUPSYNC.isSiasGradesUrl(url) ||
      PUPSYNC.isSiasHomeUrl(url))
  );
}
```

- [ ] **Step 4: Commit**

---

### Task 3: Popup UI + cache + home branch

**Files:**
- Modify: `pupsync/popup/popup.html` — `#home-overview` card inside State A
- Modify: `pupsync/popup/popup.css` — `.home-ov*` styles
- Modify: `pupsync/popup/popup.js` — fetch overview, read/write `lastGrades`, render rich/slim/landing

**Interfaces:**
- Consumes: `SCRAPE_HOME_OVERVIEW`, `STORAGE_KEYS.LAST_GRADES`
- Cache shape: `{ gwa, totalUnits, tier, qualifiesTier, disqualified, savedAt }`
- `renderHomeOverview({ mode: 'rich'|'slim', overview?, cache? })`

- [ ] **Step 1: HTML structure**

Inside `#state-a` `.state-a-body`, after greeting/tagline, before `.landing-actions`:

```html
<div id="home-overview" class="home-ov" hidden>
  <p class="home-ov-title">GWA Overview</p>
  <div class="home-ov-gwa">
    <span id="home-ov-gwa-value" class="home-ov-num">—</span>
    <span class="home-ov-gwa-label">Cumulative GWA</span>
  </div>
  <div id="home-ov-latin" class="home-ov-latin" hidden></div>
  <div id="home-ov-rich-rows" class="home-ov-rows" hidden></div>
  <div id="home-ov-counts" class="home-ov-counts" hidden></div>
  <p id="home-ov-source" class="home-ov-source"></p>
</div>
```

- [ ] **Step 2: CSS** — compact card matching maroon tokens (no hero clutter)

- [ ] **Step 3: popup.js**

On grades success in `renderGrades`, `chrome.storage.local.set({ lastGrades: {...} })`.

New flow before “not schedule → showStateA”:

```js
if (tab?.id && tab.url && PUPSYNC.isSiasHomeUrl(tab.url)) {
  await showHomeHub(tab.id);
  return;
}
```

`showHomeHub`:
1. `showView('a')` / `showStateA()` with default hint softened when card shows
2. Try `fetchHomeOverviewFromTab`
3. Load `lastGrades` from storage
4. If overview ok → rich (+ Latin from cache if `tier` or `qualifiesTier`)
5. Else if cache has `gwa` → slim
6. Else landing only (`home-overview` hidden)

Latin line copy: use tier label when present, else “Keep going — open Grades for the full picture.” when disqualified with qualifiesTier, else omit or short below-honors line from gwa only.

- [ ] **Step 4: Manual/dev sanity**

- [ ] **Step 5: Commit**

---

### Task 4: Dev preview fixtures

**Files:**
- Modify: `pupsync/dev/mock-chrome.js`
- Modify: `pupsync/dev/index.html` toolbar for `?scene=off&home=rich|slim|empty`

- [ ] **Step 1: mock `SCRAPE_HOME_OVERVIEW`** when `scene===off'` and home fixture is rich; fail for slim/empty
- [ ] **Step 2: seed `lastGrades` in mock storage for slim/rich**
- [ ] **Step 3: Toolbar buttons Home: rich / slim / empty**
- [ ] **Step 4: Commit**

---

### Task 5: Docs touch-up + verify

- [ ] Update `docs/superpowers/specs/2026-08-03-home-gwa-overview-design.md` status to approved/implemented
- [ ] Note in `2026-08-01-auto-open-popup-design.md` that home is now included (one-line amendment)
- [ ] Run full `npm test`
- [ ] Final commit if needed

## Spec coverage check

| Spec item | Task |
|-----------|------|
| Hybrid rich/slim/landing | 3 |
| Latin enrich on rich | 3 |
| Popup-orchestrated scrape | 2 |
| lastGrades write/read | 3 |
| Auto-open home | 2 |
| Fixture CI | 1 |
| Dev preview variants | 4 |
| Silent fallthrough | 3 |
