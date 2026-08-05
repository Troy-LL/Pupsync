/**
 * Lightweight DOM scrape for executeScript fallback (no chrome.* APIs).
 * Requires constants.js + utils.js loaded in the same isolated world first.
 */
(function () {
  if (typeof globalThis.__PUPSYNC_SCRAPE_DOM__ === 'function') return;

  const MARKERS = ['Subject Code', 'Description', 'Schedule'];

  function norm(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  function collectTables(root = document) {
    const tables = [];
    const visit = (node) => {
      if (!node) return;
      if (node.querySelectorAll) {
        tables.push(...node.querySelectorAll('table'));
      }
      const children =
        node.querySelectorAll?.(':scope *') || node.children || [];
      for (const el of children) {
        if (el.shadowRoot) visit(el.shadowRoot);
      }
    };
    visit(root);
    return tables;
  }

  function splitScheduleCell(text) {
    if (typeof PUPUtils !== 'undefined' && PUPUtils.splitScheduleCell) {
      return PUPUtils.splitScheduleCell(text);
    }
    const raw = (text || '').trim();
    const facultyMatch = raw.match(/Faculty:\s*(.+)/is);
    const faculty = facultyMatch
      ? facultyMatch[1].replace(/\s+/g, ' ').trim()
      : '';
    const scheduleOnly = raw.split(/Faculty:/i)[0].replace(/\s+/g, ' ').trim();
    return { scheduleOnly, faculty };
  }

  function findTable() {
    const byId = document.getElementById('Subject');
    const tables = byId && byId.tagName === 'TABLE' ? [byId] : collectTables();
    for (const table of tables) {
      const rows = [...table.querySelectorAll('tr')];
      for (let i = 0; i < rows.length; i++) {
        const headers = [...rows[i].querySelectorAll('th, td')].map((c) =>
          norm(c.textContent)
        );
        const ok = MARKERS.every((h) =>
          headers.some((cell) => cell.toLowerCase().includes(h.toLowerCase()))
        );
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
    if (idxCode === -1 || idxSchedule === -1) {
      return { subjects: [], codeRowCount: 0 };
    }

    const subjects = [];
    let pending = null;
    /** Rows that actually carry a subject code — 0 means nothing is enlisted yet. */
    let codeRowCount = 0;

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

      codeRowCount++;
      if (pending) subjects.push(pending);

      const { scheduleOnly, faculty } = splitScheduleCell(
        cells[idxSchedule]?.textContent || ''
      );
      const lecH = norm(cells[idxLec]?.textContent);
      const labH = norm(cells[idxLab]?.textContent);
      const parsed = PUPUtils.parseScheduleWithHours(scheduleOnly, lecH, labH);
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
    return { subjects, codeRowCount };
  }

  globalThis.__PUPSYNC_SCRAPE_DOM__ = function scrapeDom() {
    const found = findTable();
    if (!found) {
      return { ok: false, subjects: [], error: 'Schedule table not found' };
    }
    const { subjects, codeRowCount } = parseSubjects(found);
    if (!subjects.length) {
      return {
        ok: false,
        subjects: [],
        // Table is there but holds no subject rows: nothing enlisted yet, not a read failure.
        error: codeRowCount
          ? 'No subjects parsed from schedule table'
          : 'No enlisted subjects yet'
      };
    }
    let term = null;
    if (typeof PUPUtils !== 'undefined') {
      const header = PUPUtils.findTermOnPage(document);
      if (header && typeof SemesterConfig !== 'undefined') {
        term =
          SemesterConfig.buildTermInfo(header) || PUPUtils.buildTermInfo(header);
      }
    }
    return { ok: true, subjects, term, error: null };
  };
})();
