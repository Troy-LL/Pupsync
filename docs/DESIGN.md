# DESIGN — PUPSync UI/UX

See [SPEC.md](SPEC.md). Popup width **320px**, maroon (`#7a0019`).

---

## Header

- Calendar icon (SVG, not text logo)
- Title: **PUPSync**
- Subtitle: `8 subjects · SY 2526 · Second` when term detected

---

## Popup states

| State | When | Content |
|-------|------|---------|
| **A** | Not on SIAS schedule URL | Short message + link to portal |
| **B** | Schedule parsed | Subject list, semester section, preview + import |
| **C** | Import in progress | Dimmed list, progress bar |
| **D** | Import done | Success message + calendar link |

---

## Subject row (State B)

- Checkbox include/exclude
- Subject code (maroon), description, schedule tag (`M/TH · 1:30PM–4:30PM / …`)
- **Color chip** on the right: colored dot + ▾ (no color name on chip)
- Dropdown lists all 11 colors with names

Parse errors: warning line; no color chip.

---

## Semester section

- Collapsible **Semester dates** (collapsed by default)
- Banner when term detected: `Detected from page: SY 2526 (2025–2026) · Second Semester (csv-override)`
- Start / end date inputs (editable; override CSV + manual edits)

---

## Actions

- Primary: **Import to Calendar**
- Secondary: **Preview events** — inline list of generated events (day, type, time)

---

## Accessibility

- Color chip: `aria-label` with color name; keyboard on dropdown options
- Checkboxes labeled per subject code
