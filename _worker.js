/**
 * EasyFinance – Cloudflare Pages Worker v6.2
 * Multi-agent platform with auth, data isolation, audit log
 */

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization,X-Session-Token',
};

const DATA_TABLES        = ['clients','products','monthly_values','timeline_events'];
const AGENT_TABLES       = ['agents','agent_sessions','audit_log','crm_notes'];
const ADMIN_TABLES       = ['agents']; // only superadmin can manage
const TABLES_WITH_DELETED = ['clients','products']; // טבלאות שיש להן עמודת deleted

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

// בדיקה אם session הוא read-only
function isReadOnly(sess) {
  return sess && sess.is_readonly === 1;
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

  // POST /auth/view-token — יוצר token קצר-טווח read-only לדשבורד
  if (method === 'POST' && path === '/auth/view-token') {
    const sess = await getSession(request, env);
    if (!sess) return jr({error:'Not authenticated'},401);
    if (isReadOnly(sess)) return jr({error:'Cannot create view-token from read-only session'},403);

    const token   = generateToken(48);
    const expires = Date.now() + (8 * 60 * 60 * 1000); // 8 שעות
    const sessId  = mkid();
    const ua = request.headers.get('User-Agent') || '';
    const ip = request.headers.get('CF-Connecting-IP') || '';

    await env.DB.prepare(
      `INSERT INTO agent_sessions (id,agent_id,token,expires_at,user_agent,ip_address,created_at,revoked,is_readonly)
       VALUES (?,?,?,?,?,?,?,0,1)`
    ).bind(sessId, sess.agent_id, token, expires, ua.slice(0,200), ip, Date.now()).run();

    return jr({ view_token: token, expires });
  }

  // POST /auth/edit-token — יוצר token קצר-טווח לעריכה (read-write) לדשבורד
  if (method === 'POST' && path === '/auth/edit-token') {
    const sess = await getSession(request, env);
    if (!sess) return jr({error:'Not authenticated'},401);
    if (isReadOnly(sess)) return jr({error:'Cannot create edit-token from read-only session'},403);

    const token   = generateToken(48);
    const expires = Date.now() + (4 * 60 * 60 * 1000); // 4 שעות
    const sessId  = mkid();
    const ua = request.headers.get('User-Agent') || '';
    const ip = request.headers.get('CF-Connecting-IP') || '';

    await env.DB.prepare(
      `INSERT INTO agent_sessions (id,agent_id,token,expires_at,user_agent,ip_address,created_at,revoked,is_readonly)
       VALUES (?,?,?,?,?,?,?,0,0)`
    ).bind(sessId, sess.agent_id, token, expires, ua.slice(0,200), ip, Date.now()).run();

    return jr({ edit_token: token, expires });
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
      client_quota: sess.client_quota, subscription_end: sess.subscription_end,
      is_readonly: sess.is_readonly === 1 ? true : false
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

      // רק טבלאות עם עמודת deleted
      if (TABLES_WITH_DELETED.includes(table)) where.push('deleted=0');

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

      const whereStr = where.length ? where.join(' AND ') : '1=1';

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
      const whereClause = TABLES_WITH_DELETED.includes(table) ? 'id=? AND deleted=0' : 'id=?';
      const row = await db.prepare(`SELECT * FROM ${table} WHERE ${whereClause}`).bind(id).first();
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

      // UPSERT for monthly_values: if (product_id + month) already exists, update instead of insert
      if (table === 'monthly_values' && body.product_id && body.month) {
        const existing = await db.prepare(
          `SELECT * FROM monthly_values WHERE product_id=? AND month=?`
        ).bind(body.product_id, body.month).first();

        if (existing) {
          // Update existing record
          const upd = { value: body.value, updated_at: now };
          if (body.risk_equities   !== undefined) upd.risk_equities   = body.risk_equities;
          if (body.risk_bonds      !== undefined) upd.risk_bonds      = body.risk_bonds;
          if (body.risk_alternatives !== undefined) upd.risk_alternatives = body.risk_alternatives;
          if (body.track           !== undefined) upd.track           = body.track;

          const updKeys = Object.keys(upd).filter(k => cols.includes(k));
          const updVals = updKeys.map(k => upd[k]);
          await db.prepare(
            `UPDATE monthly_values SET ${updKeys.map(k=>k+'=?').join(',')} WHERE id=?`
          ).bind(...updVals, existing.id).run();

          if (agentId) await auditLog(env, agentId, `update_monthly_values`, table, existing.id);
          const updated = await db.prepare(`SELECT * FROM monthly_values WHERE id=?`).bind(existing.id).first();
          return jr(updated || existing, 200);
        }
      }

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
      // agent_id מוגן — לא ניתן לשינוי דרך PATCH רגיל (רק דרך /admin/unassigned)
      const protectedCols = ['id', 'agent_id'];
      const keys = Object.keys(upd).filter(k=>!protectedCols.includes(k)&&cols.includes(k));
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

    // חסימת כתיבה ל-timeline_events עבור read-only sessions
    if (['POST','PATCH','PUT','DELETE'].includes(method) && table === 'timeline_events') {
      if (isReadOnly(sess)) return jr({error:'Read-only session — cannot modify events'},403);
    }

    // ── DELETE (soft) ───────────────────────────────────────────────────
    if (method === 'DELETE' && id) {
      if (TABLES_WITH_DELETED.includes(table)) {
        await db.prepare(`UPDATE ${table} SET deleted=1,updated_at=? WHERE id=?`).bind(Date.now(),id).run();
      } else {
        await db.prepare(`DELETE FROM ${table} WHERE id=?`).bind(id).run();
      }
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

// ── Surense / Make Webhook Integration ────────────────────────────
/**
 * ארכיטקטורה: Surense → Make Scenario → POST /api/webhook/surense → EasyFinance DB
 *
 * Make שולח POST עם:
 * {
 *   "webhook_secret": "...",        ← סוד משותף לאימות
 *   "client_id": "menachem-gilor",  ← ID הלקוח ב-EasyFinance
 *   "month": "2025-12",             ← חודש בפורמט YYYY-MM
 *   "products": [
 *     {
 *       "company_name": "מגדל",
 *       "product_type": "קופת גמל",
 *       "policy_number": "12345678",
 *       "value": 157371
 *     }, ...
 *   ]
 * }
 */

/**
 * Map company name → EasyFinance institution slug
 */
function mapCompanyToInstitution(companyName) {
  const name = (companyName || '').toLowerCase();
  if (name.includes('מגדל') || name.includes('migdal'))         return 'magdal';
  if (name.includes('מנורה') || name.includes('menora'))        return 'menora';
  if (name.includes('הפניקס') || name.includes('phoenix'))      return 'phoenix';
  if (name.includes('כלל') || name.includes('clal'))            return 'clal';
  if (name.includes('הראל') || name.includes('harel'))          return 'harel';
  if (name.includes('ילין') || name.includes('yalin'))          return 'yalin';
  if (name.includes('מיטב') || name.includes('meitav'))         return 'meitav';
  if (name.includes('אנליסט') || name.includes('analyst'))      return 'analyst';
  if (name.includes('איילון') || name.includes('ayalon'))       return 'ayalon';
  if (name.includes('הכשרה') || name.includes('hachshara'))     return 'hachshara';
  if (name.includes('אלטשולר') || name.includes('altshuler'))   return 'altshuler';
  if (name.includes('מור') || name.includes('more'))            return 'more';
  if (name.includes('פסגות') || name.includes('psagot'))        return 'psagot';
  if (name.includes('בית') || name.includes('beit'))            return 'beit';
  // fallback: generate slug from name
  return (companyName || 'unknown').replace(/\s+/g,'-').replace(/[^a-z0-9\u0590-\u05ff-]/gi,'').toLowerCase() || 'unknown';
}

/**
 * Map product type string → EasyFinance product_type slug
 */
function mapProductType(productType) {
  const t = (productType || '').toLowerCase();
  if (t.includes('פנסיה') || t.includes('pension'))             return 'pension';
  if (t.includes('גמל') && !t.includes('השקעה'))               return 'gemul';
  if (t.includes('גמל להשקעה') || t.includes('investment'))    return 'gemul-hashkaa';
  if (t.includes('קרן השתלמות') || t.includes('kranot'))       return 'kranot';
  if (t.includes('ביטוח מנהלים') || t.includes('bituach'))     return 'bituach';
  if (t.includes('פוליסת חיסכון') || t.includes('polisa'))     return 'polisa';
  if (t.includes('קרן פנסיה') || t.includes('keren pensia'))   return 'pension';
  return (productType || 'other').replace(/\s+/g,'-').toLowerCase();
}

/**
 * POST /api/webhook/surense
 * מקבל נתונים מ-Make ומכניס לDB
 */
async function handleMakeWebhook(request, env) {
  // 1. Parse body
  const body = await request.json().catch(() => null);
  if (!body) return jr({ error: 'Invalid JSON body' }, 400);

  // 2. Verify webhook secret
  const secret = env.WEBHOOK_SECRET || '';
  if (secret && body.webhook_secret !== secret) {
    return jr({ error: 'Invalid webhook secret' }, 401);
  }

  const { client_id, month, products, agent_id: bodyAgentId } = body;

  if (!client_id)              return jr({ error: 'client_id required' }, 400);
  if (!month)                  return jr({ error: 'month required (YYYY-MM)' }, 400);
  if (!Array.isArray(products) || products.length === 0)
    return jr({ error: 'products array required' }, 400);

  // 3. Look up the client to get agent_id
  // Support client_id as either the internal ID or the identity_number (ת"ז)
  if (!env.DB) return jr({ error: 'D1 not bound' }, 500);
  let client;
  try {
    // First try by internal ID
    client = await env.DB.prepare(
      `SELECT id, agent_id FROM clients WHERE id=? AND deleted=0`
    ).bind(client_id).first();
    // If not found, try by identity_number (ת"ז)
    if (!client) {
      client = await env.DB.prepare(
        `SELECT id, agent_id FROM clients WHERE identity_number=? AND deleted=0`
      ).bind(client_id).first();
    }
  } catch(e) {
    return jr({ error: 'DB error: ' + e.message }, 500);
  }
  if (!client) return jr({ error: `Client not found: ${client_id}` }, 404);
  // Use the internal client ID for all DB operations
  const internalClientId = client.id;

  const agentId = client.agent_id || bodyAgentId || 'system';

  // 4. Convert month YYYY-MM → MM/YY
  const [year, mon] = month.split('-');
  const efMonth = `${mon}/${year.slice(2)}`;  // e.g. "12/25"

  const now = Date.now();
  const results = { created_products: [], updated_products: [], updated_mv: [], skipped: [] };

  // 5. Process each product
  try {
  for (const p of products) {
    const companyName  = p.company_name  || p.companyName  || '';
    const productType  = p.product_type  || p.productType  || p.type || '';
    const policyNumber = String(p.policy_number || p.policyNumber || p.account_number || '').trim();
    const rawValue     = parseFloat(p.value || p.accumulation || p.accumulation_value || 0);

    if (!policyNumber && !companyName) { results.skipped.push(p); continue; }

    const institution = mapCompanyToInstitution(companyName);
    const efType      = mapProductType(productType);

    // Build stable product ID: institution-policyNumber
    const slug = policyNumber
      ? `${institution}-${policyNumber.replace(/\s+/g,'')}`
      : `${institution}-${efType}-${internalClientId}`;
    const productId = slug.toLowerCase();

    // 5a. Upsert product
    const existing = await env.DB.prepare(
      `SELECT id FROM products WHERE id=? AND client_id=? AND deleted=0`
    ).bind(productId, internalClientId).first();

    if (!existing) {
      const productName = `${companyName} – ${productType}`.trim().replace(/\s*–\s*$/, '');
      await env.DB.prepare(
        `INSERT OR IGNORE INTO products
           (id, client_id, agent_id, name, institution, product_type, account_number, status, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
      ).bind(productId, internalClientId, agentId, productName, institution, efType, policyNumber, now, now).run();
      results.created_products.push(productId);
    }

    // 5b. Upsert monthly value
    if (rawValue > 0) {
      const existMV = await env.DB.prepare(
        `SELECT id FROM monthly_values WHERE product_id=? AND client_id=? AND month=?`
      ).bind(productId, internalClientId, efMonth).first();

      if (existMV) {
        await env.DB.prepare(
          `UPDATE monthly_values SET value=?, updated_at=? WHERE id=?`
        ).bind(rawValue, now, existMV.id).run();
      } else {
        await env.DB.prepare(
          `INSERT INTO monthly_values (id, product_id, client_id, agent_id, month, value, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(mkid(), productId, internalClientId, agentId, efMonth, rawValue, now, now).run();
      }
      results.updated_mv.push({ product: productId, month: efMonth, value: rawValue });
    } else {
      results.skipped.push(productId);
    }
  }
  } catch(loopErr) {
    return jr({ error: 'Processing error: ' + loopErr.message, partial: results }, 500);
  }

  // 6. Audit log
  await env.DB.prepare(
    `INSERT INTO audit_log (id, agent_id, action, table_name, record_id, created_at)
     VALUES (?, ?, 'make_webhook_sync', 'monthly_values', ?, ?)`
  ).bind(mkid(), agentId, client_id, now).run().catch(() => {});

  return jr({
    ok: true,
    client_id,
    month: efMonth,
    created_products: results.created_products.length,
    updated_mv: results.updated_mv.length,
    skipped: results.skipped.length,
    details: results,
  });
}

/**
 * GET /api/webhook/info  — מחזיר את ה-webhook URL + הוראות ל-Make
 * דורש session סוכן
 */
async function handleWebhookInfo(request, env, sess) {
  if (!sess) return jr({ error: 'Unauthorized' }, 401);
  const origin = new URL(request.url).origin;
  return jr({
    webhook_url: `${origin}/api/webhook/surense`,
    method: 'POST',
    content_type: 'application/json',
    secret_header: 'webhook_secret',
    body_schema: {
      webhook_secret: '<WEBHOOK_SECRET from Cloudflare>',
      client_id: '<EasyFinance client ID>',
      month: 'YYYY-MM',
      products: [
        {
          company_name: 'שם החברה',
          product_type: 'סוג מוצר',
          policy_number: 'מספר פוליסה',
          value: 12345.67,
        }
      ]
    }
  });
}

async function getSurenseToken(env) {
  const clientId     = env.SURENSE_CLIENT_ID;
  const clientSecret = env.SURENSE_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error('Surense credentials not configured');

  const resp = await fetch('https://api.surense.com/api/v1/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: clientId,
      client_secret: clientSecret,
    })
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Surense auth failed (${resp.status}): ${txt}`);
  }
  const data = await resp.json();
  return data.access_token;
}

/**
 * Fetch managed savings (מוצרים בניהול) from Surense for a given month
 * providerId for מוצרים בניהול is not listed in docs - we call /reports with managed_savings scope
 */
async function fetchSurenseManagedSavings(token, month) {
  // month format: YYYY-MM
  const resp = await fetch('https://api.surense.com/api/v1/reports', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      providerId: 'managed_savings',  // scope: reports:managed_savings
      params: { month }
    })
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Surense reports failed (${resp.status}): ${txt}`);
  }
  return resp.json();
}

/**
 * Fetch customers list from Surense
 */
async function fetchSurenseCustomers(token) {
  const resp = await fetch('https://api.surense.com/api/v1/customers', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!resp.ok) {
    const txt = await resp.text();
    throw new Error(`Surense customers failed (${resp.status}): ${txt}`);
  }
  return resp.json();
}

/**
 * Map Surense company code/name → EasyFinance institution slug
 * This mapping needs to be extended as we discover actual Surense company IDs
 */
function mapSurenseCompanyToInstitution(companyId, companyName) {
  const name = (companyName || '').toLowerCase();
  if (name.includes('מגדל') || name.includes('migdal'))    return 'magdal';
  if (name.includes('מנורה') || name.includes('menora'))   return 'menora';
  if (name.includes('הפניקס') || name.includes('phoenix')) return 'phoenix';
  if (name.includes('כלל') || name.includes('clal'))       return 'clal';
  if (name.includes('הראל') || name.includes('harel'))     return 'harel';
  if (name.includes('ילין') || name.includes('yalin'))     return 'yalin';
  if (name.includes('מיטב') || name.includes('meitav'))    return 'meitav';
  if (name.includes('אנליסט') || name.includes('analyst')) return 'analyst';
  if (name.includes('איילון') || name.includes('ayalon'))  return 'ayalon';
  if (name.includes('הכשרה') || name.includes('hachshara'))return 'hachshara';
  return companyId ? `company-${companyId}` : 'unknown';
}

/**
 * Map Surense product type → EasyFinance product_type
 */
function mapSurenseProductType(productType) {
  const t = (productType || '').toLowerCase();
  if (t.includes('pension') || t.includes('פנסיה'))          return 'pension';
  if (t.includes('gemul') || t.includes('גמל'))              return 'gemul';
  if (t.includes('kranot') || t.includes('קרן השתלמות'))     return 'kranot';
  if (t.includes('bituach') || t.includes('ביטוח מנהלים'))  return 'bituach';
  if (t.includes('polisa') || t.includes('פוליסה'))          return 'polisa';
  return productType || 'unknown';
}

/**
 * Handle Surense sync request
 * POST /api/surense/sync-client
 * Body: { client_id: string, identity_number: string, month: string }
 */
async function handleSurenseSync(request, env, sess) {
  // Require valid agent session
  if (!sess) return jr({error:'Unauthorized'},401);
  if (sess.is_readonly) return jr({error:'Read-only session'},403);

  const body = await request.json().catch(() => ({}));
  const { client_id, identity_number, month } = body;

  if (!client_id)       return jr({error:'client_id required'},400);
  if (!identity_number) return jr({error:'identity_number required'},400);

  const syncMonth = month || (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  })();

  try {
    // 1. Get Surense access token
    const surenseToken = await getSurenseToken(env);

    // 2. Fetch managed savings report for this month
    const report = await fetchSurenseManagedSavings(surenseToken, syncMonth);

    // report is expected to be an array of product rows
    // Each row contains: identity_number, company_id, company_name, product_type,
    //                    policy_number/account_number, accumulation_value, month
    const rows = Array.isArray(report) ? report :
                 (report.data ? report.data : []);

    // 3. Filter rows for this client (by identity number)
    const clientRows = rows.filter(r =>
      String(r.identity_number || r.identityNumber || r.id_number || '').replace(/-/g,'') ===
      String(identity_number).replace(/-/g,'')
    );

    if (clientRows.length === 0) {
      return jr({ ok: true, synced: 0, message: 'No products found for this identity number', raw_count: rows.length });
    }

    // 4. Upsert products and monthly values
    const now = Date.now();
    const results = { created_products: [], updated_mv: [], skipped: [] };

    for (const row of clientRows) {
      const institution = mapSurenseCompanyToInstitution(
        row.company_id || row.companyId,
        row.company_name || row.companyName || row.company
      );
      const productType  = mapSurenseProductType(row.product_type || row.productType || row.type);
      const policyNumber = row.policy_number || row.policyNumber || row.account_number || row.accountNumber || '';
      const accumValue   = parseFloat(row.accumulation || row.accumulation_value || row.accumulationValue || row.value || 0);

      // Build a stable product ID from institution + policy number
      const productId = `${institution}-${policyNumber}`.replace(/\s+/g,'-').toLowerCase();

      // Month format for EasyFinance: MM/YY
      const [year, mon] = syncMonth.split('-');
      const efMonth = `${mon}/${year.slice(2)}`;

      // Check if product exists for this client
      const existingProduct = await env.DB.prepare(
        `SELECT id FROM products WHERE id=? AND client_id=? AND deleted=0`
      ).bind(productId, client_id).first();

      if (!existingProduct) {
        // Create new product
        const productName = `${row.company_name || row.companyName || institution} – ${productType}`;
        await env.DB.prepare(
          `INSERT OR IGNORE INTO products (id, client_id, agent_id, name, institution, product_type,
            account_number, status, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`
        ).bind(productId, client_id, sess.agent_id, productName, institution, productType,
               policyNumber, now, now).run();
        results.created_products.push(productId);
      }

      // Upsert monthly value
      if (accumValue > 0) {
        const existingMV = await env.DB.prepare(
          `SELECT id FROM monthly_values WHERE product_id=? AND client_id=? AND month=?`
        ).bind(productId, client_id, efMonth).first();

        if (existingMV) {
          await env.DB.prepare(
            `UPDATE monthly_values SET value=?, updated_at=? WHERE id=?`
          ).bind(accumValue, now, existingMV.id).run();
        } else {
          await env.DB.prepare(
            `INSERT INTO monthly_values (id, product_id, client_id, agent_id, month, value, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          ).bind(mkid(), productId, client_id, sess.agent_id, efMonth, accumValue, now, now).run();
        }
        results.updated_mv.push({ product: productId, month: efMonth, value: accumValue });
      } else {
        results.skipped.push(productId);
      }
    }

    await auditLog(env, sess.agent_id, 'surense_sync', 'monthly_values', client_id);

    return jr({
      ok: true,
      month: syncMonth,
      synced: results.updated_mv.length,
      created_products: results.created_products,
      updated_mv: results.updated_mv,
      skipped: results.skipped,
    });

  } catch(e) {
    return jr({ error: e.message }, 500);
  }
}

/**
 * Handle test connection to Surense API
 * GET /api/surense/test
 */
async function handleSurenseTest(request, env, sess) {
  if (!sess) return jr({error:'Unauthorized'},401);
  try {
    const token = await getSurenseToken(env);
    // Try to fetch customers as a connectivity test
    const customers = await fetchSurenseCustomers(token);
    return jr({ ok: true, message: 'Connected to Surense API', count: Array.isArray(customers) ? customers.length : null });
  } catch(e) {
    return jr({ ok: false, error: e.message }, 500);
  }
}

/**
 * Preview Surense data without saving (for user review before import)
 * POST /api/surense/preview
 * Body: { identity_number: string, month: string }
 */
async function handleSurensePreview(request, env, sess) {
  if (!sess) return jr({error:'Unauthorized'},401);

  const body = await request.json().catch(() => ({}));
  const { identity_number, month } = body;
  if (!identity_number) return jr({error:'identity_number required'},400);

  const syncMonth = month || (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()).padStart(2,'0')}`;  // prev month
  })();

  try {
    const surenseToken = await getSurenseToken(env);
    const report = await fetchSurenseManagedSavings(surenseToken, syncMonth);

    const rows = Array.isArray(report) ? report : (report.data ? report.data : []);
    const clientRows = rows.filter(r =>
      String(r.identity_number || r.identityNumber || r.id_number || '').replace(/-/g,'') ===
      String(identity_number).replace(/-/g,'')
    );

    return jr({
      ok: true,
      month: syncMonth,
      total_in_report: rows.length,
      found: clientRows.length,
      products: clientRows.map(r => ({
        institution: mapSurenseCompanyToInstitution(r.company_id || r.companyId, r.company_name || r.companyName),
        product_type: mapSurenseProductType(r.product_type || r.productType || r.type),
        policy_number: r.policy_number || r.policyNumber || r.account_number || r.accountNumber || '',
        value: parseFloat(r.accumulation || r.accumulation_value || r.accumulationValue || r.value || 0),
        company_name: r.company_name || r.companyName || r.company || '',
        raw: r,
      }))
    });
  } catch(e) {
    return jr({ ok: false, error: e.message }, 500);
  }
}

// ── Excel Import Handler ───────────────────────────────────────────
// POST /api/import/surense-excel
// multipart/form-data: file=<xlsx>, agent_id=<optional>
async function handleSurenseExcelImport(request, env, sess) {
  if (!sess) return jr({error:'Unauthorized'}, 401);
  if (sess.is_readonly) return jr({error:'Read-only session'}, 403);
  if (!env.DB) return jr({error:'D1 not bound'}, 500);

  // Parse multipart form
  let formData;
  try { formData = await request.formData(); }
  catch(e) { return jr({error:'Invalid form data: ' + e.message}, 400); }

  const file = formData.get('file');
  if (!file) return jr({error:'file field required'}, 400);

  // Read Excel bytes
  let xlsxBytes;
  try { xlsxBytes = await file.arrayBuffer(); }
  catch(e) { return jr({error:'Cannot read file: ' + e.message}, 400); }

  // Parse Excel using a simple binary parser (XLSX format)
  // We'll parse it manually since we can't use Node.js modules
  let savingsRows = [];
  let tracksRows  = [];
  try {
    const parsed = parseXlsxBuffer(xlsxBytes);
    savingsRows  = parsed['מוצרי חיסכון']  || [];
    tracksRows   = parsed['מסלולי השקעה'] || [];
  } catch(e) {
    return jr({error:'Excel parse error: ' + e.message}, 400);
  }

  if (savingsRows.length === 0) return jr({error:'גיליון "מוצרי חיסכון" ריק או לא נמצא'}, 400);

  const agentId = sess.agent_id || 'system';
  const now     = Date.now();

  // Build tracks lookup: key = tz+"|"+policy → [{ track_name, track_code }]
  const tracksMap = {};
  for (const t of tracksRows) {
    const tz     = String(t['מספר ת.ז'] || '').trim().replace(/-/g,'');
    const policy = String(t["מס' חשבון/פוליסה"] || '').trim();
    const key    = `${tz}|${policy}`;
    if (!tracksMap[key]) tracksMap[key] = [];
    tracksMap[key].push({
      track_name:  String(t['שם מסלול'] || '').trim(),
      track_code:  String(t['קוד מסלול'] || '').trim(),
      tzvira:      parseFloat(t['צבירה במסלול'] || 0) || 0,
    });
  }

  const results = {
    clients_created: [],
    products_created: [],
    products_updated: [],
    mv_updated: [],
    deposits_added: [],
    skipped: [],
    errors: []
  };

  // ── Determine report month from first row ──
  let reportMonth = null; // MM/YY format
  for (const row of savingsRows) {
    const d = row['נכון ליום'];
    if (d) {
      const dt = d instanceof Date ? d : new Date(d);
      if (!isNaN(dt)) {
        const mm = String(dt.getMonth()+1).padStart(2,'0');
        const yy = String(dt.getFullYear()).slice(2);
        reportMonth = `${mm}/${yy}`;
        break;
      }
    }
  }
  if (!reportMonth) return jr({error:'לא נמצא תאריך "נכון ליום" בדוח'}, 400);

  // ── Process each savings row ──
  for (const row of savingsRows) {
    try {
      const tz          = String(row['מספר ת.ז'] || '').trim().replace(/-/g,'');
      const firstName   = String(row['שם פרטי לקוח']    || '').trim();
      const lastName    = String(row['שם משפחה לקוח']   || '').trim();
      const institution = String(row['יצרן']             || '').trim();
      const productType = String(row['סוג מוצר']        || '').trim();
      const productSub  = String(row['מוצר']             || '').trim();
      const policy      = String(row["מס' חשבון/פוליסה"] || '').trim();
      const tzvira      = parseFloat(row['צבירה'] || 0) || 0;
      const lastDeposit = parseFloat(row['הפקדה אחרונה'] || 0) || 0;
      const lastDepDate = row['תאריך הפקדה אחרונה'] || row['תאריך הצטרפות למוצר'];
      const agentAppt   = row['תאריך מינוי סוכן'];
      const statusProd  = String(row['סטטוס מוצר'] || 'פעיל').trim();

      if (!tz && !firstName) { results.skipped.push({row: policy, reason: 'ללא ת"ז ושם'}); continue; }
      if (!policy && !institution) { results.skipped.push({row: tz, reason: 'ללא פוליסה ויצרן'}); continue; }

      // ── 1. Find or create client by identity_number ──
      let client = await env.DB.prepare(
        `SELECT id, agent_id FROM clients WHERE identity_number=? AND deleted=0`
      ).bind(tz).first();

      let clientId;
      if (!client) {
        // Create new client
        clientId = `client-${tz || mkid()}`;
        const clientName = `${firstName} ${lastName}`.trim();
        await env.DB.prepare(`
          INSERT OR IGNORE INTO clients
            (id, agent_id, name, identity_number, active, created_at, updated_at, deleted)
          VALUES (?, ?, ?, ?, 1, ?, ?, 0)
        `).bind(clientId, agentId, clientName, tz, now, now).run();
        results.clients_created.push({id: clientId, name: clientName, tz});
      } else {
        clientId = client.id;
      }

      // ── 2. Build stable product ID ──
      const instSlug = institution
        .replace(/\s+/g,'-')
        .replace(/['"]/g,'')
        .replace(/בע.מ/g,'')
        .trim()
        .slice(0,20)
        .toLowerCase();
      const productId = `${instSlug}-${policy}`.replace(/\s+/g,'').toLowerCase();

      // ── 3. Get track info for this product ──
      const trackKey   = `${tz}|${policy}`;
      const tracks     = tracksMap[trackKey] || [];
      const trackName  = tracks.map(t => t.track_name).filter(Boolean).join(' / ') || null;
      const tracksJson = tracks.length > 0 ? JSON.stringify(tracks) : null;

      // ── 4. Format dates ──
      const fmtDate = (d) => {
        if (!d) return null;
        const dt = d instanceof Date ? d : new Date(d);
        if (isNaN(dt)) return null;
        return dt.toISOString().split('T')[0];
      };

      // ── 5. Upsert product ──
      const existProd = await env.DB.prepare(
        `SELECT id FROM products WHERE id=? AND client_id=? AND deleted=0`
      ).bind(productId, clientId).first();

      const productName = `${institution} – ${productType}`.replace(/\s*–\s*$/, '').trim();
      const isActive    = statusProd === 'פעיל' ? 'active' : 'inactive';

      if (!existProd) {
        await env.DB.prepare(`
          INSERT OR IGNORE INTO products
            (id, client_id, agent_id, name, product_subname, institution, product_type,
             account_number, track, tracks_json, status,
             agent_appointment_date, created_at, updated_at, deleted)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).bind(
          productId, clientId, agentId, productName, productSub,
          institution, productType, policy, trackName, tracksJson,
          isActive, fmtDate(agentAppt), now, now
        ).run();
        results.products_created.push(productId);
      } else {
        // Update track info and status on existing product
        await env.DB.prepare(`
          UPDATE products SET track=COALESCE(NULLIF(?,NULL),track), tracks_json=COALESCE(NULLIF(?,NULL),tracks_json),
            status=?, updated_at=?
          WHERE id=? AND client_id=?
        `).bind(trackName, tracksJson, isActive, now, productId, clientId).run();
        results.products_updated.push(productId);
      }

      // ── 6. Upsert monthly value ──
      if (tzvira > 0) {
        const existMV = await env.DB.prepare(
          `SELECT id FROM monthly_values WHERE product_id=? AND client_id=? AND month=?`
        ).bind(productId, clientId, reportMonth).first();

        if (existMV) {
          await env.DB.prepare(
            `UPDATE monthly_values SET value=?, updated_at=? WHERE id=?`
          ).bind(tzvira, now, existMV.id).run();
        } else {
          await env.DB.prepare(`
            INSERT INTO monthly_values (id, product_id, client_id, agent_id, month, value, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(mkid(), productId, clientId, agentId, reportMonth, tzvira, now, now).run();
        }
        results.mv_updated.push({product: productId, month: reportMonth, value: tzvira});
      }

      // ── 7. Add deposit to timeline_events if exists ──
      if (lastDeposit > 0 && lastDepDate) {
        const depDate = fmtDate(lastDepDate);
        if (depDate) {
          // Check if deposit already recorded for same product+date
          const existDep = await env.DB.prepare(
            `SELECT id FROM timeline_events WHERE product_id=? AND client_id=? AND event_date=? AND event_type='deposit'`
          ).bind(productId, clientId, depDate).first();

          if (!existDep) {
            await env.DB.prepare(`
              INSERT INTO timeline_events
                (id, client_id, product_id, event_date, event_type, title, description, amount, created_at, updated_at, deleted)
              VALUES (?, ?, ?, ?, 'deposit', ?, ?, ?, ?, ?, 0)
            `).bind(
              mkid(), clientId, productId, depDate,
              `הפקדה – ${productName}`,
              `הפקדה חודשית מדוח סורנס ${reportMonth}`,
              lastDeposit, now, now
            ).run();
            results.deposits_added.push({product: productId, date: depDate, amount: lastDeposit});
          }
        }
      }

    } catch(rowErr) {
      results.errors.push({row: row["מס' חשבון/פוליסה"] || '?', error: rowErr.message});
    }
  }

  // Audit log
  await env.DB.prepare(`
    INSERT INTO audit_log (id, agent_id, action, table_name, record_id, created_at)
    VALUES (?, ?, 'surense_excel_import', 'products', ?, ?)
  `).bind(mkid(), agentId, `month:${reportMonth}`, now).run().catch(()=>{});

  return jr({
    ok: true,
    month: reportMonth,
    clients_created:  results.clients_created.length,
    products_created: results.products_created.length,
    products_updated: results.products_updated.length,
    mv_updated:       results.mv_updated.length,
    deposits_added:   results.deposits_added.length,
    skipped:          results.skipped.length,
    errors:           results.errors.length,
    details: results
  });
}

// ── Surense JSON Import (called from browser after XLSX parsing) ───
// POST /api/import/surense-json
// Body: { savings: [...rows], tracks: [...rows] }
async function handleSurenseJsonImport(request, env, sess) {
  if (!sess) return jr({error:'Unauthorized'}, 401);
  if (sess.is_readonly) return jr({error:'Read-only session'}, 403);
  if (!env.DB) return jr({error:'D1 not bound'}, 500);

  const body = await request.json().catch(() => null);
  if (!body || !Array.isArray(body.savings)) return jr({error:'savings array required'}, 400);

  const savingsRows = body.savings;
  const tracksRows  = Array.isArray(body.tracks) ? body.tracks : [];
  const agentId     = sess.agent_id || 'system';
  const now         = Date.now();

  // Build tracks lookup: key = tz+"|"+policy
  const tracksMap = {};
  for (const t of tracksRows) {
    const tz     = String(t.tz || '').trim().replace(/-/g,'');
    const policy = String(t.policy || '').trim();
    const key    = `${tz}|${policy}`;
    if (!tracksMap[key]) tracksMap[key] = [];
    tracksMap[key].push({
      track_name: String(t.track_name || '').trim(),
      track_code: String(t.track_code || '').trim(),
      tzvira:     parseFloat(t.tzvira || 0) || 0,
    });
  }

  const results = {
    clients_created: [], products_created: [], products_updated: [],
    mv_updated: [], deposits_added: [], skipped: [], errors: []
  };

  // Determine report month from first row
  let reportMonth = body.month || null;
  if (!reportMonth && savingsRows[0]?.report_date) {
    const dt = new Date(savingsRows[0].report_date);
    if (!isNaN(dt)) {
      reportMonth = `${String(dt.getMonth()+1).padStart(2,'0')}/${String(dt.getFullYear()).slice(2)}`;
    }
  }
  if (!reportMonth) return jr({error:'month required (MM/YY)'}, 400);

  for (const row of savingsRows) {
    try {
      const tz          = String(row.tz || '').trim().replace(/-/g,'');
      const firstName   = String(row.first_name   || '').trim();
      const lastName    = String(row.last_name    || '').trim();
      const institution = String(row.institution  || '').trim();
      const productType = String(row.product_type || '').trim();
      const productSub  = String(row.product_sub  || '').trim();
      const policy      = String(row.policy       || '').trim();
      const tzvira      = parseFloat(row.tzvira   || 0) || 0;
      const lastDeposit = parseFloat(row.last_deposit || 0) || 0;
      const lastDepDate = row.last_deposit_date   || null;
      const agentAppt   = row.agent_appointment   || null;
      const statusProd  = String(row.status       || 'פעיל').trim();

      if (!tz && !firstName) { results.skipped.push({policy, reason:'ללא ת"ז ושם'}); continue; }
      if (!policy && !institution) { results.skipped.push({tz, reason:'ללא פוליסה ויצרן'}); continue; }

      // 1. Find or create client
      let client = tz ? await env.DB.prepare(
        `SELECT id, identity_number, import_protected FROM clients WHERE identity_number=? AND deleted=0`
      ).bind(tz).first() : null;

      let clientId;
      const isProtected = !!(client && client.import_protected);

      if (!client) {
        // New client — create
        clientId = `client-${tz || mkid()}`;
        const clientName = `${firstName} ${lastName}`.trim();
        await env.DB.prepare(`
          INSERT OR IGNORE INTO clients
            (id, agent_id, name, identity_number, active, created_at, updated_at, deleted)
          VALUES (?, ?, ?, ?, 1, ?, ?, 0)
        `).bind(clientId, agentId, clientName, tz, now, now).run();
        results.clients_created.push({id: clientId, name: clientName, tz});
      } else {
        clientId = client.id;
      }

      // For protected clients: match product by account_number, add ONLY new months
      if (isProtected) {
        // Try to find existing product by account_number (policy)
        if (!policy) { results.skipped.push({policy, tz, reason: 'מוגן — אין פוליסה'}); continue; }
        const existingProd = await env.DB.prepare(
          `SELECT id, name, name_short, track FROM products WHERE client_id=? AND account_number=? AND deleted=0`
        ).bind(clientId, policy).first();

        if (!existingProd) {
          // Product with this policy doesn't exist yet — skip (user must add manually)
          results.skipped.push({policy, tz, reason: 'מוגן — פוליסה לא קיימת במערכת'});
          continue;
        }

        // Add monthly value only if month doesn't already exist
        if (tzvira > 0) {
          const existMV = await env.DB.prepare(
            `SELECT id FROM monthly_values WHERE product_id=? AND client_id=? AND month=?`
          ).bind(existingProd.id, clientId, reportMonth).first();
          if (!existMV) {
            await env.DB.prepare(`
              INSERT INTO monthly_values (id, product_id, client_id, agent_id, month, value, created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `).bind(mkid(), existingProd.id, clientId, agentId, reportMonth, tzvira, now, now).run();
            results.mv_updated.push({product: existingProd.id, month: reportMonth, value: tzvira});
          }
          // If month already exists — don't touch (preserve manual data)
        }

        // Add deposit to timeline for protected client (only new entries)
        if (lastDeposit > 0 && lastDepDate) {
          const existDepP = await env.DB.prepare(
            `SELECT id FROM timeline_events WHERE product_id=? AND client_id=? AND event_date=? AND event_type='deposit'`
          ).bind(existingProd.id, clientId, lastDepDate).first();
          if (!existDepP) {
            // Use name_short > track > name for display
            const displayName = existingProd.name_short || existingProd.track || existingProd.name || institution;
            await env.DB.prepare(`
              INSERT INTO timeline_events
                (id, client_id, product_id, event_date, event_type, title, description, amount, created_at, updated_at, deleted)
              VALUES (?, ?, ?, ?, 'deposit', ?, ?, ?, ?, ?, 0)
            `).bind(
              mkid(), clientId, existingProd.id, lastDepDate,
              `הפקדה – ${displayName}`,
              `הפקדה מדוח סורנס ${reportMonth}`,
              lastDeposit, now, now
            ).run();
            results.deposits_added.push({product: existingProd.id, date: lastDepDate, amount: lastDeposit});
          }
        }

        continue; // Done for this protected client row
      }

      // 2. Build product ID — use full type to avoid collision (e.g. קרן פנסיה מקיפה vs כללית)
      const instSlug  = institution.replace(/\s+/g,'-').replace(/['"״]/g,'').replace(/בע.מ\.?/g,'').trim().slice(0,20).toLowerCase();
      const typeSlug  = productType.replace(/\s+/g,'-').replace(/['"״]/g,'').trim().toLowerCase();
      const productId = `${instSlug}-${policy}-${typeSlug}`.replace(/\s+/g,'').toLowerCase().slice(0, 80);

      // 3. Track info
      const trackKey   = `${tz}|${policy}`;
      const tracks     = tracksMap[trackKey] || [];
      const trackName  = tracks.map(t=>t.track_name).filter(Boolean).join(' / ') || null;
      const tracksJson = tracks.length > 0 ? JSON.stringify(tracks) : null;

      // 4. Upsert product
      const existProd = await env.DB.prepare(
        `SELECT id FROM products WHERE id=? AND client_id=? AND deleted=0`
      ).bind(productId, clientId).first();

      const productName = `${institution} – ${productType}`.replace(/\s*–\s*$/,'').trim();
      const isActive    = statusProd === 'פעיל' ? 'active' : 'inactive';

      if (!existProd) {
        await env.DB.prepare(`
          INSERT OR IGNORE INTO products
            (id, client_id, agent_id, name, product_subname, institution, product_type,
             account_number, track, tracks_json, status,
             agent_appointment_date, created_at, updated_at, deleted)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `).bind(
          productId, clientId, agentId, productName, productSub,
          institution, productType, policy, trackName, tracksJson,
          isActive, agentAppt, now, now
        ).run();
        results.products_created.push(productId);
      } else {
        // Update track info and status on existing product
        await env.DB.prepare(
          `UPDATE products SET track=COALESCE(NULLIF(?,NULL),track), tracks_json=COALESCE(NULLIF(?,NULL),tracks_json),
            status=?, updated_at=? WHERE id=? AND client_id=?`
        ).bind(trackName, tracksJson, isActive, now, productId, clientId).run();
        results.products_updated.push(productId);
      }

      // 5. Upsert monthly value
      if (tzvira > 0) {
        const existMV = await env.DB.prepare(
          `SELECT id FROM monthly_values WHERE product_id=? AND client_id=? AND month=?`
        ).bind(productId, clientId, reportMonth).first();
        if (existMV) {
          await env.DB.prepare(`UPDATE monthly_values SET value=?, updated_at=? WHERE id=?`)
            .bind(tzvira, now, existMV.id).run();
        } else {
          await env.DB.prepare(`
            INSERT INTO monthly_values (id, product_id, client_id, agent_id, month, value, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(mkid(), productId, clientId, agentId, reportMonth, tzvira, now, now).run();
        }
        results.mv_updated.push({product: productId, month: reportMonth, value: tzvira});
      }

      // 6. Add deposit to timeline — store last deposit date per product/month
      if (lastDeposit > 0 && lastDepDate) {
        // Use month+product as unique key so reimporting same month doesn't duplicate
        const existDep = await env.DB.prepare(
          `SELECT id FROM timeline_events WHERE product_id=? AND client_id=? AND event_date=? AND event_type='deposit'`
        ).bind(productId, clientId, lastDepDate).first();
        if (!existDep) {
          // Fetch name_short from newly created/existing product for display title
          const prodForTitle = await env.DB.prepare(
            `SELECT name_short, track FROM products WHERE id=? LIMIT 1`
          ).bind(productId).first();
          // Priority: name_short > trackName > productSub > productName
          const displayName = (prodForTitle && prodForTitle.name_short) || trackName || productSub || productName;
          const eventTitle  = `הפקדה – ${displayName}`;
          await env.DB.prepare(`
            INSERT INTO timeline_events
              (id, client_id, product_id, event_date, event_type, title, description, amount, created_at, updated_at, deleted)
            VALUES (?, ?, ?, ?, 'deposit', ?, ?, ?, ?, ?, 0)
          `).bind(
            mkid(), clientId, productId, lastDepDate,
            eventTitle,
            `הפקדה מדוח סורנס ${reportMonth}`,
            lastDeposit, now, now
          ).run();
          results.deposits_added.push({product: productId, date: lastDepDate, amount: lastDeposit});
        }
      }

    } catch(e) {
      results.errors.push({policy: row.policy || '?', error: e.message});
    }
  }

  await env.DB.prepare(`
    INSERT INTO audit_log (id, agent_id, action, table_name, record_id, created_at)
    VALUES (?, ?, 'surense_excel_import', 'products', ?, ?)
  `).bind(mkid(), agentId, `month:${reportMonth}`, now).run().catch(()=>{});

  return jr({
    ok: true, month: reportMonth,
    clients_created:  results.clients_created.length,
    products_created: results.products_created.length,
    products_updated: results.products_updated.length,
    mv_updated:       results.mv_updated.length,
    deposits_added:   results.deposits_added.length,
    skipped:          results.skipped.length,
    errors:           results.errors.length,
    details: results
  });
}

// ── Simple XLSX parser placeholder ────────────────────────────────
function parseXlsxBuffer(buffer) {
  throw new Error('Use /api/import/surense-json instead');
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

    // ── Make Webhook (no session – secret-based auth) ──
    if (path === '/api/webhook/surense' && request.method === 'POST') {
      return handleMakeWebhook(request, env);
    }
    if (path === '/api/webhook/info' && request.method === 'GET') {
      const sess = env.DB ? await getSession(request, env) : null;
      return handleWebhookInfo(request, env, sess);
    }

    // ── Surense Excel Import ──
    if (path === '/api/import/surense-json' && request.method === 'POST') {
      const sess = env.DB ? await getSession(request, env) : null;
      return handleSurenseJsonImport(request, env, sess);
    }

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
