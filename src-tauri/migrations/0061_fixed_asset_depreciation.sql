CREATE TABLE IF NOT EXISTS fixed_assets (
    id TEXT PRIMARY KEY,
    asset_code TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL,
    location TEXT,
    description TEXT,
    registration_type TEXT NOT NULL,
    acquisition_date DATE NOT NULL,
    available_for_use_date DATE NOT NULL,
    acquisition_cost NUMERIC(19, 2) NOT NULL,
    residual_value NUMERIC(19, 2) NOT NULL,
    useful_life_months INTEGER NOT NULL,
    depreciation_method TEXT NOT NULL DEFAULT 'STRAIGHT_LINE',
    depreciation_start_date DATE NOT NULL,
    regular_depreciation_amount NUMERIC(19, 2) NOT NULL,
    opening_balance_date DATE,
    opening_accumulated_depreciation NUMERIC(19, 2) NOT NULL DEFAULT 0,
    opening_remaining_useful_life_months INTEGER,
    asset_account_id TEXT NOT NULL,
    asset_account_code TEXT NOT NULL,
    asset_account_name TEXT NOT NULL,
    accumulated_depreciation_account_id TEXT NOT NULL,
    accumulated_depreciation_account_code TEXT NOT NULL,
    accumulated_depreciation_account_name TEXT NOT NULL,
    depreciation_expense_account_id TEXT NOT NULL,
    depreciation_expense_account_code TEXT NOT NULL,
    depreciation_expense_account_name TEXT NOT NULL,
    department_id TEXT,
    department_code TEXT,
    department_name TEXT,
    project_id TEXT,
    project_code TEXT,
    project_name TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    version INTEGER NOT NULL DEFAULT 1,
    created_by TEXT,
    created_by_name TEXT,
    updated_by TEXT,
    updated_by_name TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT fixed_assets_category_check CHECK (category IN ('BUILDING', 'VEHICLE', 'MACHINERY_EQUIPMENT', 'OFFICE_EQUIPMENT', 'FURNITURE', 'OTHER')),
    CONSTRAINT fixed_assets_registration_check CHECK (registration_type IN ('NEW', 'EXISTING')),
    CONSTRAINT fixed_assets_method_check CHECK (depreciation_method = 'STRAIGHT_LINE'),
    CONSTRAINT fixed_assets_value_check CHECK (acquisition_cost > 0 AND residual_value >= 0 AND residual_value < acquisition_cost),
    CONSTRAINT fixed_assets_life_check CHECK (useful_life_months > 0),
    CONSTRAINT fixed_assets_date_check CHECK (acquisition_date <= available_for_use_date),
    CONSTRAINT fixed_assets_opening_check CHECK (
      (
        registration_type = 'NEW'
        AND opening_balance_date IS NULL
        AND opening_accumulated_depreciation = 0
        AND opening_remaining_useful_life_months IS NULL
      )
      OR
      (
        registration_type = 'EXISTING'
        AND opening_balance_date IS NOT NULL
        AND opening_balance_date = (DATE_TRUNC('month', opening_balance_date) + INTERVAL '1 month - 1 day')::DATE
        AND opening_accumulated_depreciation BETWEEN 0 AND acquisition_cost - residual_value
        AND (
          (opening_accumulated_depreciation = acquisition_cost - residual_value AND opening_remaining_useful_life_months = 0)
          OR
          (opening_accumulated_depreciation < acquisition_cost - residual_value AND opening_remaining_useful_life_months BETWEEN 1 AND useful_life_months)
        )
      )
    )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fixed_assets_code_active_unique
ON fixed_assets (UPPER(asset_code)) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_fixed_assets_status_date ON fixed_assets (is_active, available_for_use_date);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_category ON fixed_assets (category);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_accounts ON fixed_assets (asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_dimensions ON fixed_assets (department_id, project_id);
CREATE INDEX IF NOT EXISTS idx_fixed_assets_updated ON fixed_assets (updated_at, deleted_at);

CREATE TABLE IF NOT EXISTS fixed_asset_depreciation_runs (
    id TEXT PRIMARY KEY,
    run_number TEXT NOT NULL UNIQUE,
    period_id TEXT NOT NULL,
    period_name TEXT NOT NULL,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    posting_date DATE NOT NULL,
    status TEXT NOT NULL,
    asset_count INTEGER NOT NULL,
    total_depreciation NUMERIC(19, 2) NOT NULL,
    journal_entry_id TEXT,
    reversal_journal_entry_id TEXT,
    reversal_reason TEXT,
    notes TEXT,
    version INTEGER NOT NULL DEFAULT 1,
    created_by TEXT,
    created_by_name TEXT,
    posted_by TEXT,
    posted_by_name TEXT,
    posted_at TIMESTAMPTZ,
    reversed_by TEXT,
    reversed_by_name TEXT,
    reversed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    deleted_at TIMESTAMPTZ,
    CONSTRAINT fixed_asset_runs_status_check CHECK (status IN ('DRAFT', 'POSTED', 'REVERSED')),
    CONSTRAINT fixed_asset_runs_amount_check CHECK (asset_count >= 0 AND total_depreciation >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fixed_asset_runs_active_period_unique
ON fixed_asset_depreciation_runs (period_id)
WHERE deleted_at IS NULL AND status IN ('DRAFT', 'POSTED');
CREATE INDEX IF NOT EXISTS idx_fixed_asset_runs_status_period ON fixed_asset_depreciation_runs (status, period_end DESC);
CREATE INDEX IF NOT EXISTS idx_fixed_asset_runs_posting_date ON fixed_asset_depreciation_runs (posting_date);
CREATE INDEX IF NOT EXISTS idx_fixed_asset_runs_journal ON fixed_asset_depreciation_runs (journal_entry_id);
CREATE INDEX IF NOT EXISTS idx_fixed_asset_runs_updated ON fixed_asset_depreciation_runs (updated_at, deleted_at);

CREATE TABLE IF NOT EXISTS fixed_asset_depreciation_run_lines (
    id TEXT PRIMARY KEY,
    run_id TEXT NOT NULL REFERENCES fixed_asset_depreciation_runs (id) ON DELETE CASCADE,
    asset_id TEXT NOT NULL,
    asset_code TEXT NOT NULL,
    asset_name TEXT NOT NULL,
    asset_category TEXT NOT NULL,
    acquisition_cost NUMERIC(19, 2) NOT NULL,
    residual_value NUMERIC(19, 2) NOT NULL,
    regular_depreciation_amount NUMERIC(19, 2) NOT NULL,
    opening_accumulated_depreciation NUMERIC(19, 2) NOT NULL,
    opening_book_value NUMERIC(19, 2) NOT NULL,
    depreciation_amount NUMERIC(19, 2) NOT NULL,
    closing_accumulated_depreciation NUMERIC(19, 2) NOT NULL,
    closing_book_value NUMERIC(19, 2) NOT NULL,
    asset_account_id TEXT NOT NULL,
    asset_account_code TEXT NOT NULL,
    asset_account_name TEXT NOT NULL,
    accumulated_depreciation_account_id TEXT NOT NULL,
    accumulated_depreciation_account_code TEXT NOT NULL,
    accumulated_depreciation_account_name TEXT NOT NULL,
    depreciation_expense_account_id TEXT NOT NULL,
    depreciation_expense_account_code TEXT NOT NULL,
    depreciation_expense_account_name TEXT NOT NULL,
    department_id TEXT,
    department_code TEXT,
    department_name TEXT,
    project_id TEXT,
    project_code TEXT,
    project_name TEXT,
    created_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT fixed_asset_run_lines_asset_unique UNIQUE (run_id, asset_id),
    CONSTRAINT fixed_asset_run_lines_amount_check CHECK (depreciation_amount > 0 AND closing_book_value >= residual_value)
);

CREATE INDEX IF NOT EXISTS idx_fixed_asset_run_lines_run ON fixed_asset_depreciation_run_lines (run_id);
CREATE INDEX IF NOT EXISTS idx_fixed_asset_run_lines_asset ON fixed_asset_depreciation_run_lines (asset_id);
CREATE INDEX IF NOT EXISTS idx_fixed_asset_run_lines_accounts ON fixed_asset_depreciation_run_lines (depreciation_expense_account_id, accumulated_depreciation_account_id);
CREATE INDEX IF NOT EXISTS idx_fixed_asset_run_lines_dimensions ON fixed_asset_depreciation_run_lines (department_id, project_id);

UPDATE chart_of_accounts
SET normal_balance = 'CREDIT', updated_at = NOW()
WHERE is_system = TRUE
  AND normal_balance = 'DEBIT'
  AND (
    id IN ('accumulated-depreciation', 'template-accumulated-depreciation')
    OR name ~* '(akumulasi penyusutan|accumulated depreciation)'
  );

DO $$
DECLARE
    realtime_table_name TEXT;
BEGIN
    IF TO_REGPROC('kasirku_notify_data_change') IS NOT NULL THEN
        FOREACH realtime_table_name IN ARRAY ARRAY[
            'fixed_assets',
            'fixed_asset_depreciation_runs',
            'fixed_asset_depreciation_run_lines'
        ] LOOP
            EXECUTE FORMAT('DROP TRIGGER IF EXISTS kasirku_notify_data_change ON public.%I', realtime_table_name);
            EXECUTE FORMAT(
                'CREATE TRIGGER kasirku_notify_data_change AFTER INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION kasirku_notify_data_change()',
                realtime_table_name
            );
        END LOOP;
    END IF;
END $$;
