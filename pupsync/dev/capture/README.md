# Real Google Calendar captures (store shots 1, 3 and 4)

These shots must show the real Google Calendar with the fake schedule imported by the real extension. Never redraw Google's UI.

Use a test Google account, never a personal one.

Run it on a machine with a screen (the browser opens headed so you can sign in).

## 1. Start the browser

```bash
cd pupsync
npm install --no-save playwright@1
npx playwright install chromium
PUPSYNC_MANIFEST_KEY='<store public key>' node dev/capture/launch.mjs
```

This copies the branch's extension to a temp folder (adding the key there only), opens Chromium with it loaded, and serves `dev/capture/fake-sias-schedule.html` at `https://sis2.pup.edu.ph/student/schedule`: Juan Dela Cruz (2099-00000-MN-0), section BSIT 2-9N, 8 subjects, School Year 2627 First Semester (Aug 17 to Dec 22, 2026), fake faculty.

The key makes the unpacked extension use the store ID, which is the only redirect the OAuth client allows. Without it, Google sign-in fails with redirect_uri_mismatch. (The other option is adding the unpacked ID's `https://<id>.chromiumapp.org/` redirect to the OAuth client in Google Cloud.)

Check without signing in: `node dev/capture/launch.mjs --check`.

## 2. Import

Click the PUPSync toolbar icon on the fake schedule tab, then Import to Calendar, and sign in with the test Google account.

## 3. Capture (1280x800 store frame, product area below the 160px caption band)

| Shot | Caption | What to show |
|---|---|---|
| 1 | Your PUPSIS schedule, now in Google Calendar | The fake SIAS table (left) and Google Calendar week view of **Sep 7 to 13, 2026** (right). That week has no holidays, so all classes show. |
| 3 | Holidays and exam days skipped for you | Google Calendar month view of **October 2026**. Oct 12 to 17 (midterms) is empty, and Oct 22 (PUP founding anniversary) has no classes. |
| 4 | Schedule changed? Import again, no duplicates | Change one thing in the popup (rename COMP 013 or recolor it), click Import Again and then Import to Calendar, and capture the success state ("1 updated") next to the same calendar week showing one event per class. |

Save the raw captures (no caption band) to `store/screenshots/_raw/`:

- `01-calendar-week.png`: Google Calendar week view, Sep 7 to 13, 2026
- `03-october.png`: Google Calendar month view, October 2026
- `04-popup-updated.png`: the popup success state after the re-import
- `04-calendar-week.png`: the same week in Google Calendar after the re-import

Then run `node ../store/tools/render-assets.mjs` from `pupsync/`. It frames any shot whose raw files exist and leaves the others on hold. Crop out the account avatar and email before saving.

When done, use Remove PUPSync classes to clean up the test account's calendar.
