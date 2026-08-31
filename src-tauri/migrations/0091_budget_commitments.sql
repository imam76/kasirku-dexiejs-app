-- budget_id references budgets(id) at the application level only (validated in
-- budgetCommitmentService.ts), not a hard DB constraint - matching this project's pattern for
-- cross-entity references (e.g. financeTransactions.category). budgets and budget_commitments
-- sync as two independent sync-queue items rather than one atomic bundle, so a hard FK here would
-- let a transient failure pushing a brand-new budget cascade into a foreign-key-violation failure
-- for its commitments too.
CREATE TABLE IF NOT EXISTS budget_commitments (
    id TEXT PRIMARY KEY,
    budget_id TEXT NOT NULL,
    description TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    status TEXT NOT NULL DEFAULT 'PLANNED',
    notes TEXT,
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_budget_commitments_budget_id ON budget_commitments (budget_id);
CREATE INDEX IF NOT EXISTS idx_budget_commitments_updated_at ON budget_commitments (updated_at);
CREATE INDEX IF NOT EXISTS idx_budget_commitments_status ON budget_commitments (status);

DROP TRIGGER IF EXISTS kasirku_notify_data_change ON budget_commitments;
CREATE TRIGGER kasirku_notify_data_change
AFTER INSERT OR UPDATE OR DELETE ON budget_commitments
FOR EACH ROW EXECUTE FUNCTION kasirku_notify_data_change();
