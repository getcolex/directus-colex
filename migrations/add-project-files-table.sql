-- Migration: Create tb_project_files junction table
-- This table links projects to files in directus_files with a type (input or template)
-- Run this in your Directus database (PostgreSQL)

-- Create the junction table
CREATE TABLE IF NOT EXISTS tb_project_files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id INTEGER NOT NULL,
    file_id UUID NOT NULL,
    file_type VARCHAR(20) NOT NULL DEFAULT 'input',
    date_created TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

    -- Foreign keys
    CONSTRAINT fk_project
        FOREIGN KEY (project_id)
        REFERENCES tb_projects(id)
        ON DELETE CASCADE,

    CONSTRAINT fk_file
        FOREIGN KEY (file_id)
        REFERENCES directus_files(id)
        ON DELETE CASCADE,

    -- Ensure file_type is valid
    CONSTRAINT chk_file_type
        CHECK (file_type IN ('input', 'template'))
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_project_files_project_id ON tb_project_files(project_id);
CREATE INDEX IF NOT EXISTS idx_project_files_file_type ON tb_project_files(file_type);
CREATE INDEX IF NOT EXISTS idx_project_files_project_type ON tb_project_files(project_id, file_type);

-- Grant Directus permissions (adjust role as needed)
-- Note: You may also need to register this collection in Directus admin

COMMENT ON TABLE tb_project_files IS 'Junction table linking projects to uploaded files with type classification';
COMMENT ON COLUMN tb_project_files.file_type IS 'Type of file: input (one-time project files) or template (reusable files carried over)';
