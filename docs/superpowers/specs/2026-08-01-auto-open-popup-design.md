# Auto-open popup on SIAS schedule and grades

Date: 2026-08-01  
Status: approved for implementation

## Problem

Users on the SIAS schedule or grades page must click the extension icon to open PUPSync. That adds friction every visit, including after refresh or returning to the page.

## Goal

Automatically open the existing toolbar popup when the active tab is a SIAS schedule or grades URL, including first load, refresh, revisit, and switching to such a tab.

## Non-goals

- Side panel
- Injected in-page UI
- Auto-open on SIAS home or other routes
- Permanently suppressing open after the user dismisses the popup on a tab

## Approach

Service worker listens for tab completion and activation. When the active tab URL matches `PUPSYNC.isSiasScheduleUrl` or `PUPSYNC.isSiasGradesUrl`, call `chrome.action.openPopup()` (Chrome 127+).

## Behavior

| Event | Action |
|-------|--------|
| Navigate to / land on schedule or grades (`tabs.onUpdated`, `status === 'complete'`) | Open popup if tab is active |
| Refresh on those pages | Open popup |
| Switch to an already-open schedule/grades tab (`tabs.onActivated`) | Open popup |
| Home or other SIAS / non-SIAS | Do nothing |
| Popup already open / no focused window | Swallow error; no crash |
| Chrome without `openPopup` | No-op; manual icon click still works |

Debounce ~500ms so one navigation does not fire open twice.

No per-tab “user dismissed” lock. Closing the popup and later revisiting or refreshing opens it again.

## Permissions

Add `"tabs"` to the manifest if required so the service worker can read tab URLs on activation. Keep existing host permissions for `*.pup.edu.ph`.

## Files

- `pupsync/background/service_worker.js` — listeners + open helper
- `pupsync/manifest.json` — `tabs` permission if needed
- Optional: short note in README / docs

## Testing

- Manual: open schedule → popup appears; refresh → appears again; grades → appears; home → does not; switch back to schedule tab → appears.
- Guard: calling open when unsupported does not throw unhandled.
