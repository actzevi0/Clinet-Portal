-- EasyFinance Dashboard – Migration v5.0
-- הרץ בקונסול Cloudflare D1 לאחר migrate_v4.sql
-- מוסיף שדות פילוח סיכון ומסלול לטבלת monthly_values

-- הוסף שדות לטבלת monthly_values
ALTER TABLE monthly_values ADD COLUMN IF NOT EXISTS risk_equities REAL DEFAULT 0;
ALTER TABLE monthly_values ADD COLUMN IF NOT EXISTS risk_bonds REAL DEFAULT 0;
ALTER TABLE monthly_values ADD COLUMN IF NOT EXISTS risk_alternatives REAL DEFAULT 0;
ALTER TABLE monthly_values ADD COLUMN IF NOT EXISTS track TEXT;

-- הוסף event_type חדש ל-timeline_events (track_change)
-- אין צורך ב-ALTER כי event_type הוא TEXT חופשי

-- אינדקסים נוספים
CREATE INDEX IF NOT EXISTS idx_mv_month ON monthly_values(month);
CREATE INDEX IF NOT EXISTS idx_mv_client_month ON monthly_values(client_id, month);

-- הודעה
SELECT 'migrate_v5 completed: risk/track fields added to monthly_values' AS status;
