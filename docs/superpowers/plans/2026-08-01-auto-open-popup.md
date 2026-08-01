# Auto-open popup Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox syntax.

**Goal:** Auto-open the PUPSync toolbar popup on SIAS schedule and grades pages.

**Architecture:** Service worker watches tab complete/activate; if URL matches schedule or grades, call `chrome.action.openPopup()` with debounce.

**Tech Stack:** Chrome MV3, `chrome.tabs`, `chrome.action.openPopup` (127+).

## Global Constraints

- Open on schedule + grades only (including refresh / tab switch).
- No dismiss lock.
- Soft-fail on older Chrome / already-open popup.

---

### Task 1: Auto-open in service worker

**Files:**
- Modify: `pupsync/manifest.json` — add `"tabs"`
- Modify: `pupsync/background/service_worker.js`
- Create: `docs/superpowers/specs/2026-08-01-auto-open-popup-design.md` (already written)

- [ ] Add `"tabs"` to permissions
- [ ] Add `isAutoOpenUrl(url)`, `maybeOpenPopupForTab(tabId)`, debounced callers on `tabs.onUpdated` + `tabs.onActivated`
- [ ] Commit

Manual check: schedule / grades / refresh / home / tab switch.
