-- Migration v10: Add transfer_direction column to timeline_events
-- Distinguishes between transfer-in (received funds) and transfer-out (sent funds)
-- direction='in'  → product received a transfer, remains active
-- direction='out' → product was transferred out, no longer active
-- NULL = legacy records (use heuristic: check if data exists after transfer date)

ALTER TABLE timeline_events ADD COLUMN transfer_direction TEXT DEFAULT NULL;

-- Update existing known transfer-in events for menachem-gilor
-- analyst-gemul and meitav-gemul both received transfers (transfer-in)
UPDATE timeline_events 
SET transfer_direction = 'in' 
WHERE event_type = 'transfer' 
AND product_id IN ('analyst-gemul', 'meitav-gemul')
AND client_id = 'menachem-gilor';
