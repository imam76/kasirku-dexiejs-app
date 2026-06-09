CREATE TABLE IF NOT EXISTS cooperative_members (
    id TEXT PRIMARY KEY,
    member_number TEXT NOT NULL,
    name TEXT NOT NULL,
    identity_number TEXT,
    phone TEXT,
    address TEXT,
    join_date TEXT NOT NULL,
    status TEXT NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    created_by TEXT,
    created_by_name TEXT,
    updated_by TEXT,
    updated_by_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_cooperative_members_member_number ON cooperative_members (member_number);
CREATE INDEX IF NOT EXISTS idx_cooperative_members_status ON cooperative_members (status);
CREATE INDEX IF NOT EXISTS idx_cooperative_members_updated_at ON cooperative_members (updated_at);

CREATE TABLE IF NOT EXISTS cooperative_saving_transactions (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL,
    member_number TEXT NOT NULL,
    member_name TEXT NOT NULL,
    saving_type TEXT NOT NULL,
    transaction_type TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    transaction_date TEXT NOT NULL,
    status TEXT NOT NULL,
    cash_account_id TEXT,
    cash_account_code TEXT,
    cash_account_name TEXT,
    payment_method TEXT,
    payment_channel TEXT,
    finance_transaction_id TEXT,
    journal_entry_id TEXT,
    reversal_of_transaction_id TEXT,
    reversal_transaction_id TEXT,
    reversal_finance_transaction_id TEXT,
    reversal_journal_entry_id TEXT,
    reversed_at TEXT,
    reversal_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    created_by TEXT,
    created_by_name TEXT,
    updated_by TEXT,
    updated_by_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_cooperative_saving_transactions_member_id ON cooperative_saving_transactions (member_id);
CREATE INDEX IF NOT EXISTS idx_cooperative_saving_transactions_member_number ON cooperative_saving_transactions (member_number);
CREATE INDEX IF NOT EXISTS idx_cooperative_saving_transactions_saving_type ON cooperative_saving_transactions (saving_type);
CREATE INDEX IF NOT EXISTS idx_cooperative_saving_transactions_transaction_type ON cooperative_saving_transactions (transaction_type);
CREATE INDEX IF NOT EXISTS idx_cooperative_saving_transactions_status ON cooperative_saving_transactions (status);
CREATE INDEX IF NOT EXISTS idx_cooperative_saving_transactions_transaction_date ON cooperative_saving_transactions (transaction_date);
CREATE INDEX IF NOT EXISTS idx_cooperative_saving_transactions_updated_at ON cooperative_saving_transactions (updated_at);

CREATE TABLE IF NOT EXISTS cooperative_member_saving_balances (
    id TEXT PRIMARY KEY,
    member_id TEXT NOT NULL,
    member_number TEXT NOT NULL,
    member_name TEXT NOT NULL,
    saving_type TEXT NOT NULL,
    balance DOUBLE PRECISION NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cooperative_member_saving_balances_member_id ON cooperative_member_saving_balances (member_id);
CREATE INDEX IF NOT EXISTS idx_cooperative_member_saving_balances_member_number ON cooperative_member_saving_balances (member_number);
CREATE INDEX IF NOT EXISTS idx_cooperative_member_saving_balances_saving_type ON cooperative_member_saving_balances (saving_type);
CREATE INDEX IF NOT EXISTS idx_cooperative_member_saving_balances_updated_at ON cooperative_member_saving_balances (updated_at);

CREATE TABLE IF NOT EXISTS cooperative_loans (
    id TEXT PRIMARY KEY,
    loan_number TEXT NOT NULL,
    member_id TEXT NOT NULL,
    member_number TEXT NOT NULL,
    member_name TEXT NOT NULL,
    principal_amount DOUBLE PRECISION NOT NULL,
    interest_rate_per_month DOUBLE PRECISION NOT NULL,
    tenor_months INTEGER NOT NULL,
    total_interest_amount DOUBLE PRECISION NOT NULL,
    total_payable_amount DOUBLE PRECISION NOT NULL,
    outstanding_principal_amount DOUBLE PRECISION NOT NULL,
    outstanding_interest_amount DOUBLE PRECISION NOT NULL,
    outstanding_penalty_amount DOUBLE PRECISION NOT NULL,
    status TEXT NOT NULL,
    application_date TEXT NOT NULL,
    approved_at TEXT,
    approved_by TEXT,
    approved_by_name TEXT,
    approval_notes TEXT,
    rejected_at TEXT,
    rejected_by TEXT,
    rejected_by_name TEXT,
    rejection_reason TEXT,
    disbursed_at TEXT,
    cash_account_id TEXT,
    cash_account_code TEXT,
    cash_account_name TEXT,
    payment_method TEXT,
    payment_channel TEXT,
    finance_transaction_id TEXT,
    journal_entry_id TEXT,
    disbursement_notes TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    created_by TEXT,
    created_by_name TEXT,
    updated_by TEXT,
    updated_by_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_cooperative_loans_loan_number ON cooperative_loans (loan_number);
CREATE INDEX IF NOT EXISTS idx_cooperative_loans_member_id ON cooperative_loans (member_id);
CREATE INDEX IF NOT EXISTS idx_cooperative_loans_member_number ON cooperative_loans (member_number);
CREATE INDEX IF NOT EXISTS idx_cooperative_loans_status ON cooperative_loans (status);
CREATE INDEX IF NOT EXISTS idx_cooperative_loans_application_date ON cooperative_loans (application_date);
CREATE INDEX IF NOT EXISTS idx_cooperative_loans_updated_at ON cooperative_loans (updated_at);

CREATE TABLE IF NOT EXISTS cooperative_loan_installments (
    id TEXT PRIMARY KEY,
    loan_id TEXT NOT NULL,
    loan_number TEXT NOT NULL,
    member_id TEXT NOT NULL,
    member_number TEXT NOT NULL,
    member_name TEXT NOT NULL,
    installment_number INTEGER NOT NULL,
    due_date TEXT NOT NULL,
    principal_amount DOUBLE PRECISION NOT NULL,
    interest_amount DOUBLE PRECISION NOT NULL,
    penalty_amount DOUBLE PRECISION NOT NULL,
    paid_principal_amount DOUBLE PRECISION NOT NULL,
    paid_interest_amount DOUBLE PRECISION NOT NULL,
    paid_penalty_amount DOUBLE PRECISION NOT NULL,
    status TEXT NOT NULL,
    paid_at TEXT,
    collection_status TEXT DEFAULT 'NONE',
    follow_up_date TEXT,
    collection_notes TEXT,
    last_contacted_at TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_cooperative_loan_installments_loan_id ON cooperative_loan_installments (loan_id);
CREATE INDEX IF NOT EXISTS idx_cooperative_loan_installments_member_id ON cooperative_loan_installments (member_id);
CREATE INDEX IF NOT EXISTS idx_cooperative_loan_installments_member_number ON cooperative_loan_installments (member_number);
CREATE INDEX IF NOT EXISTS idx_cooperative_loan_installments_due_date ON cooperative_loan_installments (due_date);
CREATE INDEX IF NOT EXISTS idx_cooperative_loan_installments_status ON cooperative_loan_installments (status);
CREATE INDEX IF NOT EXISTS idx_cooperative_loan_installments_collection_status ON cooperative_loan_installments (collection_status);
CREATE INDEX IF NOT EXISTS idx_cooperative_loan_installments_follow_up_date ON cooperative_loan_installments (follow_up_date);
CREATE INDEX IF NOT EXISTS idx_cooperative_loan_installments_updated_at ON cooperative_loan_installments (updated_at);

CREATE TABLE IF NOT EXISTS cooperative_loan_payments (
    id TEXT PRIMARY KEY,
    payment_number TEXT NOT NULL,
    payment_type TEXT,
    loan_id TEXT NOT NULL,
    loan_number TEXT NOT NULL,
    installment_id TEXT,
    member_id TEXT NOT NULL,
    member_number TEXT NOT NULL,
    member_name TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL,
    principal_amount DOUBLE PRECISION NOT NULL,
    interest_amount DOUBLE PRECISION NOT NULL,
    penalty_amount DOUBLE PRECISION NOT NULL,
    payment_date TEXT NOT NULL,
    status TEXT NOT NULL,
    cash_account_id TEXT,
    cash_account_code TEXT,
    cash_account_name TEXT,
    payment_method TEXT,
    payment_channel TEXT,
    finance_transaction_id TEXT,
    journal_entry_id TEXT,
    reversal_of_payment_id TEXT,
    reversal_payment_id TEXT,
    reversal_finance_transaction_id TEXT,
    reversal_journal_entry_id TEXT,
    reversed_at TEXT,
    reversal_reason TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    created_by TEXT,
    created_by_name TEXT,
    updated_by TEXT,
    updated_by_name TEXT
);

CREATE INDEX IF NOT EXISTS idx_cooperative_loan_payments_payment_number ON cooperative_loan_payments (payment_number);
CREATE INDEX IF NOT EXISTS idx_cooperative_loan_payments_loan_id ON cooperative_loan_payments (loan_id);
CREATE INDEX IF NOT EXISTS idx_cooperative_loan_payments_installment_id ON cooperative_loan_payments (installment_id);
CREATE INDEX IF NOT EXISTS idx_cooperative_loan_payments_member_id ON cooperative_loan_payments (member_id);
CREATE INDEX IF NOT EXISTS idx_cooperative_loan_payments_member_number ON cooperative_loan_payments (member_number);
CREATE INDEX IF NOT EXISTS idx_cooperative_loan_payments_payment_date ON cooperative_loan_payments (payment_date);
CREATE INDEX IF NOT EXISTS idx_cooperative_loan_payments_status ON cooperative_loan_payments (status);
CREATE INDEX IF NOT EXISTS idx_cooperative_loan_payments_updated_at ON cooperative_loan_payments (updated_at);
