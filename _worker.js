/**
 * EasyFinance – Cloudflare Pages Worker
 * Handles /tables/* API requests via D1 binding "DB"
 * All other requests → static assets
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

const ALLOWED = ['clients','products','monthly_values','timeline_events','settings'];

const jr = (data, status) => new Response(JSON.stringify(data), {
  status: status || 200,
  headers: { 'Content-Type': 'application/json', ...CORS },
});

const mkid = () => crypto.randomUUID ? crypto.randomUUID() :
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : r & 0x3 | 0x8).toString(16);
  });

async function handleTables(request, env) {
  const url    = new URL(request.url);
  const method = request.method;

  if (method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  // Parse path: /tables/{table}[/{id}]
  const m = url.pathname.match(/^\/tables\/([^/]+)\/?([^/]*)$/);
  if (!m) return jr({ error: 'invalid path' }, 404);

  const table = m[1];
  const id    = m[2] || null;

  if (!ALLOWED.includes(table)) return jr({ error: 'unknown table' }, 404);

  const db = env.DB;
  if (!db) return jr({ error: 'D1 not bound. Add binding named DB in Cloudflare Pages → Settings → Bindings' }, 500);

  try {
    // ── GET list ──────────────────────────────────────────────
    if (method === 'GET' && !id) {
      const page   = Math.max(1, parseInt(url.searchParams.get('page')  || '1'));
      const limit  = Math.min(500, parseInt(url.searchParams.get('limit') || '100'));
      const sort   = (url.searchParams.get('sort') || 'created_at').replace(/[^a-z0-9_]/gi,'');
      const search = url.searchParams.get('search') || '';
      const offset = (page - 1) * limit;

      let where = '1=1';
      const bp  = [];
      if (search) { where += ' AND (id LIKE ? OR name LIKE ?)'; bp.push(`%${search}%`,`%${search}%`); }

      let total = 0;
      try {
        const cr = await db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${where}`).bind(...bp).first();
        total = cr?.n ?? 0;
      } catch(e) { /* table may be empty */ }

      const rs = await db.prepare(
        `SELECT * FROM ${table} WHERE ${where} ORDER BY ${sort} LIMIT ? OFFSET ?`
      ).bind(...bp, limit, offset).all();

      return jr({ data: rs.results || [], total, page, limit, table });
    }

    // ── GET single ────────────────────────────────────────────
    if (method === 'GET' && id) {
      const row = await db.prepare(
        `SELECT * FROM ${table} WHERE id=?`
      ).bind(id).first();
      return row ? jr(row) : jr({ error: 'not found' }, 404);
    }

    // ── POST (create) ─────────────────────────────────────────
    if (method === 'POST' && !id) {
      const body = await request.json().catch(() => ({}));
      const now  = Date.now();
      const nid  = body.id || mkid();

      const ci   = await db.prepare(`PRAGMA table_info(${table})`).all();
      const cols = (ci.results || []).map(c => c.name);

      const rec  = { ...body, id: nid, created_at: body.created_at ?? now, updated_at: now };
      const keys = Object.keys(rec).filter(k => cols.includes(k));
      const vals = keys.map(k => rec[k]);

      await db.prepare(
        `INSERT OR REPLACE INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`
      ).bind(...vals).run();

      const created = await db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(nid).first();
      return jr(created || rec, 201);
    }

    // ── PATCH (partial update) ────────────────────────────────
    if (method === 'PATCH' && id) {
      const body = await request.json().catch(() => ({}));
      const now  = Date.now();

      const ci   = await db.prepare(`PRAGMA table_info(${table})`).all();
      const cols = (ci.results || []).map(c => c.name);

      const upd  = { ...body, updated_at: now };
      const keys = Object.keys(upd).filter(k => k !== 'id' && cols.includes(k));
      if (!keys.length) return jr({ error: 'no valid fields' }, 400);

      const vals = [...keys.map(k => upd[k]), id];
      await db.prepare(
        `UPDATE ${table} SET ${keys.map(k => `${k}=?`).join(',')} WHERE id=?`
      ).bind(...vals).run();

      const updated = await db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first();
      return jr(updated || { id });
    }

    // ── PUT (full replace) ────────────────────────────────────
    if (method === 'PUT' && id) {
      const body = await request.json().catch(() => ({}));
      const now  = Date.now();

      const ci   = await db.prepare(`PRAGMA table_info(${table})`).all();
      const cols = (ci.results || []).map(c => c.name);

      const rec  = { ...body, id, updated_at: now };
      const keys = Object.keys(rec).filter(k => cols.includes(k));
      const vals = keys.map(k => rec[k]);

      await db.prepare(
        `INSERT OR REPLACE INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`
      ).bind(...vals).run();

      const updated = await db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first();
      return jr(updated || rec);
    }

    // ── DELETE (soft) ─────────────────────────────────────────
    if (method === 'DELETE' && id) {
      await db.prepare(`DELETE FROM ${table} WHERE id=?`)
        .bind(id).run();
      return new Response(null, { status: 204, headers: CORS });
    }

    return jr({ error: 'method not allowed' }, 405);

  } catch(e) {
    return jr({ error: `DB error: ${e.message}`, table, id }, 500);
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/tables/')) {
      return handleTables(request, env);
    }

    // Static assets
    return env.ASSETS.fetch(request);
  }
};
