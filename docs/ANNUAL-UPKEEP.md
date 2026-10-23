# Yearly term data upkeep

PUPSync ships its term dates and no-class days inside the extension:

- `pupsync/config/academic-calendar.csv`: first and last day of each term
- `pupsync/config/no-class-dates.json`: holidays, breaks and exam days skipped on import

Today they cover up to **SY 2627 Summer (ends 2027-07-18)**. AY 2027-2028 classes start around mid-August 2027, and a Chrome Web Store review can take a few days, so:

| When | What |
|---|---|
| As soon as PUP posts the AY 2027-2028 registrar calendar (usually June or July) | Add `2728` rows for First, Second and Summer to the CSV, and a `2728` block to `no-class-dates.json` |
| Same week | `npm test` (it warns when the data runs out within 6 months), bump the version, upload, tag |
| By early August 2027 | Store version with 2728 data is live |

If a term has no CSV row, PUPSync falls back to month/day templates, so imports still work but dates can be off by a week or two and no holidays are skipped.

Later option (not done): fetch the JSON from pupsync.niched.tech so data updates need no store release. That adds a host permission and a privacy policy line, so it is Troy's call.

Reminder: add a calendar event for **2027-06-15, "PUPSync: add AY 2027-2028 term data"**.
