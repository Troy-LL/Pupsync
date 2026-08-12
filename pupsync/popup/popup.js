/**
 * PUPSync popup — state machine, color picker, preview, import.
 */
(function () {
  const state = {
    subjects: [],
    subjectColors: {},
    subjectChipLabels: {},
    subjectCalendarTitles: {},
    gridPrefs: { ...PUPSYNC.DEFAULT_GRID_PREFS },
    semesterStart: '',
    semesterEnd: '',
    previewOpen: false,
    scheduleView: 'grid',
    currentView: 'a',
    term: null,
    noClassDates: [],
    gridRenderToken: 0,
    firstName: null,
    gradesStanding: null,
    gradesYears: [],
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
    gwaMedal: document.getElementById('gwa-medal'),
    gwaStanding: document.getElementById('gwa-standing'),
    gwaWarnings: document.getElementById('gwa-warnings'),
    gwaSems: document.getElementById('gwa-sems'),
    btnExportGwa: document.getElementById('btn-export-gwa'),
    subjectList: document.getElementById('subject-list'),
    subjectListPanel: document.getElementById('subject-list-panel'),
    subjectListDim: document.getElementById('subject-list-dim'),
    scheduleGridPanel: document.getElementById('schedule-grid-panel'),
    scheduleGridScroll: document.getElementById('schedule-grid-scroll'),
    gridStartHour: document.getElementById('grid-start-hour'),
    gridEndHour: document.getElementById('grid-end-hour'),
    gridShowCode: document.getElementById('grid-show-code'),
    gridShowTime: document.getElementById('grid-show-time'),
    chipEditPopover: document.getElementById('chip-edit-popover'),
    chipEditInput: document.getElementById('chip-edit-input'),
    chipEditColor: document.getElementById('chip-edit-color'),
    chipEditHex: document.getElementById('chip-edit-hex'),
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
    btnExport: document.getElementById('btn-export'),
    btnPreview: document.getElementById('btn-preview'),
    importError: document.getElementById('import-error'),
    progressLabel: document.getElementById('progress-label'),
    progressFill: document.getElementById('progress-fill'),
    progressTrack: document.getElementById('progress-track'),
    successText: document.getElementById('success-text'),
    siasLink: document.getElementById('sias-link'),
    gradesLink: document.getElementById('grades-link'),
    landingGreeting: document.getElementById('landing-greeting'),
    btnAgain: document.getElementById('btn-again'),
    termDetected: document.getElementById('term-detected'),
    stateAHint: document.getElementById('state-a-hint'),
    homeOverview: document.getElementById('home-overview'),
    homeOvGwaValue: document.getElementById('home-ov-gwa-value'),
    homeOvLatin: document.getElementById('home-ov-latin'),
    homeOvRows: document.getElementById('home-ov-rows'),
    homeOvCounts: document.getElementById('home-ov-counts'),
    homeOvSource: document.getElementById('home-ov-source'),
    landingNotice: document.getElementById('landing-notice'),
    landingNoticeTitle: document.getElementById('landing-notice-title'),
    landingNoticeBody: document.getElementById('landing-notice-body'),
    siasLinkDesc: document.getElementById('sias-link-desc')
  };

  /**
   * Popup UI state that survives a close/reopen: which <details> the user drilled
   * into, scroll position, schedule view, and disclosure toggles. A misclick closes
   * the popup, so reopening should land where they left off.
   * session storage clears on browser restart; falls back to local in the dev harness.
   */
  const UI_STATE_KEY = 'popupUiState';
  const uiStore = chrome.storage.session || chrome.storage.local;
  const ui = {
    openDetails: [],
    scroll: {},
    scheduleView: null,
    previewOpen: false,
    semOpen: false
  };
  let uiSaveTimer = null;
  /** Ignore scroll events until the restore pass runs, so render-time 0 does not clobber. */
  let uiRestored = false;

  async function loadUiState() {
    try {
      const data = await uiStore.get(UI_STATE_KEY);
      Object.assign(ui, data?.[UI_STATE_KEY] || {});
    } catch {
      /* first run or storage unavailable — defaults are fine */
    }
  }

  function saveUiState() {
    clearTimeout(uiSaveTimer);
    uiSaveTimer = setTimeout(() => {
      Promise.resolve(uiStore.set({ [UI_STATE_KEY]: { ...ui } })).catch(
        () => {}
      );
    }, 150);
  }

  function captureOpenDetails() {
    ui.openDetails = Array.from(
      document.querySelectorAll('details[data-uikey][open]')
    ).map((d) => d.dataset.uikey);
    saveUiState();
  }

  function restoreOpenDetails() {
    const want = new Set(ui.openDetails || []);
    document.querySelectorAll('details[data-uikey]').forEach((d) => {
      d.open = want.has(d.dataset.uikey);
    });
  }

  function restoreScroll() {
    const top = ui.scroll?.[state.currentView] || 0;
    requestAnimationFrame(() => {
      if (top) {
        (document.scrollingElement || document.documentElement).scrollTop = top;
      }
      uiRestored = true;
    });
  }

  const STATE_A_HINT_DEFAULT =
    'Open a page above, then click PUPSync again.';

  function renderLandingGreeting() {
    if (!els.landingGreeting) return;
    els.landingGreeting.textContent = state.firstName
      ? `Hi ${state.firstName}!`
      : 'Hi!';
  }

  function setLandingLinks(tabUrl) {
    let host = 'sis2.pup.edu.ph';
    try {
      if (tabUrl && PUPSYNC.isSiasHostUrl(tabUrl)) {
        host = new URL(tabUrl).hostname;
      }
    } catch {
      /* keep default */
    }
    if (els.siasLink) {
      els.siasLink.href = PUPUtils.siasPathUrlForHost(
        host,
        PUPSYNC.SIAS_SCHEDULE_PATH
      );
    }
    if (els.gradesLink) {
      els.gradesLink.href = PUPUtils.siasPathUrlForHost(
        host,
        PUPSYNC.SIAS_GRADES_PATH
      );
    }
  }

  /**
   * If the active tab is already on SIAS, navigate it in place.
   * Otherwise open a new tab so we don't hijack unrelated pages.
   */
  async function openSiasUrl(url) {
    if (!url) return;
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab?.id != null && PUPSYNC.isSiasHostUrl(tab.url)) {
      await chrome.tabs.update(tab.id, { url });
    } else {
      await chrome.tabs.create({ url });
    }
    // Dev preview reloads via mock tabs API — don't close the preview window.
    if (!window.__PUPSYNC_DEV__) window.close();
  }

  function onLandingNavClick(e) {
    // Modified clicks keep browser default (open in new tab / window).
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) {
      return;
    }
    e.preventDefault();
    void openSiasUrl(e.currentTarget.href);
  }

  async function saveFirstName(name) {
    if (!name) return;
    state.firstName = name;
    await chrome.storage.local.set({
      [PUPSYNC.STORAGE_KEYS.STUDENT_FIRST_NAME]: name
    });
    renderLandingGreeting();
  }

  async function refreshIdentityFromTab(tabId) {
    if (!tabId) return;
    try {
      const result = await new Promise((resolve) => {
        chrome.runtime.sendMessage(
          { type: PUPSYNC.MESSAGE_TYPES.SCRAPE_IDENTITY, tabId },
          (res) => {
            if (chrome.runtime.lastError) resolve(null);
            else resolve(res);
          }
        );
      });
      if (result?.ok && result.firstName) {
        await saveFirstName(result.firstName);
      }
    } catch {
      /* ignore */
    }
  }

  const SIAS_LINK_DESC_DEFAULT = 'Sync classes to Google Calendar';

  /**
   * Blocking-state banner above the landing actions. Passing null clears it.
   * The only notice today is empty enlistment, where "Import schedule" leads back to
   * the page the student is already on — so the notice also makes that action inert
   * instead of leaving a button that silently does nothing when clicked.
   */
  function setLandingNotice(notice) {
    const inert = !!notice;
    if (els.landingNotice) {
      els.landingNotice.hidden = !inert;
      if (els.landingNoticeTitle) {
        els.landingNoticeTitle.textContent = notice?.title || '';
      }
      if (els.landingNoticeBody) {
        els.landingNoticeBody.textContent = notice?.body || '';
      }
    }
    if (els.siasLink) {
      els.siasLink.classList.toggle('is-inert', inert);
      els.siasLink.setAttribute('aria-disabled', String(inert));
      if (inert) els.siasLink.setAttribute('tabindex', '-1');
      else els.siasLink.removeAttribute('tabindex');
    }
    if (els.siasLinkDesc) {
      els.siasLinkDesc.textContent = inert
        ? 'Nothing to import yet'
        : SIAS_LINK_DESC_DEFAULT;
    }
    // The notice carries the explanation; a duplicate footnote below just adds noise.
    if (els.stateAHint) els.stateAHint.hidden = inert;
  }

  function showStateA(hint, notice) {
    if (els.stateAHint) {
      els.stateAHint.textContent = hint || STATE_A_HINT_DEFAULT;
    }
    setLandingNotice(notice || null);
    renderLandingGreeting();
    showView('a');
  }

  /**
   * The schedule page loaded fine, the table is just empty — nothing is enlisted yet.
   * The term is already on the scrape payload even on this path, so name it.
   * displayLabel, not shortLabel: shortLabel drops the word "Semester" for badge use.
   */
  function emptyEnlistmentNotice(result) {
    const term =
      result?.term ||
      (result?.termHeader
        ? SemesterConfig.buildTermInfo(result.termHeader) ||
          PUPUtils.buildTermInfo(result.termHeader)
        : null);
    const label = term?.displayLabel || term?.shortLabel || '';
    return {
      title: 'No enlisted subjects yet',
      body: label
        ? `${label} has no classes posted to your schedule. They show up here once enlistment posts them, so no need to refresh.`
        : 'This schedule page has no classes posted yet. They show up here once enlistment posts them, so no need to refresh.'
    };
  }

  function hideHomeOverview() {
    if (els.homeOverview) els.homeOverview.hidden = true;
  }

  function latinLineFromCache(cache) {
    if (!cache) return '';
    if (cache.tier) return `On track: ${cache.tier}`;
    if (cache.qualifiesTier && cache.disqualified) {
      return `GWA fits ${cache.qualifiesTier} — open Grades for the full picture`;
    }
    if (cache.gwa != null) return 'Open Grades for Latin standing details';
    return '';
  }

  function renderHomeOverviewCard(cache) {
    if (!els.homeOverview) return;
    const gwa = cache?.gwa;
    if (gwa == null || !Number.isFinite(Number(gwa))) {
      hideHomeOverview();
      return;
    }

    els.homeOverview.hidden = false;
    if (els.homeOvGwaValue) {
      els.homeOvGwaValue.textContent = Number(gwa).toFixed(2);
    }

    const latin = latinLineFromCache(cache);
    if (els.homeOvLatin) {
      if (latin) {
        els.homeOvLatin.hidden = false;
        els.homeOvLatin.textContent = latin;
      } else {
        els.homeOvLatin.hidden = true;
        els.homeOvLatin.textContent = '';
      }
    }

    const rows = [];
    const units =
      cache.unitsEarned != null
        ? cache.unitsEarned
        : cache.totalUnits != null
          ? String(cache.totalUnits)
          : null;
    if (units) {
      rows.push(
        `<div class="home-ov-row"><span class="k">Units earned</span><span class="v">${escapeHtml(String(units))}</span></div>`
      );
    }
    if (cache.subjectsAsOf) {
      rows.push(
        `<div class="home-ov-row"><span class="k">Subjects as of</span><span class="v">${escapeHtml(cache.subjectsAsOf)}</span></div>`
      );
    }
    if (els.homeOvRows) {
      els.homeOvRows.hidden = rows.length === 0;
      els.homeOvRows.innerHTML = rows.join('');
    }

    const hasCounts =
      cache.enrolled != null || cache.dropped != null || cache.failed != null;
    if (els.homeOvCounts) {
      if (hasCounts) {
        els.homeOvCounts.hidden = false;
        els.homeOvCounts.innerHTML = `
            <div class="home-ov-count"><div class="n">${cache.enrolled != null ? cache.enrolled : '—'}</div><div class="t">Subjects</div></div>
            <div class="home-ov-count"><div class="n">${cache.dropped != null ? cache.dropped : '—'}</div><div class="t">Dropped</div></div>
            <div class="home-ov-count"><div class="n">${cache.failed != null ? cache.failed : '—'}</div><div class="t">Failed</div></div>`;
      } else {
        els.homeOvCounts.hidden = true;
        els.homeOvCounts.innerHTML = '';
      }
    }

    if (els.homeOvSource) {
      els.homeOvSource.textContent = cache.savedAt
        ? `From last grades sync · refreshes when you open Grades`
        : 'From last grades sync';
    }
  }

  async function readLastGradesCache() {
    try {
      const data = await chrome.storage.local.get(PUPSYNC.STORAGE_KEYS.LAST_GRADES);
      return data[PUPSYNC.STORAGE_KEYS.LAST_GRADES] || null;
    } catch {
      return null;
    }
  }

  async function writeLastGradesCache(snapshot) {
    if (!snapshot || snapshot.gwa == null) return;
    try {
      await chrome.storage.local.set({
        [PUPSYNC.STORAGE_KEYS.LAST_GRADES]: {
          ...snapshot,
          savedAt: new Date().toISOString()
        }
      });
    } catch {
      /* ignore */
    }
  }

  async function showHomeHub() {
    hideHomeOverview();
    showStateA('Pick a page below anytime — or stay here for your GWA snapshot.');
    const cache = await readLastGradesCache();
    if (cache?.gwa != null) {
      renderHomeOverviewCard(cache);
      restoreScroll();
      return;
    }
    showStateA();
    restoreScroll();
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
      a: 'Welcome',
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
      PUPSYNC.STORAGE_KEYS.SUBJECT_CHIP_LABELS,
      PUPSYNC.STORAGE_KEYS.SUBJECT_CALENDAR_TITLES,
      PUPSYNC.STORAGE_KEYS.SEMESTER_START,
      PUPSYNC.STORAGE_KEYS.SEMESTER_END,
      PUPSYNC.STORAGE_KEYS.STUDENT_FIRST_NAME,
      PUPSYNC.STORAGE_KEYS.GRID_PREFS
    ]);
    state.subjectColors = data[PUPSYNC.STORAGE_KEYS.SUBJECT_COLORS] || {};
    state.subjectChipLabels =
      data[PUPSYNC.STORAGE_KEYS.SUBJECT_CHIP_LABELS] || {};
    state.subjectCalendarTitles =
      data[PUPSYNC.STORAGE_KEYS.SUBJECT_CALENDAR_TITLES] || {};
    state.semesterStart =
      data[PUPSYNC.STORAGE_KEYS.SEMESTER_START] || defaults.start;
    state.semesterEnd = data[PUPSYNC.STORAGE_KEYS.SEMESTER_END] || defaults.end;
    state.firstName = data[PUPSYNC.STORAGE_KEYS.STUDENT_FIRST_NAME] || null;
    state.gridPrefs = {
      ...PUPSYNC.DEFAULT_GRID_PREFS,
      ...(data[PUPSYNC.STORAGE_KEYS.GRID_PREFS] || {})
    };
    els.semesterStart.value = state.semesterStart;
    els.semesterEnd.value = state.semesterEnd;
    renderLandingGreeting();
    renderTermLabel();
    renderGridPrefs();
  }

  /** Fill the hour selects and reflect current gridPrefs. */
  function renderGridPrefs() {
    const hourOptions = (selected) => {
      let html = `<option value=""${selected === null ? ' selected' : ''}>Auto</option>`;
      for (let h = 0; h <= 23; h++) {
        const label = PUPUtils.formatTime12h(`${String(h).padStart(2, '0')}:00`);
        html += `<option value="${h}"${selected === h ? ' selected' : ''}>${label}</option>`;
      }
      return html;
    };
    if (els.gridStartHour) {
      els.gridStartHour.innerHTML = hourOptions(state.gridPrefs.startHour);
    }
    if (els.gridEndHour) {
      els.gridEndHour.innerHTML = hourOptions(state.gridPrefs.endHour);
    }
    if (els.gridShowCode) els.gridShowCode.checked = !!state.gridPrefs.showCode;
    if (els.gridShowTime) els.gridShowTime.checked = !!state.gridPrefs.showTime;
  }

  function wireGridPrefs() {
    const update = async (patch) => {
      state.gridPrefs = { ...state.gridPrefs, ...patch };
      await saveGridPrefs();
      renderScheduleGrid();
    };
    const hour = (el) => (el.value === '' ? null : Number(el.value));
    els.gridStartHour?.addEventListener('change', () =>
      update({ startHour: hour(els.gridStartHour) })
    );
    els.gridEndHour?.addEventListener('change', () =>
      update({ endHour: hour(els.gridEndHour) })
    );
    els.gridShowCode?.addEventListener('change', () =>
      update({ showCode: els.gridShowCode.checked })
    );
    els.gridShowTime?.addEventListener('change', () =>
      update({ showTime: els.gridShowTime.checked })
    );
  }

  async function saveGridPrefs() {
    await chrome.storage.local.set({
      [PUPSYNC.STORAGE_KEYS.GRID_PREFS]: state.gridPrefs
    });
  }

  async function saveColors() {
    await chrome.storage.local.set({
      [PUPSYNC.STORAGE_KEYS.SUBJECT_COLORS]: state.subjectColors
    });
  }

  async function saveChipLabels() {
    await chrome.storage.local.set({
      [PUPSYNC.STORAGE_KEYS.SUBJECT_CHIP_LABELS]: state.subjectChipLabels
    });
  }

  async function saveCalendarTitles() {
    await chrome.storage.local.set({
      [PUPSYNC.STORAGE_KEYS.SUBJECT_CALENDAR_TITLES]:
        state.subjectCalendarTitles
    });
  }

  /** Subjects with calendarTitle overrides applied (import + preview). */
  function subjectsForCalendar() {
    return state.subjects.map((s) => {
      const custom = String(
        state.subjectCalendarTitles[s.subjectCode] || ''
      ).trim();
      if (!custom) return s;
      return { ...s, calendarTitle: custom };
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
    const start = state.semesterStart || els.semesterStart?.value || '';
    const end = state.semesterEnd || els.semesterEnd?.value || '';
    const range = start && end ? `${start} → ${end}` : '';
    const n = state.noClassDates?.length || 0;
    const exclusion =
      state.term?.schoolYearCode != null
        ? n
          ? ` · ${n} no-class days`
          : ' · no exclusions'
        : '';
    if (state.term?.displayLabel) {
      els.termDetected.hidden = false;
      els.termDetected.textContent = range
        ? `${state.term.displayLabel} · ${range}${exclusion}`
        : `${state.term.displayLabel}${exclusion}`;
    } else if (range) {
      els.termDetected.hidden = false;
      els.termDetected.textContent = `Semester · ${range}`;
    } else {
      els.termDetected.hidden = true;
      els.termDetected.textContent = '';
    }
  }

  function refreshNoClassDates(term) {
    const t = term || state.term;
    if (!t?.schoolYearCode) {
      state.noClassDates = [];
      return;
    }
    state.noClassDates = SemesterConfig.lookupNoClassDates(
      t.schoolYearCode,
      t.semester
    );
    if (!state.noClassDates.length) {
      console.warn(
        '[PUPSync] No no-class dates for',
        t.schoolYearCode,
        t.semester
      );
    }
  }

  function clearImportError() {
    if (!els.importError) return;
    els.importError.hidden = true;
    els.importError.textContent = '';
  }

  function showImportError(message) {
    if (!els.importError) {
      alert(message);
      return;
    }
    els.importError.hidden = false;
    els.importError.textContent = message;
  }

  async function applyTerm(term) {
    if (!term?.semesterStart || !term?.semesterEnd) return;
    state.term = term;
    state.semesterStart = term.semesterStart;
    state.semesterEnd = term.semesterEnd;
    els.semesterStart.value = term.semesterStart;
    els.semesterEnd.value = term.semesterEnd;
    refreshNoClassDates(term);
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
    // Chrome extension popups do not shrink after they grow. Once the week grid
    // widens the window, keep popup-wide for List (and import/success) in this
    // open so content fills the frame instead of a blank right column.
    const onGrid = state.scheduleView === 'grid';
    const onScheduleFlow =
      state.currentView === 'b' ||
      state.currentView === 'c' ||
      state.currentView === 'd';

    if (onScheduleFlow && onGrid) {
      state.popupLockedWide = true;
    }

    const wide = onScheduleFlow && (onGrid || !!state.popupLockedWide);
    document.body.classList.toggle('popup-wide', wide);
  }

  function setPreviewOpen(open) {
    state.previewOpen = open;
    els.previewPanel.hidden = !open;
    if (open) renderPreview();
    els.btnPreview.textContent = open ? 'Hide preview ▴' : 'Preview events ▾';
  }

  /** Reapply the disclosures the user had open before the popup closed. */
  function restoreScheduleDisclosures() {
    if (ui.semOpen) {
      els.semToggle.classList.add('open');
      els.semInputs.hidden = false;
      els.semToggle.setAttribute('aria-expanded', 'true');
    }
    if (ui.previewOpen) setPreviewOpen(true);
    restoreOpenDetails();
    restoreScroll();
  }

  function setScheduleView(view) {
    state.scheduleView = view;
    ui.scheduleView = view;
    saveUiState();
    const isGrid = view === 'grid';
    if (!isGrid) hideChipEditPopover();
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
    if (isGrid) renderScheduleGrid();
  }

  /** Match the on-screen week panel — never bake a taller bitmap than the viewport. */
  function gridExportSize() {
    const el = els.scheduleGridScroll;
    const rect =
      state.scheduleView === 'grid' ? el?.getBoundingClientRect() : null;
    const width = Math.round(Math.max(rect?.width || 0, 600));
    const height = Math.round(Math.max(rect?.height || 0, 280));
    return { width, height };
  }

  function buildWeekModelForPanel() {
    const subjects = getActiveSubjects();
    const { width: exportW, height: exportH } = gridExportSize();
    const chrome = PUPGridImage.exportChromeHeight();
    const chipOpts = {
      subjectChipLabels: state.subjectChipLabels,
      startHour: state.gridPrefs.startHour,
      endHour: state.gridPrefs.endHour
    };
    const probe = PUPUtils.buildWeekGridModel(subjects, state.subjectColors, {
      pxPerMin: 1,
      ...chipOpts
    });
    const pxPerMin = Math.max(
      0.4,
      (exportH - chrome) / Math.max(probe.spanMin, 60)
    );
    const model = PUPUtils.buildWeekGridModel(subjects, state.subjectColors, {
      pxPerMin,
      ...chipOpts
    });
    return {
      model,
      width: exportW,
      height: chrome + model.totalHeight
    };
  }

  async function renderScheduleGrid() {
    if (!els.scheduleGridScroll) return;
    const token = ++state.gridRenderToken;
    els.scheduleGridScroll.classList.add('is-rendering');
    hideChipEditPopover();

    await new Promise((r) =>
      requestAnimationFrame(() => requestAnimationFrame(r))
    );

    try {
      const { model, width, height } = buildWeekModelForPanel();
      if (token !== state.gridRenderToken) return;
      const n = new Set(model.blocks.map((b) => b.subjectCode)).size;
      PUPGridImage.mountWeekGrid(els.scheduleGridScroll, model, {
        width,
        height,
        showTime: state.gridPrefs.showTime,
        showCode: state.gridPrefs.showCode,
        ariaLabel: `Weekly schedule, ${n} subject${n === 1 ? '' : 's'}. Click a class to edit its grid label.`
      });
      wireWeekGridChipEditing();
    } catch (err) {
      console.error('[PUPSync] week grid failed', err);
      if (token === state.gridRenderToken) {
        els.scheduleGridScroll.replaceChildren();
        els.scheduleGridScroll.setAttribute(
          'aria-label',
          'Could not render schedule preview'
        );
      }
    } finally {
      if (token === state.gridRenderToken) {
        els.scheduleGridScroll.classList.remove('is-rendering');
      }
    }
  }

  function hideChipEditPopover() {
    if (!els.chipEditPopover) return;
    els.chipEditPopover.hidden = true;
    state.chipEditCode = null;
  }

  async function commitChipEditFromPopover(save) {
    const code = state.chipEditCode;
    if (!els.chipEditInput) {
      hideChipEditPopover();
      return;
    }
    if (save && code) {
      const maxLen = PUPSYNC.CHIP_LABEL_MAX_LENGTH || 12;
      const next = els.chipEditInput.value.trim().slice(0, maxLen);
      if (next) state.subjectChipLabels[code] = next;
      else delete state.subjectChipLabels[code];
      await saveChipLabels();
      document
        .querySelectorAll('.chip-label-input')
        .forEach((input) => {
          const row = input.closest('.subject-row');
          if (row?.dataset.code === code) input.value = next;
        });
    }
    hideChipEditPopover();
    if (save && code) renderScheduleGrid();
  }

  /**
   * Repaint a subject's blocks in place. A full renderScheduleGrid() would
   * remount the SVG and close the popover the user is still picking in.
   */
  function paintBlocksInPlace(code, hex) {
    els.scheduleGridScroll
      ?.querySelectorAll(`g.schedule-block[data-code="${CSS.escape(code)}"] rect`)
      .forEach((rect) => rect.setAttribute('fill', hex));
  }

  /** Write a color from any surface: state, storage, grid, list chip, preview. */
  async function setSubjectColor(code, value, { repaintInPlace = false } = {}) {
    state.subjectColors[code] = value;
    await saveColors();
    if (repaintInPlace) paintBlocksInPlace(code, PUPUtils.resolveColor(value).hex);
    else renderScheduleGrid();
    document.querySelectorAll('.subject-row').forEach((row) => {
      if (row.dataset.code !== code) return;
      const field = row.querySelector('.color-field');
      if (field) updateColorChip(field, value);
    });
    if (state.previewOpen) renderPreview();
  }

  function wireChipEditColor() {
    const { chipEditColor: swatch, chipEditHex: hex } = els;
    const apply = (value) => {
      const code = state.chipEditCode;
      if (!code) return;
      if (swatch) swatch.value = value;
      if (hex && document.activeElement !== hex) hex.value = value;
      setSubjectColor(code, value, { repaintInPlace: true });
    };
    swatch?.addEventListener('input', () => apply(swatch.value.toUpperCase()));
    hex?.addEventListener('input', () => {
      const raw = hex.value.trim();
      if (/^#[0-9a-f]{6}$/i.test(raw)) apply(raw.toUpperCase());
    });
  }

  function openChipEditPopover(code, currentLabel, anchorEl) {
    if (!els.chipEditPopover || !els.chipEditInput || !els.scheduleGridPanel) {
      return;
    }
    const maxLen = PUPSYNC.CHIP_LABEL_MAX_LENGTH || 12;
    state.chipEditCode = code;
    els.chipEditInput.maxLength = maxLen;
    els.chipEditInput.value = (
      state.subjectChipLabels[code] ||
      currentLabel ||
      ''
    ).slice(0, maxLen);

    const color = PUPUtils.resolveColor(state.subjectColors[code]);
    if (els.chipEditColor) els.chipEditColor.value = color.hex;
    if (els.chipEditHex) els.chipEditHex.value = color.hex;

    const panelRect = els.scheduleGridPanel.getBoundingClientRect();
    const rect = (
      anchorEl?.querySelector?.('rect') || anchorEl
    )?.getBoundingClientRect?.();
    if (rect) {
      const left = Math.max(8, rect.left - panelRect.left);
      const top = Math.max(8, rect.top - panelRect.top);
      const width = Math.min(
        Math.max(rect.width, 96),
        panelRect.width - left - 8
      );
      els.chipEditPopover.style.left = `${left}px`;
      els.chipEditPopover.style.top = `${top}px`;
      els.chipEditPopover.style.width = `${width}px`;
    } else {
      els.chipEditPopover.style.left = '12px';
      els.chipEditPopover.style.top = '12px';
      els.chipEditPopover.style.width = '140px';
    }

    els.chipEditPopover.hidden = false;
    requestAnimationFrame(() => {
      els.chipEditInput.focus();
      els.chipEditInput.select();
    });
  }

  function wireWeekGridChipEditing() {
    const svg = els.scheduleGridScroll?.querySelector('svg');
    svg?.querySelectorAll('g.schedule-block').forEach((g) => {
      const activate = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const code = g.getAttribute('data-code');
        if (!code) return;
        openChipEditPopover(code, g.getAttribute('data-label') || '', g);
      };
      g.addEventListener('click', activate);
      g.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') activate(e);
      });
    });
  }

  function buildPreviewEvents() {
    return PUPUtils.buildCalendarEvents(
      subjectsForCalendar(),
      state.semesterStart,
      state.semesterEnd,
      state.subjectColors,
      state.noClassDates
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
    const current = PUPUtils.resolveColor(label);
    const isCustom = !PUPSYNC.COLOR_BY_LABEL[String(label || '').trim()];
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
    const customHex = isCustom ? current.hex : '';
    return `
      <div class="color-field">
        <button type="button" class="color-chip" aria-haspopup="listbox" aria-expanded="false" aria-label="Color: ${current.label}" title="${current.label}">
          <span class="color-chip-dot" style="background:${current.hex}"></span>
          <span class="color-chip-chevron" aria-hidden="true">▾</span>
        </button>
        <div class="color-menu" role="listbox" hidden>
          ${options}
          <div class="color-custom">
            <input type="color" class="color-custom-input" value="${current.hex}" aria-label="Custom color" />
            <input type="text" class="color-custom-hex" maxlength="7" spellcheck="false" value="${customHex}" placeholder="#RRGGBB" aria-label="Custom color hex" />
          </div>
          <p class="color-custom-note">Custom colors show here; Google Calendar uses the closest preset.</p>
        </div>
      </div>`;
  }

  function updateColorChip(field, label) {
    const color = PUPUtils.resolveColor(label);
    const isPreset = !!PUPSYNC.COLOR_BY_LABEL[String(label || '').trim()];
    const dot = field.querySelector('.color-chip-dot');
    const chip = field.querySelector('.color-chip');
    if (dot) dot.style.background = color.hex;
    if (chip) {
      chip.title = color.label;
      chip.setAttribute('aria-label', `Color: ${color.label}`);
    }
    field.querySelectorAll('.color-option').forEach((opt) => {
      const on = isPreset && opt.dataset.label === label;
      opt.classList.toggle('selected', on);
      opt.setAttribute('aria-selected', String(on));
    });
    const swatch = field.querySelector('.color-custom-input');
    if (swatch) swatch.value = color.hex;
    const hexInput = field.querySelector('.color-custom-hex');
    if (hexInput && document.activeElement !== hexInput) {
      hexInput.value = isPreset ? '' : color.hex;
    }
  }

  function wireColorField(field, subject) {
    const chip = field.querySelector('.color-chip');
    const menu = field.querySelector('.color-menu');
    if (!chip || !menu) return;

    const applyColor = (value) => setSubjectColor(subject.subjectCode, value);

    const swatch = field.querySelector('.color-custom-input');
    const hexInput = field.querySelector('.color-custom-hex');
    if (swatch) {
      // Menu stays open while picking, so the grid updates under the picker.
      swatch.addEventListener('click', (e) => e.stopPropagation());
      swatch.addEventListener('input', (e) => {
        e.stopPropagation();
        applyColor(swatch.value.toUpperCase());
      });
    }
    if (hexInput) {
      let timer = null;
      const commit = () => {
        const raw = hexInput.value.trim();
        if (/^#[0-9a-f]{6}$/i.test(raw)) {
          applyColor(raw.toUpperCase());
        } else if (!raw) {
          applyColor(PUPSYNC.DEFAULT_COLOR_LABEL);
        } else {
          // Invalid: leave the stored color alone, snap the field back.
          updateColorChip(field, state.subjectColors[subject.subjectCode]);
        }
      };
      hexInput.addEventListener('click', (e) => e.stopPropagation());
      hexInput.addEventListener('input', () => {
        clearTimeout(timer);
        timer = setTimeout(commit, 280);
      });
      hexInput.addEventListener('change', () => {
        clearTimeout(timer);
        commit();
      });
    }

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
        await applyColor(opt.dataset.label);
        closeAllColorMenus();
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
    const maxLen = PUPSYNC.CHIP_LABEL_MAX_LENGTH || 12;
    const calMax = PUPSYNC.CALENDAR_TITLE_MAX_LENGTH || 100;
    const chipValue = escapeHtml(
      state.subjectChipLabels[subject.subjectCode] || ''
    );
    const calStored = state.subjectCalendarTitles[subject.subjectCode] || '';
    const calValue = escapeHtml(calStored);
    const calPlaceholder = escapeHtml(subject.description || '');
    const chipField = subject.parseError
      ? ''
      : interactive
        ? `<label class="chip-label-field">
            <span class="chip-label-caption">Grid label · week chips</span>
            <input type="text" class="chip-label-input" maxlength="${maxLen}" value="${chipValue}" placeholder="e.g. Web Dev" aria-label="Week grid label for ${escapeHtml(subject.subjectCode)}" />
          </label>`
        : state.subjectChipLabels[subject.subjectCode]
          ? `<div class="chip-label-readonly">${chipValue}</div>`
          : '';
    const calField = subject.parseError
      ? `<div class="subject-desc">${escapeHtml(subject.description)}</div>`
      : interactive
        ? `<label class="cal-title-field">
            <span class="chip-label-caption">Calendar title · Google Calendar import</span>
            <input type="text" class="cal-title-input" maxlength="${calMax}" value="${calValue}" placeholder="${calPlaceholder}" aria-label="Calendar event title for ${escapeHtml(subject.subjectCode)}" />
          </label>`
        : `<div class="subject-desc">${escapeHtml(calStored || subject.description)}</div>`;

    row.innerHTML = `
      <div class="subject-top">
        <input type="checkbox" ${subject.excluded ? '' : 'checked'} ${interactive ? '' : 'disabled'} aria-label="Include ${subject.subjectCode}">
        <div class="subject-info">
          <div class="subject-code">${escapeHtml(subject.subjectCode)}</div>
          ${calField}
          <div class="schedule-tag">${escapeHtml(tag)}</div>
          ${chipField}
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
      const chipInput = row.querySelector('.chip-label-input');
      if (chipInput) {
        let debounce = null;
        const commit = async () => {
          const next = chipInput.value.trim().slice(0, maxLen);
          chipInput.value = next;
          if (next) state.subjectChipLabels[subject.subjectCode] = next;
          else delete state.subjectChipLabels[subject.subjectCode];
          await saveChipLabels();
          renderScheduleGrid();
        };
        chipInput.addEventListener('input', () => {
          clearTimeout(debounce);
          debounce = setTimeout(commit, 280);
        });
        chipInput.addEventListener('change', commit);
      }
      const calInput = row.querySelector('.cal-title-input');
      if (calInput) {
        let debounce = null;
        const commit = async () => {
          const next = calInput.value.trim().slice(0, calMax);
          const original = String(subject.description || '').trim();
          if (next && next !== original) {
            state.subjectCalendarTitles[subject.subjectCode] = next;
            calInput.value = next;
          } else {
            delete state.subjectCalendarTitles[subject.subjectCode];
            calInput.value = '';
          }
          await saveCalendarTitles();
          if (state.previewOpen) renderPreview();
        };
        calInput.addEventListener('input', () => {
          clearTimeout(debounce);
          debounce = setTimeout(commit, 280);
        });
        calInput.addEventListener('change', commit);
      }
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

  function listerBadgeHtml(badge, name) {
    if (!badge) return '';
    const title =
      name ||
      (badge === 'PL' ? "President's Lister" : "Dean's Lister");
    return `<span class="gwa-lister gwa-lister-${escapeHtml(String(badge).toLowerCase())}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}">${escapeHtml(badge)}</span>`;
  }

  function honorMedalForTier(tier) {
    const row = (PUPSYNC.HONOR_TIERS || []).find((t) => t.label === tier);
    return row?.medal || null;
  }

  function foolsMedalCaption(medal) {
    if (medal === 'gold') return "Fool's gold";
    if (medal === 'silver') return "Fool's silver";
    if (medal === 'bronze') return "Fool's bronze";
    return "Fool's medal";
  }

  /** Real medals, or fake “almost” medals when a rule breaks eligibility. */
  function medalSvg(medal, fools = false) {
    if (fools) {
      if (medal === 'gold') {
        /* Painted cardboard — peeling “gold” paint */
        return `
          <svg class="gwa-medal-svg" viewBox="0 0 48 56" width="40" height="46" aria-hidden="true">
            <path d="M18 22 L13 3 H19.5 L24 14 L28.5 3 H35 L30 22 Z" fill="#c4a484"/>
            <path d="M19 20 L15 5 H20 L24 13 L28 5 H33 L29 20 Z" fill="#d4b896" opacity="0.7"/>
            <circle cx="24" cy="34" r="16" fill="#c9a66b"/>
            <circle cx="24" cy="34" r="14.5" fill="#e6c35c"/>
            <path d="M32 22 L38 28 L34 30 L37 36 L30 33 Z" fill="#b89a6a"/>
            <path d="M32.5 23.5 L36.5 27.5 L34 28.5 L36 32.5 L31 30.5 Z" fill="#d8c39a"/>
            <path d="M24 25 L26.2 30.2 L31.8 30.7 L27.4 34.4 L28.7 39.8 L24 36.9 L19.3 39.8 L20.6 34.4 L16.2 30.7 L21.8 30.2 Z" fill="#b8860b" opacity="0.55"/>
            <path d="M14 40 Q18 44 24 42" fill="none" stroke="#8a6a3a" stroke-width="1" opacity="0.5"/>
          </svg>`;
      }
      if (medal === 'silver') {
        /* Soda-can lid + pull tab */
        return `
          <svg class="gwa-medal-svg" viewBox="0 0 48 56" width="40" height="46" aria-hidden="true">
            <path d="M20 18 L17 4 H22 L24 12 L26 4 H31 L28 18 Z" fill="#9aa3ab"/>
            <circle cx="24" cy="34" r="16" fill="#b8c0c6"/>
            <circle cx="24" cy="34" r="13" fill="none" stroke="#8e969e" stroke-width="1.25"/>
            <circle cx="24" cy="34" r="7" fill="none" stroke="#8e969e" stroke-width="1"/>
            <rect x="21.5" y="22" width="5" height="10" rx="1.5" fill="#d7dde2" stroke="#7d848c" stroke-width="0.75"/>
            <circle cx="24" cy="25" r="1.6" fill="#7d848c"/>
            <path d="M20 20 H28 V17.5 C28 15.5 26.2 14 24 14 S20 15.5 20 17.5 Z" fill="#d7dde2" stroke="#7d848c" stroke-width="0.75"/>
          </svg>`;
      }
      /* Dalgona — honeycomb cookie with a cracked star */
      return `
        <svg class="gwa-medal-svg" viewBox="0 0 48 56" width="40" height="46" aria-hidden="true">
          <path d="M18 22 L14 4 H20 L24 13 L28 4 H34 L30 22 Z" fill="#c4a484" opacity="0.85"/>
          <circle cx="24" cy="34" r="16" fill="#c47a2a"/>
          <circle cx="24" cy="34" r="14" fill="#e0a045"/>
          <path d="M24 22 L27.2 28.5 H34 L28.8 32.8 L31 39.5 L24 35.8 L17 39.5 L19.2 32.8 L14 28.5 H20.8 Z" fill="none" stroke="#8a4b12" stroke-width="1.4" stroke-linejoin="round"/>
          <path d="M22 30 L26 37" fill="none" stroke="#8a4b12" stroke-width="1.1" stroke-linecap="round"/>
          <path d="M27 29 L30 33" fill="none" stroke="#8a4b12" stroke-width="1" stroke-linecap="round" opacity="0.8"/>
          <circle cx="18" cy="28" r="1.1" fill="#f0c56a" opacity="0.7"/>
          <circle cx="31" cy="38" r="1.2" fill="#f0c56a" opacity="0.55"/>
        </svg>`;
    }

    const fills = {
      gold: { face: '#e8b923', rim: '#b8860b', ribbon: '#7a0019' },
      silver: { face: '#c5c9ce', rim: '#7d848c', ribbon: '#5c0013' },
      bronze: { face: '#c67b3c', rim: '#8a4b1f', ribbon: '#5c0013' }
    };
    const c = fills[medal] || fills.bronze;
    return `
      <svg class="gwa-medal-svg" viewBox="0 0 48 56" width="40" height="46" aria-hidden="true">
        <path d="M18 22 L12 2 H20 L24 14 L28 2 H36 L30 22 Z" fill="${c.ribbon}"/>
        <circle cx="24" cy="34" r="16" fill="${c.rim}"/>
        <circle cx="24" cy="34" r="12.5" fill="${c.face}"/>
        <path d="M24 24.5 L26.4 30.2 L32.5 30.8 L27.9 34.9 L29.3 40.8 L24 37.6 L18.7 40.8 L20.1 34.9 L15.5 30.8 L21.6 30.2 Z" fill="${c.rim}" opacity="0.9"/>
      </svg>`;
  }

  function setHonorMedal(tier, fools = false) {
    const el = els.gwaMedal;
    if (!el) return;
    const medal = honorMedalForTier(tier);
    if (!medal) {
      el.hidden = true;
      el.innerHTML = '';
      el.className = 'gwa-medal';
      el.removeAttribute('title');
      return;
    }
    el.hidden = false;
    el.className = `gwa-medal gwa-medal-${medal}${fools ? ' is-fools' : ''}`;
    el.innerHTML = medalSvg(medal, fools);
    el.setAttribute(
      'title',
      fools
        ? `${foolsMedalCaption(medal)} — GWA is in ${tier} range; Latin honors has extra rules`
        : tier
    );
  }

  const STANDING_LINES = {
    onTrack: [
      'Looking good, {name} — on track for {tier}.',
      'Nice work, {name}. {tier} is looking very real.',
      'Hey {name} — you’re pacing for {tier}. Keep that energy.',
      'Proud of this one, {name}. {tier} track.',
      '{name}, that GWA is quietly doing {tier} things.',
      'Solid run, {name}. Still on track for {tier}.',
      'You got this, {name} — {tier} is in reach.',
      'Clean numbers, {name}. On track for {tier}.',
      'Breathe, {name}. You’re doing great — {tier} pace.',
      'All good, {name}. {tier} is still on the table.'
    ],
    fools: [
      'Good try, {name} — {fool}. Your GWA still sits in {tier} range.',
      'Hey {name}, that’s {fool} energy. The GWA still looks like {tier}.',
      'Close in spirit, {name}. {fool} for now — GWA’s still {tier}-ish.',
      'You’re fine, {name}. {fool}, but that average still says {tier}.',
      'No stress, {name}. {fool} medal — GWA is still in {tier} territory.',
      'Still impressive, {name}. {fool}, and the GWA hasn’t quit {tier}.',
      'Take the W on the average, {name}. {fool}, but {tier}-range GWA.',
      'Latin honors is picky, {name}. {fool} — GWA still vibes {tier}.',
      'You’re doing real work, {name}. {fool} — and that GWA still reads {tier}.',
      'Chin up, {name}. {fool}, and that GWA still belongs near {tier}.'
    ],
    dq: [
      'Latin honors is picky, {name} — you’re still doing real work.',
      'Hey {name}, honors rules are harsh. You’re still putting in the hours.',
      'It’s alright, {name}. This doesn’t erase what you already did.',
      'Breathe, {name}. Grades are a chapter, not the whole book.',
      'You’re fine, {name}. Keep going — the effort still counts.',
      'No lecture needed, {name}. You’re doing the best you can with this.',
      'Soft landing, {name}. Latin honors isn’t the only score that matters.',
      'Still with you, {name}. One rough rule doesn’t define the semester.',
      'Good try overall, {name}. Show up again tomorrow — that’s enough.',
      'Hey {name}, you’re more than a cutoff. Keep being kind to yourself.'
    ],
    below: [
      'No Latin honors cutoff yet, {name} — and that’s okay. You’re doing fine.',
      'Hey {name}, no honors band right now. You’re still doing the work.',
      'All good, {name}. Cutoffs can wait — you’re showing up.',
      'You’re fine, {name}. Not every semester has to chase a medal.',
      'Breathe, {name}. Steady is still progress.',
      'No rush, {name}. GWA is a long game and you’re in it.',
      'It’s alright, {name}. Focus on the next class, not the ribbon.',
      'Soft truth, {name}: you’re doing enough for today.',
      'Keep going, {name}. Fine is a perfectly good place to be.',
      'Hey {name} — grades will move. You’re still trying, and that matters.'
    ]
  };

  function fillStandingLine(template, vars) {
    const name = state.firstName || '';
    let out = template;
    if (name) {
      out = out.replaceAll('{name}', name);
    } else {
      out = out
        .replaceAll(', {name} —', ' —')
        .replaceAll(', {name}.', '.')
        .replaceAll(', {name}', '')
        .replaceAll('Hey {name} —', 'Hey —')
        .replaceAll('Hey {name},', 'Hey,')
        .replaceAll('{name}, ', '')
        .replaceAll('{name} —', '')
        .replaceAll('{name} ', '')
        .replaceAll('{name}', '');
      out = out.replace(/^,\s*/, '').replace(/\s{2,}/g, ' ').trim();
      out = out.replace(/^—\s*/, '');
      // Capitalize if we stripped a leading name
      if (out && /^[a-z]/.test(out)) {
        out = out.charAt(0).toUpperCase() + out.slice(1);
      }
    }
    return out
      .replaceAll('{tier}', vars.tier || '')
      .replaceAll('{fool}', vars.fool || '');
  }

  function pickStandingLine(pool, vars) {
    const line = pool[Math.floor(Math.random() * pool.length)];
    return fillStandingLine(line, vars);
  }

  function standingMessage(liveStanding) {
    if (liveStanding.disqualified) {
      if (liveStanding.qualifiesTier) {
        const medal = honorMedalForTier(liveStanding.qualifiesTier);
        return {
          className: 'gwa-standing dq',
          text: pickStandingLine(STANDING_LINES.fools, {
            tier: liveStanding.qualifiesTier,
            fool: foolsMedalCaption(medal)
          }),
          foolsTier: liveStanding.qualifiesTier
        };
      }
      return {
        className: 'gwa-standing dq',
        text: pickStandingLine(STANDING_LINES.dq, {}),
        foolsTier: null
      };
    }
    if (liveStanding.tier) {
      return {
        className: 'gwa-standing ok',
        text: pickStandingLine(STANDING_LINES.onTrack, {
          tier: liveStanding.tier
        }),
        realTier: liveStanding.tier
      };
    }
    return {
      className: 'gwa-standing',
      text: pickStandingLine(STANDING_LINES.below, {}),
      foolsTier: null
    };
  }

  function renderGrades(result) {
    const { years, standing } = PUPUtils.buildGradesBreakdown(
      result.semesters || []
    );
    const liveStanding = result.standing || standing;
    state.gradesStanding = liveStanding;
    state.gradesYears = years;
    if (typeof PUPUtils.buildGradesHomeSnapshot === 'function') {
      void writeLastGradesCache(
        PUPUtils.buildGradesHomeSnapshot(result.semesters || [])
      );
    } else {
      void writeLastGradesCache(liveStanding);
    }

    els.gwaValue.textContent =
      liveStanding.gwa != null ? liveStanding.gwa.toFixed(2) : '—';
    els.gwaUnits.textContent = liveStanding.totalUnits || 0;

    const msg = standingMessage(liveStanding);
    const stand = els.gwaStanding;
    stand.className = msg.className;
    stand.textContent = msg.text;
    if (msg.realTier) setHonorMedal(msg.realTier, false);
    else if (msg.foolsTier) setHonorMedal(msg.foolsTier, true);
    else setHonorMedal(null);

    if (liveStanding.disqualifiers.length) {
      els.gwaWarnings.hidden = false;
      els.gwaWarnings.innerHTML =
        `<div class="gwa-warn-title">Just so you know — Latin honors also checks</div>` +
        liveStanding.disqualifiers
          .map((d) => `<div class="gwa-warn-item">${escapeHtml(d)}</div>`)
          .join('') +
        `<div class="gwa-warn-soft">None of this erases the effort you already put in.</div>`;
    } else {
      els.gwaWarnings.hidden = true;
    }

    els.gwaSems.innerHTML = years.length
      ? years
          .map((year) => {
            const yearGwa =
              year.gwa != null ? year.gwa.toFixed(2) : '—';
            const yearLister = listerBadgeHtml(year.lister, year.listerName);
            const semHtml = year.semesters
              .map((sem) => {
                const semGwa = sem.gwa != null ? sem.gwa.toFixed(2) : '—';
                const shortLabel =
                  sem.semester != null
                    ? `${sem.semester} Semester`
                    : sem.label || 'Semester';
                const semLister = listerBadgeHtml(sem.lister, sem.listerName);
                const rows = (sem.subjects || [])
                  .map((subj) => {
                    const gradeText =
                      subj.grade != null
                        ? Number(subj.grade).toFixed(2)
                        : escapeHtml(subj.gradeText || '—');
                    const mods = [
                      subj.excluded ? 'is-excluded' : '',
                      subj.failing ? 'is-failing' : '',
                      subj.pending ? 'is-pending' : '',
                      subj.passed ? 'is-pass' : '',
                      subj.nonNumeric ? 'is-nonnumeric' : ''
                    ]
                      .filter(Boolean)
                      .join(' ');
                    const note = subj.excluded
                      ? 'NSTP · not in GWA'
                      : subj.pending
                        ? 'No grade yet'
                        : subj.passed
                          ? 'Pass · not in GWA'
                          : subj.nonNumeric
                            ? 'Not counted in GWA'
                            : '';
                    return `
                    <div class="gwa-subj-row ${mods}">
                      <div class="gwa-subj-main">
                        <span class="gwa-subj-code">${escapeHtml(subj.subjectCode)}</span>
                        <span class="gwa-subj-desc">${escapeHtml(subj.description || '')}</span>
                        ${note ? `<span class="gwa-subj-note">${note}</span>` : ''}
                      </div>
                      <span class="gwa-subj-units">${escapeHtml(String(subj.units || '—'))}u</span>
                      <span class="gwa-subj-grade">${gradeText}</span>
                    </div>`;
                  })
                  .join('');
                return `
                <details class="gwa-sem" data-uikey="${escapeHtml(`y:${year.label}|s:${shortLabel}`)}">
                  <summary class="gwa-sem-summary">
                    <span class="gwa-sem-label">${escapeHtml(shortLabel)}</span>
                    <span class="gwa-row-meta">
                      ${semLister}
                      <span class="gwa-sem-gwa">${semGwa}</span>
                      <span class="chevron" aria-hidden="true">▾</span>
                    </span>
                  </summary>
                  <div class="gwa-subj-list">${rows || '<div class="gwa-subj-empty">No subjects</div>'}</div>
                </details>`;
              })
              .join('');
            return `
            <details class="gwa-year" data-uikey="${escapeHtml(`y:${year.label}`)}">
              <summary class="gwa-year-summary">
                <span class="gwa-year-label">${escapeHtml(year.label)}</span>
                <span class="gwa-row-meta">
                  ${yearLister}
                  <span class="gwa-year-gwa">${yearGwa}</span>
                  <span class="chevron" aria-hidden="true">▾</span>
                </span>
              </summary>
              <div class="gwa-year-body">${semHtml}</div>
            </details>`;
          })
          .join('')
      : '<div class="gwa-subj-empty">No semesters found</div>';

    showView('e');
    restoreOpenDetails();
    restoreScroll();
  }

  async function init() {
    await SemesterConfig.load();
    await loadStorage();
    wireGridPrefs();
    wireChipEditColor();
    await loadUiState();
    if (ui.scheduleView) state.scheduleView = ui.scheduleView;

    // `toggle` does not bubble — listen in the capture phase.
    document.addEventListener('toggle', captureOpenDetails, true);
    document.addEventListener(
      'scroll',
      () => {
        if (!uiRestored) return;
        ui.scroll[state.currentView] =
          (document.scrollingElement || document.documentElement).scrollTop ||
          0;
        saveUiState();
      },
      { passive: true }
    );

    els.semToggle.addEventListener('click', () => {
      const open = els.semToggle.classList.toggle('open');
      els.semInputs.hidden = !open;
      els.semToggle.setAttribute('aria-expanded', String(open));
      ui.semOpen = open;
      saveUiState();
    });

    els.semesterStart.addEventListener('change', async () => {
      await saveSemester();
      renderTermLabel();
    });
    els.semesterEnd.addEventListener('change', async () => {
      await saveSemester();
      renderTermLabel();
    });

    els.viewGrid?.addEventListener('click', () => setScheduleView('grid'));
    els.viewList?.addEventListener('click', () => setScheduleView('list'));

    els.chipEditInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void commitChipEditFromPopover(true);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        void commitChipEditFromPopover(false);
      }
    });
    els.chipEditInput?.addEventListener('blur', () => {
      if (els.chipEditPopover?.hidden) return;
      // Defer so a click on another block can open first
      setTimeout(() => {
        if (!els.chipEditPopover?.hidden && document.activeElement !== els.chipEditInput) {
          void commitChipEditFromPopover(true);
        }
      }, 120);
    });

    els.btnPreview.addEventListener('click', async () => {
      await saveSemester();
      setPreviewOpen(!state.previewOpen);
      ui.previewOpen = state.previewOpen;
      saveUiState();
    });

    // An inert action must not navigate — clicking it is exactly the spam we are stopping.
    els.siasLink?.addEventListener('click', (e) => {
      if (els.siasLink.getAttribute('aria-disabled') === 'true') {
        e.preventDefault();
      }
    });

    els.siasLink?.addEventListener('click', onLandingNavClick);
    els.gradesLink?.addEventListener('click', onLandingNavClick);

    els.btnImport.addEventListener('click', startImport);
    els.btnExport?.addEventListener('click', exportWeekGridImage);
    els.btnExportGwa?.addEventListener('click', exportGwaShareImage);
    els.btnAgain.addEventListener('click', () => showView('b'));

    document.addEventListener('click', () => closeAllColorMenus());
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (els.chipEditPopover && !els.chipEditPopover.hidden) {
          void commitChipEditFromPopover(false);
          return;
        }
        closeAllColorMenus();
      }
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
    setLandingLinks(tab?.url);

    if (tab?.id && tab.url && PUPSYNC.isSiasHostUrl(tab.url)) {
      await refreshIdentityFromTab(tab.id);
    }

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

    if (tab?.id && tab.url && PUPSYNC.isSiasHomeUrl(tab.url)) {
      await showHomeHub();
      return;
    }

    if (!tab?.id || !tab.url || !PUPSYNC.isSiasScheduleUrl(tab.url)) {
      hideHomeOverview();
      showStateA();
      return;
    }

    const result = await fetchScheduleFromTab(tab.id);
    if (!result?.ok || !result.subjects?.length) {
      if (result?.error === 'No enlisted subjects yet') {
        showStateA('', emptyEnlistmentNotice(result));
        return;
      }
      const hints = {
        'Schedule table not found':
          'Schedule table not found. Scroll until all subjects are visible, then refresh this page (F5) and open PUPSync again.',
        'No subjects parsed from schedule table':
          'Found the schedule page but could not read subjects. Refresh the page (F5) and try again.',
        'Content script not available':
          'Extension could not connect to this tab. Reload PUPSync at chrome://extensions, refresh SIAS (F5), then try again.',
        'Standalone scrape not loaded':
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
    clearImportError();
    showView('b');
    setScheduleView(state.scheduleView);
    renderSubjects();
    restoreScheduleDisclosures();
  }

  function updateProgress(current, total) {
    const pct = total ? Math.round((current / total) * 100) : 0;
    const label =
      total > 0
        ? `Creating event ${current} of ${total}…`
        : 'Starting import…';
    els.progressLabel.textContent = label;
    els.progressFill.style.transform = `scaleX(${pct / 100})`;
    if (els.progressTrack) {
      els.progressTrack.setAttribute('aria-valuenow', String(pct));
      els.progressTrack.setAttribute('aria-valuetext', label);
    }
  }

  async function startImport() {
    await saveSemester();
    clearImportError();
    const active = getActiveSubjects();
    if (!active.length) {
      showImportError('No subjects selected for import.');
      return;
    }

    showView('c');
    updateProgress(0, 0);

    chrome.runtime.sendMessage(
      {
        type: PUPSYNC.MESSAGE_TYPES.IMPORT,
        subjects: subjectsForCalendar(),
        semesterStart: state.semesterStart,
        semesterEnd: state.semesterEnd,
        subjectColors: state.subjectColors,
        noClassDates: state.noClassDates
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

  async function exportGwaShareImage() {
    if (!state.gradesStanding || typeof PUPGwaShare?.exportPng !== 'function') {
      alert('Nothing to export yet.');
      return;
    }
    try {
      const blob = await PUPGwaShare.exportPng({
        standing: state.gradesStanding,
        years: state.gradesYears,
        firstName: state.firstName
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const who = (state.firstName || 'gwa').replace(/\s+/g, '-');
      a.href = url;
      a.download = `pupsync-${who}-gwa.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err) {
      console.error('[PUPSync] GWA export failed', err);
      alert('Could not export the GWA image.');
    }
  }

  async function exportWeekGridImage() {
    await saveSemester();
    const subjects = getActiveSubjects();
    if (!subjects.length) {
      alert('No subjects selected to export.');
      return;
    }

    const { model, height } = buildWeekModelForPanel();
    const scale = Math.max(PUPGridImage.exportPixelRatio(), 2);

    try {
      const blob = await PUPGridImage.exportWeekGridPng(model, {
        width: Math.max(gridExportSize().width, 840),
        height,
        scale,
        showTime: state.gridPrefs.showTime,
        showCode: state.gridPrefs.showCode
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const term = (state.term?.shortLabel || 'schedule').replace(/\s+/g, '-');
      a.href = url;
      a.download = `pupsync-${term}.png`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);
    } catch (err) {
      console.error('[PUPSync] export image failed', err);
      alert('Could not export the week grid image.');
    }
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
    showView('b');
    setScheduleView(state.scheduleView);
    showImportError(`Import failed: ${err}`);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
