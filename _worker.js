/**
 * EasyFinance – Cloudflare Pages Worker v6.2
 * Multi-agent platform with auth, data isolation, audit log
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Session-Token',
};

const DATA_TABLES   = ['clients','products','monthly_values','timeline_events'];
const AGENT_TABLES  = ['agents','agent_sessions','audit_log','crm_notes'];
const ADMIN_TABLES  = ['agents']; // only superadmin can manage

const jr  = (data, status=200) => new Response(JSON.stringify(data), {
  status, headers: { 'Content-Type': 'application/json', ...CORS }
});
const mkid = () => crypto.randomUUID ? crypto.randomUUID() :
  'xxxx-xxxx-4xxx-yxxx'.replace(/[xy]/g, c => {
    const r = Math.random()*16|0;
    return (c==='x'?r:r&0x3|0x8).toString(16);
  });

// ── Crypto helpers ─────────────────────────────────────────────────
async function hashPassword(password) {
  const enc = new TextEncoder().encode(password);
  const buf = await crypto.subtle.digest('SHA-256', enc);
  return Array.from(new Uint8Array(buf)).map(b=>b.toString(16).padStart(2,'0')).join('');
}

function generateToken(length=40) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let token = '';
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  for (const b of bytes) token += chars[b % chars.length];
  return token;
}

// ── Session validation ──────────────────────────────────────────────
async function getSession(request, env) {
  const token = request.headers.get('X-Session-Token') ||
                new URL(request.url).searchParams.get('_st');
  if (!token) return null;
  if (!env.DB) return null;

  const now = Date.now();
  const sess = await env.DB.prepare(
    `SELECT s.*, a.id as agent_id, a.name as agent_name, a.email as agent_email,
            a.role, a.status as agent_status, a.logo_url, a.plan,
            a.client_quota, a.subscription_end
     FROM agent_sessions s
     JOIN agents a ON a.id = s.agent_id
     WHERE s.token=? AND s.expires_at > ? AND s.revoked=0 AND a.status='active'`
  ).bind(token, now).first();

  return sess || null;
}

// ── Audit Log ──────────────────────────────────────────────────────
async function auditLog(env, agentId, action, targetTable, targetId, meta={}) {
  if (!env.DB) return;
  try {
    await env.DB.prepare(
      `INSERT INTO audit_log (id,agent_id,action,target_table,target_id,meta,created_at)
       VALUES (?,?,?,?,?,?,?)`
    ).bind(mkid(), agentId, action, targetTable||'', targetId||'', JSON.stringify(meta), Date.now()).run();
  } catch(e) { /* non-critical */ }
}

