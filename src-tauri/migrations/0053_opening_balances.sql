CREATE TABLE IF NOT EXISTS opening_balance_batches (
    id TEXT PRIMARY KEY,
    module TEXT NOT NULL,
    cutoff_date TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL,
    total_debit DOUBLE PRECISION NOT NULL DEFAULT 0,
    total_credit DOUBLE PRECISION NOT NULL DEFAULT 0,
    journal_entry_id TEXT,
    posted_at TIMESTAMPTZ,
    skipped_at TIMESTAMPTZ,
    notes TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_by TEXT,
    created_by_name TEXT,
    updated_by TEXT,
    updated_by_name TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_opening_balance_batches_module ON opening_balance_batches (module);
CREATE INDEX IF NOT EXISTS idx_opening_balance_batches_cutoff_date ON opening_balance_batches (cutoff_date);
CREATE INDEX IF NOT EXISTS idx_opening_balance_batches_status ON opening_balance_batches (status);
CREATE INDEX IF NOT EXISTS idx_opening_balance_batches_journal_entry_id ON opening_balance_batches (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_opening_balance_batches_updated_at ON opening_balance_batches (updated_at);
CREATE INDEX IF NOT EXISTS idx_opening_balance_batches_deleted_at ON opening_balance_batches (deleted_at);

CREATE TABLE IF NOT EXISTS opening_balance_lines (
    id TEXT PRIMARY KEY,
    batch_id TEXT NOT NULL REFERENCES opening_balance_batches (id) ON DELETE CASCADE,
    module TEXT NOT NULL,
    line_number INTEGER NOT NULL,
    contact_id TEXT,
    party_name TEXT,
    document_number TEXT,
    document_date TIMESTAMPTZ,
    due_date TIMESTAMPTZ,
    currency_code TEXT,
    currency_name TEXT,
    currency_symbol TEXT,
    base_currency_code TEXT,
    fx_rate DOUBLE PRECISION,
    amount DOUBLE PRECISION,
    base_amount DOUBLE PRECISION NOT NULL,
    paid_amount DOUBLE PRECISION,
    remaining_amount DOUBLE PRECISION,
    settlement_status TEXT,
    last_paid_at TIMESTAMPTZ,
    account_id TEXT,
    account_code TEXT,
    account_name TEXT,
    counter_account_id TEXT,
    counter_account_code TEXT,
    counter_account_name TEXT,
    debit DOUBLE PRECISION NOT NULL DEFAULT 0,
    credit DOUBLE PRECISION NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_opening_balance_lines_batch_id ON opening_balance_lines (batch_id);
CREATE INDEX IF NOT EXISTS idx_opening_balance_lines_module ON opening_balance_lines (module);
CREATE INDEX IF NOT EXISTS idx_opening_balance_lines_contact_id ON opening_balance_lines (contact_id);
CREATE INDEX IF NOT EXISTS idx_opening_balance_lines_document_number ON opening_balance_lines (document_number);
CREATE INDEX IF NOT EXISTS idx_opening_balance_lines_document_date ON opening_balance_lines (document_date);
CREATE INDEX IF NOT EXISTS idx_opening_balance_lines_due_date ON opening_balance_lines (due_date);
CREATE INDEX IF NOT EXISTS idx_opening_balance_lines_account_id ON opening_balance_lines (account_id);
CREATE INDEX IF NOT EXISTS idx_opening_balance_lines_settlement_status ON opening_balance_lines (settlement_status);
CREATE INDEX IF NOT EXISTS idx_opening_balance_lines_updated_at ON opening_balance_lines (updated_at);

DO $$
DECLARE
    realtime_table_name TEXT;
BEGIN
    IF TO_REGPROC('kasirku_notify_data_change') IS NOT NULL THEN
        FOREACH realtime_table_name IN ARRAY ARRAY[
            'opening_balance_batches',
            'opening_balance_lines'
        ] LOOP
            EXECUTE FORMAT(
                'DROP TRIGGER IF EXISTS kasirku_notify_data_change ON public.%I',
                realtime_table_name
            );
            EXECUTE FORMAT(
                'CREATE TRIGGER kasirku_notify_data_change
                 AFTER INSERT OR UPDATE OR DELETE ON public.%I
                 FOR EACH ROW EXECUTE FUNCTION kasirku_notify_data_change()',
                realtime_table_name
            );
        END LOOP;
    END IF;
END;
$$;
