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
    scheduleView: 'grid',
    currentView: 'a',
    term: null,
    gridImageUrl: null,
    gridRenderToken: 0
  };

  const els = {
    headerBadge: document.getElementById('header-badge'),
    stateA: document.getElementById('state-a'),
    stateB: document.getElementById('state-b'),
    stateC: document.getElementById('state-c'),
    stateD: document.getElementById('state-d'),
    stateE: document.getElementById('state-e'),
    gwaValue: document.getElementById('gwa-value'),
    gwaUnits: document.getElementById('gwa-units'),
    gwaStanding: document.getElementById('gwa-standing'),
    gwaWarnings: document.getElementById('gwa-warnings'),
    gwaSems: document.getElementById('gwa-sems'),
    subjectList: document.getElementById('subject-list'),
    subjectListPanel: document.getElementById('subject-list-panel'),
    subjectListDim: document.getElementById('subject-list-dim'),
    scheduleGridPanel: document.getElementById('schedule-grid-panel'),
    scheduleGridScroll: document.getElementById('schedule-grid-scroll'),
    scheduleGridImage: document.getElementById('schedule-grid-image'),
    viewGrid: document.getElementById('view-grid'),
    viewList: document.getElementById('view-list'),
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
    termDetected: document.getElementById('term-detected'),
    stateAHint: document.getElementById('state-a-hint')
  };

  const STATE_A_HINT_DEFAULT =
    'Go to your PUP schedule page and open this extension again.';

  function showStateA(hint) {
    if (els.stateAHint) {
      els.stateAHint.textContent = hint || STATE_A_HINT_DEFAULT;
    }
    showView('a');
  }

  function showView(view) {
    state.currentView = view;
    updatePopupWidth();
    els.stateA.hidden = view !== 'a';
    els.stateB.hidden = view !== 'b';
    els.stateC.hidden = view !== 'c';
    els.stateD.hidden = view !== 'd';
    if (els.stateE) els.stateE.hidden = view !== 'e';
    const subjectBadge = state.term?.shortLabel
      ? `${state.subjects.length} subjects · ${state.term.shortLabel}`
      : `${state.subjects.length} subjects`;
    const badges = {
      a: 'Schedule import',
      b: subjectBadge,
      c: 'Importing…',
      d: 'Done',
      e: 'Grades · GWA'
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
    return state.subjectColors[code] || PUPSYNC.DEFAULT_COLOR_LABEL;
  }

  function colorSeed() {
    return (
      state.term?.shortLabel ||
      state.term?.schoolYearCode ||
      'pupsync'
    );
  }

  function ensureAutoColors() {
    const next = PUPUtils.autoAssignSubjectColors(
      state.subjects,
      state.subjectColors,
      colorSeed()
    );
    const changed =
      Object.keys(next).length !== Object.keys(state.subjectColors).length ||
      Object.keys(next).some((k) => next[k] !== state.subjectColors[k]);
    state.subjectColors = next;
    return changed;
  }

  function updatePopupWidth() {
    const wide = state.currentView === 'b' && state.scheduleView === 'grid';
    document.body.classList.toggle('popup-wide', wide);
  }

  function setScheduleView(view) {
    state.scheduleView = view;
    const isGrid = view === 'grid';
    if (els.scheduleGridPanel) els.scheduleGridPanel.hidden = !isGrid;
    if (els.subjectListPanel) els.subjectListPanel.hidden = isGrid;
    if (els.viewGrid) {
      els.viewGrid.classList.toggle('active', isGrid);
      els.viewGrid.setAttribute('aria-selected', String(isGrid));
    }
    if (els.viewList) {
      els.viewList.classList.toggle('active', !isGrid);
      els.viewList.setAttribute('aria-selected', String(!isGrid));
    }
    updatePopupWidth();
  }

  function gridExportSize() {
    updatePopupWidth();
    const wide = state.currentView === 'b' && state.scheduleView === 'grid';
    const minW = wide ? 600 : 320;
    const el = els.scheduleGridScroll;
    const rect = el?.getBoundingClientRect();
    const width = Math.round(
      Math.max(rect?.width || 0, document.body.clientWidth || 0, minW)
    );
    const height = Math.round(Math.max(rect?.height || 0, 300));
    return { width, height };
  }

  async function renderScheduleGrid() {
    if (!els.scheduleGridImage) return;
    const token = ++state.gridRenderToken;
    if (els.scheduleGridScroll) {
      els.scheduleGridScroll.classList.add('is-rendering');
    }

    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    const subjects = getActiveSubjects();
    const { width: exportW, height: exportH } = gridExportSize();
    const chrome = PUPGridImage.exportChromeHeight();
    const probe = PUPUtils.buildWeekGridModel(subjects, state.subjectColors, {
      pxPerMin: 1
    });
    const pxPerMin = Math.max(
      0.4,
      (exportH - chrome) / Math.max(probe.spanMin, 60)
    );
    const model = PUPUtils.buildWeekGridModel(subjects, state.subjectColors, {
      pxPerMin
    });
    const exportScale = PUPGridImage.exportPixelRatio();
    const logicalH = chrome + model.totalHeight;

    try {
      const blob = await PUPGridImage.exportWeekGridWebP(model, {
        width: exportW,
        height: logicalH,
        scale: exportScale
      });
      if (token !== state.gridRenderToken) return;

      if (state.gridImageUrl) URL.revokeObjectURL(state.gridImageUrl);
      state.gridImageUrl = URL.createObjectURL(blob);
      els.scheduleGridImage.src = state.gridImageUrl;
      const n = new Set(model.blocks.map((b) => b.subjectCode)).size;
      els.scheduleGridImage.alt = `Weekly schedule, ${n} subject${n === 1 ? '' : 's'}`;
    } catch (err) {
      console.error('[PUPSync] week grid image failed', err);
      if (token === state.gridRenderToken) {
        els.scheduleGridImage.removeAttribute('src');
        els.scheduleGridImage.alt = 'Could not render schedule preview';
      }
    } finally {
      if (token === state.gridRenderToken && els.scheduleGridScroll) {
        els.scheduleGridScroll.classList.remove('is-rendering');
      }
    }
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
        renderScheduleGrid();
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
        renderScheduleGrid();
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
    renderScheduleGrid();
    if (state.previewOpen) renderPreview();
  }

  async function fetchScheduleFromTab(tabId) {
    try {
      const result = await chrome.runtime.sendMessage({
        type: PUPSYNC.MESSAGE_TYPES.SCRAPE_TAB,
        tabId
      });
      if (result) return result;
    } catch (err) {
      return {
        ok: false,
        subjects: [],
        error: err.message || 'Content script not available'
      };
    }
    return {
      ok: false,
      subjects: [],
      error: 'Content script not available'
    };
  }

  async function fetchGradesFromTab(tabId) {
    try {
      const result = await chrome.runtime.sendMessage({
        type: PUPSYNC.MESSAGE_TYPES.SCRAPE_GRADES,
        tabId
      });
      if (result) return result;
    } catch (err) {
      return { ok: false, semesters: [], error: err.message };
    }
    return { ok: false, semesters: [], error: 'Content script not available' };
  }

  function renderGrades(result) {
    const standing =
      result.standing || PUPUtils.computeAcademicStanding(result.semesters);

    els.gwaValue.textContent = standing.gwa != null ? standing.gwa.toFixed(2) : '—';
    els.gwaUnits.textContent = standing.totalUnits || 0;

    const stand = els.gwaStanding;
    if (standing.disqualified) {
      stand.className = 'gwa-standing dq';
      stand.textContent = standing.qualifiesTier
        ? `GWA fits ${standing.qualifiesTier}, but a rule below breaks eligibility`
        : 'Not on track for Latin honors';
    } else if (standing.tier) {
      stand.className = 'gwa-standing ok';
      stand.textContent = `On track: ${standing.tier} 🎓`;
    } else {
      stand.className = 'gwa-standing';
      stand.textContent = 'Below Latin honors range';
    }

    if (standing.disqualifiers.length) {
      els.gwaWarnings.hidden = false;
      els.gwaWarnings.innerHTML =
        `<div class="gwa-warn-title">Breaks Latin honors eligibility:</div>` +
        standing.disqualifiers
          .map((d) => `<div class="gwa-warn-item">⚠ ${escapeHtml(d)}</div>`)
          .join('');
    } else {
      els.gwaWarnings.hidden = true;
    }

    els.gwaSems.innerHTML = standing.perSemester
      .map(
        (s) => `
        <div class="gwa-sem-row">
          <span class="gwa-sem-label">${escapeHtml(s.label || 'Semester')}</span>
          <span class="gwa-sem-gwa">${s.gwa != null ? s.gwa.toFixed(2) : '—'}</span>
        </div>`
      )
      .join('');

    showView('e');
  }

  async function init() {
    await SemesterConfig.load();
    await loadStorage();

    els.semToggle.addEventListener('click', () => {
      const open = els.semToggle.classList.toggle('open');
      els.semInputs.hidden = !open;
      els.semToggle.setAttribute('aria-expanded', String(open));
    });

    els.semesterStart.addEventListener('change', saveSemester);
    els.semesterEnd.addEventListener('change', saveSemester);

    els.viewGrid?.addEventListener('click', () => setScheduleView('grid'));
    els.viewList?.addEventListener('click', () => setScheduleView('list'));

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
    els.siasLink.href =
      tab?.url && PUPSYNC.isSiasScheduleUrl(tab.url)
        ? tab.url.split('?')[0].split('#')[0]
        : PUPSYNC.SIAS_PORTAL_URL;

    if (tab?.id && tab.url && PUPSYNC.isSiasGradesUrl(tab.url)) {
      const grades = await fetchGradesFromTab(tab.id);
      if (grades?.ok && grades.semesters?.length) {
        renderGrades(grades);
      } else {
        showStateA(
          'Found the grades page but could not read it. Refresh (F5) and open PUPSync again.'
        );
      }
      return;
    }

    if (!tab?.id || !tab.url || !PUPSYNC.isSiasScheduleUrl(tab.url)) {
      showStateA();
      return;
    }

    const result = await fetchScheduleFromTab(tab.id);
    if (!result?.ok || !result.subjects?.length) {
      const hints = {
        'Schedule table not found':
          'Schedule table not found. Scroll until all subjects are visible, then refresh this page (F5) and open PUPSync again.',
        'No subjects parsed from schedule table':
          'Found the schedule page but could not read subjects. Refresh the page (F5) and try again.',
        'Content script not available':
          'Extension could not connect to this tab. Reload PUPSync at chrome://extensions, refresh SIAS (F5), then try again.'
      };
      showStateA(
        hints[result?.error] ||
          'Could not read the schedule. Refresh the SIAS page (F5), then open PUPSync again.'
      );
      return;
    }

    state.subjects = result.subjects.map((s) => ({
      ...s,
      excluded: s.excluded ?? false
    }));
    if (result.term) {
      await applyTerm(result.term);
    } else if (result.termHeader) {
      const term = SemesterConfig.buildTermInfo(result.termHeader);
      if (term) await applyTerm(term);
      else renderTermLabel();
    } else {
      renderTermLabel();
    }
    if (ensureAutoColors()) await saveColors();
    showView('b');
    setScheduleView(state.scheduleView);
    renderSubjects();
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
