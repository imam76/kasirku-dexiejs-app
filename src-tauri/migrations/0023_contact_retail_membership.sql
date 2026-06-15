ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS is_member BOOLEAN NOT NULL DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS membership_number TEXT,
ADD COLUMN IF NOT EXISTS membership_status TEXT,
ADD COLUMN IF NOT EXISTS membership_joined_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS membership_points_balance DOUBLE PRECISION NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_contacts_is_member ON contacts (is_member);
CREATE INDEX IF NOT EXISTS idx_contacts_membership_number ON contacts (membership_number);
