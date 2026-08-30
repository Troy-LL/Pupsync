# PUPSync

PUP SIAS schedule, parsed off the page and dropped into Google Calendar. The popup also reads GWA and Latin honors standing from the grades page.

Chrome extension for PUP students. Not an official PUP product.

## Install

[Add to Chrome](https://chromewebstore.google.com/detail/pupsync/lajkaclhliicgdfdlnfioaodjnkjmedp) from the Chrome Web Store.

Open a SIAS schedule or grades page and the popup should appear. Google Calendar import needs OAuth.

## Load unpacked (contributors)

For local development, not the product install.

1. Open `chrome://extensions`
2. Turn on Developer mode
3. Load unpacked and pick the `pupsync/` folder

Local dry-run works without OAuth.

Term dates live in `pupsync/config/academic-calendar.csv`. Product notes are in [PRODUCT.md](PRODUCT.md). Spec and architecture are in [docs/](docs/).
