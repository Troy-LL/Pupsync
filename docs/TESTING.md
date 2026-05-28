# TESTING — PUPSync

## Load extension

1. `chrome://extensions` → Developer mode → **Load unpacked** → `pupsync/`
2. Open `https://sis2.pup.edu.ph/student/schedule` (logged in)
3. Open PUPSync popup

---

## Config file (`academic-calendar.csv`)

- [ ] Edit a row in `pupsync/config/academic-calendar.csv` (e.g. change `end_date`)
- [ ] Reload extension
- [ ] Popup semester dates match the CSV row for current SY + semester
- [ ] Term banner shows `(csv-override)` when override row used

---

## Term parsing

- [ ] Page heading `School Year 2526 - Second Semester` → header shows `SY 2526 · Second`
- [ ] Semester dates section shows detected term
- [ ] Removing override row falls back to `*` rule or `builtin` (check banner suffix)

---

## Schedule parser

- [ ] All subjects listed with schedule tags
- [ ] `S/S` subject → Saturday + Sunday in preview
- [ ] `M/TH` + lec/lab → 4 preview events
- [ ] Faculty paired from sub-row

---

## UI

- [ ] Color chip: dot only; dropdown shows names
- [ ] Preview events list correct count
- [ ] Import dry-run: State C → D; events in service worker console

---

## Unit tests

```bash
cd pupsync && npm test
```

---

## Dev preview

```bash
cd pupsync && npm run dev
```

Uses mock data + `academic-calendar.csv` from repo.

---

## Phase 2b (live Calendar)

After Google Cloud + `DRY_RUN = false` in `shared/constants.js`:

- [ ] OAuth succeeds
- [ ] Events appear in primary calendar with correct recurrence and colors
