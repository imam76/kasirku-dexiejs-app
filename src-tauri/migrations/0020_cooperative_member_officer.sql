ALTER TABLE cooperative_members
    ADD COLUMN IF NOT EXISTS officer_id TEXT,
    ADD COLUMN IF NOT EXISTS officer_name TEXT,
    ADD COLUMN IF NOT EXISTS officer_position TEXT;

CREATE INDEX IF NOT EXISTS idx_cooperative_members_officer_id ON cooperative_members (officer_id);
