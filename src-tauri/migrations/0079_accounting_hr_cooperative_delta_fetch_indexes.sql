-- Cursor pagination indexes for the delta-fetch rollout of cash_bank_reconciliations,
-- accounting_periods, closing_runs, accounting_fiscal_years, fiscal_year_closing_runs,
-- cooperative_areas, hr_positions, employment_contracts, salary_components and
-- employee_salary_components (all now paginate on updated_at). Index only, no
-- schema/data change.

CREATE INDEX IF NOT EXISTS idx_cash_bank_reconciliations_updated_at_id
    ON cash_bank_reconciliations (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_accounting_periods_updated_at_id
    ON accounting_periods (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_closing_runs_updated_at_id
    ON closing_runs (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_accounting_fiscal_years_updated_at_id
    ON accounting_fiscal_years (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_fiscal_year_closing_runs_updated_at_id
    ON fiscal_year_closing_runs (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_cooperative_areas_updated_at_id
    ON cooperative_areas (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_hr_positions_updated_at_id
    ON hr_positions (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_employment_contracts_updated_at_id
    ON employment_contracts (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_salary_components_updated_at_id
    ON salary_components (updated_at, id);
CREATE INDEX IF NOT EXISTS idx_employee_salary_components_updated_at_id
    ON employee_salary_components (updated_at, id);
