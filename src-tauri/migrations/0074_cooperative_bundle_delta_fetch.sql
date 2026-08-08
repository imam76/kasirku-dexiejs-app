-- Cooperative bundle delta fetch: cursor pagination support for all 6 tables behind
-- refreshCooperativeDataFromPostgres(), so realtime sync no longer full-scans them.
--
-- cooperative_loans and cooperative_loan_installments never had a deleted_at column -
-- rows were hard DELETEd (delete_cooperative_loan_application, delete_cooperative_loan_migration),
-- which is why the client had to reconcile deletions by diffing the full remote list against
-- Dexie. That diff is incompatible with a cursor that only returns recently-changed rows, so
-- both deletion paths move to soft-delete (deleted_at) here to make cursor pagination safe.

ALTER TABLE cooperative_loans ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE cooperative_loan_installments ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_cooperative_members_updated_at_id
    ON cooperative_members (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_cooperative_saving_transactions_updated_at_id
    ON cooperative_saving_transactions (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_cooperative_member_saving_balances_updated_at_id
    ON cooperative_member_saving_balances (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_cooperative_loans_updated_at_id
    ON cooperative_loans (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_cooperative_loan_installments_updated_at_id
    ON cooperative_loan_installments (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_cooperative_loan_payments_updated_at_id
    ON cooperative_loan_payments (updated_at, id);
