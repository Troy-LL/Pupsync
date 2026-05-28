# docs/ — PUPSync product truth

| File | Purpose |
|------|---------|
| [SPEC.md](SPEC.md) | Requirements, goals, features, pipeline, milestones |
| [CONFIG.md](CONFIG.md) | **Academic calendar CSV** — how term dates are resolved |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Extension layout, data flow, storage |
| [DESIGN.md](DESIGN.md) | Popup UI states and components |
| [API.md](API.md) | Google Calendar API, OAuth, event payload |
| [TESTING.md](TESTING.md) | Manual test checklist |

## Maintain each term

Edit **[`pupsync/config/academic-calendar.csv`](../pupsync/config/academic-calendar.csv)** with official PUP start/end dates, then reload the extension.

## Run locally

```bash
cd pupsync
npm run dev    # popup preview at http://localhost:5173
npm test       # parser + term unit tests
```
