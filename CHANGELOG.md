# Changelog

Versions match `pupsync/manifest.json` and the Chrome Web Store. Tag each store upload as `vX.Y.Z` and attach the zip from `npm run package` to a GitHub release.

## Unreleased (proposed 0.3.0)

### Fixed
- Re-importing can no longer overwrite a student's own events. PUPSync only reads, updates or removes events carrying its private tag and the current semester. Titles like "[COMP 016] ..." or "Faculty:" text in a description are ignored.
- A subject code that repeats across semesters no longer updates last semester's event. Events now carry the term.
- If the calendar lookup fails, the import stops before changing anything instead of guessing from saved data.
- If the semester can't be read from the SIAS schedule page, import and Remove PUPSync classes stop with an error and make no calendar calls. They no longer fall back to the last semester seen or to the date range, which could point a second-sem import at first-sem events. Semester names are normalized to fixed values (first, second, third, summer, midyear).
- If an import fails midway, the finished classes are saved and the error says how many of how many went through. Importing again picks up where it stopped.
- Google sign-in no longer shows the full consent screen every hour. The token lives in session storage, and an expired token is retried once.

### Added
- Remove PUPSync classes: takes this semester's PUPSync events off Google Calendar. Your own events and other semesters stay. The confirm count is what it will actually remove, counted from Google. Events from v0.2.3 that haven't been re-imported this semester carry no semester tag, so it leaves them alone and doesn't count them; import once and they're included.
- Classes dropped from this semester's schedule are removed on the next import, and the result says "Removed N". Only subject codes missing from the whole SIAS schedule count as dropped, so a class that failed to parse, has no meeting times yet, or is unticked keeps its events. A class that loses one of its meeting times keeps that old event until you remove it or use Remove PUPSync classes.
- Re-importing an unchanged schedule makes no calendar changes.
- New-semester prompt on the schedule page, and a hint on SIAS home once the last imported sem has ended.
- Welcome page on install.
- Editable event description with {faculty}, {section}, {type}, {code} and {title}.
- One-time, dismissible review request after an import.
- Report a problem: copies a summary with no names, student numbers, faculty or grades.
- Auto-open switch. The popup now opens once per SIAS tab instead of on every page load.
- pupsync.niched.tech on exported GWA and week grid images.
- Uninstall survey hook (off until a form URL is set).
- Warning for classes imported with 0.2.2 or older: when the popup opens, it counts untagged weekly events in this semester whose title starts with a code on your schedule, like "[COMP 016] ...", and says importing can add a second copy. It only warns. Those events are never adopted, changed or removed by title.

### Changed
- Dropped the `tabs` permission. Host access to `*.pup.edu.ph` covers what the extension reads.
- One privacy policy at https://pupsync.niched.tech/privacy-policy.html. The GitHub Pages copy redirects there.
- Fixtures and dev data use a fake student (Juan Dela Cruz, 2099-00000-MN-0) and fake faculty.
- No em dashes or arrows in popup copy.

### Known limits
- Duplicates from 0.2.2 or older: events made before 0.2.3 have no PUPSync tag, so PUPSync can't tell them apart from your own events and leaves them alone. Importing the same semester on top of them adds a second copy of each class. The warning above points this out; delete the old copies in Google Calendar by hand.
- Events from 0.2.3 (tagged, but before semesters were stored) are adopted only by tag plus a date window: a tagged event whose first class falls between 14 days before the semester start and the semester end gets this semester added on the next import.

## 0.2.3 (2026-08-18)
- Tagged events with private extended properties, in-place updates on re-import, Google OAuth verification approved for calendar.events.

## 0.2.2 (2026-08-05)
- Editable Google Calendar event titles.

## 0.2.0 to 0.2.1 (2026-08-04)
- First Chrome Web Store release: SIAS schedule import, week grid, colors, holidays skipped, GWA view.
