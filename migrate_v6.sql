-- EasyFinance Dashboard – Migration v6.0
-- Multi-agent platform: agents, sessions, audit log, CRM notes, branding
-- הרץ לאחר migrate_v5.sql

-- ── AGENTS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'agent',
  status TEXT DEFAULT 'active',
  plan TEXT DEFAULT 'basic',
  client_quota INTEGER DEFAULT 50,
  subscription_end INTEGER,
  logo_url TEXT,
  last_login INTEGER,
  reset_token TEXT,
  reset_token_expires INTEGER,
  created_at INTEGER,
  updated_at INTEGER,
  deleted INTEGER DEFAULT 0
);

-- ── AGENT SESSIONS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  impersonated_by TEXT,
  revoked INTEGER DEFAULT 0,
  created_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sessions_token  ON agent_sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_agent  ON agent_sessions(agent_id);

-- ── AGENT SETTINGS ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_settings (
  id TEXT PRIMARY KEY,
  agent_id TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  brand_name TEXT,
  brand_color TEXT DEFAULT '#1a56db',
  brand_secondary_color TEXT DEFAULT '#0ea5e9',
  report_footer TEXT,
  whatsapp_template TEXT,
  custom_domain TEXT,
  features_json TEXT DEFAULT '{}',
  created_at INTEGER,
  updated_at INTEGER
);

-- ── AUDIT LOG ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  action TEXT NOT NULL,
  target_table TEXT,
  target_id TEXT,
  meta TEXT DEFAULT '{}',
  created_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_audit_agent   ON audit_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- ── CRM NOTES ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_notes (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  content TEXT DEFAULT '',
  meetings_json TEXT DEFAULT '[]',
  created_at INTEGER,
  updated_at INTEGER,
  UNIQUE(agent_id, client_id)
);
CREATE INDEX IF NOT EXISTS idx_crm_client ON crm_notes(client_id);

-- ── Add agent_id to clients (if not exists) ─────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS agent_id TEXT;
CREATE INDEX IF NOT EXISTS idx_clients_agent ON clients(agent_id);

-- ── Initial Super Admin ─────────────────────────────────────────────
-- password: Admin@12345  (change immediately after first login!)
-- SHA-256 of "Admin@12345":
INSERT OR IGNORE INTO agents
  (id, name, email, password_hash, role, status, plan, client_quota, created_at, updated_at, deleted)
VALUES (
  'superadmin-1',
  'Super Admin',
  'admin@easyfinance.co.il',
  '6f2cb9dd8f4b65e24e1c3f3fa5bc57982349237f11abceacd45bbcb74d621c25',
  'superadmin',
  'active',
  'unlimited',
  NULL,
  strftime('%s','now')*1000,
  strftime('%s','now')*1000,
  0
);

SELECT 'migrate_v6 completed: agents, sessions, audit_log, crm_notes, agent_settings added' AS status;
