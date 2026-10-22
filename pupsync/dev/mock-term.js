/** Mock term from academic-calendar.csv (dev). */
(function () {
  async function initMockTerm() {
    await SemesterConfig.load();
    window.PUPSYNC_MOCK_TERM = SemesterConfig.buildTermInfo({
      schoolYearCode: '2627',
      semester: 'First',
      raw: 'School Year 2627 - First Semester'
    });
  }
  window.__PUPSYNC_MOCK_TERM_READY__ = initMockTerm();
})();
