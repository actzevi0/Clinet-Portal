-- EasyFinance Dashboard – Migration v7.0
-- Add UNIQUE constraint to monthly_values (product_id, month)
-- This prevents duplicate entries and enables proper UPSERT behavior

-- Create unique index on (product_id, month) to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_unique_product_month 
ON monthly_values(product_id, month);

SELECT 'migrate_v7 completed: unique index on monthly_values(product_id, month)' AS status;
