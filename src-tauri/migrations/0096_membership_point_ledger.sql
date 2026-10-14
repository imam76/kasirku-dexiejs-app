-- Member points become ledger-owned. Each device pushes immutable point events and
-- PostgreSQL applies them additively, the same shape as stock_mutations -> products, so two
-- terminals redeeming or earning on one member sum instead of overwriting each other.
--
-- A point event bumps memberships.updated_at so the change reaches other devices through the
-- membership pull cursor. Profile fields therefore keep last-write-wins on their own
-- timestamp: otherwise a sale on another terminal would make a pending profile edit look stale
-- and silently drop it.
ALTER TABLE memberships ADD COLUMN IF NOT EXISTS profile_updated_at TIMESTAMPTZ;
UPDATE memberships SET profile_updated_at = updated_at WHERE profile_updated_at IS NULL;
-- Older app builds still insert without this column until every terminal is updated.
ALTER TABLE memberships ALTER COLUMN profile_updated_at SET DEFAULT NOW();
ALTER TABLE memberships ALTER COLUMN profile_updated_at SET NOT NULL;

-- membership_id references memberships(id) at the application level only, same rationale as
-- memberships.contact_id (0092): both sync as independent sync-queue items.
CREATE TABLE IF NOT EXISTS membership_point_transactions (
    id TEXT PRIMARY KEY,
    membership_id TEXT NOT NULL,
    membership_number TEXT,
    member_name TEXT NOT NULL,
    transaction_id TEXT,
    transaction_number TEXT,
    type TEXT NOT NULL,
    points_delta DOUBLE PRECISION NOT NULL,
    amount_value DOUBLE PRECISION NOT NULL DEFAULT 0,
    -- The originating device's view of the balance, kept for the receipt trail only.
    balance_after DOUBLE PRECISION NOT NULL,
    reason TEXT NOT NULL,
    created_by TEXT,
    created_by_name TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    -- created_at is device business time; pulls cursor on arrival order instead (see 0095).
    server_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_membership_point_transactions_membership
    ON membership_point_transactions (membership_id, created_at);
CREATE INDEX IF NOT EXISTS idx_membership_point_transactions_transaction_id
    ON membership_point_transactions (transaction_id);
CREATE INDEX IF NOT EXISTS idx_membership_point_transactions_server_created_at_id
    ON membership_point_transactions (server_created_at, id);

DROP TRIGGER IF EXISTS kasirku_notify_data_change ON membership_point_transactions;
CREATE TRIGGER kasirku_notify_data_change
AFTER INSERT OR UPDATE OR DELETE ON membership_point_transactions
FOR EACH ROW EXECUTE FUNCTION kasirku_notify_data_change();
