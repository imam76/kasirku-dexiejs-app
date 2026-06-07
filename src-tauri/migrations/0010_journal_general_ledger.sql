CREATE TABLE IF NOT EXISTS journal_entries (
    id TEXT PRIMARY KEY,
    entry_number TEXT NOT NULL,
    entry_date TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL,
    source_type TEXT NOT NULL,
    source_id TEXT,
    source_number TEXT,
    source_event TEXT,
    description TEXT NOT NULL,
    total_debit DOUBLE PRECISION NOT NULL,
    total_credit DOUBLE PRECISION NOT NULL,
    posted_at TIMESTAMPTZ,
    voided_at TIMESTAMPTZ,
    reversed_entry_id TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_by TEXT,
    created_by_name TEXT,
    updated_by TEXT,
    updated_by_name TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_number ON journal_entries (entry_number);
CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_date ON journal_entries (entry_date);
CREATE INDEX IF NOT EXISTS idx_journal_entries_status ON journal_entries (status);
CREATE INDEX IF NOT EXISTS idx_journal_entries_source_type ON journal_entries (source_type);
CREATE INDEX IF NOT EXISTS idx_journal_entries_source_id ON journal_entries (source_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_source_event ON journal_entries (source_event);
CREATE INDEX IF NOT EXISTS idx_journal_entries_reversed_entry_id ON journal_entries (reversed_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entries_updated_at ON journal_entries (updated_at);
CREATE INDEX IF NOT EXISTS idx_journal_entries_deleted_at ON journal_entries (deleted_at);

CREATE TABLE IF NOT EXISTS journal_entry_lines (
    id TEXT PRIMARY KEY,
    journal_entry_id TEXT NOT NULL REFERENCES journal_entries (id) ON DELETE CASCADE,
    account_id TEXT NOT NULL,
    account_code TEXT NOT NULL,
    account_name TEXT NOT NULL,
    account_type TEXT NOT NULL,
    debit DOUBLE PRECISION NOT NULL,
    credit DOUBLE PRECISION NOT NULL,
    description TEXT,
    department_id TEXT,
    project_id TEXT,
    created_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_journal_entry_id ON journal_entry_lines (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account_id ON journal_entry_lines (account_id);
CREATE INDEX IF NOT EXISTS idx_journal_entry_lines_account_code ON journal_entry_lines (account_code);
