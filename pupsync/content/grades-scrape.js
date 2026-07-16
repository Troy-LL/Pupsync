/**
 * SIAS grades scrape: walk every semester grade table, extract subjects.
 * Standalone (no chrome.* deps); uses PUPUtils/PUPSYNC when injected alongside.
 */
(function () {
  if (typeof globalThis.__PUPSYNC_SCRAPE_GRADES__ === 'function') return;

  const MARKERS = ['subject code', 'units', 'final grade'];
  const TERM_RE =
    /School\s+Year\s+(\d{4})\s*[-–—]?\s*(First|Second|Third|Summer|Midyear)?\s*Semester/i;

  function norm(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  function collectTables(root) {
    const tables = [];
    const visit = (node) => {
      if (!node) return;
      if (node.querySelectorAll) tables.push(...node.querySelectorAll('table'));
      const children = node.querySelectorAll
        ? node.querySelectorAll(':scope *')
        : node.children || [];
      for (const el of children) if (el.shadowRoot) visit(el.shadowRoot);
    };
    visit(root || document);
    return tables;
  }

  function isGradeTable(table) {
    const rows = [...table.querySelectorAll('tr')];
    for (let i = 0; i < rows.length; i++) {
      const headers = [...rows[i].querySelectorAll('th, td')].map((c) =>
        norm(c.textContent).toLowerCase()
      );
      const ok = MARKERS.every((h) => headers.some((cell) => cell.includes(h)));
      if (ok) return i;
    }
    return -1;
  }

  function colIndex(headers, name) {
    const lower = name.toLowerCase();
    return headers.findIndex((h) => h.toLowerCase().includes(lower));
  }

  // ponytail: nearest preceding banner in document order; PUP wraps each
  // semester's header + table in its own card, so this reliably pairs them.
  function termLabelForTable(table, banners) {
    let best = null;
    for (const b of banners) {
      const pos = b.el.compareDocumentPosition(table);
      if (pos & Node.DOCUMENT_POSITION_FOLLOWING) best = b; // banner precedes table
    }
    return best;
  }

  function collectBanners() {
    const out = [];
    const all = document.querySelectorAll('div, h1, h2, h3, th, td, span, p');
    for (const el of all) {
      const t = norm(el.textContent);
      if (t.length > 70) continue; // tight match = the banner, not a container
      const m = t.match(TERM_RE);
      if (m) out.push({ el, code: m[1], semester: m[2] || 'Unknown', raw: t });
    }
    return out;
  }

  function parseSemester(table, headerRowIndex) {
    const rows = [...table.querySelectorAll('tr')];
    const headers = [...rows[headerRowIndex].querySelectorAll('th, td')].map((c) =>
      norm(c.textContent)
    );
    const idxCode = colIndex(headers, 'Subject Code');
    const idxDesc = colIndex(headers, 'Description');
    const idxUnit = colIndex(headers, 'Units');
    const idxGrade = colIndex(headers, 'Final Grade');
    const idxStatus = colIndex(headers, 'Grade Status');
    if (idxCode === -1 || idxUnit === -1 || idxGrade === -1) return [];

    const subjects = [];
    for (let i = headerRowIndex + 1; i < rows.length; i++) {
      const cells = [...rows[i].querySelectorAll('th, td')];
      if (!cells.length) continue;
      const code = norm(cells[idxCode]?.textContent);
      if (!code || code === '#') continue;
      const gradeText = norm(cells[idxGrade]?.textContent);
      const grade =
        typeof PUPUtils !== 'undefined'
          ? PUPUtils.parseGrade(gradeText)
          : (/^\d+(\.\d+)?$/.test(gradeText) ? parseFloat(gradeText) : null);
      subjects.push({
        subjectCode: code,
        description: norm(cells[idxDesc]?.textContent),
        units: norm(cells[idxUnit]?.textContent),
        grade,
        gradeText,
        status: idxStatus !== -1 ? norm(cells[idxStatus]?.textContent) : ''
      });
    }
    return subjects;
  }

  globalThis.__PUPSYNC_SCRAPE_GRADES__ = function scrapeGrades() {
    const tables = collectTables();
    const banners = collectBanners();
    const semesters = [];

    for (const table of tables) {
      const headerRowIndex = isGradeTable(table);
      if (headerRowIndex === -1) continue;
      const subjects = parseSemester(table, headerRowIndex);
      if (!subjects.length) continue;
      const banner = termLabelForTable(table, banners);
      semesters.push({
        label: banner ? banner.raw : '',
        schoolYearCode: banner?.code || null,
        semester: banner?.semester || null,
        subjects
      });
    }

    if (!semesters.length) {
      return {
        ok: false,
        semesters: [],
        error: 'Grade tables not found',
        tableCount: tables.length
      };
    }

    let standing = null;
    if (typeof PUPUtils !== 'undefined') {
      standing = PUPUtils.computeAcademicStanding(semesters);
    }
    return { ok: true, semesters, standing, error: null };
  };
})();