// ── Auth Routes ────────────────────────────────────────────────────
async function handleAuth(request, env) {
  const url    = new URL(request.url);
  const method = request.method;
  const path   = url.pathname;

  if (method === 'OPTIONS') return new Response(null, {status:204, headers:CORS});

  // POST /auth/login
  if (method === 'POST' && path === '/auth/login') {
    const { email, password } = await request.json().catch(()=>({}));
    if (!email || !password) return jr({error:'Missing credentials'},400);
    if (!env.DB) return jr({error:'DB not connected'},503);

    const agent = await env.DB.prepare(
      `SELECT * FROM agents WHERE email=? AND deleted=0`
    ).bind(email.toLowerCase().trim()).first();

    if (!agent) return jr({error:'אימייל או סיסמה שגויים'},401);
    if (agent.status === 'blocked') return jr({error:'החשבון חסום. פנה למנהל המערכת.'},403);

    const hash = await hashPassword(password);
    if (hash !== agent.password_hash) return jr({error:'אימייל או סיסמה שגויים'},401);

    // Check subscription
    if (agent.subscription_end && agent.subscription_end < Date.now() && agent.role !== 'superadmin') {
      return jr({error:'פג תוקף המנוי. פנה למנהל המערכת.'},403);
    }

    const token   = generateToken(48);
    const expires = Date.now() + (7 * 24 * 60 * 60 * 1000); // 7 days
    const sessId  = mkid();

    // Get device info
    const ua = request.headers.get('User-Agent') || '';
    const ip = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || '';

    await env.DB.prepare(
      `INSERT INTO agent_sessions (id,agent_id,token,expires_at,user_agent,ip_address,created_at,revoked)
       VALUES (?,?,?,?,?,?,?,0)`
    ).bind(sessId, agent.id, token, expires, ua.slice(0,200), ip, Date.now()).run();

    // Update last login
    await env.DB.prepare(
      `UPDATE agents SET last_login=?, updated_at=? WHERE id=?`
    ).bind(Date.now(), Date.now(), agent.id).run();

    await auditLog(env, agent.id, 'login', 'agents', agent.id, {ip, ua: ua.slice(0,100)});

    return jr({
      token, expires,
      agent: {
        id: agent.id, name: agent.name, email: agent.email,
        role: agent.role, plan: agent.plan, logo_url: agent.logo_url,
        client_quota: agent.client_quota
      }
    });
  }

  // POST /auth/logout
  if (method === 'POST' && path === '/auth/logout') {
    const token = request.headers.get('X-Session-Token');
    if (token && env.DB) {
      await env.DB.prepare(`UPDATE agent_sessions SET revoked=1 WHERE token=?`).bind(token).run();
    }
    return jr({ok:true});
  }

  // GET /auth/me
  if (method === 'GET' && path === '/auth/me') {
    const sess = await getSession(request, env);
    if (!sess) return jr({error:'Not authenticated'},401);
    return jr({
      id: sess.agent_id, name: sess.agent_name, email: sess.agent_email,
      role: sess.role, plan: sess.plan, logo_url: sess.logo_url,
      client_quota: sess.client_quota, subscription_end: sess.subscription_end
    });
  }

  // POST /auth/change-password
  if (method === 'POST' && path === '/auth/change-password') {
    const sess = await getSession(request, env);
    if (!sess) return jr({error:'Not authenticated'},401);
    const { current_password, new_password } = await request.json().catch(()=>({}));
    if (!current_password || !new_password) return jr({error:'Missing fields'},400);
    if (new_password.length < 8) return jr({error:'הסיסמה חייבת להכיל לפחות 8 תווים'},400);

    const agent = await env.DB.prepare(`SELECT * FROM agents WHERE id=?`).bind(sess.agent_id).first();
    if (!agent) return jr({error:'Agent not found'},404);
    const curHash = await hashPassword(current_password);
    if (curHash !== agent.password_hash) return jr({error:'הסיסמה הנוכחית שגויה'},400);

    const newHash = await hashPassword(new_password);
    await env.DB.prepare(`UPDATE agents SET password_hash=?,updated_at=? WHERE id=?`)
      .bind(newHash, Date.now(), sess.agent_id).run();

    await auditLog(env, sess.agent_id, 'change_password', 'agents', sess.agent_id);
    return jr({ok:true});
  }

  // POST /auth/request-reset  (sends reset token — in production: send email)
  if (method === 'POST' && path === '/auth/request-reset') {
    const { email } = await request.json().catch(()=>({}));
    if (!email || !env.DB) return jr({ok:true}); // always ok to prevent enumeration

    const agent = await env.DB.prepare(`SELECT id FROM agents WHERE email=? AND deleted=0`)
      .bind(email.toLowerCase().trim()).first();

    if (agent) {
      const resetToken = generateToken(32);
      const expires    = Date.now() + (60 * 60 * 1000); // 1 hour
      await env.DB.prepare(
        `UPDATE agents SET reset_token=?,reset_token_expires=?,updated_at=? WHERE id=?`
      ).bind(resetToken, expires, Date.now(), agent.id).run();

      // TODO: send email via SendGrid/Resend with resetToken
      // For now, return the token in response (DEMO MODE ONLY)
      if (url.searchParams.get('demo') === '1') {
        return jr({ok:true, demo_token: resetToken, message:'[DEMO] Reset token generated'});
      }
    }
    return jr({ok:true, message:'אם האימייל קיים במערכת, נשלח מייל לאיפוס סיסמה'});
  }

  // POST /auth/reset-password
  if (method === 'POST' && path === '/auth/reset-password') {
    const { token, new_password } = await request.json().catch(()=>({}));
    if (!token || !new_password) return jr({error:'Missing fields'},400);
    if (new_password.length < 8) return jr({error:'הסיסמה חייבת להכיל לפחות 8 תווים'},400);
    if (!env.DB) return jr({error:'DB not available'},503);

    const agent = await env.DB.prepare(
      `SELECT * FROM agents WHERE reset_token=? AND reset_token_expires > ? AND deleted=0`
    ).bind(token, Date.now()).first();

    if (!agent) return jr({error:'קישור האיפוס פג תוקפו או אינו תקין'},400);

    const newHash = await hashPassword(new_password);
    await env.DB.prepare(
      `UPDATE agents SET password_hash=?,reset_token=NULL,reset_token_expires=NULL,updated_at=? WHERE id=?`
    ).bind(newHash, Date.now(), agent.id).run();

    await auditLog(env, agent.id, 'reset_password', 'agents', agent.id);
    return jr({ok:true});
  }

  // POST /auth/impersonate/:agentId  (superadmin only)
  if (method === 'POST' && path.startsWith('/auth/impersonate/')) {
    const sess = await getSession(request, env);
    if (!sess || sess.role !== 'superadmin') return jr({error:'Forbidden'},403);
    const targetId = path.split('/').pop();

    const targetAgent = await env.DB.prepare(`SELECT * FROM agents WHERE id=? AND deleted=0`).bind(targetId).first();
    if (!targetAgent) return jr({error:'Agent not found'},404);

    const token   = generateToken(48);
    const expires = Date.now() + (2 * 60 * 60 * 1000); // 2 hours only
    await env.DB.prepare(
      `INSERT INTO agent_sessions (id,agent_id,token,expires_at,user_agent,ip_address,created_at,revoked,impersonator_id,is_impersonation)
       VALUES (?,?,?,?,?,?,?,0,?,1)`
    ).bind(mkid(), targetId, token, expires, 'impersonation', '', Date.now(), sess.agent_id).run();

    await auditLog(env, sess.agent_id, 'impersonate', 'agents', targetId);
    return jr({token, expires, agent: {id:targetAgent.id, name:targetAgent.name, email:targetAgent.email, role:targetAgent.role}});
  }

  return jr({error:'Not found'},404);
}

