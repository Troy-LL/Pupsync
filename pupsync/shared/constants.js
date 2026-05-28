/**
 * PUPSync shared constants (loaded in content script, popup, and service worker).
 */
const PUPSYNC = {
  SIAS_SCHEDULE_URL_PATTERN: /^https:\/\/sis2\.pup\.edu\.ph\/student\/schedule/,
  SIAS_PORTAL_URL: 'https://sis2.pup.edu.ph/student/schedule',
  TIMEZONE: 'Asia/Manila',
  CALENDAR_API_EVENTS: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
  STORAGE_KEYS: {
    SUBJECT_COLORS: 'subjectColors',
    SEMESTER_START: 'semesterStart',
    SEMESTER_END: 'semesterEnd',
    OAUTH_TOKEN: 'oauthToken',
    LAST_SCHEDULE: 'lastSchedule',
    LAST_TERM: 'lastTerm'
  },
  /** PUP-style SY code e.g. 2526 → 2025–2026 */
  TERM_HEADER_PATTERN:
    /School\s+Year\s+(\d{4})\s*[-–—]?\s*(First|Second|Third|Summer|Midyear)?\s*Semester/i,
  MESSAGE_TYPES: {
    GET_SCHEDULE: 'GET_SCHEDULE',
    SCHEDULE_PARSED: 'SCHEDULE_PARSED',
    PREVIEW_EVENTS: 'PREVIEW_EVENTS',
    IMPORT: 'IMPORT',
    IMPORT_PROGRESS: 'IMPORT_PROGRESS',
    IMPORT_COMPLETE: 'IMPORT_COMPLETE',
    IMPORT_ERROR: 'IMPORT_ERROR'
  },
  TABLE_HEADERS: ['Subject Code', 'Description', 'Schedule'],
  DAY_CODES: {
    'S/S': ['Saturday', 'Sunday'],
    TH: 'Thursday',
    M: 'Monday',
    T: 'Tuesday',
    W: 'Wednesday',
    F: 'Friday',
    S: 'Saturday'
  },
  DAY_TO_BYDAY: {
    Monday: 'MO',
    Tuesday: 'TU',
    Wednesday: 'WE',
    Thursday: 'TH',
    Friday: 'FR',
    Saturday: 'SA',
    Sunday: 'SU'
  },
  DEFAULT_COLOR_LABEL: 'Peacock',
  /** Phase 2a: set true to skip OAuth/API; flip false after Google Cloud setup */
  DRY_RUN: true,
  COLORS: [
    { label: 'Tomato', hex: '#D50000', colorId: '11' },
    { label: 'Flamingo', hex: '#E67C73', colorId: '4' },
    { label: 'Tangerine', hex: '#F4511E', colorId: '6' },
    { label: 'Banana', hex: '#F6BF26', colorId: '5' },
    { label: 'Sage', hex: '#33B679', colorId: '2' },
    { label: 'Basil', hex: '#0B8043', colorId: '10' },
    { label: 'Peacock', hex: '#039BE5', colorId: '7' },
    { label: 'Blueberry', hex: '#3F51B5', colorId: '9' },
    { label: 'Lavender', hex: '#7986CB', colorId: '1' },
    { label: 'Grape', hex: '#8E24AA', colorId: '3' },
    { label: 'Graphite', hex: '#616161', colorId: '8' }
  ]
};

PUPSYNC.COLOR_BY_LABEL = Object.fromEntries(
  PUPSYNC.COLORS.map((c) => [c.label, c])
);
