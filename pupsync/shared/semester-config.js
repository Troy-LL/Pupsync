/**
 * Loads academic-calendar.csv and resolves semester start/end dates.
 */
const SemesterConfig = {
  overrides: new Map(),
  rules: new Map(),
  loaded: false,
  loadError: null,

  normalizeSemester(name) {
    return (name || '')
      .replace(/\s*semester\s*/gi, '')
      .trim()
      .toLowerCase();
  },

  key(schoolYearCode, semester) {
    return `${schoolYearCode}|${this.normalizeSemester(semester)}`;
  },

  parseCsvLine(line) {
    const parts = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (ch === ',' && !inQuotes) {
        parts.push(cur.trim());
        cur = '';
        continue;
      }
      cur += ch;
    }
    parts.push(cur.trim());
    return parts;
  },

  parseCsv(text) {
    this.overrides.clear();
    this.rules.clear();
    const lines = text.split(/\r?\n/);
    let headers = null;

    for (const raw of lines) {
      const line = raw.trim();
      if (!line || line.startsWith('#')) continue;

      const cols = this.parseCsvLine(line);
      if (!headers) {
        headers = cols.map((h) => h.toLowerCase());
        continue;
      }

      const row = {};
      headers.forEach((h, i) => {
        row[h] = cols[i] || '';
      });

      const code = row.school_year_code || '*';
      const semester = row.semester;
      if (!semester) continue;

      const startDate = row.start_date || '';
      const endDate = row.end_date || '';

      if (startDate && endDate) {
        this.overrides.set(this.key(code, semester), {
          startDate,
          endDate,
          source: 'csv-override',
          notes: row.notes || ''
        });
        continue;
      }

      if (code !== '*') continue;

      this.rules.set(this.normalizeSemester(semester), {
        startMonth: parseInt(row.start_month, 10),
        startDay: parseInt(row.start_day, 10),
        endMonth: parseInt(row.end_month, 10),
        endDay: parseInt(row.end_day, 10),
        syYearPart: (row.sy_year_part || 'start').toLowerCase(),
        source: 'csv-rule',
        notes: row.notes || ''
      });
    }
  },

  async load() {
    if (this.loaded) return;
    try {
      const url =
        typeof chrome !== 'undefined' && chrome.runtime?.getURL
          ? chrome.runtime.getURL('config/academic-calendar.csv')
          : '/config/academic-calendar.csv';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      this.parseCsv(text);
      this.loadError = null;
    } catch (err) {
      this.loadError = err.message;
      console.warn('[PUPSync] academic-calendar.csv not loaded:', err.message);
    }
    this.loaded = true;
  },

  resolveYears(schoolYearCode) {
    const s = String(schoolYearCode || '');
    if (!/^\d{4}$/.test(s)) return null;
    const y1 = 2000 + parseInt(s.slice(0, 2), 10);
    const y2 = 2000 + parseInt(s.slice(2, 4), 10);
    return {
      startYear: Math.min(y1, y2),
      endYear: Math.max(y1, y2),
      label: `SY ${s} (${Math.min(y1, y2)}–${Math.max(y1, y2)})`
    };
  },

  applyRule(rule, years) {
    const year =
      rule.syYearPart === 'end' ? years.endYear : years.startYear;
    const rangeStart = new Date(year, rule.startMonth - 1, rule.startDay);
    const rangeEnd = new Date(year, rule.endMonth - 1, rule.endDay);
    return {
      startDate: PUPUtils.toISODate(PUPUtils.getMondayOnOrAfter(rangeStart)),
      endDate: PUPUtils.toISODate(rangeEnd),
      source: rule.source
    };
  },

  /** Built-in rules if CSV missing or incomplete */
  builtinRule(semesterNorm) {
    const builtin = {
      first: {
        startMonth: 8,
        startDay: 1,
        endMonth: 12,
        endDay: 20,
        syYearPart: 'start',
        source: 'builtin'
      },
      second: {
        startMonth: 1,
        startDay: 1,
        endMonth: 5,
        endDay: 31,
        syYearPart: 'end',
        source: 'builtin'
      },
      summer: {
        startMonth: 6,
        startDay: 1,
        endMonth: 7,
        endDay: 31,
        syYearPart: 'end',
        source: 'builtin'
      },
      midyear: {
        startMonth: 6,
        startDay: 1,
        endMonth: 7,
        endDay: 31,
        syYearPart: 'end',
        source: 'builtin'
      },
      third: {
        startMonth: 6,
        startDay: 1,
        endMonth: 6,
        endDay: 30,
        syYearPart: 'end',
        source: 'builtin'
      }
    };
    if (semesterNorm.includes('first')) return builtin.first;
    if (semesterNorm.includes('second')) return builtin.second;
    if (semesterNorm.includes('summer')) return builtin.summer;
    if (semesterNorm.includes('midyear')) return builtin.midyear;
    if (semesterNorm.includes('third')) return builtin.third;
    return null;
  },

  lookup(schoolYearCode, semester) {
    const years = this.resolveYears(schoolYearCode);
    if (!years) return null;

    const semNorm = this.normalizeSemester(semester);
    const semName = semester.replace(/\s*semester\s*/i, '').trim() || semester;

    const override = this.overrides.get(this.key(schoolYearCode, semester));
    let dates;
    if (override) {
      dates = {
        startDate: override.startDate,
        endDate: override.endDate,
        source: override.source
      };
    } else {
      const rule =
        this.rules.get(semNorm) || this.builtinRule(semNorm);
      if (!rule) return null;
      dates = this.applyRule(rule, years);
    }

    return {
      schoolYearCode,
      semester,
      displayLabel: `${years.label} · ${semName} Semester`,
      shortLabel: `SY ${schoolYearCode} · ${semName}`,
      semesterStart: dates.startDate,
      semesterEnd: dates.endDate,
      startYear: years.startYear,
      endYear: years.endYear,
      dateSource: dates.source
    };
  },

  buildTermInfo(termHeader) {
    if (!termHeader?.schoolYearCode) return null;
    return this.lookup(termHeader.schoolYearCode, termHeader.semester);
  }
};
