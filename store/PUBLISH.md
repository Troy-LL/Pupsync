# Chrome Web Store publish checklist

## Before upload

- [ ] `npm test` passes in `pupsync/`
- [ ] Live import works (`DRY_RUN: false`, real OAuth client)
- [ ] Privacy policy hosted publicly → paste URL into listing + store form
- [ ] `npm run package` → upload `dist/pupsync.zip`
- [ ] Screenshots captured (see `store/listing.txt`)
- [ ] Store listing text filled from `store/listing.txt`
- [ ] OAuth consent screen: test users work; publish to Production when opening to everyone
- [ ] Chrome Web Store OAuth client uses the **store** extension ID after first upload (update redirect / Chrome client as needed)

## Host privacy policy (GitHub Pages)

Easiest with this repo’s existing `docs/` folder:

1. `docs/privacy-policy.html` is already in the repo (same content as `store/privacy-policy.html`)
2. GitHub → Settings → Pages → Deploy from branch **main**, folder **/docs**
3. Privacy URL will be like: `https://troy-ll.github.io/Pupsync/privacy-policy.html`
   (confirm exact URL after Pages is enabled)

## Upload

1. [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole) → New item
2. Upload `dist/pupsync.zip`
3. Fill listing, privacy URL, single purpose, permission justifications
4. Submit for review