// ── CRM Notes ──────────────────────────────────────────────────────
async function handleCRM(request, env, sess) {
  const url    = new URL(request.url);
  const method = request.method;
  const m      = url.pathname.match(/^\/crm\/notes\/?([^/]*)$/);
  const clientId = m?.[1] || url.searchParams.get('client_id');

  if (method === 'OPTIONS') return new Response(null,{status:204,headers:CORS});

  if (method === 'GET') {
    if (!clientId) return jr({error:'client_id required'},400);
    const note = await env.DB.prepare(
      `SELECT * FROM crm_notes WHERE agent_id=? AND client_id=?`
    ).bind(sess.agent_id, clientId).first();
    return jr(note || {agent_id:sess.agent_id, client_id:clientId, content:'', meetings:[]});
  }

  if (method === 'POST' || method === 'PUT') {
    const body = await request.json().catch(()=>({}));
    if (!clientId && !body.client_id) return jr({error:'client_id required'},400);
    const cid  = clientId || body.client_id;
    const now  = Date.now();

    // Verify client belongs to this agent
    const client = await env.DB.prepare(
      `SELECT id FROM clients WHERE id=? AND agent_id=?`
    ).bind(cid, sess.agent_id).first();
    if (!client) return jr({error:'Client not found or access denied'},404);

    const existing = await env.DB.prepare(
      `SELECT id FROM crm_notes WHERE agent_id=? AND client_id=?`
    ).bind(sess.agent_id, cid).first();

    if (existing) {
      await env.DB.prepare(
        `UPDATE crm_notes SET content=?,meetings_json=?,updated_at=? WHERE agent_id=? AND client_id=?`
      ).bind(body.content||'', JSON.stringify(body.meetings||[]), now, sess.agent_id, cid).run();
    } else {
      await env.DB.prepare(
        `INSERT INTO crm_notes (id,agent_id,client_id,content,meetings_json,created_at,updated_at)
         VALUES (?,?,?,?,?,?,?)`
      ).bind(mkid(), sess.agent_id, cid, body.content||'', JSON.stringify(body.meetings||[]), now, now).run();
    }

    await auditLog(env, sess.agent_id, 'update_crm', 'crm_notes', cid);
    return jr({ok:true});
  }

  return jr({error:'Method not allowed'},405);
}

