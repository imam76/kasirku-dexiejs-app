CREATE TABLE IF NOT EXISTS payroll_runs (
    id TEXT PRIMARY KEY,
    payroll_number TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status TEXT NOT NULL,
    employee_count INTEGER NOT NULL DEFAULT 0,
    gross_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    allowance_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    bonus_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    other_deduction_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    cash_advance_deduction_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    deduction_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    net_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    payment_method TEXT,
    payment_channel TEXT,
    cash_account_id TEXT,
    cash_account_code TEXT,
    cash_account_name TEXT,
    finance_transaction_id TEXT,
    notes TEXT,
    approved_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    voided_at TIMESTAMPTZ,
    created_by TEXT,
    created_by_name TEXT,
    updated_by TEXT,
    updated_by_name TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_payroll_runs_number ON payroll_runs (payroll_number);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_period_start ON payroll_runs (period_start);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_period_end ON payroll_runs (period_end);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_status ON payroll_runs (status);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_paid_at ON payroll_runs (paid_at);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_finance_transaction_id ON payroll_runs (finance_transaction_id);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_updated_at ON payroll_runs (updated_at);

CREATE TABLE IF NOT EXISTS payroll_run_items (
    id TEXT PRIMARY KEY,
    payroll_run_id TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    employee_name TEXT NOT NULL,
    employee_position TEXT,
    base_salary DOUBLE PRECISION NOT NULL DEFAULT 0,
    allowance_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    bonus_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    other_deduction_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    cash_advance_deduction_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    deduction_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    gross_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    net_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_payroll_run_items_payroll_run_id ON payroll_run_items (payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_payroll_run_items_employee_id ON payroll_run_items (employee_id);

CREATE TABLE IF NOT EXISTS employee_cash_advances (
    id TEXT PRIMARY KEY,
    advance_number TEXT NOT NULL,
    employee_id TEXT NOT NULL,
    employee_name TEXT NOT NULL,
    employee_position TEXT,
    amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    outstanding_amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    disbursed_at TIMESTAMPTZ NOT NULL,
    payment_method TEXT,
    payment_channel TEXT,
    cash_account_id TEXT,
    cash_account_code TEXT,
    cash_account_name TEXT,
    finance_transaction_id TEXT,
    notes TEXT,
    voided_at TIMESTAMPTZ,
    void_reason TEXT,
    created_by TEXT,
    created_by_name TEXT,
    updated_by TEXT,
    updated_by_name TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_employee_cash_advances_number ON employee_cash_advances (advance_number);
CREATE INDEX IF NOT EXISTS idx_employee_cash_advances_employee_id ON employee_cash_advances (employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_cash_advances_status ON employee_cash_advances (status);
CREATE INDEX IF NOT EXISTS idx_employee_cash_advances_disbursed_at ON employee_cash_advances (disbursed_at);
CREATE INDEX IF NOT EXISTS idx_employee_cash_advances_finance_transaction_id ON employee_cash_advances (finance_transaction_id);
CREATE INDEX IF NOT EXISTS idx_employee_cash_advances_updated_at ON employee_cash_advances (updated_at);

CREATE TABLE IF NOT EXISTS employee_cash_advance_repayments (
    id TEXT PRIMARY KEY,
    cash_advance_id TEXT NOT NULL,
    cash_advance_number TEXT NOT NULL,
    payroll_run_id TEXT NOT NULL,
    payroll_run_item_id TEXT NOT NULL,
    payroll_number TEXT,
    employee_id TEXT NOT NULL,
    employee_name TEXT NOT NULL,
    amount DOUBLE PRECISION NOT NULL DEFAULT 0,
    status TEXT NOT NULL,
    allocated_at TIMESTAMPTZ NOT NULL,
    posted_at TIMESTAMPTZ,
    voided_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_employee_cash_advance_repayments_cash_advance_id ON employee_cash_advance_repayments (cash_advance_id);
CREATE INDEX IF NOT EXISTS idx_employee_cash_advance_repayments_payroll_run_id ON employee_cash_advance_repayments (payroll_run_id);
CREATE INDEX IF NOT EXISTS idx_employee_cash_advance_repayments_payroll_run_item_id ON employee_cash_advance_repayments (payroll_run_item_id);
CREATE INDEX IF NOT EXISTS idx_employee_cash_advance_repayments_employee_id ON employee_cash_advance_repayments (employee_id);
CREATE INDEX IF NOT EXISTS idx_employee_cash_advance_repayments_status ON employee_cash_advance_repayments (status);
CREATE INDEX IF NOT EXISTS idx_employee_cash_advance_repayments_updated_at ON employee_cash_advance_repayments (updated_at);
