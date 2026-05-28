/**
 * Schedule parsing and calendar event helpers.
 */
const PUPUtils = {
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
   * Parse day codes from days part (after S/S tokenization).
   */
  parseDayCodes(daysPart) {
    const tokenized = daysPart.replace(/S\/S/g, '\u0000SS\u0000');
    const tokens = tokenized.split('/').map((t) => t.trim()).filter(Boolean);
    const days = [];
    for (const token of tokens) {
      if (token === '\u0000SS\u0000' || token === 'SS') {
        days.push('Saturday', 'Sunday');
        continue;
      }
      const mapped = PUPSYNC.DAY_CODES[token];
      if (Array.isArray(mapped)) {
        days.push(...mapped);
      } else if (mapped) {
        days.push(mapped);
      }
    }
    return [...new Set(days)];
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
   * Parse schedule tail after section prefix.
   * @returns {{ section: string, days: string[], lectureTime: object, labTime: object|null, parseError?: string }}
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
      const days = this.parseDayCodes(daysPart);
      const timeSlots = timesPart.split('/').map((s) => s.trim()).filter(Boolean);
      if (!days.length || !timeSlots.length) {
        throw new Error('Empty days or times');
      }
      const lectureTime = this.parseTimeRange(timeSlots[0]);
      const labTime = timeSlots[1] ? this.parseTimeRange(timeSlots[1]) : null;
      return { section, days, lectureTime, labTime };
    } catch (err) {
      return {
        section: section || '',
        days: [],
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
    const daysStr = entry.days.map(dayAbbrev).join('/');
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
   * Expand subjects into calendar event payloads.
   */
  buildCalendarEvents(subjects, semesterStart, semesterEnd, subjectColors) {
    const events = [];
    for (const subject of subjects) {
      if (subject.excluded || subject.parseError) continue;
      const colorLabel =
        subjectColors[subject.subjectCode] || PUPSYNC.DEFAULT_COLOR_LABEL;
      const color = PUPSYNC.COLOR_BY_LABEL[colorLabel] || PUPSYNC.COLORS[6];
      const slots = [];
      if (subject.lectureTime && subject.days?.length) {
        for (const day of subject.days) {
          slots.push({ day, time: subject.lectureTime, type: 'Lecture' });
        }
      }
      if (subject.labTime && subject.days?.length) {
        for (const day of subject.days) {
          slots.push({ day, time: subject.labTime, type: 'Lab' });
        }
      }
      for (const slot of slots) {
        const occ = this.firstOccurrenceDate(semesterStart, slot.day);
        events.push({
          subjectCode: subject.subjectCode,
          description: subject.description,
          faculty: subject.faculty,
          section: subject.section,
          day: slot.day,
          type: slot.type,
          colorLabel: color.label,
          colorHex: color.hex,
          colorId: color.colorId,
          startDisplay: `${this.formatTime12h(slot.time.start)}–${this.formatTime12h(slot.time.end)}`,
          payload: {
            summary: `[${subject.subjectCode}] ${subject.description}`,
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
            recurrence: [this.buildRRule(slot.day, semesterEnd)]
          }
        });
      }
    }
    return events;
  }
};
