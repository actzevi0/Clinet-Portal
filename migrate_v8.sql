-- EasyFinance v8 migration: add is_readonly to agent_sessions
ALTER TABLE agent_sessions ADD COLUMN is_readonly INTEGER DEFAULT 0;

SELECT 'v8 migration complete: is_readonly added to agent_sessions' AS status;
