-- EasyFinance Dashboard – D1 Schema v6.0
-- Multi-agent platform with auth, data isolation, audit log

-- ── AGENTS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT DEFAULT 'agent',         -- 'agent' | 'superadmin'
  status TEXT DEFAULT 'active',      -- 'active' | 'blocked'
  plan TEXT DEFAULT 'basic',         -- 'basic' | 'pro' | 'unlimited'
  client_quota INTEGER DEFAULT 50,   -- max clients (NULL = unlimited)
  subscription_end INTEGER,          -- timestamp ms, NULL = no expiry
  logo_url TEXT,                     -- base64 or URL for branding
  last_login INTEGER,
  reset_token TEXT,
  reset_token_expires INTEGER,
  created_at INTEGER,
  updated_at INTEGER,
  deleted INTEGER DEFAULT 0
);

-- ── AGENT SESSIONS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_sessions (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT,
  ip_address TEXT,
  impersonated_by TEXT,              -- superadmin id if impersonation
  revoked INTEGER DEFAULT 0,
  created_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON agent_sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_agent ON agent_sessions(agent_id);

-- ── AGENT SETTINGS (branding, white-label) ────────────────────────
CREATE TABLE IF NOT EXISTS agent_settings (
  id TEXT PRIMARY KEY,
  agent_id TEXT UNIQUE NOT NULL,
  logo_url TEXT,                     -- branding logo (base64 or URL)
  brand_name TEXT,                   -- agency name for reports
  brand_color TEXT DEFAULT '#1a56db',
  brand_secondary_color TEXT DEFAULT '#0ea5e9',
  report_footer TEXT,               -- footer text for PDF reports
  whatsapp_template TEXT,
  custom_domain TEXT,               -- white-label domain
  features_json TEXT DEFAULT '{}',  -- enabled features
  created_at INTEGER,
  updated_at INTEGER
);

-- ── AUDIT LOG ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  agent_id TEXT,
  action TEXT NOT NULL,             -- 'login','create_client','update_product',...
  target_table TEXT,
  target_id TEXT,
  meta TEXT DEFAULT '{}',           -- JSON with extra details
  created_at INTEGER
);
CREATE INDEX IF NOT EXISTS idx_audit_agent ON audit_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at);

-- ── CRM NOTES ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_notes (
  id TEXT PRIMARY KEY,
  agent_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  content TEXT DEFAULT '',          -- free text notes (not visible to client)
  meetings_json TEXT DEFAULT '[]',  -- [{date,summary,next_action}]
  created_at INTEGER,
  updated_at INTEGER,
  UNIQUE(agent_id, client_id)
);
CREATE INDEX IF NOT EXISTS idx_crm_client ON crm_notes(client_id);

-- ── CLIENTS (add agent_id) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  agent_id TEXT,                    -- which agent owns this client
  name TEXT,
  report_title TEXT,
  report_period TEXT,
  ytd_start_month TEXT,
  ytd_end_month TEXT,
  active INTEGER DEFAULT 1,
  username TEXT,
  password_hash TEXT,
  whatsapp_phone TEXT,
  enable_goals INTEGER DEFAULT 0,
  goals_json TEXT,
  enable_whatif INTEGER DEFAULT 0,
  enable_insights INTEGER DEFAULT 0,
  insights_json TEXT,
  enable_notifications INTEGER DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER,
  deleted INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_clients_agent ON clients(agent_id);

-- ── PRODUCTS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  client_id TEXT,
  name TEXT,
  name_short TEXT,
  institution TEXT,
  product_type TEXT,
  track TEXT,
  status TEXT DEFAULT 'active',
  color TEXT,
  inception_value REAL,
  inception_date TEXT,
  ytd_start_month TEXT,
  ytd_start_value REAL,
  sort_order INTEGER DEFAULT 0,
  exclude_open INTEGER DEFAULT 0,
  risk_equities REAL DEFAULT 0,
  risk_bonds REAL DEFAULT 0,
  risk_alternatives REAL DEFAULT 0,
  created_at INTEGER,
  updated_at INTEGER,
  deleted INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_products_client ON products(client_id);

-- ── MONTHLY VALUES ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS monthly_values (
  id TEXT PRIMARY KEY,
  client_id TEXT,
  product_id TEXT,
  month TEXT,
  value REAL,
  risk_equities REAL DEFAULT 0,
  risk_bonds REAL DEFAULT 0,
  risk_alternatives REAL DEFAULT 0,
  track TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  deleted INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_mv_product ON monthly_values(product_id);
CREATE INDEX IF NOT EXISTS idx_mv_client ON monthly_values(client_id);

-- ── TIMELINE EVENTS ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  client_id TEXT,
  product_id TEXT,
  event_date TEXT,
  event_type TEXT,
  title TEXT,
  description TEXT,
  amount REAL,
  created_at INTEGER,
  updated_at INTEGER,
  deleted INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_events_client ON timeline_events(client_id);

-- ── INITIAL SUPERADMIN ────────────────────────────────────────────
-- password: Admin@12345  (SHA-256 hash)
-- CHANGE THIS IMMEDIATELY after first login!
INSERT OR IGNORE INTO agents (id,name,email,password_hash,role,status,plan,client_quota,created_at,updated_at,deleted)
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
