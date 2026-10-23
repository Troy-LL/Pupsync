/**
 * In-memory stand-in for the Google Calendar events API, for tests and the
 * dev preview. Supports list (privateExtendedProperty filters, paging),
 * insert, patch and delete, plus injected failures.
 */
var PUPFakeCalendar = globalThis.PUPFakeCalendar;
if (!PUPFakeCalendar) {
  PUPFakeCalendar = {
    create({ pageSize = 250 } = {}) {
      const events = new Map();
      const deleted = new Set();
      const calls = [];
      const failures = [];
      let seq = 0;

      const json = (status, body) => ({
        ok: status >= 200 && status < 300,
        status,
        json: async () => body,
        text: async () => (body ? JSON.stringify(body) : '')
      });

      function matchesFilters(ev, filters) {
        const priv = ev.extendedProperties?.private || {};
        return filters.every(([k, v]) => priv[k] === v);
      }

      function takeFailure(method, id) {
        const i = failures.findIndex(
          (f) => f.method === method && (f.id == null || f.id === id) && (f.after ?? 0) <= 0
        );
        failures.forEach((f) => {
          if (f.method === method && f.after > 0) f.after--;
        });
        if (i < 0) return null;
        const [f] = failures.splice(i, 1);
        return f.status;
      }

      async function fetchImpl(url, init = {}) {
        const method = (init.method || 'GET').toUpperCase();
        const u = new URL(url);
        const m = u.pathname.match(/\/events(?:\/([^/]+))?$/);
        const id = m && m[1] ? decodeURIComponent(m[1]) : null;
        calls.push({ method, id, url: String(url) });
        const failStatus = takeFailure(method, id);
        if (failStatus) return json(failStatus, { error: { code: failStatus } });

        if (method === 'GET' && !id) {
          const filters = u.searchParams
            .getAll('privateExtendedProperty')
            .map((p) => {
              const at = p.indexOf('=');
              return [p.slice(0, at), p.slice(at + 1)];
            });
          const all = [...events.values()].filter((ev) => matchesFilters(ev, filters));
          const max = Math.min(Number(u.searchParams.get('maxResults') || 250), pageSize);
          const offset = Number(u.searchParams.get('pageToken') || 0);
          const items = all.slice(offset, offset + max).map((e) => JSON.parse(JSON.stringify(e)));
          const next = offset + max < all.length ? String(offset + max) : undefined;
          return json(200, { items, nextPageToken: next });
        }
        if (method === 'POST' && !id) {
          const body = JSON.parse(init.body);
          const newId = `evt_${++seq}`;
          events.set(newId, { ...body, id: newId, status: 'confirmed' });
          return json(200, events.get(newId));
        }
        if (method === 'PATCH' && id) {
          if (deleted.has(id)) return json(410, null);
          const cur = events.get(id);
          if (!cur) return json(404, null);
          const body = JSON.parse(init.body);
          const next = { ...cur, ...body };
          if (body.extendedProperties) {
            next.extendedProperties = {
              ...(cur.extendedProperties || {}),
              ...body.extendedProperties,
              private: {
                ...(cur.extendedProperties?.private || {}),
                ...(body.extendedProperties.private || {})
              }
            };
          }
          events.set(id, next);
          return json(200, next);
        }
        if (method === 'DELETE' && id) {
          if (deleted.has(id)) return json(410, null);
          if (!events.has(id)) return json(404, null);
          events.delete(id);
          deleted.add(id);
          return { ok: true, status: 204, json: async () => null, text: async () => '' };
        }
        return json(400, { error: 'unsupported' });
      }

      return {
        fetch: fetchImpl,
        events,
        calls,
        /** Fail the next matching call: { method, id?, status, after? } */
        failNext(f) {
          failures.push({ ...f });
        },
        /** Seed an event as if the student or an older version made it. */
        seed(ev) {
          const newId = ev.id || `seed_${++seq}`;
          events.set(newId, { status: 'confirmed', ...JSON.parse(JSON.stringify(ev)), id: newId });
          return newId;
        },
        writes() {
          return calls.filter((c) => c.method !== 'GET');
        },
        resetCalls() {
          calls.length = 0;
        }
      };
    }
  };
  globalThis.PUPFakeCalendar = PUPFakeCalendar;
}
