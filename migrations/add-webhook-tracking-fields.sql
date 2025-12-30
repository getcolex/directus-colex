-- Migration: Add webhook tracking fields to tasks collection
-- Date: 2025-12-13
-- Description: Add fields to track webhook execution status and responses

-- Add webhook tracking fields if they don't exist
DO $$
BEGIN
    -- webhook_last_status: HTTP status code of last webhook call
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'tasks' AND column_name = 'webhook_last_status') THEN
        ALTER TABLE tasks ADD COLUMN webhook_last_status INTEGER;
    END IF;

    -- webhook_last_response: Response body from last webhook call (limited to 1000 chars)
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'tasks' AND column_name = 'webhook_last_response') THEN
        ALTER TABLE tasks ADD COLUMN webhook_last_response TEXT;
    END IF;

    -- webhook_last_error: Error message if webhook failed
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'tasks' AND column_name = 'webhook_last_error') THEN
        ALTER TABLE tasks ADD COLUMN webhook_last_error TEXT;
    END IF;
END $$;

-- Add comments for documentation
COMMENT ON COLUMN tasks.webhook_triggered IS 'Set to true to trigger server-side webhook execution';
COMMENT ON COLUMN tasks.last_webhook_trigger IS 'Timestamp of last webhook trigger attempt';
COMMENT ON COLUMN tasks.webhook_last_status IS 'HTTP status code of last webhook response';
COMMENT ON COLUMN tasks.webhook_last_response IS 'Response body from last successful webhook call';
COMMENT ON COLUMN tasks.webhook_last_error IS 'Error message if last webhook call failed';
