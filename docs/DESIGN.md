# DESIGN — PUPSync UI/UX

See [SPEC.md](SPEC.md).

**Widths:** `320px` compact (State A, list view, import states) · `600px` when State B shows the **Week grid** (`body.popup-wide`).

**Brand:** maroon `#7a0019`, calendar-plus icon in header (SVG).

---

## Header

- Calendar icon (SVG)
- Title: **PUPSync**
- Subtitle examples: `Schedule import` (State A) · `8 subjects · SY 2526 · Second` (State B) · `Importing…` / `Done`

---

## Popup states

| State | When | Content |
|-------|------|---------|
| **A** | Not on a SIS schedule URL | Message (`#state-a-hint`), link to portal / current schedule URL |
| **B** | Schedule parsed | Week grid **or** list, semester section, preview + import |
| **C** | Import in progress | Dimmed subject list, progress bar |
| **D** | Import done | Success message + calendar link |

---

## State B — schedule views

Tab switcher: **Week grid** (default) | **List**.

### Week grid

- Canvas export → WebP image in `#schedule-grid-image` (`shared/schedule-grid-image.js`)
- Fixed 300px-tall scroll area; popup widens to 600px
- Colors auto-assigned on first load; hint points users to List view to edit
- Re-renders when subjects are toggled or colors change

### List

- Scrollable subject rows (max ~240px)
- Same row layout as before grid feature

---

## Subject row (List view)

- Checkbox include/exclude
- Subject code (maroon), description, schedule tag from `PUPUtils.scheduleTag()`
- **Color chip** on the right: colored dot + ▾ (no color name on chip)
- Dropdown lists all 11 Google Calendar colors with names

Parse errors: warning line; no color chip.

---

## Semester section

- Collapsible **Semester dates** (collapsed by default)
- Banner when term detected: `Detected from page: SY 2526 (2025–2026) · Second Semester (csv-override)`
- Start / end date inputs (editable; override CSV + manual edits)

---

## Actions

- Primary: **Import to Calendar**
- Secondary: **Preview events** — inline list (code, day, Lec/Lab, start time)

---

## Accessibility

- View tabs: `role="tablist"` / `role="tab"` + `aria-selected`
- Color chip: `aria-label` with color name; keyboard on dropdown options
- Checkboxes labeled per subject code
- Week grid image: `alt` describes subject count
