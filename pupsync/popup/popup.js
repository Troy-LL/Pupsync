/**
 * PUPSync popup — state machine, color picker, preview, import.
 */
(function () {
  const state = {
    subjects: [],
    subjectColors: {},
    semesterStart: '',
    semesterEnd: '',
    previewOpen: false,
    currentView: 'a',
    term: null
  };

  const els = {
    headerBadge: document.getElementById('header-badge'),
    stateA: document.getElementById('state-a'),
    stateB: document.getElementById('state-b'),
    stateC: document.getElementById('state-c'),
    stateD: document.getElementById('state-d'),
    subjectList: document.getElementById('subject-list'),
    subjectListDim: document.getElementById('subject-list-dim'),
    semToggle: document.getElementById('sem-toggle'),
    semInputs: document.getElementById('sem-inputs'),
    semesterStart: document.getElementById('semester-start'),
    semesterEnd: document.getElementById('semester-end'),
    previewPanel: document.getElementById('preview-panel'),
    previewHeader: document.getElementById('preview-header'),
    previewList: document.getElementById('preview-list'),
    btnImport: document.getElementById('btn-import'),
    btnPreview: document.getElementById('btn-preview'),
    progressLabel: document.getElementById('progress-label'),
    progressFill: document.getElementById('progress-fill'),
    btnImportingText: document.getElementById('btn-importing-text'),
    successText: document.getElementById('success-text'),
    siasLink: document.getElementById('sias-link'),
    btnAgain: document.getElementById('btn-again'),
    termDetected: document.getElementById('term-detected')
  };

  function showView(view) {
    state.currentView = view;
    els.stateA.hidden = view !== 'a';
    els.stateB.hidden = view !== 'b';
    els.stateC.hidden = view !== 'c';
    els.stateD.hidden = view !== 'd';
    const subjectBadge = state.term?.shortLabel
      ? `${state.subjects.length} subjects · ${state.term.shortLabel}`
      : `${state.subjects.length} subjects`;
    const badges = {
      a: 'Schedule import',
      b: subjectBadge,
      c: 'Importing…',
      d: 'Done'
    };
    els.headerBadge.textContent = badges[view] || 'PUPSync';
  }

  async function loadStorage() {
    const defaults = PUPUtils.getDefaultSemesterDates();
    const data = await chrome.storage.local.get([
      PUPSYNC.STORAGE_KEYS.SUBJECT_COLORS,
      PUPSYNC.STORAGE_KEYS.SEMESTER_START,
      PUPSYNC.STORAGE_KEYS.SEMESTER_END
    ]);
    state.subjectColors = data[PUPSYNC.STORAGE_KEYS.SUBJECT_COLORS] || {};
    state.semesterStart =
      data[PUPSYNC.STORAGE_KEYS.SEMESTER_START] || defaults.start;
    state.semesterEnd = data[PUPSYNC.STORAGE_KEYS.SEMESTER_END] || defaults.end;
    els.semesterStart.value = state.semesterStart;
    els.semesterEnd.value = state.semesterEnd;
  }

  async function saveColors() {
    await chrome.storage.local.set({
      [PUPSYNC.STORAGE_KEYS.SUBJECT_COLORS]: state.subjectColors
    });
  }

  async function saveSemester() {
    state.semesterStart = els.semesterStart.value;
    state.semesterEnd = els.semesterEnd.value;
    await chrome.storage.local.set({
      [PUPSYNC.STORAGE_KEYS.SEMESTER_START]: state.semesterStart,
      [PUPSYNC.STORAGE_KEYS.SEMESTER_END]: state.semesterEnd
    });
  }

  function renderTermLabel() {
    if (!els.termDetected) return;
    if (state.term?.displayLabel) {
      els.termDetected.hidden = false;
      const src = state.term.dateSource ? ` (${state.term.dateSource})` : '';
      els.termDetected.textContent = `Detected from page: ${state.term.displayLabel}${src}`;
    } else {
      els.termDetected.hidden = true;
      els.termDetected.textContent = '';
    }
  }

  async function applyTerm(term) {
    if (!term?.semesterStart || !term?.semesterEnd) return;
    state.term = term;
    state.semesterStart = term.semesterStart;
    state.semesterEnd = term.semesterEnd;
    els.semesterStart.value = term.semesterStart;
    els.semesterEnd.value = term.semesterEnd;
    await saveSemester();
    renderTermLabel();
  }

  function getActiveSubjects() {
    return state.subjects.filter((s) => !s.excluded && !s.parseError);
  }

  function getColorLabel(code) {
    return (
      state.subjectColors[code] ||
      PUPSYNC.DEFAULT_COLOR_LABEL
    );
  }

  function buildPreviewEvents() {
    return PUPUtils.buildCalendarEvents(
      state.subjects,
      state.semesterStart,
      state.semesterEnd,
      state.subjectColors
    );
  }

  function renderPreview() {
    const events = buildPreviewEvents();
    els.previewHeader.textContent = `Preview — ${events.length} events to be created`;
    els.previewList.innerHTML = '';
    for (const ev of events) {
      const row = document.createElement('div');
      row.className = 'preview-item';
      row.innerHTML = `
        <span class="preview-dot" style="background:${ev.colorHex}"></span>
        <span>${ev.subjectCode} · ${ev.day}</span>
        <span class="preview-type">${ev.type === 'Lecture' ? 'Lec' : 'Lab'}</span>
        <span class="preview-time">${ev.startDisplay}</span>
      `;
      els.previewList.appendChild(row);
    }
    els.btnPreview.textContent = state.previewOpen
      ? 'Hide preview'
      : 'Preview events';
  }

  function closeAllColorMenus() {
    document.querySelectorAll('.color-field').forEach((field) => {
      const menu = field.querySelector('.color-menu');
      const chip = field.querySelector('.color-chip');
      if (menu) menu.hidden = true;
      if (chip) chip.setAttribute('aria-expanded', 'false');
    });
  }

  function buildColorFieldHtml(label, interactive) {
    const current = PUPSYNC.COLOR_BY_LABEL[label] || PUPSYNC.COLORS[6];
    if (!interactive) {
      return `
        <div class="color-field">
          <span class="color-chip color-chip-static" title="${current.label}" aria-label="Color: ${current.label}">
            <span class="color-chip-dot" style="background:${current.hex}"></span>
          </span>
        </div>`;
    }
    const options = PUPSYNC.COLORS.map(
      (c) => `
      <button type="button" class="color-option${c.label === label ? ' selected' : ''}" data-label="${c.label}" role="option" aria-selected="${c.label === label}">
        <span class="color-option-dot" style="background:${c.hex}"></span>
        <span>${c.label}</span>
      </button>`
    ).join('');
    return `
      <div class="color-field">
        <button type="button" class="color-chip" aria-haspopup="listbox" aria-expanded="false" aria-label="Color: ${current.label}" title="${current.label}">
          <span class="color-chip-dot" style="background:${current.hex}"></span>
          <span class="color-chip-chevron" aria-hidden="true">▾</span>
        </button>
        <div class="color-menu" role="listbox" hidden>${options}</div>
      </div>`;
  }

  function updateColorChip(field, label) {
    const color = PUPSYNC.COLOR_BY_LABEL[label] || PUPSYNC.COLORS[6];
    const dot = field.querySelector('.color-chip-dot');
    const chip = field.querySelector('.color-chip');
    if (dot) dot.style.background = color.hex;
    if (chip) {
      chip.title = color.label;
      chip.setAttribute('aria-label', `Color: ${color.label}`);
    }
    field.querySelectorAll('.color-option').forEach((opt) => {
      const on = opt.dataset.label === label;
      opt.classList.toggle('selected', on);
      opt.setAttribute('aria-selected', String(on));
    });
  }

  function wireColorField(field, subject) {
    const chip = field.querySelector('.color-chip');
    const menu = field.querySelector('.color-menu');
    if (!chip || !menu) return;

    chip.addEventListener('click', (e) => {
      e.stopPropagation();
      const willOpen = menu.hidden;
      closeAllColorMenus();
      if (willOpen) {
        menu.hidden = false;
        chip.setAttribute('aria-expanded', 'true');
      }
    });

    menu.querySelectorAll('.color-option').forEach((opt) => {
      opt.addEventListener('click', async (e) => {
        e.stopPropagation();
        const label = opt.dataset.label;
        state.subjectColors[subject.subjectCode] = label;
        updateColorChip(field, label);
        await saveColors();
        closeAllColorMenus();
        if (state.previewOpen) renderPreview();
      });
    });
  }

  function renderSubjectRow(subject, container, interactive) {
    const row = document.createElement('div');
    row.className = 'subject-row' + (subject.parseError ? ' error' : '');
    row.dataset.code = subject.subjectCode;

    const colorLabel = getColorLabel(subject.subjectCode);
    const tag = PUPUtils.scheduleTag(subject);
    const errorHtml = subject.parseError
      ? `<div class="error-tag" role="alert">⚠ Could not parse schedule — skipped on import</div>`
      : '';
    const colorField = subject.parseError
      ? ''
      : buildColorFieldHtml(colorLabel, interactive);

    row.innerHTML = `
      <div class="subject-top">
        <input type="checkbox" ${subject.excluded ? '' : 'checked'} ${interactive ? '' : 'disabled'} aria-label="Include ${subject.subjectCode}">
        <div class="subject-info">
          <div class="subject-code">${escapeHtml(subject.subjectCode)}</div>
          <div class="subject-desc">${escapeHtml(subject.description)}</div>
          <div class="schedule-tag">${escapeHtml(tag)}</div>
        </div>
        ${colorField}
      </div>
      ${errorHtml}
    `;

    if (interactive) {
      const cb = row.querySelector('input[type="checkbox"]');
      cb.addEventListener('change', () => {
        subject.excluded = !cb.checked;
      });
      const field = row.querySelector('.color-field');
      if (field) wireColorField(field, subject);
    }

    container.appendChild(row);
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  function renderSubjects() {
    els.subjectList.innerHTML = '';
    els.subjectListDim.innerHTML = '';
    for (const subject of state.subjects) {
      renderSubjectRow(subject, els.subjectList, true);
      renderSubjectRow(subject, els.subjectListDim, false);
    }
    if (state.previewOpen) renderPreview();
  }

  async function fetchScheduleFromTab(tabId) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: PUPSYNC.MESSAGE_TYPES.GET_SCHEDULE
      });
      return response;
    } catch {
      return { ok: false, subjects: [], error: 'Content script not available' };
    }
  }

  async function init() {
    els.siasLink.href = PUPSYNC.SIAS_PORTAL_URL;
    await SemesterConfig.load();
    await loadStorage();

    els.semToggle.addEventListener('click', () => {
      const open = els.semToggle.classList.toggle('open');
      els.semInputs.hidden = !open;
      els.semToggle.setAttribute('aria-expanded', String(open));
    });

    els.semesterStart.addEventListener('change', saveSemester);
    els.semesterEnd.addEventListener('change', saveSemester);

    els.btnPreview.addEventListener('click', async () => {
      await saveSemester();
      state.previewOpen = !state.previewOpen;
      els.previewPanel.hidden = !state.previewOpen;
      if (state.previewOpen) renderPreview();
      els.btnPreview.textContent = state.previewOpen
        ? 'Hide preview ▴'
        : 'Preview events ▾';
    });

    els.btnImport.addEventListener('click', startImport);
    els.btnAgain.addEventListener('click', () => showView('b'));

    document.addEventListener('click', () => closeAllColorMenus());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeAllColorMenus();
    });

    chrome.runtime.onMessage.addListener((message) => {
      if (message?.type === PUPSYNC.MESSAGE_TYPES.IMPORT_PROGRESS) {
        updateProgress(message.current, message.total);
      }
      if (message?.type === PUPSYNC.MESSAGE_TYPES.IMPORT_ERROR) {
        onImportError(message.error);
      }
    });

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab.url?.includes('sis2.pup.edu.ph')) {
      showView('a');
      return;
    }

    const result = await fetchScheduleFromTab(tab.id);
    if (!result?.ok || !result.subjects?.length) {
      showView('a');
      return;
    }

    state.subjects = result.subjects.map((s) => ({
      ...s,
      excluded: s.excluded ?? false
    }));
    if (result.term) {
      await applyTerm(result.term);
    } else {
      renderTermLabel();
    }
    renderSubjects();
    showView('b');
  }

  function updateProgress(current, total) {
    const pct = total ? Math.round((current / total) * 100) : 0;
    els.progressLabel.textContent = `Creating event ${current} of ${total}…`;
    els.btnImportingText.textContent = `Creating event ${current} of ${total}…`;
    els.progressFill.style.width = `${pct}%`;
  }

  async function startImport() {
    await saveSemester();
    const active = getActiveSubjects();
    if (!active.length) {
      alert('No subjects selected for import.');
      return;
    }

    showView('c');
    updateProgress(0, 0);

    chrome.runtime.sendMessage(
      {
        type: PUPSYNC.MESSAGE_TYPES.IMPORT,
        subjects: state.subjects,
        semesterStart: state.semesterStart,
        semesterEnd: state.semesterEnd,
        subjectColors: state.subjectColors
      },
      (response) => {
        if (chrome.runtime.lastError) {
          onImportError(chrome.runtime.lastError.message);
          return;
        }
        if (response?.error) {
          onImportError(response.error);
          return;
        }
        if (response?.created != null) {
          onImportComplete(response.created);
        }
      }
    );
  }

  function onImportComplete(created) {
    if (PUPSYNC.DRY_RUN) {
      const where = window.__PUPSYNC_DEV__
        ? 'browser console'
        : 'service worker console';
      els.successText.textContent = `${created} events generated (dry run — see ${where})`;
    } else {
      els.successText.textContent = `${created} events added to your Google Calendar`;
    }
    showView('d');
  }

  function onImportError(err) {
    alert(`Import failed: ${err}`);
    showView('b');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
