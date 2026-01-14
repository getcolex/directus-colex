-- Migration: Add task_id column to tb_project_files
-- This allows files to be associated with specific tasks (input files)
-- task_id = NULL means project-level file (template files)

-- Add the task_id column
ALTER TABLE tb_project_files
ADD COLUMN IF NOT EXISTS task_id INTEGER;

-- Add foreign key constraint
ALTER TABLE tb_project_files
ADD CONSTRAINT fk_task
    FOREIGN KEY (task_id)
    REFERENCES tb_tasks(id)
    ON DELETE CASCADE;

-- Add index for task_id queries
CREATE INDEX IF NOT EXISTS idx_project_files_task_id ON tb_project_files(task_id);

-- Update comments
COMMENT ON COLUMN tb_project_files.task_id IS 'Optional task ID for input files attached to specific tasks. NULL for project-level template files.';
