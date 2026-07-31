/**
 * Find SIAS student banner: "LAST, FIRST … (YYYY-#####-XX-#)".
 */
(function () {
  if (typeof globalThis.__PUPSYNC_SCRAPE_IDENTITY__ === 'function') return;

  function scrapeIdentity() {
    const parse = globalThis.PUPUtils?.parseSiasStudentName;
    if (typeof parse !== 'function') {
      return { ok: false, error: 'Parser not loaded' };
    }

    const nodes = document.querySelectorAll(
      'h1, h2, h3, h4, p, div, span, td, strong, b, label'
    );
    for (const el of nodes) {
      const t = (el.textContent || '').replace(/\s+/g, ' ').trim();
      if (t.length < 12 || t.length > 140) continue;
      const parsed = parse(t);
      if (parsed?.firstName) {
        return {
          ok: true,
          firstName: parsed.firstName,
          lastName: parsed.lastName,
          raw: parsed.raw
        };
      }
    }
    return { ok: false, error: 'Student name not found' };
  }

  globalThis.__PUPSYNC_SCRAPE_IDENTITY__ = scrapeIdentity;
})();
