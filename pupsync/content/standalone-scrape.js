/**
 * SIAS schedule table scrape (uses PUPUtils from shared/utils.js when injected).
 */
(function () {
  if (typeof globalThis.__PUPSYNC_STANDALONE__ === 'function') return;

  const MARKERS = ['subject code', 'description', 'schedule'];

  function norm(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  function collectTables(root) {
    const tables = [];
    const visit = (node) => {
      if (!node) return;
      if (node.querySelectorAll) {
        tables.push(...node.querySelectorAll('table'));
      }
      const children = node.querySelectorAll
        ? node.querySelectorAll(':scope *')
        : node.children || [];
      for (const el of children) {
        if (el.shadowRoot) visit(el.shadowRoot);
      }
    };
    visit(root || document);
    return tables;
  }

  function findTable() {
    const byId = document.getElementById('Subject');
    const tables = byId && byId.tagName === 'TABLE' ? [byId] : collectTables();
    for (const table of tables) {
      const rows = [...table.querySelectorAll('tr')];
      for (let i = 0; i < rows.length; i++) {
        const headers = [...rows[i].querySelectorAll('th, td')].map((c) =>
          norm(c.textContent).toLowerCase()
        );
        const ok = MARKERS.every((h) => headers.some((cell) => cell.includes(h)));
        if (ok) return { table, headerRowIndex: i };
      }
    }
    return null;
  }

  function colIndex(headers, name) {
    const lower = name.toLowerCase();
    return headers.findIndex((h) => h.toLowerCase().includes(lower));
  }

  function parseSubjects(found) {
    const rows = [...found.table.querySelectorAll('tr')];
    const headers = [...rows[found.headerRowIndex].querySelectorAll('th, td')].map(
      (c) => norm(c.textContent)
    );
    const idxCode = colIndex(headers, 'Subject Code');
    const idxDesc = colIndex(headers, 'Description');
    const idxLec = colIndex(headers, 'Lec');
    const idxLab = colIndex(headers, 'Lab');
    const idxUnit = colIndex(headers, 'Unit');
    const idxSchedule = colIndex(headers, 'Schedule');
    if (idxCode === -1 || idxSchedule === -1) return [];

    const subjects = [];
    let pending = null;

    for (let i = found.headerRowIndex + 1; i < rows.length; i++) {
      const cells = [...rows[i].querySelectorAll('th, td')];
      if (!cells.length) continue;
      const subjectCode = norm(cells[idxCode]?.textContent);
      if (!subjectCode || subjectCode === '#') {
        const rowText = cells.map((c) => c.textContent).join(' ');
        if (/Faculty:/i.test(rowText) && pending) {
          const m = rowText.match(/Faculty:\s*(.+)/i);
          pending.faculty = m ? m[1].trim() : '';
          subjects.push(pending);
          pending = null;
        }
        continue;
      }
      if (pending) subjects.push(pending);

      const scheduleText = cells[idxSchedule]?.textContent || '';
      const facultyMatch = scheduleText.match(/Faculty:\s*(.+)/is);
      const faculty = facultyMatch
        ? facultyMatch[1].replace(/\s+/g, ' ').trim()
        : '';
      const scheduleOnly = scheduleText.split(/Faculty:/i)[0].replace(/\s+/g, ' ').trim();
      const lecH = norm(cells[idxLec]?.textContent);
      const labH = norm(cells[idxLab]?.textContent);
      const parsed =
        typeof PUPUtils !== 'undefined'
          ? PUPUtils.parseScheduleWithHours(scheduleOnly, lecH, labH)
          : { parseError: 'PUPUtils not loaded' };

      pending = {
        subjectCode,
        description: norm(cells[idxDesc]?.textContent),
        lectureHours: lecH,
        labHours: labH,
        units: norm(cells[idxUnit]?.textContent),
        section: parsed.section,
        daysPart: parsed.daysPart,
        days: parsed.days,
        meetings: parsed.meetings || [],
        lectureTime: parsed.lectureTime,
        labTime: parsed.labTime,
        faculty,
        rawSchedule: scheduleOnly,
        parseError: parsed.parseError || null,
        excluded: false
      };
    }
    if (pending) subjects.push(pending);
    return subjects;
  }

  function parseTermHeader() {
    const termRe =
      /School\s+Year\s+(\d{4})\s*[-–—]?\s*(First|Second|Third|Summer|Midyear)?\s*Semester/i;
    const h1 = document.querySelector('h1');
    if (h1) {
      const m = (h1.textContent || '').match(termRe);
      if (m) {
        return { schoolYearCode: m[1], semester: m[2] || 'Second' };
      }
    }
    const text = (document.body?.innerText || '').slice(0, 12000);
    const m = text.match(termRe);
    if (!m) return null;
    return {
      schoolYearCode: m[1],
      semester: m[2] || 'Second'
    };
  }

  globalThis.__PUPSYNC_STANDALONE__ = function pupsyncStandaloneScrape() {
    const found = findTable();
    if (!found) {
      return {
        ok: false,
        subjects: [],
        termHeader: parseTermHeader(),
        error: 'Schedule table not found',
        tableCount: collectTables().length
      };
    }
    const subjects = parseSubjects(found);
    const termHeader = parseTermHeader();
    if (!subjects.length) {
      return {
        ok: false,
        subjects: [],
        termHeader,
        error: 'No subjects parsed from schedule table'
      };
    }
    return { ok: true, subjects, termHeader, error: null };
  };
})();
