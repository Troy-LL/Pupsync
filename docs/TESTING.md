# TESTING — PUPSync

## Load extension

1. `chrome://extensions` → Developer mode → **Load unpacked** → folder **`Pupsync/pupsync`** (must contain `manifest.json`)
2. After any code change: click **Reload** on the PUPSync card
3. Open `https://sis2.pup.edu.ph/student/schedule` (or your campus `sisN` host), logged in
4. **Refresh the SIAS tab (F5)** if the extension was loaded or reloaded while the tab was already open
5. Open the PUPSync popup

---

## Config file (`academic-calendar.csv`)

- [ ] Edit a row in `pupsync/config/academic-calendar.csv` (e.g. change `end_date`)
- [ ] Reload extension
- [ ] Popup semester dates match the CSV row for current SY + semester
- [ ] Term banner shows `(csv-override)` when override row used

---

## Term parsing

- [ ] Page heading `School Year 2526 - Second Semester` → header shows `8 subjects · SY 2526 · Second` (or similar)
- [ ] Semester dates section shows detected term
- [ ] Removing override row falls back to `*` rule or `builtin` (check banner suffix)

---

## Schedule parser

- [ ] All subjects listed (BSIT sample: 8 subjects)
- [ ] `S/S` subject → two Saturday blocks in preview/grid (not Sunday)
- [ ] `T/F` + lec/lab → two events per subject (e.g. Tue lec + Fri lab), not four
- [ ] `M/TH` + lec/lab → Mon lec + Thu lab for split schedules
- [ ] Faculty shown (inline `Faculty:` in schedule cell)

---

## Popup UI

- [ ] Default **Week grid** tab: timetable image, popup ~600px wide
- [ ] **List** tab: subject rows, color chips, checkboxes
- [ ] Toggle subject off → grid updates
- [ ] Color chip: dot + dropdown with color names
- [ ] Preview events → correct count and Lec/Lab labels
- [ ] Import dry-run: State C → D; payloads in service worker console (`DRY_RUN`)

---

## Unit tests

```bash
cd pupsync && npm test
```

Expect **65 passed** (parser, URL match, meetings, S/S, connected lab).

---

## Dev preview

```bash
cd pupsync && npm run dev
```

Open http://localhost:5173 — same popup markup/CSS/JS as the extension, mock scrape via `SCRAPE_TAB`.

---

## Phase 2b (live Calendar)

After Google Cloud + `DRY_RUN = false` in `shared/constants.js`:

- [ ] OAuth succeeds
- [ ] Events appear in primary calendar with correct recurrence and colors
