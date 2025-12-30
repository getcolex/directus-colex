-- SQL Script to fix button_context for all tasks
-- This updates button_context.status to match the actual task status

UPDATE tasks
SET button_context = jsonb_set(
    COALESCE(button_context::jsonb, '{}'::jsonb),
    '{status}',
    to_jsonb(status)
)
WHERE button_context IS NOT NULL 
  AND (button_context::jsonb->>'status') != status;

-- Show affected tasks
SELECT 
    id,
    name,
    status AS actual_status,
    button_context::jsonb->>'status' AS button_context_status
FROM tasks
WHERE project_id = '20131104-933a-4868-93c5-0675e34b4bf9'
ORDER BY sort, name;
