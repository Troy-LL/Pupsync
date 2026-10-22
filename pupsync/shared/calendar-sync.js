/**
 * Google Calendar sync rules for PUPSync.
 *
 * Safety rules this file enforces:
 * - Only events carrying the private extended property pupsync=true are ever
 *   read as ours. Titles and descriptions are never trusted, since a student
 *   can type "[COMP 016] ..." or "Faculty: ..." into their own events.
 * - Writes (update, delete) only touch events tagged pupsync=true with a
 *   pupsyncTerm equal to the term being synced. The one exception is
 *   adoption: a v0.2.3 event (tagged, but made before terms were stored)
 *   whose first class falls inside this term's dates gets the term added.
 * - A failed lookup aborts the sync before anything is created.
 * - Re-syncing an unchanged term makes zero writes (payload hash).
 * - A failure mid-run returns what was done so far so it can be saved.
 *
 * Works in the service worker (importScripts), the dev preview and Node tests.
 */
var PUPCalendarSync = globalThis.PUPCalendarSync;
if (!PUPCalendarSync) {
  const PAGE_SIZE = 250;
  const MAX_PAGES = 40;
  const MAX_RETRIES = 3;
  const ADOPT_WINDOW_DAYS = 14;
  const LEGACY_SCAN_MAX_PAGES = 8;

  class CalendarApiError extends Error {
    constructor(status, message) {
      super(message);
      this.name = 'CalendarApiError';
      this.status = status;
    }
  }

  /** Shown when the SIAS page did not tell us which semester this is. */
  const NO_TERM_ERROR =
    'PUPSync could not read the semester from your SIAS schedule page, so nothing was changed in Google Calendar. Refresh the schedule page (F5) and open PUPSync again.';

  /**
   * Semester names as SIAS writes them ("First Semester", "FIRST", "1st")
   * map to one fixed value. Anything else is unknown and gives ''.
   */
  function normalizeSemester(name) {
    const s = String(name || '')
      .toLowerCase()
      .replace(/semester|sem\b/g, '')
      .replace(/[^a-z0-9]+/g, '');
    const fixed = {
      first: 'first',
      '1st': 'first',
      second: 'second',
      '2nd': 'second',
      third: 'third',
      '3rd': 'third',
      summer: 'summer',
      midyear: 'midyear'
    };
    return fixed[s] || '';
  }

  /**
   * "2627" + "First Semester" -> "2627-first". There is no fallback: no
   * school year code or no known semester gives '', and callers must stop.
   * Never build a key from dates or a stored older term, since that can
   * point a second-sem sync at first-sem events.
   */
  function buildTermKey(term) {
    const code = String(term?.schoolYearCode || '').trim();
    if (!/^\d{4}$/.test(code)) return '';
    const sem = normalizeSemester(term?.semester);
    if (!sem) return '';
    return `${code}-${sem}`;
  }

  /** "comp  016 " -> "COMP 016", so codes compare the same everywhere. */
  function normalizeSubjectCode(code) {
    return String(code || '')
      .trim()
      .replace(/\s+/g, ' ')
      .toUpperCase();
  }

  /**
   * Every subject code on the scraped SIAS schedule, whatever its state:
   * ticked, unticked, parse error or no meeting times. Dropped-class removal
   * only removes codes missing from this list.
   */
  /** Subject code of one buildCalendarEvents item, normalized. */
  function eventSubjectCode(ev) {
    return normalizeSubjectCode(
      ev?.subjectCode || ev?.payload?.extendedProperties?.private?.pupsyncSubjectCode
    );
  }

  function scheduleSubjectCodes(subjects) {
    const out = new Set();
    for (const s of subjects || []) {
      const code = normalizeSubjectCode(s?.subjectCode);
      if (code) out.add(code);
    }
    return [...out];
  }

  /**
   * The IMPORT message the popup sends. `state` is the popup state; its
   * `subjects` is the full scraped SIAS list, so the schedule list holds every
   * code on the page (parse errors, no meeting times and unticked included).
   * `calendarSubjects` is what becomes events: ticked, parsed, overrides applied.
   */
  function buildImportMessage({ type, state, calendarSubjects }) {
    const scraped = Array.isArray(state?.subjects) ? state.subjects : [];
    return {
      type,
      subjects: calendarSubjects || [],
      term: state?.term ?? null,
      scheduleSubjectCodes: scheduleSubjectCodes(scraped),
      keepSubjectCodes: scraped.filter((s) => s?.excluded).map((s) => s.subjectCode),
      semesterStart: state?.semesterStart,
      semesterEnd: state?.semesterEnd,
      subjectColors: state?.subjectColors,
      noClassDates: state?.noClassDates,
      descriptionTemplate: state?.descriptionTemplate
    };
  }

  function stableStringify(value) {
    if (Array.isArray(value)) {
      return `[${value.map(stableStringify).join(',')}]`;
    }
    if (value && typeof value === 'object') {
      return `{${Object.keys(value)
        .sort()
        .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
        .join(',')}}`;
    }
    return JSON.stringify(value === undefined ? null : value);
  }

  /** FNV-1a over the payload, ignoring the hash field itself. */
  function payloadHash(payload) {
    const copy = JSON.parse(JSON.stringify(payload || {}));
    if (copy.extendedProperties?.private) {
      delete copy.extendedProperties.private.pupsyncHash;
    }
    const s = stableStringify(copy);
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16).padStart(8, '0');
  }

  /** Copy of a built payload with term and hash tags added. */
  function tagPayload(payload, termKey) {
    const out = JSON.parse(JSON.stringify(payload));
    out.extendedProperties = out.extendedProperties || {};
    out.extendedProperties.private = {
      ...(out.extendedProperties.private || {}),
      pupsync: 'true',
      pupsyncApp: 'pupsync',
      pupsyncTerm: termKey
    };
    out.extendedProperties.private.pupsyncHash = payloadHash(out);
    return out;
  }

  function eventKeyOf(priv) {
    const code = String(priv?.pupsyncSubjectCode || '').trim();
    if (!code) return '';
    const idx = parseInt(priv.pupsyncMeetingIndex || '0', 10);
    return `${code}__${Number.isFinite(idx) ? idx : 0}`;
  }

  function startTimeOf(item) {
    const raw = item?.start?.dateTime || item?.start?.date;
    if (!raw) return NaN;
    return new Date(raw).getTime();
  }

  function dayStart(iso, offsetDays = 0) {
    const d = new Date(`${iso}T00:00:00+08:00`);
    if (Number.isNaN(d.getTime())) return NaN;
    return d.getTime() + offsetDays * 86400000;
  }

  /**
   * Sort tagged events into this term's events, adoptable v0.2.3 events,
   * and everything we must leave alone.
   */
  function classifyTaggedEvents(items, { termKey, semesterStart, semesterEnd }) {
    const matched = {};
    const adoptable = {};
    const duplicates = [];
    const winStart = dayStart(semesterStart, -ADOPT_WINDOW_DAYS);
    const winEnd = dayStart(semesterEnd, 1);
    for (const item of items || []) {
      if (!item?.id || item.status === 'cancelled') continue;
      // Exception instances of a series share the master's tags; skip them.
      if (item.recurringEventId) continue;
      const priv = item.extendedProperties?.private;
      if (!priv || priv.pupsync !== 'true') continue;
      const key = eventKeyOf(priv);
      if (!key) continue;
      if (priv.pupsyncTerm) {
        if (priv.pupsyncTerm !== termKey) continue;
        if (matched[key]) duplicates.push(item);
        else matched[key] = item;
        continue;
      }
      const t = startTimeOf(item);
      if (Number.isFinite(t) && t >= winStart && t < winEnd && !adoptable[key]) {
        adoptable[key] = item;
      }
    }
    for (const key of Object.keys(adoptable)) {
      if (matched[key]) delete adoptable[key];
    }
    return { matched, adoptable, duplicates };
  }

  /**
   * What Remove PUPSync classes deletes for a term: this term's tagged
   * series, duplicates included. Untermed v0.2.3 events are not in it; they
   * get the term on the next import (adoption) and only then count.
   */
  function removableEvents(classified) {
    return [...Object.values(classified?.matched || {}), ...(classified?.duplicates || [])];
  }

  /**
   * Warn-only check for classes imported by v0.2.2 or older. Those events
   * have no PUPSync tag, so sync never reads, adopts or writes them, and a
   * re-import can sit a second copy next to them. This only counts likely
   * ones so the popup can say so: an untagged weekly series starting in
   * this term's window whose title starts with "[CODE] " for a code on the
   * current schedule. Titles are never used to adopt or change an event.
   */
  /** timeMin/timeMax for the legacy scan, matching the adoption window. */
  function legacyScanWindow(semesterStart, semesterEnd) {
    const a = dayStart(semesterStart, -ADOPT_WINDOW_DAYS);
    const b = dayStart(semesterEnd, 1);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return { timeMin: new Date(a).toISOString(), timeMax: new Date(b).toISOString() };
  }

  function findLegacyLookalikes(items, { subjectCodes, semesterStart, semesterEnd }) {
    const codes = new Set((subjectCodes || []).map(normalizeSubjectCode).filter(Boolean));
    const winStart = dayStart(semesterStart, -ADOPT_WINDOW_DAYS);
    const winEnd = dayStart(semesterEnd, 1);
    const found = [];
    if (!codes.size || !Number.isFinite(winStart) || !Number.isFinite(winEnd)) return found;
    for (const item of items || []) {
      if (!item?.id || item.status === 'cancelled' || item.recurringEventId) continue;
      if (item.extendedProperties?.private?.pupsync === 'true') continue;
      const weekly = (item.recurrence || []).some((r) => /^RRULE:.*FREQ=WEEKLY/i.test(String(r)));
      if (!weekly) continue;
      const m = String(item.summary || '').match(/^\[([^\]]+)\]\s/);
      if (!m || !codes.has(normalizeSubjectCode(m[1]))) continue;
      const t = startTimeOf(item);
      if (!Number.isFinite(t) || t < winStart || t >= winEnd) continue;
      found.push({ id: item.id, code: normalizeSubjectCode(m[1]) });
    }
    return found;
  }

  /**
   * Thin Calendar API client. fetchImpl is injected so tests can use a fake.
   */
  function createClient({ fetchImpl, token, baseUrl, sleep }) {
    const base = baseUrl || 'https://www.googleapis.com/calendar/v3/calendars/primary/events';
    const wait = sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
    const doFetch = fetchImpl || ((...a) => fetch(...a));

    async function call(method, url, body, attempt = 0) {
      let res;
      try {
        res = await doFetch(url, {
          method,
          headers: {
            Authorization: `Bearer ${token}`,
            ...(body ? { 'Content-Type': 'application/json' } : {})
          },
          body: body ? JSON.stringify(body) : undefined
        });
      } catch (err) {
        throw new CalendarApiError(0, `Network error: ${err?.message || err}`);
      }
      if (res.status === 429 && attempt < MAX_RETRIES) {
        await wait(Math.pow(2, attempt) * 500);
        return call(method, url, body, attempt + 1);
      }
      if (!res.ok) {
        let text = '';
        try {
          text = await res.text();
        } catch {}
        throw new CalendarApiError(res.status, `Calendar API ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`);
      }
      if (res.status === 204) return null;
      try {
        return await res.json();
      } catch {
        return null;
      }
    }

    return {
      async listTagged() {
        const items = [];
        let pageToken = '';
        for (let page = 0; page < MAX_PAGES; page++) {
          const url = new URL(base);
          url.searchParams.set('privateExtendedProperty', 'pupsync=true');
          url.searchParams.set('singleEvents', 'false');
          url.searchParams.set('maxResults', String(PAGE_SIZE));
          if (pageToken) url.searchParams.set('pageToken', pageToken);
          const data = await call('GET', url.toString());
          if (Array.isArray(data?.items)) items.push(...data.items);
          pageToken = data?.nextPageToken || '';
          if (!pageToken) return items;
        }
        throw new CalendarApiError(0, 'Too many pages of PUPSync events');
      },
      /**
       * Read-only list of every event in a time window, for the legacy
       * warning. Stops after a few pages; a partial list only means a
       * smaller warning count.
       */
      async listWindow({ timeMin, timeMax }) {
        const items = [];
        let pageToken = '';
        for (let page = 0; page < LEGACY_SCAN_MAX_PAGES; page++) {
          const url = new URL(base);
          url.searchParams.set('timeMin', timeMin);
          url.searchParams.set('timeMax', timeMax);
          url.searchParams.set('singleEvents', 'false');
          url.searchParams.set('maxResults', String(PAGE_SIZE));
          if (pageToken) url.searchParams.set('pageToken', pageToken);
          const data = await call('GET', url.toString());
          if (Array.isArray(data?.items)) items.push(...data.items);
          pageToken = data?.nextPageToken || '';
          if (!pageToken) break;
        }
        return items;
      },
      insert(payload) {
        return call('POST', base, payload);
      },
      patch(id, payload) {
        return call('PATCH', `${base}/${encodeURIComponent(id)}`, payload);
      },
      remove(id) {
        return call('DELETE', `${base}/${encodeURIComponent(id)}`);
      }
    };
  }

  /**
   * Sync one term.
   * @param {object} opts
   * @param {object} opts.client createClient() result
   * @param {Array} opts.events PUPUtils.buildCalendarEvents output
   * @param {string} opts.termKey buildTermKey output
   * @param {string[]} [opts.scheduleSubjectCodes] every code on the scraped
   *   SIAS schedule (scheduleSubjectCodes()). A class event is removed as
   *   dropped only when its code is missing from this list, so parse-error,
   *   no-meeting and unticked subjects are never removed. Nothing is removed
   *   (removalSkipped) when the list is missing, empty, or lacks a code that
   *   is being imported in this run.
   * @param {string[]} [opts.keepSubjectCodes] extra codes to leave alone
   * @param {function} [opts.onProgress] (done, total, counts)
   */
  async function syncTerm({
    client,
    events,
    termKey,
    semesterStart,
    semesterEnd,
    scheduleSubjectCodes: onSchedule,
    keepSubjectCodes = [],
    onProgress
  }) {
    if (!termKey) {
      return { ok: false, noTerm: true, error: NO_TERM_ERROR, aborted: true };
    }
    let existing;
    try {
      existing = classifyTaggedEvents(await client.listTagged(), {
        termKey,
        semesterStart,
        semesterEnd
      });
    } catch (err) {
      // Never fall back to a stale local map: abort before any write.
      return {
        ok: false,
        aborted: true,
        status: err?.status || 0,
        error: err?.message || String(err)
      };
    }

    const counts = { created: 0, updated: 0, unchanged: 0, adopted: 0, removed: 0 };
    const map = {};
    const desiredKeys = new Set();
    const steps = events.length;
    let done = 0;

    const report = () => {
      if (onProgress) onProgress(done, steps, { ...counts });
    };

    for (const ev of events) {
      const key = ev.eventKey || `${ev.subjectCode}__${ev.meetingIndex ?? 0}`;
      desiredKeys.add(key);
      const payload = tagPayload(ev.payload, termKey);
      const hash = payload.extendedProperties.private.pupsyncHash;
      try {
        const mine = existing.matched[key];
        const legacy = existing.adoptable[key];
        if (mine) {
          if (mine.extendedProperties?.private?.pupsyncHash === hash) {
            counts.unchanged++;
            map[key] = mine.id;
          } else {
            try {
              await client.patch(mine.id, payload);
              counts.updated++;
              map[key] = mine.id;
            } catch (err) {
              if (err?.status !== 404 && err?.status !== 410) throw err;
              const made = await client.insert(payload);
              counts.created++;
              if (made?.id) map[key] = made.id;
            }
          }
        } else if (legacy) {
          await client.patch(legacy.id, payload);
          counts.adopted++;
          counts.updated++;
          map[key] = legacy.id;
        } else {
          const made = await client.insert(payload);
          counts.created++;
          if (made?.id) map[key] = made.id;
        }
      } catch (err) {
        return {
          ok: false,
          partial: true,
          status: err?.status || 0,
          error: err?.message || String(err),
          done,
          total: steps,
          ...counts,
          map
        };
      }
      done++;
      report();
    }

    // Classes dropped from this term's schedule: remove their events, this
    // term only, and only for codes no longer anywhere on the SIAS schedule.
    // The list must be non-empty and hold every code imported in this run;
    // otherwise it is not the full schedule and nothing is removed.
    const scheduleSet = new Set(
      (Array.isArray(onSchedule) ? onSchedule : []).map(normalizeSubjectCode).filter(Boolean)
    );
    const importedCodes = new Set(events.map(eventSubjectCode).filter(Boolean));
    const canRemove =
      scheduleSet.size > 0 && [...importedCodes].every((code) => scheduleSet.has(code));
    const keep = new Set([
      ...scheduleSet,
      ...(keepSubjectCodes || []).map(normalizeSubjectCode).filter(Boolean)
    ]);
    const codeOf = (item) =>
      normalizeSubjectCode(item.extendedProperties?.private?.pupsyncSubjectCode);
    let leftAlone = 0;
    let toRemove = [];
    for (const [key, item] of Object.entries(existing.matched)) {
      if (desiredKeys.has(key)) continue;
      const code = codeOf(item);
      if (!canRemove || !code || keep.has(code)) {
        leftAlone++;
        continue;
      }
      toRemove.push(item);
    }
    // A half-loaded SIAS page looks like a mass drop. Hold removal when it
    // would take all of this term's classes, or 2 or more classes that are
    // half or more of them. A single drop goes ahead unless it is the only class.
    const existingCodes = new Set(Object.values(existing.matched).map(codeOf).filter(Boolean));
    const dropCodes = new Set(toRemove.map(codeOf));
    const drops = dropCodes.size;
    const held =
      drops > 0 && (drops >= existingCodes.size || (drops >= 2 && drops * 2 >= existingCodes.size))
        ? drops
        : 0;
    if (held) {
      leftAlone += toRemove.length;
      toRemove = [];
    }
    const removedCodes = new Set();
    for (const item of toRemove) {
      try {
        await client.remove(item.id);
        counts.removed++;
        removedCodes.add(codeOf(item));
      } catch (err) {
        if (err?.status === 404 || err?.status === 410) {
          counts.removed++;
          removedCodes.add(codeOf(item));
          continue;
        }
        return {
          ok: false,
          partial: true,
          status: err?.status || 0,
          error: err?.message || String(err),
          done,
          total: steps,
          ...counts,
          map
        };
      }
    }

    return {
      ok: true,
      total: steps,
      done,
      ...counts,
      map,
      ...(canRemove && !held ? {} : { removalSkipped: true }),
      ...(held ? { removalHeld: held } : {}),
      removedClasses: removedCodes.size,
      // What Remove PUPSync classes would now delete: every synced key (all
      // tagged with this term now), events left alone above, and duplicates.
      removableCount: Object.keys(map).length + leftAlone + existing.duplicates.length
    };
  }

  /**
   * Undo: delete every PUPSync event of this term (series masters only).
   * Lists from Google every time; the local map is never trusted alone.
   */
  async function removeTerm({ client, termKey, semesterStart, semesterEnd }) {
    if (!termKey) return { ok: false, noTerm: true, error: NO_TERM_ERROR };
    let existing;
    try {
      existing = classifyTaggedEvents(await client.listTagged(), {
        termKey,
        semesterStart,
        semesterEnd
      });
    } catch (err) {
      return { ok: false, aborted: true, status: err?.status || 0, error: err?.message || String(err) };
    }
    const targets = removableEvents(existing);
    let removed = 0;
    let alreadyGone = 0;
    for (const item of targets) {
      try {
        await client.remove(item.id);
        removed++;
      } catch (err) {
        if (err?.status === 404 || err?.status === 410) {
          alreadyGone++;
          continue;
        }
        return {
          ok: false,
          partial: true,
          status: err?.status || 0,
          error: err?.message || String(err),
          removed,
          alreadyGone,
          total: targets.length
        };
      }
    }
    return { ok: true, removed, alreadyGone, total: targets.length };
  }

  /** One sync or undo at a time. */
  function createLock() {
    let busy = false;
    return {
      get busy() {
        return busy;
      },
      async run(fn) {
        if (busy) return { ok: false, busy: true, error: 'A PUPSync sync is already running.' };
        busy = true;
        try {
          return await fn();
        } finally {
          busy = false;
        }
      }
    };
  }

  PUPCalendarSync = {
    CalendarApiError,
    NO_TERM_ERROR,
    normalizeSemester,
    buildTermKey,
    normalizeSubjectCode,
    scheduleSubjectCodes,
    buildImportMessage,
    payloadHash,
    tagPayload,
    classifyTaggedEvents,
    removableEvents,
    findLegacyLookalikes,
    legacyScanWindow,
    createClient,
    syncTerm,
    removeTerm,
    createLock
  };
  globalThis.PUPCalendarSync = PUPCalendarSync;
}
