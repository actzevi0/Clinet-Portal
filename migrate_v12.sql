-- Migration v12: Ensure columns for Surense import matching
-- Uses safe approach: each ALTER is in a separate statement
-- SQLite will ignore "duplicate column" errors silently when caught

-- clients: identity number and protection flag
ALTER TABLE clients ADD COLUMN identity_number TEXT;
ALTER TABLE clients ADD COLUMN import_protected INTEGER DEFAULT 0;

-- products: policy/account number, agent info, tracks, subname
ALTER TABLE products ADD COLUMN account_number TEXT;
ALTER TABLE products ADD COLUMN agent_id TEXT;
ALTER TABLE products ADD COLUMN agent_appointment_date TEXT;
ALTER TABLE products ADD COLUMN tracks_json TEXT;
ALTER TABLE products ADD COLUMN product_subname TEXT;

-- Indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_clients_tz ON clients(identity_number);
CREATE INDEX IF NOT EXISTS idx_products_account ON products(account_number);
