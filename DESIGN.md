---
name: PUPSync
description: Maroon Upsked system for the Chrome extension and Persuade marketing site
colors:
  maroon: "#7a0019"
  maroon-dark: "#5c0013"
  maroon-light: "#9a1a32"
  maroon-bg: "#f7f2f3"
  maroon-border: "#e0cfd3"
  maroon-muted: "#6e3a45"
  text: "#1c1214"
  text-muted: "#5a454a"
  surface: "#ffffff"
  surface-soft: "#faf8f8"
  ok-bg: "#e8f5ec"
  ok-fg: "#0a6b38"
typography:
  display:
    fontFamily: "Bricolage Grotesque, system-ui, sans-serif"
    fontWeight: 800
    letterSpacing: "-0.03em"
  body:
    fontFamily: "Source Serif 4, Georgia, serif"
    fontSize: "1.0625rem"
    lineHeight: 1.55
  mono:
    fontFamily: "Red Hat Mono, ui-monospace, monospace"
    fontSize: "0.85rem"
  hand:
    fontFamily: "Caveat, cursive"
    fontWeight: 700
  operate-ui:
    fontFamily: "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "12px"
rounded:
  sm: "8px"
  md: "12px"
spacing:
  section: "clamp(2.5rem, 6vw, 4rem)"
  gutter: "clamp(1rem, 4vw, 2rem)"
components:
  button-primary:
    backgroundColor: "{colors.maroon}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "0.85rem 1.35rem"
  button-primary-hover:
    backgroundColor: "{colors.maroon-dark}"
    textColor: "#ffffff"
    rounded: "{rounded.sm}"
    padding: "0.85rem 1.35rem"
---

## Overview

PUPSync’s visual system is **restrained neutrals + committed PUP maroon**, shared by the Operate popup and the Persuade marketing site. Marketing may use scrapbook/quiz topology (torn collage, hand notes, notebook sheet) without inventing a second palette. Unofficial product: always disclaim.

## Colors

- **Primary:** `--maroon` `#7a0019` for brand, primary buttons, quiz accents, sheet rule.
- **Neutrals:** blush ground `#f7f2f3`, white surfaces, ink `#1c1214`, muted `#5a454a` / `#6e3a45` on blush (never raw gray on maroon-tinted grounds).
- **Status:** ok green `#0a6b38` on `#e8f5ec` for live Latin band; danger stays in the maroon family.

## Typography

- **Marketing display:** Bricolage Grotesque (or stamped wordmark asset) for brand-scale titles.
- **Marketing body:** Source Serif 4 for quiz questions and long reading.
- **Meta / labels:** Red Hat Mono for badges, disclaimers, sheet ledes.
- **Hand accents:** Caveat for quiz titles and CTA asides only, not body.
- **Operate popup:** system UI stack at 12px; do not import marketing display faces into the extension chrome.

## Layout

- Marketing: sticky topbar, hero as brand + one confession line + CTA + collage proof, then quiz sheet, how/features/why bands, closer.
- Operate: compact 320px / wide 600px popup; header maroon band → content → one primary action.
- More space above section headings than below; body measure ~42–58ch on the site.

## Elevation & Depth

- Soft offset shadows (`--shadow-soft`, `--shadow-lift`); no zero-offset glow, no hard 4px neobrutal offsets.
- Collage proof may use a raster scrapbook asset; interactive synthetic UI stays live HTML when editable.

## Shapes

- Control radius 8–12px; pills only for tiny badges.
- Quiz sheet uses a torn clip-path bottom edge; do not card-wrap the whole page.

## Components

- **Primary button:** maroon fill, white type, `:active` scale `0.97`, 160ms ease-out.
- **Quiz checks:** maroon square with stroke-draw check (`t-check`); one answer per question.
- **Verdict:** maroon panel that scales in from `0.96`; white inverse CTA.
- **Proof badges:** uppercase mono “synthetic” on illustrative data.

## Do's and Don'ts

- **Do** keep maroon recognizable and label synthetic demos.
- **Do** prefer transform/opacity motion under 300ms with strong ease-out; honor `prefers-reduced-motion`.
- **Don’t** ship feature-card heroes, eyebrow kickers, purple gradients, or official-PUP seal claims.
- **Don’t** put Inter/system display faces as the marketing brand voice; use the stamped wordmark or Bricolage.
