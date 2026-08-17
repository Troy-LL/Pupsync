/**
 * PUPSync shared constants (loaded in content script, popup, and service worker).
 * Uses var + globalThis so re-injection into the same frame does not throw.
 */
var PUPSYNC = globalThis.PUPSYNC;
if (!PUPSYNC) {
  PUPSYNC = {
  /** Path shared by sis1, sis2, etc. — host is matched separately */
  SIAS_SCHEDULE_PATH: '/student/schedule',
  SIAS_GRADES_PATH: '/student/grades',
  SIAS_HOME_PATH: '/student/home',
  SIAS_HOST_PATTERN: /^sis[\w-]*\.pup\.edu\.ph$/i,
  SIAS_SCHEDULE_URL_PATTERN:
    /^https:\/\/sis[\w-]*\.pup\.edu\.ph\/student\/schedule/i,
  /** Default link when popup opens off-schedule */
  SIAS_PORTAL_URL: 'https://sis2.pup.edu.ph/student/schedule',
  SIAS_HOME_URL: 'https://sis2.pup.edu.ph/student/home',
  SIAS_GRADES_URL: 'https://sis2.pup.edu.ph/student/grades',
  TIMEZONE: 'Asia/Manila',
  CALENDAR_API_EVENTS: 'https://www.googleapis.com/calendar/v3/calendars/primary/events',
  STORAGE_KEYS: {
    SUBJECT_COLORS: 'subjectColors',
    SUBJECT_CHIP_LABELS: 'subjectChipLabels',
    /** Custom Google Calendar event titles (subjectCode → string). */
    SUBJECT_CALENDAR_TITLES: 'subjectCalendarTitles',
    /** Custom schedule day/time overrides per subject & meeting (subjectCode -> { [meetingIndex]: { day, start, end } }). */
    SUBJECT_SCHEDULE_OVERRIDES: 'subjectScheduleOverrides',
    /** Map of synced calendar events (eventKey -> eventId). */
    SYNCED_CALENDAR_EVENTS: 'syncedCalendarEvents',
    /** ISO timestamp of last successful Google Calendar sync. */
    LAST_CALENDAR_SYNC: 'lastCalendarSync',
    SEMESTER_START: 'semesterStart',
    SEMESTER_END: 'semesterEnd',
    OAUTH_TOKEN: 'oauthToken',
    LAST_SCHEDULE: 'lastSchedule',
    LAST_TERM: 'lastTerm',
    LAST_GRADES: 'lastGrades',
    STUDENT_FIRST_NAME: 'studentFirstName',
    /** Popup UI: open grade details, schedule grid/list, etc. */
    UI_SESSION: 'uiSession'
  },
  /** Max chars for editable week-grid chip titles (preview + export). */
  CHIP_LABEL_MAX_LENGTH: 12,
  /** Max chars for custom Google Calendar event titles. */
  CALENDAR_TITLE_MAX_LENGTH: 100,
  /** PUP-style SY code e.g. 2526 → 2025–2026 */
  TERM_HEADER_PATTERN:
    /School\s+Year\s+(\d{4})\s*[-–—]?\s*(First|Second|Third|Summer|Midyear)?\s*Semester/i,
  MESSAGE_TYPES: {
    GET_SCHEDULE: 'GET_SCHEDULE',
    GET_ACADEMIC_CSV: 'GET_ACADEMIC_CSV',
    GET_NO_CLASS_JSON: 'GET_NO_CLASS_JSON',
    SCRAPE_TAB: 'SCRAPE_TAB',
    SCRAPE_GRADES: 'SCRAPE_GRADES',
    SCRAPE_IDENTITY: 'SCRAPE_IDENTITY',
    SCHEDULE_PARSED: 'SCHEDULE_PARSED',
    PREVIEW_EVENTS: 'PREVIEW_EVENTS',
    IMPORT: 'IMPORT',
    IMPORT_PROGRESS: 'IMPORT_PROGRESS',
    IMPORT_COMPLETE: 'IMPORT_COMPLETE',
    IMPORT_ERROR: 'IMPORT_ERROR',
    CHECK_SYNCED_EVENTS: 'CHECK_SYNCED_EVENTS'
  },
  TABLE_HEADERS: ['Subject Code', 'Description', 'Schedule'],
  GRADE_TABLE_HEADERS: ['Subject Code', 'Units', 'Final Grade'],
  /** NSTP components — excluded from GWA per PUP rule (matched as code prefix). */
  GWA_EXCLUDED_PREFIXES: ['CWTS', 'ROTC', 'LTS', 'NSTP'],
  /**
   * PUP Latin honors GWA cutoffs (inclusive max per band).
   * Summa 1.0000–1.1500 · Magna 1.1501–1.3500 · Cum Laude 1.3501–1.6000
   */
  HONOR_TIERS: [
    { label: 'Summa Cum Laude', max: 1.15, medal: 'gold' },
    { label: 'Magna Cum Laude', max: 1.35, medal: 'silver' },
    { label: 'Cum Laude', max: 1.6, medal: 'bronze' }
  ],
  /**
   * No final grade numerically worse than this (PUP: must have no grade lower than 2.50).
   * On the 1.00–5.00 scale, worse means a higher number.
   */
  HONOR_MIN_GRADE: 2.5,
  /**
   * Semester / year resident scholarship bands (indicative).
   * PL = President's Lister (GWA ≤ 1.50), DL = Dean's Lister (GWA ≤ 1.75).
   * Also requires no grade worse than 2.50 and no INC/W/DRP/5.00.
   */
  LISTER_TIERS: [
    { label: 'PL', name: "President's Lister", max: 1.5 },
    { label: 'DL', name: "Dean's Lister", max: 1.75 }
  ],
  LISTER_MIN_GRADE: 2.5,
  DAY_CODES: {
    /** S/S = two Saturday blocks (S1/S2), not Sunday */
    'S/S': ['Saturday', 'Saturday'],
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
  DRY_RUN: false,
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

  function siasUrlMatchesPath(url, basePath) {
    try {
      const cfg = globalThis.PUPSYNC;
      if (!cfg) return false;
      const s = String(url || '');
      const m = s.match(/^https?:\/\/([^/?#]+)(\/[^?#]*)?/i);
      if (!m) return false;
      if (!cfg.SIAS_HOST_PATTERN.test(m[1])) return false;
      const path = (m[2] || '/').replace(/\/+$/, '') || '/';
      const base = basePath.replace(/\/+$/, '');
      return path === base || path.startsWith(`${base}/`);
    } catch {
      return false;
    }
  }

  PUPSYNC.isSiasScheduleUrl = function isSiasScheduleUrl(url) {
    return siasUrlMatchesPath(url, PUPSYNC.SIAS_SCHEDULE_PATH);
  };

  PUPSYNC.isSiasGradesUrl = function isSiasGradesUrl(url) {
    return siasUrlMatchesPath(url, PUPSYNC.SIAS_GRADES_PATH);
  };

  PUPSYNC.isSiasHomeUrl = function isSiasHomeUrl(url) {
    return siasUrlMatchesPath(url, PUPSYNC.SIAS_HOME_PATH);
  };

  /** Any sis*.pup.edu.ph page (for greeting scrape). */
  PUPSYNC.isSiasHostUrl = function isSiasHostUrl(url) {
    try {
      const m = String(url || '').match(/^https?:\/\/([^/?#]+)/i);
      return !!(m && PUPSYNC.SIAS_HOST_PATTERN.test(m[1]));
    } catch {
      return false;
    }
  };

  globalThis.PUPSYNC = PUPSYNC;
}
