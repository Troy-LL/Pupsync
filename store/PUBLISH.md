# Chrome Web Store publish checklist

## Before upload

- [ ] `npm test` and `npm run test:e2e` pass in `pupsync/` (CI runs both plus `npm run package`)
- [ ] Bump `version` in `pupsync/manifest.json` only (package.json has no version) and move the CHANGELOG `Unreleased` entries under it
- [ ] Live import works (`DRY_RUN: false`, real OAuth client)
- [ ] Privacy policy URL in the listing and store form: https://pupsync.niched.tech/privacy-policy.html
- [ ] `npm run package`, then upload `dist/pupsync-vX.Y.Z.zip`
- [ ] After the store accepts it: `git tag vX.Y.Z && git push origin vX.Y.Z`, then make a GitHub release from the tag with the zip attached
- [ ] Screenshots captured (see `store/listing.txt`)
- [ ] Store listing text filled from `store/listing.txt`
- [ ] OAuth consent screen: test users work; publish to Production when opening to everyone
- [ ] Chrome Web Store OAuth client uses the **store** extension ID after first upload (update redirect / Chrome client as needed)

## Privacy policy

The one policy lives at `site/privacy-policy.html` and is served from https://pupsync.niched.tech/privacy-policy.html (the URL Google verified). `docs/privacy-policy.html` on GitHub Pages and `store/privacy-policy.html` only redirect there.

## Upload

1. [Chrome Developer Dashboard](https://chrome.google.com/webstore/devconsole), then New item
2. Upload `dist/pupsync.zip`
3. Fill listing, privacy URL, single purpose, permission justifications
4. Submit for review
