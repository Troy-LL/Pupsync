/**
 * Content script: scrape SIAS schedule table and respond to popup messages.
 */
(function () {
  const HEADER_MARKERS = PUPSYNC.TABLE_HEADERS;

  function normalizeHeader(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  function findScheduleTable() {
    const tables = document.querySelectorAll('table');
    for (const table of tables) {
      const headerCells = table.querySelectorAll('tr th, tr td');
      const firstRow = table.querySelector('tr');
      if (!firstRow) continue;
      const headers = [...firstRow.querySelectorAll('th, td')].map((c) =>
        normalizeHeader(c.textContent)
      );
      const hasAll = HEADER_MARKERS.every((h) =>
        headers.some((cell) => cell.toLowerCase().includes(h.toLowerCase()))
      );
      if (hasAll) return table;
    }
    return null;
  }

  function columnIndex(headers, name) {
    const lower = name.toLowerCase();
    return headers.findIndex((h) => h.toLowerCase().includes(lower));
  }

  function extractFaculty(text) {
    const m = (text || '').match(/Faculty:\s*(.+)/i);
    return m ? m[1].trim() : '';
  }

  function isFacultyRow(cells) {
    const text = [...cells].map((c) => c.textContent).join(' ');
    return /Faculty:/i.test(text);
  }

  function parseTable(table) {
    const rows = [...table.querySelectorAll('tr')];
    if (rows.length < 2) return [];

    const headerCells = [...rows[0].querySelectorAll('th, td')];
    const headers = headerCells.map((c) => normalizeHeader(c.textContent));

    const idxCode = columnIndex(headers, 'Subject Code');
    const idxDesc = columnIndex(headers, 'Description');
    const idxLec = columnIndex(headers, 'Lec');
    const idxLab = columnIndex(headers, 'Lab');
    const idxUnit = columnIndex(headers, 'Unit');
    const idxSchedule = columnIndex(headers, 'Schedule');

    if (idxCode === -1 || idxSchedule === -1) {
      return [];
    }

    const subjects = [];
    let pending = null;

    for (let i = 1; i < rows.length; i++) {
      const cells = [...rows[i].querySelectorAll('td')];
      if (!cells.length) continue;

      if (isFacultyRow(cells)) {
        if (pending) {
          pending.faculty = extractFaculty(cells.map((c) => c.textContent).join(' '));
          subjects.push(pending);
          pending = null;
        }
        continue;
      }

      const subjectCode = (cells[idxCode]?.textContent || '').trim();
      if (!subjectCode || subjectCode === '#') continue;

      if (pending) {
        subjects.push(pending);
      }

      const rawSchedule = (cells[idxSchedule]?.textContent || '').trim();
      const parsed = PUPUtils.parseScheduleString(rawSchedule);

      pending = {
        subjectCode,
        description: (cells[idxDesc]?.textContent || '').trim(),
        lectureHours: (cells[idxLec]?.textContent || '').trim(),
        labHours: (cells[idxLab]?.textContent || '').trim(),
        units: (cells[idxUnit]?.textContent || '').trim(),
        section: parsed.section,
        days: parsed.days,
        lectureTime: parsed.lectureTime,
        labTime: parsed.labTime,
        faculty: '',
        rawSchedule,
        parseError: parsed.parseError || null,
        excluded: false
      };
    }

    if (pending) {
      subjects.push(pending);
    }

    return subjects;
  }

  async function parsePageTerm() {
    await SemesterConfig.load();
    const header = PUPUtils.findTermOnPage(document);
    return SemesterConfig.buildTermInfo(header) || PUPUtils.buildTermInfo(header);
  }

  async function runParse() {
    const term = await parsePageTerm();
    const table = findScheduleTable();
    if (!table) {
      return {
        ok: false,
        subjects: [],
        term,
        error: 'Schedule table not found'
      };
    }
    const subjects = parseTable(table);
    return { ok: true, subjects, term, error: null };
  }

  function persistAndNotify(result) {
    const payload = {};
    if (result.ok && result.subjects?.length) {
      payload[PUPSYNC.STORAGE_KEYS.LAST_SCHEDULE] = result.subjects;
    }
    if (result.term) {
      payload[PUPSYNC.STORAGE_KEYS.LAST_TERM] = result.term;
    }
    if (Object.keys(payload).length) {
      chrome.storage.local.set(payload);
    }
  }

  async function scan() {
    const result = await runParse();
    persistAndNotify(result);
    return result;
  }

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === PUPSYNC.MESSAGE_TYPES.GET_SCHEDULE) {
      scan().then(sendResponse);
      return true;
    }
    return false;
  });

  scan().then((initial) => {
    if (!initial.ok) {
      const observer = new MutationObserver(() => {
        runParse().then((result) => {
          if (result.ok && result.subjects.length) {
            persistAndNotify(result);
            observer.disconnect();
          }
        });
      });
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true
      });
      setTimeout(() => observer.disconnect(), 30000);
    }
  });
})();