// ── Superadmin: Agents Management ─────────────────────────────────
async function handleAgents(request, env, sess) {
  const url    = new URL(request.url);
  const method = request.method;
  const m      = url.pathname.match(/^\/admin\/agents\/?([^/]*)$/);
  const agentId = m?.[1] || null;

  if (method === 'OPTIONS') return new Response(null,{status:204,headers:CORS});
  if (!sess || sess.role !== 'superadmin') return jr({error:'Forbidden'},403);

  if (method === 'GET' && !agentId) {
    const page  = Math.max(1, parseInt(url.searchParams.get('page')||'1'));
    const limit = Math.min(200, parseInt(url.searchParams.get('limit')||'50'));
    const offset = (page-1)*limit;
    const rows  = await env.DB.prepare(
      `SELECT id,name,email,role,status,plan,client_quota,subscription_end,last_login,created_at,logo_url
       FROM agents WHERE deleted=0 ORDER BY created_at DESC LIMIT ? OFFSET ?`
    ).bind(limit,offset).all();

    // Attach stats
    const agents = await Promise.all((rows.results||[]).map(async a => {
      const cc = await env.DB.prepare(`SELECT COUNT(*) n FROM clients WHERE agent_id=? AND deleted=0`).bind(a.id).first();
      return {...a, client_count: cc?.n||0};
    }));

    const total = await env.DB.prepare(`SELECT COUNT(*) n FROM agents WHERE deleted=0`).first();
    return jr({data: agents, total: total?.n||0, page, limit});
  }

  if (method === 'GET' && agentId) {
    const agent = await env.DB.prepare(
      `SELECT id,name,email,role,status,plan,client_quota,subscription_end,last_login,created_at,logo_url FROM agents WHERE id=?`
    ).bind(agentId).first();
    if (!agent) return jr({error:'Not found'},404);
    return jr(agent);
  }

  if (method === 'POST' && !agentId) {
    const body = await request.json().catch(()=>({}));
    const {name, email, password, role='agent', plan='basic', client_quota=50, subscription_end=null} = body;
    if (!name || !email || !password) return jr({error:'Missing required fields'},400);
    if (password.length < 8) return jr({error:'Password too short'},400);

    const existing = await env.DB.prepare(`SELECT id FROM agents WHERE email=?`).bind(email.toLowerCase()).first();
    if (existing) return jr({error:'Email already exists'},409);

    const hash = await hashPassword(password);
    const id   = mkid();
    const now  = Date.now();

    await env.DB.prepare(
      `INSERT INTO agents (id,name,email,password_hash,role,status,plan,client_quota,subscription_end,created_at,updated_at,deleted)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,0)`
    ).bind(id, name, email.toLowerCase(), hash, role, 'active', plan, client_quota, subscription_end, now, now).run();

    await auditLog(env, sess.agent_id, 'create_agent', 'agents', id, {email, role, plan});
    const created = await env.DB.prepare(`SELECT id,name,email,role,status,plan,client_quota FROM agents WHERE id=?`).bind(id).first();
    return jr(created, 201);
  }

  if (method === 'PATCH' && agentId) {
    const body = await request.json().catch(()=>({}));
    const now  = Date.now();
    const allowed = ['name','email','role','status','plan','client_quota','subscription_end','logo_url'];
    const keys = Object.keys(body).filter(k => allowed.includes(k));
    if (!keys.length) return jr({error:'No valid fields'},400);

    // Hash password if provided
    if (body.password) {
      const h = await hashPassword(body.password);
      keys.push('password_hash');
      body.password_hash = h;
    }

    const vals = [...keys.map(k => body[k]==='null'?null:body[k]), now, agentId];
    await env.DB.prepare(
      `UPDATE agents SET ${keys.map(k=>`${k}=?`).join(',')},updated_at=? WHERE id=?`
    ).bind(...vals).run();

    await auditLog(env, sess.agent_id, 'update_agent', 'agents', agentId, {fields:keys});
    const updated = await env.DB.prepare(`SELECT id,name,email,role,status,plan,client_quota,subscription_end,logo_url FROM agents WHERE id=?`).bind(agentId).first();
    return jr(updated);
  }

  if (method === 'DELETE' && agentId) {
    await env.DB.prepare(`UPDATE agents SET deleted=1,updated_at=? WHERE id=?`).bind(Date.now(),agentId).run();
    await auditLog(env, sess.agent_id, 'delete_agent', 'agents', agentId);
    return new Response(null,{status:204,headers:CORS});
  }

  return jr({error:'Method not allowed'},405);
}

