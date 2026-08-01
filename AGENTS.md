# AGENTS.md

## Cursor Cloud specific instructions

PUPSync is a **client-only Chrome (Manifest V3) extension** for PUP students — it scrapes the SIAS portal, previews a weekly schedule, and pushes recurring events to Google Calendar. There is **no backend, no database, and no npm dependencies**: everything runs in the browser, and the dev/test tooling uses only Node.js built-ins (`http`, `fs`, `vm`). Because of this, there is nothing to `npm install`; `node_modules/` never exists.

All commands run from the `pupsync/` directory (that's where `package.json` lives). Scripts are defined in `pupsync/package.json`:

- Tests: `cd pupsync && npm test` — runs Node-based parser/term unit tests (`test/parse-schedule.test.js`). No browser or network needed.
- Dev preview server: `cd pupsync && npm run dev` — static server on port `5173` (override with `PORT=...`). Serves the popup with mock Chrome APIs and mock SIAS data; imports run in dry-run mode. Switch scenes via query param: `/?scene=off` (landing), `/?scene=grades` (GWA), default is the schedule grid.
- Package build: `cd pupsync && npm run package` — writes `dist/pupsync.zip` at the repo root (both `dist/` and `*.zip` are gitignored).
- Icons: `cd pupsync && npm run icons` — optional, needs Python 3 + Pillow. Shipped icons already exist in `pupsync/icons/`, so this is rarely needed.

There is **no linter** configured (no ESLint/Prettier).

Gotchas / non-obvious notes:
- The dev preview (`npm run dev`) is the only thing runnable headlessly in cloud. Full end-to-end behavior (real content-script scraping, `chrome.identity` OAuth, live Google Calendar writes) requires loading the unpacked extension in a real Chrome + a logged-in SIAS session + a Google OAuth client — these cannot be exercised in a headless/cloud VM.
- `shared/constants.js` has a `DRY_RUN` flag. In the dev preview, import is always simulated regardless; for a loaded extension, `DRY_RUN: true` logs events to the service worker console instead of hitting Google.
- Term/semester dates come from local config files (`pupsync/config/academic-calendar.csv`, `pupsync/config/no-class-dates.json`), not a server. Tests assert against these committed values.
