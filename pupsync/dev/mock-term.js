/** Mock term from academic-calendar.csv (dev). */
(function () {
  async function initMockTerm() {
    await SemesterConfig.load();
    window.PUPSYNC_MOCK_TERM = SemesterConfig.buildTermInfo({
      schoolYearCode: '2526',
      semester: 'Second',
      raw: 'School Year 2526 - Second Semester'
    });
  }
  window.__PUPSYNC_MOCK_TERM_READY__ = initMockTerm();
})();
