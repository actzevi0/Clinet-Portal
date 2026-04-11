-- EasyFinance Dashboard – D1 Schema
-- הרץ את זה בקונסול Cloudflare D1 אם הטבלאות לא קיימות

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  name TEXT,
  report_title TEXT,
  report_period TEXT,
  ytd_start_month TEXT,
  ytd_end_month TEXT,
  active INTEGER DEFAULT 1,
  username TEXT,
  password_hash TEXT,
  created_at INTEGER,
  updated_at INTEGER,
  deleted INTEGER DEFAULT 0
);

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
  created_at INTEGER,
  updated_at INTEGER,
  deleted INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS monthly_values (
  id TEXT PRIMARY KEY,
  client_id TEXT,
  product_id TEXT,
  month TEXT,
  value REAL,
  created_at INTEGER,
  updated_at INTEGER,
  deleted INTEGER DEFAULT 0
);

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
