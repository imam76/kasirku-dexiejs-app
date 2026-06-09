ALTER TABLE cooperative_members
    ADD COLUMN IF NOT EXISTS area_id TEXT,
    ADD COLUMN IF NOT EXISTS area_name TEXT,
    ADD COLUMN IF NOT EXISTS area_code TEXT;

CREATE INDEX IF NOT EXISTS idx_cooperative_members_area_id ON cooperative_members (area_id);
