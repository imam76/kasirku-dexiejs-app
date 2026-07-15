ALTER TABLE opening_balance_batches
    ADD COLUMN IF NOT EXISTS batch_number TEXT,
    ADD COLUMN IF NOT EXISTS company_id TEXT,
    ADD COLUMN IF NOT EXISTS company_name TEXT,
    ADD COLUMN IF NOT EXISTS accounting_start_date TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS revision_number INTEGER,
    ADD COLUMN IF NOT EXISTS previous_batch_id TEXT REFERENCES opening_balance_batches (id),
    ADD COLUMN IF NOT EXISTS posting_idempotency_key TEXT,
    ADD COLUMN IF NOT EXISTS posted_by TEXT,
    ADD COLUMN IF NOT EXISTS posted_by_name TEXT,
    ADD COLUMN IF NOT EXISTS locked_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reversed_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS reversed_by TEXT,
    ADD COLUMN IF NOT EXISTS reversed_by_name TEXT,
    ADD COLUMN IF NOT EXISTS reversal_journal_entry_id TEXT,
    ADD COLUMN IF NOT EXISTS validated_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS validated_by TEXT,
    ADD COLUMN IF NOT EXISTS validated_by_name TEXT;

UPDATE opening_balance_batches
SET
    company_id = COALESCE(company_id, 'default'),
    revision_number = COALESCE(revision_number, 1),
    batch_number = COALESCE(
        batch_number,
        'OB-' || TO_CHAR(cutoff_date, 'YYYYMMDD') || '-' || module || '-R' || COALESCE(revision_number, 1)::TEXT
    ),
    posted_by = COALESCE(posted_by, updated_by),
    posted_by_name = COALESCE(posted_by_name, updated_by_name),
    locked_at = CASE
        WHEN status = 'POSTED' THEN COALESCE(locked_at, posted_at)
        ELSE locked_at
    END
WHERE
    company_id IS NULL
    OR revision_number IS NULL
    OR batch_number IS NULL
    OR (status = 'POSTED' AND locked_at IS NULL)
    OR (status = 'POSTED' AND posted_by IS NULL AND updated_by IS NOT NULL);

CREATE UNIQUE INDEX IF NOT EXISTS uq_opening_balance_batches_batch_number
    ON opening_balance_batches (batch_number)
    WHERE deleted_at IS NULL AND batch_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_opening_balance_batches_active_company_cutoff_module
    ON opening_balance_batches (company_id, cutoff_date, module)
    WHERE deleted_at IS NULL AND status IN ('DRAFT', 'VALIDATED', 'POSTED', 'LOCKED');

CREATE UNIQUE INDEX IF NOT EXISTS uq_opening_balance_batches_journal_entry_id
    ON opening_balance_batches (journal_entry_id)
    WHERE deleted_at IS NULL AND journal_entry_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_opening_balance_batches_posting_idempotency_key
    ON opening_balance_batches (posting_idempotency_key)
    WHERE deleted_at IS NULL AND posting_idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_opening_balance_batches_company_id
    ON opening_balance_batches (company_id);

CREATE INDEX IF NOT EXISTS idx_opening_balance_batches_previous_batch_id
    ON opening_balance_batches (previous_batch_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_opening_balance_batches_status'
          AND conrelid = 'opening_balance_batches'::REGCLASS
    ) THEN
        ALTER TABLE opening_balance_batches
            ADD CONSTRAINT chk_opening_balance_batches_status
            CHECK (status IN ('DRAFT', 'VALIDATED', 'POSTED', 'LOCKED', 'REVERSED', 'SKIPPED', 'VOIDED'));
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_opening_balance_batches_revision_number'
          AND conrelid = 'opening_balance_batches'::REGCLASS
    ) THEN
        ALTER TABLE opening_balance_batches
            ADD CONSTRAINT chk_opening_balance_batches_revision_number
            CHECK (revision_number IS NULL OR revision_number > 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'chk_opening_balance_batches_totals_non_negative'
          AND conrelid = 'opening_balance_batches'::REGCLASS
    ) THEN
        ALTER TABLE opening_balance_batches
            ADD CONSTRAINT chk_opening_balance_batches_totals_non_negative
            CHECK (total_debit >= 0 AND total_credit >= 0);
    END IF;
END;
$$;
