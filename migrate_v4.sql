-- EasyFinance Dashboard – Migration v4.0
-- הרץ אחרי v3.0 כדי להוסיף שדות חדשים
-- בטוח להרצה – משתמש ב-ALTER TABLE ADD COLUMN (לא ימחק נתונים)

-- clients: שדות חדשים v4.0
ALTER TABLE clients ADD COLUMN IF NOT EXISTS whatsapp_phone TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS enable_goals INTEGER DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS goals_json TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS enable_whatif INTEGER DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS enable_insights INTEGER DEFAULT 0;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS insights_json TEXT;
ALTER TABLE clients ADD COLUMN IF NOT EXISTS enable_notifications INTEGER DEFAULT 0;

-- products: שדות סיכון v4.0
ALTER TABLE products ADD COLUMN IF NOT EXISTS risk_equities REAL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS risk_bonds REAL DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS risk_alternatives REAL DEFAULT 0;
