-- Migration v9: products tracks, management fees, client demographics
-- products: account_number, management_fee, show_fee, tracks_json
ALTER TABLE products ADD COLUMN account_number TEXT;
ALTER TABLE products ADD COLUMN management_fee REAL DEFAULT 0;
ALTER TABLE products ADD COLUMN show_fee INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN tracks_json TEXT;

-- clients: birth_date, join_date, show_join_date
ALTER TABLE clients ADD COLUMN birth_date TEXT;
ALTER TABLE clients ADD COLUMN join_date TEXT;
ALTER TABLE clients ADD COLUMN show_join_date INTEGER DEFAULT 0;

SELECT 'migration v9 done' AS status;
