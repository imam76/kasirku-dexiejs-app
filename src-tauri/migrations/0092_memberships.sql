-- contact_id references contacts(id) at the application level only, not a hard DB
-- constraint - same rationale as budget_commitments.budget_id (0091): memberships and
-- contacts sync as independent sync-queue items, and a membership can legitimately exist
-- with no linked contact at all (phone-only POS quick-create).
CREATE TABLE IF NOT EXISTS memberships (
    id TEXT PRIMARY KEY,
    contact_id TEXT,
    member_number TEXT NOT NULL,
    name TEXT,
    phone TEXT NOT NULL,
    email TEXT,
    status TEXT NOT NULL DEFAULT 'ACTIVE',
    joined_at TIMESTAMPTZ NOT NULL,
    points_balance DOUBLE PRECISION NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_memberships_contact_id ON memberships (contact_id);
CREATE INDEX IF NOT EXISTS idx_memberships_member_number ON memberships (member_number);
CREATE INDEX IF NOT EXISTS idx_memberships_phone ON memberships (phone);
CREATE INDEX IF NOT EXISTS idx_memberships_updated_at ON memberships (updated_at);

DROP TRIGGER IF EXISTS kasirku_notify_data_change ON memberships;
CREATE TRIGGER kasirku_notify_data_change
AFTER INSERT OR UPDATE OR DELETE ON memberships
FOR EACH ROW EXECUTE FUNCTION kasirku_notify_data_change();
