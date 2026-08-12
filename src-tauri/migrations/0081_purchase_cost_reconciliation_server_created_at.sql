-- purchase_cost_reconciliations.created_at is client-supplied (set on the originating device
-- when reconcilePurchaseReceiptCost runs, possibly offline) and is only pushed to Postgres later
-- via the sync queue, which can lag arbitrarily behind other devices. Cursoring delta-fetch on
-- created_at means a device that pushes late can have its row permanently skipped once other
-- devices' pull cursors have already advanced past that (earlier) created_at value.
--
-- server_created_at is assigned by Postgres itself at INSERT time (DEFAULT NOW(), never supplied
-- by the client - see insert_purchase_cost_reconciliation), so it always reflects true arrival
-- order at the server and is immune to client clock skew or delayed pushes. Delta-fetch cursors
-- on (server_created_at, id) instead.

ALTER TABLE purchase_cost_reconciliations
    ADD COLUMN IF NOT EXISTS server_created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_purchase_cost_reconciliations_server_created_at_id
    ON purchase_cost_reconciliations (server_created_at, id);
