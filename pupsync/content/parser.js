/**
 * Content script: scrape SIAS schedule table and respond to popup messages.
 */
(function () {
  if (
    globalThis.__PUPSYNC_CS__ &&
    typeof globalThis.__PUPSYNC_GET_SCHEDULE__ === 'function'
  ) {
    return;
  }
  globalThis.__PUPSYNC_CS__ = true;

  const HEADER_MARKERS = PUPSYNC.TABLE_HEADERS;

  function normalizeHeader(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  function rowHeaders(row) {
    return [...row.querySelectorAll('th, td')].map((c) =>
      normalizeHeader(c.textContent)
    );
  }

  function rowHasScheduleHeaders(headers) {
    return HEADER_MARKERS.every((h) =>
      headers.some((cell) => cell.toLowerCase().includes(h.toLowerCase()))
    );
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

  /** @returns {{ table: HTMLTableElement, headerRowIndex: number } | null} */
  function findScheduleTable() {
    const byId = document.getElementById('Subject');
    const tables = byId?.tagName === 'TABLE' ? [byId] : collectTables();
    for (const table of tables) {
      const rows = [...table.querySelectorAll('tr')];
      for (let i = 0; i < rows.length; i++) {
        const headers = rowHeaders(rows[i]);
        if (rowHasScheduleHeaders(headers)) {
          return { table, headerRowIndex: i };
        }
      }
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

  function isFacultyOnlyRow(cells, idxCode) {
    const code = (cells[idxCode]?.textContent || '').trim();
    if (code && code !== '#') return false;
    const text = [...cells].map((c) => c.textContent).join(' ');
    return /Faculty:/i.test(text);
  }

  function parseTable(table, headerRowIndex = 0) {
    const rows = [...table.querySelectorAll('tr')];
    if (rows.length <= headerRowIndex + 1) return [];

    const headers = rowHeaders(rows[headerRowIndex]);

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

    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const cells = [...rows[i].querySelectorAll('th, td')];
      if (!cells.length) continue;

      const subjectCode = (cells[idxCode]?.textContent || '').trim();
      if (!subjectCode || subjectCode === '#') {
        if (isFacultyOnlyRow(cells, idxCode) && pending) {
          pending.faculty = extractFaculty(
            cells.map((c) => c.textContent).join(' ')
          );
          subjects.push(pending);
          pending = null;
        }
        continue;
      }

      if (pending) {
        subjects.push(pending);
      }

      const { scheduleOnly, faculty } = PUPUtils.splitScheduleCell(
        cells[idxSchedule]?.textContent || ''
      );
      const lecH = (cells[idxLec]?.textContent || '').trim();
      const labH = (cells[idxLab]?.textContent || '').trim();
      const parsed = PUPUtils.parseScheduleWithHours(
        scheduleOnly,
        lecH,
        labH
      );

      pending = {
        subjectCode,
        description: (cells[idxDesc]?.textContent || '').trim(),
        lectureHours: lecH,
        labHours: labH,
        units: (cells[idxUnit]?.textContent || '').trim(),
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
    const found = findScheduleTable();
    if (!found) {
      return {
        ok: false,
        subjects: [],
        term,
        error: 'Schedule table not found'
      };
    }
    const subjects = parseTable(found.table, found.headerRowIndex);
    if (!subjects.length) {
      return {
        ok: false,
        subjects: [],
        term,
        error: 'No subjects parsed from schedule table'
      };
    }
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

  globalThis.__PUPSYNC_GET_SCHEDULE__ = scan;

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
