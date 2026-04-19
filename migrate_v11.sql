-- Migration v11: Add agent_id column to monthly_values
-- This column was missing and caused the Make webhook (handleMakeWebhook) to fail with:
-- D1_ERROR: table monthly_values has no column named agent_id

ALTER TABLE monthly_values ADD COLUMN agent_id TEXT;