// ── Superadmin: Unassigned Clients ────────────────────────────────
async function handleUnassigned(request, env, sess) {
  if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:CORS});
  if (!sess || sess.role !== 'superadmin') return jr({error:'Forbidden'},403);

  const db  = env.DB;
  const url = new URL(request.url);

  // GET /admin/unassigned – list clients with no agent
  if (request.method === 'GET') {
    const page   = Math.max(1, parseInt(url.searchParams.get('page')||'1'));
    const limit  = Math.min(200, parseInt(url.searchParams.get('limit')||'100'));
    const search = url.searchParams.get('search')||'';
    const offset = (page-1)*limit;

    const bp = [];
    let whereExtra = '';
    if (search) {
      whereExtra = ' AND (name LIKE ? OR id LIKE ?)';
      bp.push(`%${search}%`, `%${search}%`);
    }

    const total = await db.prepare(
      `SELECT COUNT(*) n FROM clients WHERE (agent_id IS NULL OR agent_id='') AND deleted=0${whereExtra}`
    ).bind(...bp).first();

    const rows = await db.prepare(
      `SELECT id, name, created_at FROM clients WHERE (agent_id IS NULL OR agent_id='') AND deleted=0${whereExtra} ORDER BY name LIMIT ? OFFSET ?`
    ).bind(...bp, limit, offset).all();

    return jr({ data: rows.results||[], total: total?.n||0, page, limit });
  }

  // PATCH /admin/unassigned/:clientId – assign to agent
  const m = url.pathname.match(/^\/admin\/unassigned\/([^/]+)$/);
  if (request.method === 'PATCH' && m) {
    const clientId = m[1];
    const body = await request.json().catch(()=>({}));
    const agentId = body.agent_id || null;

    if (!agentId) return jr({error:'agent_id נדרש'},400);

    // Verify agent exists
    const agent = await db.prepare(`SELECT id,name,client_quota FROM agents WHERE id=? AND deleted=0`).bind(agentId).first();
    if (!agent) return jr({error:'סוכן לא נמצא'},404);

    // Verify client exists and is unassigned
    const client = await db.prepare(`SELECT id,name,agent_id FROM clients WHERE id=? AND deleted=0`).bind(clientId).first();
    if (!client) return jr({error:'לקוח לא נמצא'},404);

    // Check quota
    if (agent.client_quota) {
      const cc = await db.prepare(`SELECT COUNT(*) n FROM clients WHERE agent_id=? AND deleted=0`).bind(agentId).first();
      if ((cc?.n||0) >= agent.client_quota) {
        return jr({error:`הסוכן הגיע למגבלת הלקוחות (${agent.client_quota})`},402);
      }
    }

    // Assign
    await db.prepare(`UPDATE clients SET agent_id=?, updated_at=? WHERE id=?`)
      .bind(agentId, Date.now(), clientId).run();

    await auditLog(env, sess.agent_id, 'assign_client', 'clients', clientId,
      { agent_id: agentId, agent_name: agent.name, client_name: client.name });

    const updated = await db.prepare(`SELECT * FROM clients WHERE id=?`).bind(clientId).first();
    return jr(updated);
  }

  return jr({error:'Method not allowed'},405);
}

// ── Superadmin: Analytics ──────────────────────────────────────────
async function handleAnalytics(request, env, sess) {
  if (!sess || sess.role !== 'superadmin') return jr({error:'Forbidden'},403);

  const totalAgents  = await env.DB.prepare(`SELECT COUNT(*) n FROM agents WHERE deleted=0 AND role!='superadmin'`).first();
  const activeAgents = await env.DB.prepare(`SELECT COUNT(*) n FROM agents WHERE deleted=0 AND status='active' AND role!='superadmin'`).first();
  const totalClients = await env.DB.prepare(`SELECT COUNT(*) n FROM clients WHERE deleted=0`).first();
  const totalProducts= await env.DB.prepare(`SELECT COUNT(*) n FROM products WHERE deleted=0`).first();
  const recentLogins = await env.DB.prepare(
    `SELECT a.id,a.name,a.email,a.last_login,
       (SELECT COUNT(*) FROM clients WHERE agent_id=a.id AND deleted=0) as client_count
     FROM agents a WHERE a.deleted=0 AND a.role!='superadmin'
     ORDER BY a.last_login DESC LIMIT 10`
  ).all();

  const planStats = await env.DB.prepare(
    `SELECT plan, COUNT(*) n FROM agents WHERE deleted=0 AND role!='superadmin' GROUP BY plan`
  ).all();

  return jr({
    total_agents:  totalAgents?.n||0,
    active_agents: activeAgents?.n||0,
    total_clients: totalClients?.n||0,
    total_products:totalProducts?.n||0,
    recent_logins: recentLogins.results||[],
    plan_stats:    planStats.results||[]
  });
}

