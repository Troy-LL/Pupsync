# PUPSync Chrome Extension

Import your PUP SIAS class schedule into Google Calendar.

## Maintain term dates (important)

Each semester, edit:

**[`config/academic-calendar.csv`](config/academic-calendar.csv)**

Set `start_date` and `end_date` for your `school_year_code` + `semester` row. Reload the extension after saving.

Guide: [config/README.md](config/README.md) · [docs/CONFIG.md](../docs/CONFIG.md)

## Load in Chrome

1. `chrome://extensions` → Developer mode → **Load unpacked** → this folder
2. Open [SIAS schedule](https://sis2.pup.edu.ph/student/schedule)
3. Click PUPSync

## Dev preview

```bash
npm run dev
```

Open http://localhost:5173 — mock schedule + real CSV.

## Tests

```bash
npm test
```

## Local import (Phase 2a)

`shared/constants.js` → `DRY_RUN: true` — import logs events to the service worker console (no Google account).

## Live Calendar (Phase 2b)

1. Google Cloud project + Calendar API + Chrome OAuth client
2. Set `oauth2.client_id` in `manifest.json`
3. Set `DRY_RUN: false` in `shared/constants.js`

See [docs/TESTING.md](../docs/TESTING.md).

## Docs

[docs/README.md](../docs/README.md)
