# PRODUCT.md — PUPSync

## Platform

`web` — Chrome extension (Manifest V3) popup UI, compact 320px / wide 600px.

## Users

Primary: PUP students on SIAS (`sis*.pup.edu.ph`), often on a laptop between classes or during enlistment week.

## Jobs

1. Import the current SIAS class schedule into Google Calendar with colors and preview.
2. Read overall GWA and indicative Latin honors standing from the SIAS grades page.
3. Orient from any SIAS page via a landing hub that greets by first name and routes to schedule or grades.

## Mechanism

No backend. The extension scrapes the open SIAS DOM and (for import) calls Google Calendar with user OAuth. Academic term dates come from a local CSV the maintainer updates each semester.

## Brand commitments

- Product name: **PUPSync**
- PUP maroon identity (`#7a0019` family) stays recognizable
- Not an official PUP product (disclaim on store / privacy)
- Visual craft reference for this redesign: [Upsked](https://upsked.com/) — clarity-first school scheduling tools (inferred from user brief)

## Constraints

- Popup size limits; week grid is a live SVG preview (PNG on export)
- Operate mode: scanability and task completion over marketing expression
- Accessibility: readable contrast; no reliance on color alone for include/exclude

## Open

- Duplicate-event handling on re-import
- Store screenshots / final listing polish