// ── Audit Log ──────────────────────────────────────────────────────
async function handleAuditLog(request, env, sess) {
  if (!sess) return jr({error:'Not authenticated'},401);
  const url   = new URL(request.url);
  const page  = Math.max(1, parseInt(url.searchParams.get('page')||'1'));
  const limit = Math.min(100, parseInt(url.searchParams.get('limit')||'50'));
  const offset = (page-1)*limit;

  let where = '1=1';
  const bp  = [];

  // Agents can only see their own logs, superadmin sees all
  if (sess.role !== 'superadmin') {
    where += ' AND agent_id=?';
    bp.push(sess.agent_id);
  } else if (url.searchParams.get('agent_id')) {
    where += ' AND agent_id=?';
    bp.push(url.searchParams.get('agent_id'));
  }

  const rows = await env.DB.prepare(
    `SELECT l.*, a.name as agent_name, a.email as agent_email
     FROM audit_log l LEFT JOIN agents a ON a.id=l.agent_id
     WHERE ${where} ORDER BY l.created_at DESC LIMIT ? OFFSET ?`
  ).bind(...bp, limit, offset).all();

  const total = await env.DB.prepare(`SELECT COUNT(*) n FROM audit_log WHERE ${where}`).bind(...bp).first();
  return jr({data: rows.results||[], total: total?.n||0, page, limit});
}

// ── Agent Logo Upload ──────────────────────────────────────────────
async function handleLogoUpload(request, env, sess) {
  if (!sess) return jr({error:'Not authenticated'},401);
  if (request.method !== 'POST') return jr({error:'POST only'},405);

  const body = await request.json().catch(()=>({}));
  const { logo_url } = body; // expects a base64 data URL or external URL

  if (!logo_url) return jr({error:'logo_url required'},400);
  if (logo_url.length > 500000) return jr({error:'Logo too large (max 500KB)'},400);

  await env.DB.prepare(`UPDATE agents SET logo_url=?,updated_at=? WHERE id=?`)
    .bind(logo_url, Date.now(), sess.agent_id).run();

  await auditLog(env, sess.agent_id, 'update_logo', 'agents', sess.agent_id);
  return jr({ok:true, logo_url});
}

