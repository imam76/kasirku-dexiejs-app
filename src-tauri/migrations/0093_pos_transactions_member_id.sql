-- member_id references memberships(id) at the application level only, no hard DB
-- constraint - same rationale as member_contact_id before it. New transactions populate
-- member_id going forward; member_contact_id is kept read-only for historical rows.
ALTER TABLE pos_transactions ADD COLUMN IF NOT EXISTS member_id TEXT;

CREATE INDEX IF NOT EXISTS idx_pos_transactions_member_id ON pos_transactions (member_id);
