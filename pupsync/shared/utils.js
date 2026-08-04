/**
 * Schedule parsing and calendar event helpers.
 */
var PUPUtils = globalThis.PUPUtils;
if (!PUPUtils) {
  PUPUtils = {
  isSiasScheduleUrl(url) {
    return globalThis.PUPSYNC?.isSiasScheduleUrl?.(url) || false;
  },

  siasScheduleUrlForHost(hostname) {
    const base = globalThis.PUPSYNC?.SIAS_SCHEDULE_PATH || '/student/schedule';
    return `https://${hostname}${base}`;
  },

  siasPathUrlForHost(hostname, path) {
    const p = path || '/student/home';
    return `https://${hostname}${p.startsWith('/') ? p : `/${p}`}`;
  },

  /**
   * SIAS line: "LAST, FIRST MIDDLE (YYYY-#####-XX-#)" → first given name only.
   * "LAZARO, TROY LAUREN TAN (2024-03529-MN-0)" → "Troy"
   */
  parseSiasStudentName(text) {
    const raw = String(text || '').replace(/\s+/g, ' ').trim();
    const m = raw.match(
      /([A-Za-z][A-Za-z\s.'-]*?),\s*([A-Za-z][A-Za-z.'-]*)(?:\s+[A-Za-z][A-Za-z.'-]*)*\s*\(\d{4}-\d{5}-[A-Z]{2}-\d\)/
    );
    if (!m) return null;
    const token = m[2];
    const firstName =
      token.charAt(0).toUpperCase() + token.slice(1).toLowerCase();
    return {
      firstName,
      lastName: m[1].trim(),
      raw: m[0].trim()
    };
  },

  titleCaseWord(word) {
    const w = String(word || '');
    if (!w) return '';
    return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
  },

  /**
   * Strip section prefix: "1N - BSIT 2-1N - M/TH ..." -> "M/TH ..."
   */
  stripSectionPrefix(raw) {
    if (!raw || typeof raw !== 'string') return '';
    const trimmed = raw.trim();
    const parts = trimmed.split(' - ');
    if (parts.length >= 3) {
      return parts.slice(2).join(' - ').trim();
    }
    if (parts.length === 2) {
      return parts[1].trim();
    }
    return trimmed;
  },

  /**
   * Map one day token (longer codes first: TH before T).
   */
  mapDayToken(token) {
    const t = (token || '').trim();
    if (!t) return null;
    if (/^S\/S$/i.test(t)) return ['Saturday', 'Saturday'];
    const order = ['TH', 'SU', 'S', 'M', 'T', 'W', 'F'];
    for (const code of order) {
      if (t === code || t.toUpperCase() === code) {
        const mapped = PUPSYNC.DAY_CODES[code];
        if (Array.isArray(mapped)) return [...mapped];
        if (mapped) return [mapped];
      }
    }
    return null;
  },

  /**
   * Expand days part: "/" pairs with time slots (T/F → Tue + Fri).
   * S/S → two Saturday entries (S1, S2).
   */
  parseDayTokens(daysPart) {
    const part = (daysPart || '').trim();
    if (/^S\/S$/i.test(part)) {
      return ['Saturday', 'Saturday'];
    }
    const tokens = part.split('/').map((t) => t.trim()).filter(Boolean);
    const days = [];
    for (const token of tokens) {
      const mapped = this.mapDayToken(token);
      if (mapped) days.push(...mapped);
    }
    return days;
  },

  /** @deprecated use parseDayTokens — unique days only */
  parseDayCodes(daysPart) {
    return [...new Set(this.parseDayTokens(daysPart))];
  },

  slotDurationHours(time) {
    if (!time?.start || !time?.end) return 0;
    return (this.timeToMinutes(time.end) - this.timeToMinutes(time.start)) / 60;
  },

  parseUnitHours(value) {
    const n = parseFloat(String(value || '').replace(/[^\d.]/g, ''));
    return Number.isFinite(n) ? n : 0;
  },

  /**
   * Label each meeting as Lecture or Lab using Lec/Lab unit columns.
   * Connected same-day blocks (e.g. S/S) → all Lab when spans match lec+lab hours.
   */
  classifyMeetings(meetings, lectureHours, labHours) {
    if (!meetings?.length) return [];
    const lecH = this.parseUnitHours(lectureHours);
    const labH = this.parseUnitHours(labHours);
    const durations = meetings.map((m) => this.slotDurationHours(m.time));

    const allSameDay =
      meetings.length > 1 && meetings.every((m) => m.day === meetings[0].day);
    const totalH = durations.reduce((a, b) => a + b, 0);
    const connectedLab =
      allSameDay &&
      meetings.length >= 2 &&
      lecH > 0 &&
      labH > 0 &&
      Math.abs(totalH - (lecH + labH)) <= 0.75;

    if (connectedLab) {
      return meetings.map((m) => ({ ...m, type: 'Lab' }));
    }

    if (meetings.length === 1) {
      const d = durations[0];
      let type = 'Lecture';
      if (labH > 0 && lecH === 0) type = 'Lab';
      else if (labH > 0 && lecH > 0) {
        type =
          Math.abs(d - labH) < Math.abs(d - lecH) ? 'Lab' : 'Lecture';
      }
      return [{ ...meetings[0], type }];
    }

    if (meetings.length === 2 && lecH > 0 && labH > 0) {
      return [
        { ...meetings[0], type: 'Lecture' },
        { ...meetings[1], type: 'Lab' }
      ];
    }

    return meetings.map((m, i) => {
      const d = durations[i];
      let type = 'Lecture';
      if (labH > 0 && (lecH === 0 || Math.abs(d - labH) < Math.abs(d - lecH))) {
        type = 'Lab';
      }
      return { ...m, type };
    });
  },

  /**
   * Full parse: zip days with times, optional lec/lab classification.
   */
  parseScheduleWithHours(rawSchedule, lectureHours, labHours) {
    const base = this.parseScheduleString(rawSchedule);
    if (base.parseError) return base;
    const meetings = this.classifyMeetings(
      base.meetings,
      lectureHours,
      labHours
    );
    return { ...base, meetings };
  },

  to24h(timeStr) {
    const m = timeStr.trim().match(/^(\d{1,2}):(\d{2})(AM|PM)$/i);
    if (!m) throw new Error(`Invalid time: ${timeStr}`);
    let hour = parseInt(m[1], 10);
    const minute = m[2];
    const ampm = m[3].toUpperCase();
    if (ampm === 'AM') {
      if (hour === 12) hour = 0;
    } else if (hour !== 12) {
      hour += 12;
    }
    return `${String(hour).padStart(2, '0')}:${minute}`;
  },

  parseTimeRange(rangeStr) {
    const [startStr, endStr] = rangeStr.split('-');
    if (!startStr || !endStr) throw new Error(`Invalid range: ${rangeStr}`);
    return {
      start: this.to24h(startStr),
      end: this.to24h(endStr)
    };
  },

  /**
   * SIAS puts "Faculty: …" inside the Schedule cell (not a separate row).
   */
  splitScheduleCell(text) {
    const raw = (text || '').trim();
    const facultyMatch = raw.match(/Faculty:\s*(.+)/is);
    const faculty = facultyMatch
      ? facultyMatch[1].replace(/\s+/g, ' ').trim()
      : '';
    const scheduleOnly = raw.split(/Faculty:/i)[0].replace(/\s+/g, ' ').trim();
    return { scheduleOnly, faculty };
  },

  /**
   * Parse schedule tail after section prefix.
   * Days and times pair by "/" index (T/F + time1/time2 → Tue@time1, Fri@time2).
   * @returns {{ section, days, daysPart, meetings, lectureTime, labTime, parseError? }}
   */
  parseScheduleString(rawSchedule) {
    const raw = (rawSchedule || '').trim();
    let section = '';
    let tail = raw;
    const idx1 = raw.indexOf(' - ');
    if (idx1 !== -1) {
      const idx2 = raw.indexOf(' - ', idx1 + 3);
      if (idx2 !== -1) {
        section = raw.slice(0, idx2).trim();
        tail = raw.slice(idx2 + 3).trim();
      }
    }

    try {
      const tailPart = tail;
      const spaceIdx = tailPart.indexOf(' ');
      if (spaceIdx === -1) {
        throw new Error('Missing days/times');
      }
      const daysPart = tailPart.slice(0, spaceIdx).trim();
      const timesPart = tailPart.slice(spaceIdx + 1).trim();
      const dayTokens = this.parseDayTokens(daysPart);
      const timeSlots = timesPart
        .split('/')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((s) => this.parseTimeRange(s));
      if (!dayTokens.length || !timeSlots.length) {
        throw new Error('Empty days or times');
      }
      if (dayTokens.length !== timeSlots.length) {
        throw new Error(
          `Day slots (${dayTokens.length}) do not match time slots (${timeSlots.length})`
        );
      }
      const meetings = dayTokens.map((day, i) => ({
        day,
        time: timeSlots[i]
      }));
      const days = [...new Set(dayTokens)];
      return {
        section,
        daysPart,
        days,
        meetings,
        lectureTime: timeSlots[0] || null,
        labTime: timeSlots[1] || null
      };
    } catch (err) {
      return {
        section: section || '',
        daysPart: '',
        days: [],
        meetings: [],
        lectureTime: null,
        labTime: null,
        parseError: err.message
      };
    }
  },

  formatTime12h(time24) {
    const [h, m] = time24.split(':').map(Number);
    const ampm = h >= 12 ? 'PM' : 'AM';
    let hour = h % 12;
    if (hour === 0) hour = 12;
    return `${hour}:${String(m).padStart(2, '0')}${ampm}`;
  },

  timeToMinutes(time24) {
    const [h, m] = time24.split(':').map(Number);
    return h * 60 + m;
  },

  WEEK_DAYS: [
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
    'Sunday'
  ],

  WEEK_DAY_SHORT: {
    Monday: 'M',
    Tuesday: 'T',
    Wednesday: 'W',
    Thursday: 'TH',
    Friday: 'F',
    Saturday: 'S',
    Sunday: 'Su'
  },

  /** Stable numeric seed from a string (for color shuffle). */
  hashSeed(str) {
    let h = 2166136261;
    const s = String(str || '');
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  },

  /**
   * Assign Google Calendar colors to subjects that have none yet.
   * Shuffles palette per term seed so colors look varied but stay stable.
   */
  autoAssignSubjectColors(subjects, subjectColors, seed) {
    const colors = { ...(subjectColors || {}) };
    const missing = (subjects || []).filter(
      (s) => !s.excluded && !s.parseError && !colors[s.subjectCode]
    );
    if (!missing.length) return colors;

    const palette = [...PUPSYNC.COLORS];
    let state = this.hashSeed(seed || 'pupsync-default');
    for (let i = palette.length - 1; i > 0; i--) {
      state = (Math.imul(state, 1103515245) + 12345) >>> 0;
      const j = state % (i + 1);
      [palette[i], palette[j]] = [palette[j], palette[i]];
    }

    const used = new Set(Object.values(colors));
    let pi = 0;
    for (const subject of missing) {
      while (pi < palette.length && used.has(palette[pi].label)) pi++;
      const pick =
        pi < palette.length
          ? palette[pi++]
          : palette[this.hashSeed(subject.subjectCode) % palette.length];
      colors[subject.subjectCode] = pick.label;
      used.add(pick.label);
    }
    return colors;
  },

  /**
   * Flatten subjects into timed blocks (one per day × slot type).
   * @param {object} [subjectChipLabels] map subjectCode → custom chip title
   */
  expandScheduleBlocks(subjects, subjectColors, subjectChipLabels = {}) {
    const blocks = [];
    const maxLen = PUPSYNC.CHIP_LABEL_MAX_LENGTH || 12;
    for (const subject of subjects || []) {
      if (subject.excluded || subject.parseError) continue;
      const colorLabel =
        subjectColors[subject.subjectCode] || PUPSYNC.DEFAULT_COLOR_LABEL;
      const color = PUPSYNC.COLOR_BY_LABEL[colorLabel] || PUPSYNC.COLORS[6];
      const custom = String(
        subjectChipLabels[subject.subjectCode] || subject.chipLabel || ''
      )
        .trim()
        .slice(0, maxLen);
      const addMeeting = (meeting) => {
        if (!meeting?.time) return;
        blocks.push({
          subjectCode: subject.subjectCode,
          description: subject.description,
          section: subject.section || '',
          day: meeting.day,
          type: meeting.type || 'Lecture',
          startMin: this.timeToMinutes(meeting.time.start),
          endMin: this.timeToMinutes(meeting.time.end),
          colorHex: color.hex,
          colorLabel: color.label,
          timeLabel: `${this.formatTime12h(meeting.time.start)}–${this.formatTime12h(meeting.time.end)}`,
          chipLabel: custom || ''
        });
      };
      if (subject.meetings?.length) {
        for (const m of subject.meetings) addMeeting(m);
      } else {
        const addSlot = (time, type) => {
          if (!time || !subject.days?.length) return;
          for (const day of subject.days) {
            addMeeting({ day, time, type });
          }
        };
        addSlot(subject.lectureTime, 'Lecture');
        addSlot(subject.labTime, 'Lab');
      }
    }
    return blocks;
  },

  assignBlockLanes(blocks) {
    const byDay = {};
    for (const block of blocks) {
      if (!byDay[block.day]) byDay[block.day] = [];
      byDay[block.day].push(block);
    }
    for (const dayBlocks of Object.values(byDay)) {
      dayBlocks.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);
      const laneEnds = [];
      for (const block of dayBlocks) {
        let lane = laneEnds.findIndex((end) => block.startMin >= end);
        if (lane === -1) {
          lane = laneEnds.length;
          laneEnds.push(block.endMin);
        } else {
          laneEnds[lane] = block.endMin;
        }
        block.lane = lane;
      }
      const laneCount = laneEnds.length || 1;
      for (const block of dayBlocks) {
        block.laneCount = laneCount;
      }
    }
    return blocks;
  },

  /**
   * Layout model for the popup week grid.
   */
  buildWeekGridModel(subjects, subjectColors, options = {}) {
    const pxPerMin = options.pxPerMin ?? 0.55;
    const padMin = options.padMinutes ?? 30;
    const chipLabels = options.subjectChipLabels || {};
    let blocks = this.expandScheduleBlocks(
      subjects,
      subjectColors,
      chipLabels
    );
    blocks = this.assignBlockLanes(blocks);

    let startMin = 7 * 60;
    let endMin = 22 * 60;
    if (blocks.length) {
      startMin = Math.min(...blocks.map((b) => b.startMin)) - padMin;
      endMin = Math.max(...blocks.map((b) => b.endMin)) + padMin;
      startMin = Math.floor(startMin / 60) * 60;
      endMin = Math.ceil(endMin / 60) * 60;
    }

    const spanMin = Math.max(endMin - startMin, 60);
    const totalHeight = Math.round(spanMin * pxPerMin);
    const hourLabels = [];
    for (let m = startMin; m <= endMin; m += 60) {
      const h24 = `${String(Math.floor(m / 60)).padStart(2, '0')}:00`;
      hourLabels.push({
        minutes: m,
        label: this.formatTime12h(h24),
        top: Math.round((m - startMin) * pxPerMin)
      });
    }

    for (const block of blocks) {
      block.top = Math.round((block.startMin - startMin) * pxPerMin);
      block.height = Math.max(
        14,
        Math.round((block.endMin - block.startMin) * pxPerMin) - 2
      );
      const laneCount = block.laneCount || 1;
      const lane = block.lane || 0;
      block.widthPct = 100 / laneCount;
      block.leftPct = lane * block.widthPct;
    }

    return {
      days: this.WEEK_DAYS,
      dayShort: this.WEEK_DAY_SHORT,
      startMin,
      endMin,
      spanMin,
      totalHeight,
      pxPerMin,
      hourLabels,
      blocks
    };
  },

  scheduleTag(entry) {
    if (entry.parseError) return 'Could not parse schedule';
    const dayAbbrev = (day) => {
      const map = {
        Monday: 'M',
        Tuesday: 'T',
        Wednesday: 'W',
        Thursday: 'TH',
        Friday: 'F',
        Saturday: 'S',
        Sunday: 'Su'
      };
      return map[day] || day.slice(0, 2);
    };
    if (entry.daysPart) {
      const times =
        entry.meetings?.map(
          (m) =>
            `${this.formatTime12h(m.time.start)}–${this.formatTime12h(m.time.end)}`
        ) ||
        [];
      if (times.length) {
        return `${entry.daysPart} · ${times.join(' / ')}`;
      }
    }
    const daysStr = (entry.days || []).map(dayAbbrev).join('/');
    const lec = entry.lectureTime
      ? `${this.formatTime12h(entry.lectureTime.start)}–${this.formatTime12h(entry.lectureTime.end)}`
      : '';
    const lab = entry.labTime
      ? ` / ${this.formatTime12h(entry.labTime.start)}–${this.formatTime12h(entry.labTime.end)}`
      : '';
    return `${daysStr} · ${lec}${lab}`;
  },

  getMondayOnOrBefore(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    d.setDate(d.getDate() + diff);
    d.setHours(0, 0, 0, 0);
    return d;
  },

  /** First Monday on or after the given date (semester start convention). */
  getMondayOnOrAfter(date) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    const add = (1 - d.getDay() + 7) % 7;
    d.setDate(d.getDate() + add);
    return d;
  },

  parseTermHeader(text) {
    const normalized = (text || '').replace(/\s+/g, ' ').trim();
    const m = normalized.match(PUPSYNC.TERM_HEADER_PATTERN);
    if (!m) return null;
    return {
      schoolYearCode: m[1],
      semester: (m[2] || 'Unknown').trim(),
      raw: normalized
    };
  },

  parseSchoolYearCode(code) {
    const s = String(code || '');
    if (!/^\d{4}$/.test(s)) return null;
    const y1 = 2000 + parseInt(s.slice(0, 2), 10);
    const y2 = 2000 + parseInt(s.slice(2, 4), 10);
    const startYear = Math.min(y1, y2);
    const endYear = Math.max(y1, y2);
    return {
      startYear,
      endYear,
      label: `SY ${s} (${startYear}–${endYear})`
    };
  },

  /**
   * Map PUP school year + semester label to calendar date range (inferred; user can override).
   */
  deriveSemesterDatesFromTerm(term) {
    if (!term?.schoolYearCode) return null;
    const years = this.parseSchoolYearCode(term.schoolYearCode);
    if (!years) return null;

    const sem = (term.semester || '').toLowerCase();
    let rangeStart;
    let rangeEnd;

    if (sem.includes('first')) {
      rangeStart = new Date(years.startYear, 7, 1);
      rangeEnd = new Date(years.startYear, 11, 20);
    } else if (sem.includes('second')) {
      rangeStart = new Date(years.endYear, 0, 1);
      rangeEnd = new Date(years.endYear, 4, 31);
    } else if (sem.includes('third')) {
      rangeStart = new Date(years.endYear, 5, 1);
      rangeEnd = new Date(years.endYear, 6, 30);
    } else if (sem.includes('summer') || sem.includes('midyear')) {
      rangeStart = new Date(years.endYear, 5, 1);
      rangeEnd = new Date(years.endYear, 7, 15);
    } else {
      return null;
    }

    const semName = term.semester.replace(/\s*semester\s*/i, '').trim() || term.semester;
    return {
      schoolYearCode: term.schoolYearCode,
      semester: term.semester,
      displayLabel: `${years.label} · ${semName} Semester`,
      shortLabel: `SY ${term.schoolYearCode} · ${semName}`,
      semesterStart: this.toISODate(this.getMondayOnOrAfter(rangeStart)),
      semesterEnd: this.toISODate(rangeEnd),
      startYear: years.startYear,
      endYear: years.endYear,
      raw: term.raw || null
    };
  },

  findTermOnPage(doc) {
    const root = doc || (typeof document !== 'undefined' ? document : null);
    if (!root?.body) return null;

    const selectors =
      'h1, h2, h3, h4, h5, p, legend, caption, th, td, label, strong, b';
    for (const el of root.querySelectorAll(selectors)) {
      const text = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (!text || text.length > 120) continue;
      const parsed = this.parseTermHeader(text);
      if (parsed) return parsed;
    }

    const chunk = (root.body.innerText || '').slice(0, 8000);
    return this.parseTermHeader(chunk);
  },

  buildTermInfo(termHeader) {
    if (!termHeader) return null;
    if (typeof SemesterConfig !== 'undefined') {
      const fromConfig = SemesterConfig.buildTermInfo(termHeader);
      if (fromConfig) return fromConfig;
    }
    return this.deriveSemesterDatesFromTerm(termHeader);
  },

  getDefaultSemesterDates() {
    const start = this.getMondayOnOrBefore(new Date());
    const end = new Date(start);
    end.setDate(end.getDate() + 18 * 7 - 1);
    return {
      start: this.toISODate(start),
      end: this.toISODate(end)
    };
  },

  toISODate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  parseISODate(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d);
  },

  /**
   * First occurrence of weekday on or after semesterStart.
   */
  firstOccurrenceDate(semesterStartISO, dayName) {
    const target = {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6
    }[dayName];
    if (target === undefined) throw new Error(`Unknown day: ${dayName}`);
    const start = this.parseISODate(semesterStartISO);
    start.setHours(0, 0, 0, 0);
    const current = start.getDay();
    let add = target - current;
    if (add < 0) add += 7;
    start.setDate(start.getDate() + add);
    return start;
  },

  buildRRule(dayName, semesterEndISO) {
    const byday = PUPSYNC.DAY_TO_BYDAY[dayName];
    const end = this.parseISODate(semesterEndISO);
    end.setHours(23, 59, 59, 0);
    const until =
      end.getUTCFullYear() +
      String(end.getUTCMonth() + 1).padStart(2, '0') +
      String(end.getUTCDate()).padStart(2, '0') +
      'T235959Z';
    return `RRULE:FREQ=WEEKLY;BYDAY=${byday};UNTIL=${until}`;
  },

  buildDateTimeISO(date, time24) {
    const [h, m] = time24.split(':').map(Number);
    const y = date.getFullYear();
    const mo = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    return `${y}-${mo}-${d}T${hh}:${mm}:00+08:00`;
  },

  /**
   * No-class ISO dates that fall on this weekday between first occurrence and semester end.
   */
  filterNoClassDatesForSlot(noClassDates, dayName, firstOccDate, semesterEndISO) {
    if (!noClassDates?.length) return [];
    const target = {
      Sunday: 0,
      Monday: 1,
      Tuesday: 2,
      Wednesday: 3,
      Thursday: 4,
      Friday: 5,
      Saturday: 6
    }[dayName];
    if (target === undefined) return [];

    const start = new Date(firstOccDate);
    start.setHours(0, 0, 0, 0);
    const end = this.parseISODate(semesterEndISO);
    end.setHours(0, 0, 0, 0);

    return noClassDates.filter((iso) => {
      const d = this.parseISODate(iso);
      if (Number.isNaN(d.getTime())) return false;
      d.setHours(0, 0, 0, 0);
      if (d.getDay() !== target) return false;
      if (d < start || d > end) return false;
      return true;
    });
  },

  /**
   * Google Calendar EXDATE line; times must match event start.
   * e.g. EXDATE;TZID=Asia/Manila:20260831T090000,20261102T090000
   */
  buildExdateLine(isoDates, time24) {
    if (!isoDates?.length) return null;
    const [h, m] = time24.split(':').map(Number);
    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    const stamps = isoDates.map((iso) => {
      const [y, mo, d] = iso.split('-');
      return `${y}${mo}${d}T${hh}${mm}00`;
    });
    return `EXDATE;TZID=${PUPSYNC.TIMEZONE}:${stamps.join(',')}`;
  },

  /**
   * Expand subjects into calendar event payloads.
   * Uses subject.calendarTitle when set, otherwise SIAS description, for the event summary.
   * @param {string[]} [noClassDates] YYYY-MM-DD holidays/vacations/exams to EXDATE
   */
  buildCalendarEvents(subjects, semesterStart, semesterEnd, subjectColors, noClassDates) {
    const skipDates = Array.isArray(noClassDates) ? noClassDates : [];
    const events = [];
    for (const subject of subjects) {
      if (subject.excluded || subject.parseError) continue;
      const colorLabel =
        subjectColors[subject.subjectCode] || PUPSYNC.DEFAULT_COLOR_LABEL;
      const color = PUPSYNC.COLOR_BY_LABEL[colorLabel] || PUPSYNC.COLORS[6];
      const eventTitle =
        String(subject.calendarTitle || '').trim() ||
        subject.description ||
        subject.subjectCode;
      const slots = [];
      if (subject.meetings?.length) {
        for (const m of subject.meetings) {
          slots.push({
            day: m.day,
            time: m.time,
            type: m.type || 'Lecture'
          });
        }
      } else if (subject.lectureTime && subject.days?.length) {
        for (const day of subject.days) {
          slots.push({ day, time: subject.lectureTime, type: 'Lecture' });
        }
        if (subject.labTime) {
          for (const day of subject.days) {
            slots.push({ day, time: subject.labTime, type: 'Lab' });
          }
        }
      }
      for (const slot of slots) {
        const occ = this.firstOccurrenceDate(semesterStart, slot.day);
        const recurrence = [this.buildRRule(slot.day, semesterEnd)];
        const exDates = this.filterNoClassDatesForSlot(
          skipDates,
          slot.day,
          occ,
          semesterEnd
        );
        const exLine = this.buildExdateLine(exDates, slot.time.start);
        if (exLine) recurrence.push(exLine);

        events.push({
          subjectCode: subject.subjectCode,
          description: eventTitle,
          faculty: subject.faculty,
          section: subject.section,
          day: slot.day,
          type: slot.type,
          colorLabel: color.label,
          colorHex: color.hex,
          colorId: color.colorId,
          startDisplay: `${this.formatTime12h(slot.time.start)}–${this.formatTime12h(slot.time.end)}`,
          payload: {
            summary: `[${subject.subjectCode}] ${eventTitle}`,
            description: `Faculty: ${subject.faculty || 'N/A'}\nSection: ${subject.section || 'N/A'}\nType: ${slot.type}`,
            colorId: color.colorId,
            start: {
              dateTime: this.buildDateTimeISO(occ, slot.time.start),
              timeZone: PUPSYNC.TIMEZONE
            },
            end: {
              dateTime: this.buildDateTimeISO(occ, slot.time.end),
              timeZone: PUPSYNC.TIMEZONE
            },
            recurrence
          }
        });
      }
    }
    return events;
  },

  /** True if a subject code belongs to an NSTP component (excluded from GWA). */
  isGwaExcluded(code) {
    const c = String(code || '').toUpperCase();
    const prefixes = PUPSYNC.GWA_EXCLUDED_PREFIXES || [];
    return prefixes.some((p) => c.startsWith(p));
  },

  /** Parse a PUP final grade cell to a number, or null if non-numeric. */
  parseGrade(text) {
    const s = String(text || '').replace(/\s+/g, ' ').trim();
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
  },

  /**
   * Classify a SIAS final-grade cell for GWA / Latin honors.
   * Pending blanks ("—") and Pass (P) are ignored — not disqualifiers.
   * INC / W / DRP / 5.00 disqualify Latin honors.
   */
  classifyFinalGrade(grade, gradeText) {
    if (grade != null && Number.isFinite(Number(grade))) {
      const n = Number(grade);
      if (n >= 5) {
        return { kind: 'deficiency', grade: n, label: n.toFixed(2) };
      }
      return { kind: 'numeric', grade: n };
    }
    const raw = String(gradeText || '')
      .replace(/\s+/g, ' ')
      .trim();
    const s = raw.toUpperCase();
    if (
      !s ||
      s === '—' ||
      s === '-' ||
      s === '–' ||
      s === 'N/A' ||
      s === 'NA' ||
      s === 'NONE' ||
      s === 'NULL'
    ) {
      return { kind: 'pending' };
    }
    if (['P', 'PASS', 'PASSED'].includes(s)) {
      return { kind: 'pass', label: raw };
    }
    if (
      ['INC', 'INCOMPLETE', 'W', 'WITHDRAWN', 'DRP', 'DROPPED', 'DROP', 'DR'].includes(
        s
      )
    ) {
      return { kind: 'deficiency', label: raw || s };
    }
    // Unknown letter marks: do not invent meaning (not GWA, not Latin DQ).
    return { kind: 'pending', label: raw };
  },

  /**
   * Compute GWA + Latin honors standing from scraped grade semesters.
   * NSTP excluded from GWA. Pending/blank grades ignored. INC/W/DRP/5.00 DQ.
   * @param {Array<{label?:string, subjects:Array<{subjectCode:string,units:(string|number),grade:(number|null),gradeText?:string}>}>} semesters
   */
  computeAcademicStanding(semesters) {
    const tiers = PUPSYNC.HONOR_TIERS || [];
    const minGrade = PUPSYNC.HONOR_MIN_GRADE ?? 2.5;

    let weighted = 0;
    let totalUnits = 0;
    let countedSubjects = 0;
    const disqualifiers = [];
    const perSemester = [];

    for (const sem of semesters || []) {
      let sw = 0;
      let su = 0;
      for (const subj of sem.subjects || []) {
        if (this.isGwaExcluded(subj.subjectCode)) continue;
        const units = parseFloat(subj.units);
        const classified = this.classifyFinalGrade(subj.grade, subj.gradeText);

        if (classified.kind === 'pending' || classified.kind === 'pass') {
          continue;
        }
        if (classified.kind === 'deficiency') {
          const mark = classified.label || classified.grade?.toFixed?.(2) || 'deficiency';
          disqualifiers.push(`${subj.subjectCode}: ${mark}`);
          if (
            classified.grade != null &&
            Number.isFinite(units) &&
            units > 0
          ) {
            weighted += classified.grade * units;
            totalUnits += units;
            countedSubjects += 1;
            sw += classified.grade * units;
            su += units;
          }
          continue;
        }

        const grade = classified.grade;
        if (!Number.isFinite(units) || units <= 0) continue;
        weighted += grade * units;
        totalUnits += units;
        countedSubjects += 1;
        sw += grade * units;
        su += units;
        if (grade > minGrade) {
          disqualifiers.push(
            `${subj.subjectCode}: grade ${grade.toFixed(2)} below ${minGrade.toFixed(2)}`
          );
        }
      }
      perSemester.push({
        label: sem.label || '',
        schoolYearCode: sem.schoolYearCode || null,
        semester: sem.semester || null,
        gwa: su > 0 ? weighted0(sw / su) : null,
        units: su
      });
    }

    const gwa = totalUnits > 0 ? weighted0(weighted / totalUnits) : null;
    let tier = null;
    if (gwa != null) {
      for (const t of tiers) {
        if (gwa <= t.max) {
          tier = t.label;
          break;
        }
      }
    }
    const disqualified = disqualifiers.length > 0;
    return {
      gwa,
      totalUnits,
      countedSubjects,
      perSemester,
      tier: disqualified ? null : tier,
      qualifiesTier: tier,
      disqualified,
      disqualifiers
    };

    function weighted0(n) {
      return Math.round(n * 100) / 100;
    }
  },

  /**
   * Indicative President's / Dean's Lister badge for a set of subjects.
   * PL: GWA ≤ 1.50 · DL: GWA ≤ 1.75 · no grade worse than 2.50 · no INC/W/DRP/5.00.
   * Pending ("—") grades → no badge yet. NSTP excluded from GWA only.
   * @returns {{ badge: ('PL'|'DL'|null), gwa: (number|null), eligible: boolean }}
   */
  computeListerBadge(subjects) {
    const tiers = PUPSYNC.LISTER_TIERS || [];
    const minGrade = PUPSYNC.LISTER_MIN_GRADE ?? PUPSYNC.HONOR_MIN_GRADE ?? 2.5;
    let weighted = 0;
    let totalUnits = 0;
    let eligible = true;
    let hasCounted = false;

    for (const subj of subjects || []) {
      const classified = this.classifyFinalGrade(subj.grade, subj.gradeText);
      const excluded = this.isGwaExcluded(subj.subjectCode);

      if (classified.kind === 'pending') {
        if (!excluded) eligible = false;
        continue;
      }
      if (classified.kind === 'deficiency') {
        eligible = false;
        if (
          classified.grade != null &&
          !excluded &&
          Number.isFinite(parseFloat(subj.units)) &&
          parseFloat(subj.units) > 0
        ) {
          const u = parseFloat(subj.units);
          weighted += classified.grade * u;
          totalUnits += u;
          hasCounted = true;
        }
        continue;
      }
      if (classified.kind === 'pass') continue;

      const grade = classified.grade;
      if (grade > minGrade) eligible = false;
      if (excluded) continue;
      const units = parseFloat(subj.units);
      if (!Number.isFinite(units) || units <= 0) continue;
      weighted += grade * units;
      totalUnits += units;
      hasCounted = true;
    }

    const gwa = totalUnits > 0 ? Math.round((weighted / totalUnits) * 100) / 100 : null;
    let badge = null;
    if (eligible && gwa != null && hasCounted) {
      for (const t of tiers) {
        if (gwa <= t.max) {
          badge = t.label;
          break;
        }
      }
    }
    return { badge, gwa, eligible: !!(eligible && badge) };
  },

  /**
   * Group scraped semesters into school-year → semester → subjects for UI.
   * Attaches per-semester / per-year GWA using the same rules as standing.
   */
  buildGradesBreakdown(semesters) {
    const standing = this.computeAcademicStanding(semesters);
    const yearMap = new Map();

    (semesters || []).forEach((sem, i) => {
      const stats = standing.perSemester[i] || {};
      const code = sem.schoolYearCode || 'unknown';
      if (!yearMap.has(code)) {
        yearMap.set(code, {
          schoolYearCode: code === 'unknown' ? null : code,
          label:
            code === 'unknown'
              ? 'School year'
              : `SY ${code}`,
          semesters: [],
          weighted: 0,
          units: 0,
          allSubjects: []
        });
      }
      const year = yearMap.get(code);
      const subjects = (sem.subjects || []).map((subj) => {
        const excluded = this.isGwaExcluded(subj.subjectCode);
        const classified = this.classifyFinalGrade(subj.grade, subj.gradeText);
        const minGrade = PUPSYNC.HONOR_MIN_GRADE ?? 2.5;
        const grade =
          classified.kind === 'numeric' || classified.kind === 'deficiency'
            ? classified.grade ?? null
            : null;
        return {
          ...subj,
          excluded,
          failing:
            !excluded &&
            classified.kind === 'numeric' &&
            grade != null &&
            grade > minGrade,
          deficiency: !excluded && classified.kind === 'deficiency',
          nonNumeric: !excluded && classified.kind === 'deficiency'
        };
      });
      const lister = this.computeListerBadge(subjects);
      year.semesters.push({
        label: sem.label || stats.label || 'Semester',
        semester: sem.semester || null,
        gwa: stats.gwa ?? null,
        units: stats.units ?? 0,
        subjects,
        lister: lister.badge,
        listerName:
          (PUPSYNC.LISTER_TIERS || []).find((t) => t.label === lister.badge)
            ?.name || null
      });
      year.allSubjects.push(...subjects);
      if (stats.gwa != null && stats.units > 0) {
        year.weighted += stats.gwa * stats.units;
        year.units += stats.units;
      }
    });

    const years = [...yearMap.values()].map((y) => {
      const yearLister = this.computeListerBadge(y.allSubjects);
      return {
        schoolYearCode: y.schoolYearCode,
        label: y.label,
        gwa: y.units > 0 ? Math.round((y.weighted / y.units) * 100) / 100 : null,
        units: y.units,
        semesters: y.semesters,
        lister: yearLister.badge,
        listerName:
          (PUPSYNC.LISTER_TIERS || []).find((t) => t.label === yearLister.badge)
            ?.name || null
      };
    });

    return { years, standing };
  },

  /**
   * Home hub snapshot from scraped grades (cached). No live SIAS home overview.
   * Omits Academic Status (not present in grade tables).
   */
  buildGradesHomeSnapshot(semesters) {
    const standing = this.computeAcademicStanding(semesters);
    let enrolled = 0;
    let dropped = 0;
    let failed = 0;
    let subjectsAsOf = '';

    for (const sem of semesters || []) {
      if (sem?.label) subjectsAsOf = String(sem.label).trim();
      else if (sem?.schoolYearCode || sem?.semester) {
        const sy = sem.schoolYearCode ? `SY ${sem.schoolYearCode}` : '';
        const term = sem.semester ? `${sem.semester} Semester` : '';
        subjectsAsOf = [term, sy].filter(Boolean).join(' · ') || subjectsAsOf;
      }
      for (const subj of sem?.subjects || []) {
        enrolled += 1;
        const blob = `${subj.status || ''} ${subj.gradeText || ''}`.toLowerCase();
        if (/\b(drp|drop|dropped|withdrawn|withdraw)\b/.test(blob)) {
          dropped += 1;
          continue;
        }
        if (subj.grade != null && Number(subj.grade) >= 5) {
          failed += 1;
          continue;
        }
        if (/\bfail/.test(blob)) failed += 1;
      }
    }

    if (!subjectsAsOf && standing.perSemester?.length) {
      const last = standing.perSemester[standing.perSemester.length - 1];
      subjectsAsOf = last?.label || '';
    }

    return {
      gwa: standing.gwa,
      totalUnits: standing.totalUnits,
      tier: standing.tier || null,
      qualifiesTier: standing.qualifiesTier || null,
      disqualified: !!standing.disqualified,
      unitsEarned:
        standing.totalUnits != null ? String(standing.totalUnits) : null,
      subjectsAsOf: subjectsAsOf || null,
      enrolled,
      dropped,
      failed
    };
  },

  /** Strip tags for Node fixture tests (not a full HTML parser). */
  htmlToPlainText(html) {
    return String(html || '')
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|h\d|li|section|article|header)>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{2,}/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }
  };
  globalThis.PUPUtils = PUPUtils;
}