// ── Data Tables (with agent isolation) ────────────────────────────
async function handleTables(request, env, sess) {
  const url    = new URL(request.url);
  const method = request.method;

  if (method === 'OPTIONS') return new Response(null, {status:204, headers:CORS});

  const m = url.pathname.match(/^\/tables\/([^/]+)\/?([^/]*)$/);
  if (!m) return jr({error:'invalid path'},404);

  const table = m[1];
  const id    = m[2] || null;

  if (![...DATA_TABLES].includes(table)) return jr({error:'unknown table'},404);

  const db = env.DB;
  if (!db) return jr({error:'D1 not bound. Add binding named DB in Cloudflare Pages → Settings → Bindings'},500);

  // If no session (demo mode without auth) — allow but note it
  const agentId = sess?.agent_id || null;

  try {
    // ── GET list ─────────────────────────────────────────────────
    if (method === 'GET' && !id) {
      const page   = Math.max(1, parseInt(url.searchParams.get('page')||'1'));
      const limit  = Math.min(500, parseInt(url.searchParams.get('limit')||'100'));
      const sort   = (url.searchParams.get('sort')||'created_at').replace(/[^a-z0-9_]/gi,'');
      const search = url.searchParams.get('search')||'';
      const offset = (page-1)*limit;

      const where = [];
      const bp    = [];

      where.push('deleted=0');

      // Agent isolation: filter by agent_id if the table supports it
      if (agentId) {
        if (table === 'clients') {
          where.push('agent_id=?');
          bp.push(agentId);
        } else if (['products','monthly_values','timeline_events'].includes(table)) {
          // Filter via client's agent_id
          where.push(`client_id IN (SELECT id FROM clients WHERE agent_id=? AND deleted=0)`);
          bp.push(agentId);
        }
      }

      if (search) { where.push('(id LIKE ? OR name LIKE ?)'); bp.push(`%${search}%`,`%${search}%`); }

      const whereStr = where.join(' AND ');

      let total = 0;
      try {
        const cr = await db.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${whereStr}`).bind(...bp).first();
        total = cr?.n??0;
      } catch(e) {}

      const rs = await db.prepare(
        `SELECT * FROM ${table} WHERE ${whereStr} ORDER BY ${sort} LIMIT ? OFFSET ?`
      ).bind(...bp, limit, offset).all();

      return jr({data:rs.results||[], total, page, limit, table});
    }

    // ── GET single ───────────────────────────────────────────────
    if (method === 'GET' && id) {
      const row = await db.prepare(`SELECT * FROM ${table} WHERE id=? AND deleted=0`).bind(id).first();
      if (!row) return jr({error:'not found'},404);

      // Check access if agent is logged in
      if (agentId && row.agent_id && row.agent_id !== agentId) return jr({error:'Access denied'},403);

      return jr(row);
    }

    // ── POST (create) ────────────────────────────────────────────
    if (method === 'POST' && !id) {
      const body = await request.json().catch(()=>({}));
      const now  = Date.now();
      const nid  = body.id || mkid();

      // Check client quota
      if (agentId && table === 'clients') {
        const agent = await db.prepare(`SELECT client_quota FROM agents WHERE id=?`).bind(agentId).first();
        if (agent?.client_quota) {
          const cc = await db.prepare(`SELECT COUNT(*) n FROM clients WHERE agent_id=? AND deleted=0`).bind(agentId).first();
          if ((cc?.n||0) >= agent.client_quota) {
            return jr({error:`הגעת למגבלת הלקוחות (${agent.client_quota}). שדרג את החבילה.`},402);
          }
        }
      }

      const ci   = await db.prepare(`PRAGMA table_info(${table})`).all();
      const cols = (ci.results||[]).map(c=>c.name);

      const rec  = {...body, id:nid, created_at:body.created_at??now, updated_at:now, deleted:0};
      // Inject agent_id for clients
      if (agentId && table === 'clients' && cols.includes('agent_id')) rec.agent_id = agentId;

      const keys = Object.keys(rec).filter(k=>cols.includes(k));
      const vals = keys.map(k=>rec[k]);

      await db.prepare(
        `INSERT OR REPLACE INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`
      ).bind(...vals).run();

      if (agentId) await auditLog(env, agentId, `create_${table}`, table, nid);

      const created = await db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(nid).first();
      return jr(created||rec, 201);
    }

    // ── PATCH (partial update) ────────────────────────────────────
    if (method === 'PATCH' && id) {
      const body = await request.json().catch(()=>({}));
      const now  = Date.now();

      // Access check
      const existing = await db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first();
      if (!existing) return jr({error:'not found'},404);
      if (agentId && table === 'clients' && existing.agent_id && existing.agent_id !== agentId)
        return jr({error:'Access denied'},403);

      const ci   = await db.prepare(`PRAGMA table_info(${table})`).all();
      const cols = (ci.results||[]).map(c=>c.name);

      const upd  = {...body, updated_at:now};
      const keys = Object.keys(upd).filter(k=>k!=='id'&&k!=='agent_id'&&cols.includes(k));
      if (!keys.length) return jr({error:'no valid fields'},400);

      const vals = [...keys.map(k=>upd[k]), id];
      await db.prepare(
        `UPDATE ${table} SET ${keys.map(k=>`${k}=?`).join(',')} WHERE id=?`
      ).bind(...vals).run();

      if (agentId) await auditLog(env, agentId, `update_${table}`, table, id);

      const updated = await db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first();
      return jr(updated||{id});
    }

    // ── PUT (full replace) ────────────────────────────────────────
    if (method === 'PUT' && id) {
      const body = await request.json().catch(()=>({}));
      const now  = Date.now();

      const ci   = await db.prepare(`PRAGMA table_info(${table})`).all();
      const cols = (ci.results||[]).map(c=>c.name);

      const rec  = {...body, id, updated_at:now};
      const keys = Object.keys(rec).filter(k=>cols.includes(k));
      const vals = keys.map(k=>rec[k]);

      await db.prepare(
        `INSERT OR REPLACE INTO ${table} (${keys.join(',')}) VALUES (${keys.map(()=>'?').join(',')})`
      ).bind(...vals).run();

      if (agentId) await auditLog(env, agentId, `replace_${table}`, table, id);
      const updated = await db.prepare(`SELECT * FROM ${table} WHERE id=?`).bind(id).first();
      return jr(updated||rec);
    }

    // ── DELETE (soft) ─────────────────────────────────────────────
    if (method === 'DELETE' && id) {
      await db.prepare(`UPDATE ${table} SET deleted=1,updated_at=? WHERE id=?`).bind(Date.now(),id).run();
      if (agentId) await auditLog(env, agentId, `delete_${table}`, table, id);
      return new Response(null,{status:204,headers:CORS});
    }

    return jr({error:'method not allowed'},405);
  } catch(e) {
    return jr({error:`DB error: ${e.message}`, table, id},500);
  }
}

// ── Settings ───────────────────────────────────────────────────────
async function handleSettings(request, env, sess) {
  const method = request.method;
  if (method === 'OPTIONS') return new Response(null,{status:204,headers:CORS});
  if (!sess) return jr({error:'Not authenticated'},401);

  if (method === 'GET') {
    const settings = await env.DB.prepare(
      `SELECT * FROM agent_settings WHERE agent_id=?`
    ).bind(sess.agent_id).first();
    return jr(settings || {agent_id: sess.agent_id});
  }

  if (method === 'POST' || method === 'PATCH') {
    const body = await request.json().catch(()=>({}));
    const now  = Date.now();
    const existing = await env.DB.prepare(
      `SELECT id FROM agent_settings WHERE agent_id=?`
    ).bind(sess.agent_id).first();

    const allowed = ['logo_url','brand_name','brand_color','brand_secondary_color',
                     'report_footer','whatsapp_template','custom_domain','features_json'];
    const keys = Object.keys(body).filter(k=>allowed.includes(k));

    if (existing) {
      if (keys.length) {
        const vals = [...keys.map(k=>body[k]), now, sess.agent_id];
        await env.DB.prepare(
          `UPDATE agent_settings SET ${keys.map(k=>`${k}=?`).join(',')},updated_at=? WHERE agent_id=?`
        ).bind(...vals).run();
      }
    } else {
      const rec = {id:mkid(), agent_id:sess.agent_id, created_at:now, updated_at:now};
      keys.forEach(k => rec[k]=body[k]);
      const rkeys = Object.keys(rec);
      await env.DB.prepare(
        `INSERT INTO agent_settings (${rkeys.join(',')}) VALUES (${rkeys.map(()=>'?').join(',')})`
      ).bind(...rkeys.map(k=>rec[k])).run();
    }

    await auditLog(env, sess.agent_id, 'update_settings', 'agent_settings', sess.agent_id);
    return jr({ok:true});
  }

  return jr({error:'Method not allowed'},405);
}

// ── Main Fetch Handler ─────────────────────────────────────────────
export default {
  async fetch(request, env, ctx) {
    const url  = new URL(request.url);
    const path = url.pathname;

    // CORS preflight
    if (request.method === 'OPTIONS') return new Response(null,{status:204,headers:CORS});

    // Auth routes (no session required)
    if (path.startsWith('/auth/')) return handleAuth(request, env);

    // Authenticated routes
    const sess = env.DB ? await getSession(request, env) : null;

    // Tables (data CRUD)
    if (path.startsWith('/tables/')) return handleTables(request, env, sess);

    // CRM Notes
    if (path.startsWith('/crm/')) return handleCRM(request, env, sess);

    // Agent management (superadmin)
    if (path.startsWith('/admin/agents')) return handleAgents(request, env, sess);

    // Unassigned clients management (superadmin)
    if (path.startsWith('/admin/unassigned')) return handleUnassigned(request, env, sess);

    // Analytics (superadmin)
    if (path === '/admin/analytics') return handleAnalytics(request, env, sess);

    // Audit log
    if (path === '/admin/audit-log') return handleAuditLog(request, env, sess);

    // Agent settings / branding
    if (path === '/agent/settings') return handleSettings(request, env, sess);

    // Logo upload
    if (path === '/agent/logo') return handleLogoUpload(request, env, sess);

    // Static assets
    return env.ASSETS.fetch(request);
  }
};
