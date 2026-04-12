-- ═══════════════════════════════════════════════════════════
-- EasyFinance v6 Production Migration (safe — skip existing)
-- ═══════════════════════════════════════════════════════════

-- ── agents ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agents (
  id              TEXT PRIMARY KEY,
  name            TEXT NOT NULL,
  email           TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'agent',
  status          TEXT NOT NULL DEFAULT 'active',
  plan            TEXT NOT NULL DEFAULT 'basic',
  client_quota    INTEGER,
  subscription_end INTEGER,
  logo_url        TEXT,
  brand_name      TEXT,
  primary_color   TEXT,
  secondary_color TEXT,
  pdf_footer      TEXT,
  custom_domain   TEXT,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL,
  deleted         INTEGER NOT NULL DEFAULT 0
);

-- ── agent_sessions ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_sessions (
  id              TEXT PRIMARY KEY,
  agent_id        TEXT NOT NULL,
  token           TEXT UNIQUE NOT NULL,
  expires_at      INTEGER NOT NULL,
  created_at      INTEGER NOT NULL,
  ip_address      TEXT,
  user_agent      TEXT,
  is_impersonation INTEGER DEFAULT 0,
  impersonator_id  TEXT,
  revoked         INTEGER DEFAULT 0
);

-- ── agent_settings ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS agent_settings (
  agent_id        TEXT PRIMARY KEY,
  brand_name      TEXT,
  primary_color   TEXT DEFAULT '#1a56db',
  secondary_color TEXT DEFAULT '#0ea5e9',
  pdf_footer      TEXT,
  custom_domain   TEXT,
  feature_goals   INTEGER DEFAULT 0,
  feature_whatif  INTEGER DEFAULT 0,
  feature_insights INTEGER DEFAULT 0,
  feature_notifications INTEGER DEFAULT 0,
  updated_at      INTEGER NOT NULL
);

-- ── audit_log ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id              TEXT PRIMARY KEY,
  agent_id        TEXT,
  action          TEXT NOT NULL,
  target_type     TEXT,
  target_id       TEXT,
  target_name     TEXT,
  details         TEXT,
  ip_address      TEXT,
  user_agent      TEXT,
  created_at      INTEGER NOT NULL
);

-- ── crm_notes ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS crm_notes (
  id              TEXT PRIMARY KEY,
  client_id       TEXT NOT NULL,
  agent_id        TEXT NOT NULL,
  note            TEXT NOT NULL,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);

-- ── עמודות חסרות ב-clients ──────────────────────────────────
ALTER TABLE clients ADD COLUMN agent_id TEXT;
ALTER TABLE clients ADD COLUMN whatsapp_phone TEXT;
ALTER TABLE clients ADD COLUMN enable_goals INTEGER DEFAULT 0;
ALTER TABLE clients ADD COLUMN goals_json TEXT;
ALTER TABLE clients ADD COLUMN enable_whatif INTEGER DEFAULT 0;
ALTER TABLE clients ADD COLUMN enable_insights INTEGER DEFAULT 0;
ALTER TABLE clients ADD COLUMN insights_json TEXT;
ALTER TABLE clients ADD COLUMN enable_notifications INTEGER DEFAULT 0;
ALTER TABLE clients ADD COLUMN deleted INTEGER DEFAULT 0;

-- ── עמודות חסרות ב-products ─────────────────────────────────
ALTER TABLE products ADD COLUMN agent_id TEXT;
ALTER TABLE products ADD COLUMN risk_equities REAL DEFAULT 0;
ALTER TABLE products ADD COLUMN risk_bonds REAL DEFAULT 0;
ALTER TABLE products ADD COLUMN risk_alternatives REAL DEFAULT 0;
ALTER TABLE products ADD COLUMN deleted INTEGER DEFAULT 0;

-- ── עמודות חסרות ב-monthly_values ───────────────────────────
ALTER TABLE monthly_values ADD COLUMN risk_equities REAL DEFAULT 0;
ALTER TABLE monthly_values ADD COLUMN risk_bonds REAL DEFAULT 0;
ALTER TABLE monthly_values ADD COLUMN risk_alternatives REAL DEFAULT 0;
ALTER TABLE monthly_values ADD COLUMN track TEXT;

-- ── indexes ─────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_sessions_token  ON agent_sessions(token);
CREATE INDEX IF NOT EXISTS idx_sessions_agent  ON agent_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_audit_agent     ON audit_log(agent_id);
CREATE INDEX IF NOT EXISTS idx_audit_created   ON audit_log(created_at);
CREATE INDEX IF NOT EXISTS idx_clients_agent   ON clients(agent_id);
CREATE INDEX IF NOT EXISTS idx_products_client ON products(client_id);
CREATE INDEX IF NOT EXISTS idx_mv_product      ON monthly_values(product_id);
CREATE INDEX IF NOT EXISTS idx_mv_month        ON monthly_values(month);

-- ── Super Admin ──────────────────────────────────────────────
-- password: EasyAdmin@2025!  (SHA-256)
INSERT OR IGNORE INTO agents (id,name,email,password_hash,role,status,plan,client_quota,created_at,updated_at,deleted)
VALUES (
  'superadmin-1','Super Admin','admin@easyfinance.co.il',
  '032bb6c6e03edff61a1d453cd7169081570e2d0aa3dbdb4c1692835ea3563418',
  'superadmin','active','unlimited',NULL,
  strftime('%s','now')*1000, strftime('%s','now')*1000, 0
);

SELECT 'v6 migration complete' as status;
