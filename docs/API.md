# API — PUPSync × Google Calendar

See [ARCHITECTURE.md](ARCHITECTURE.md) for where API calls originate (`background/service_worker.js`).

**Term dates** for `recurrence` / `UNTIL` come from [CONFIG.md](CONFIG.md) (`academic-calendar.csv`), not from the Calendar API.

---

## Authentication

- **Method:** OAuth 2.0 via `chrome.identity.launchWebAuthFlow`
- **Scope:** `https://www.googleapis.com/auth/calendar.events`
- Token cached in `chrome.storage.local` under `oauthToken`.
- Auth failure → show re-auth prompt in popup.

---

## Event Creation

**Endpoint:** `POST https://www.googleapis.com/calendar/v3/calendars/primary/events`

**Sample request body — INTE 202, Monday lecture:**

```json
{
  "summary": "[INTE 202] Integrative Programming and Technologies 1",
  "description": "Faculty: NAYRE, RACHEL\nSection: 1N - BSIT 2-1N\nType: Lecture",
  "colorId": "7",
  "start": {
    "dateTime": "2026-08-17T13:30:00+08:00",
    "timeZone": "Asia/Manila"
  },
  "end": {
    "dateTime": "2026-08-17T16:30:00+08:00",
    "timeZone": "Asia/Manila"
  },
  "recurrence": [
    "RRULE:FREQ=WEEKLY;BYDAY=MO;UNTIL=20261212T000000Z"
  ]
}
```

**Field rules:**
- `summary`: `[SUBJECTCODE] Full Description`
- `description`: Faculty, section, and type (Lecture / Lab)
- `start` / `end`: ISO 8601 datetime of first occurrence of that weekday on or after semester start date
- `recurrence`: Weekly until semester end date (`UNTIL=YYYYMMDDTHHMMSSZ`)
- `reminders`: default Google Calendar reminders (no override in MVP)
- `colorId`: integer string mapped from chosen color label (see table below)

---

## colorId Mapping

| PUPSync Label | Hex | colorId |
|---------------|-----|---------|
| Tomato | `#D50000` | 11 |
| Flamingo | `#E67C73` | 4 |
| Tangerine | `#F4511E` | 6 |
| Banana | `#F6BF26` | 5 |
| Sage | `#33B679` | 2 |
| Basil | `#0B8043` | 10 |
| Peacock | `#039BE5` | 7 |
| Blueberry | `#3F51B5` | 9 |
| Lavender | `#7986CB` | 1 |
| Grape | `#8E24AA` | 3 |
| Graphite | `#616161` | 8 |

---

## Event Generation Rules

For each selected subject, one event is created per `(day, timeSlot)` pair:
- A subject with `M/TH` and both lecture + lab slots → 4 events total (2 days × 2 slots).
- `BYDAY` value in `RRULE` maps from day name: `MO`, `TU`, `WE`, `TH`, `FR`, `SA`, `SU`.

---

## Error Handling

| Error | Handling |
|-------|----------|
| `429` Rate limit | Exponential backoff, max 3 retries |
| Auth failure | Show re-auth prompt in popup |
| Parse failure on subject row | Warn icon on row, skip, continue with remaining |

---

## Timezone

All events use `Asia/Manila` (UTC+8) — hardcoded for MVP.
