CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    code TEXT,
    name TEXT NOT NULL,
    status TEXT NOT NULL,
    contact_id TEXT,
    contact_name TEXT,
    department_id TEXT,
    department_code TEXT,
    department_name TEXT,
    start_date TEXT,
    end_date TEXT,
    budget_amount DOUBLE PRECISION,
    description TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_projects_name ON projects (name);
CREATE INDEX IF NOT EXISTS idx_projects_code ON projects (code);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects (status);
CREATE INDEX IF NOT EXISTS idx_projects_is_active ON projects (is_active);
CREATE INDEX IF NOT EXISTS idx_projects_department_id ON projects (department_id);
CREATE INDEX IF NOT EXISTS idx_projects_contact_id ON projects (contact_id);
