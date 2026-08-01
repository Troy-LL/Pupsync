# DESIGN — PUPSync UI/UX

See [SPEC.md](SPEC.md) and [PRODUCT.md](../PRODUCT.md).

**Craft reference:** [Upsked](https://upsked.com/) clarity for school scheduling tools — adapted to a Chrome extension Operate surface with PUP maroon identity.

**Widths:** `320px` compact (landing, list, import, grades) · `600px` when State B shows the **Week grid** (`body.popup-wide`).

**Brand:** maroon `#7a0019`, soft neutrals (`#faf8f8` / `#f7f2f3`), calendar-plus mark in header (SVG). Soft control radii `8–10px`. Motion tokens from transitions-polish (`--duration-*`, `--ease-smooth-out`, press scale `0.97`).

**Contrast:** body/secondary text targets readable greys (`#1c1214` / `#5a454a`) — avoid washed muted pink-greys on pale grounds.

---

## Header

- Calendar icon (SVG)
- Title: **PUPSync**
- Subtitle: `Welcome` · `N subjects · SY …` · `Importing…` / `Done` · `Grades · GWA`

---

## Popup states

| State | When | Content |
|-------|------|---------|
| **A** | Not on schedule/grades (or errors) | Greeting + action links (schedule / grades) |
| **B** | Schedule parsed | Segmented Week grid \| List, semester, preview + import |
| **C** | Import in progress | Dimmed list + progress |
| **D** | Import done | Success + calendar link |
| **E** | Grades page | GWA card, standing, per-semester rows |

---

## State B — schedule views

Segmented control: **Week grid** (default) | **List**.

### Week grid

- Live **SVG** in `#schedule-grid-scroll` (fills panel, no letterboxing)
- **Export image** downloads a high-res **PNG** (canvas)
- Upsked light field: white, faint H/V grid, day names, `7AM` axis, rounded blocks
- Fixed 300px-tall panel; popup widens to 600px
- Hint + compact **Export image** in grid footer
- Sticky Import/Preview actions stay reachable

### List

- Scrollable subject rows; checkbox, code, schedule tag, color chip

---

## Actions

- Primary: **Import to Calendar** (sticky; press feedback)
- Secondary: **Preview events**
- Grid footer: compact **Export image**
- Always-visible term/date summary; expand only to edit dates
- Import errors: inline banner (`role="alert"`), not `alert()`

---

## Grades (State E)

- Large tabular GWA, units label, standing pill (ok / dq)
- Personalized standing lines (uses first name when known); ~10 random variants per state
- Friendly, encouraging standing copy (real medals + fool’s medals); soft “just so you know” warnings
- On-track medals: **gold** Summa · **silver** Magna · **bronze** Cum Laude
- Disqualified-but-GWA-fits: **fool's** medals (cardboard gold · soda-can silver · dalgona bronze)
- Breakdown collapsed by default behind **View grade breakdown** CTA; years/semesters also collapsed with chevrons
- Breakdown: **school year** → **semester** → **subjects** (code, desc, units, grade)
- NSTP / failing / non-numeric grades flagged in the list
- Footer note fully padded (no clip)
- Dev preview: `?scene=grades&fixture=magna|summa|cum|below|failing|lost|foolsGold|foolsSilver|foolsBronze|inc`

---

## Accessibility

- Tabs: `role="tablist"` / `aria-selected`
- Focus rings on chips/options
- `prefers-reduced-motion` disables entrance, press, chevron, progress, spinner motion
- Hover transforms gated with `(hover: hover) and (pointer: fine)`
- Progress fill uses `transform: scaleX` (GPU)
- Strong `--ease-out` cubic-bezier for UI feedback
