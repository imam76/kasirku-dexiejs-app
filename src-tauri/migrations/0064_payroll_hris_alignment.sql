ALTER TABLE payroll_runs
    ADD COLUMN IF NOT EXISTS payroll_period TEXT NOT NULL DEFAULT 'MONTHLY',
    ADD COLUMN IF NOT EXISTS salary_currency TEXT NOT NULL DEFAULT 'IDR';

ALTER TABLE payroll_run_items
    ADD COLUMN IF NOT EXISTS employee_number TEXT,
    ADD COLUMN IF NOT EXISTS employee_department TEXT,
    ADD COLUMN IF NOT EXISTS payroll_period TEXT NOT NULL DEFAULT 'MONTHLY',
    ADD COLUMN IF NOT EXISTS salary_currency TEXT NOT NULL DEFAULT 'IDR',
    ADD COLUMN IF NOT EXISTS salary_payment_method TEXT;

UPDATE payroll_run_items item
SET employee_number = COALESCE(item.employee_number, employee.employee_number),
    employee_position = COALESCE(item.employee_position, employee.job_position_name, employee.position),
    employee_department = COALESCE(item.employee_department, employee.department_name),
    payroll_period = COALESCE(employee.payroll_period, item.payroll_period, 'MONTHLY'),
    salary_currency = COALESCE(employee.salary_currency, item.salary_currency, 'IDR'),
    salary_payment_method = COALESCE(item.salary_payment_method, employee.salary_payment_method, 'CASH')
FROM employees employee
WHERE employee.id = item.employee_id;

UPDATE payroll_runs run
SET payroll_period = COALESCE(snapshot.payroll_period, run.payroll_period, 'MONTHLY'),
    salary_currency = COALESCE(snapshot.salary_currency, run.salary_currency, 'IDR')
FROM (
    SELECT DISTINCT ON (payroll_run_id)
        payroll_run_id,
        payroll_period,
        salary_currency
    FROM payroll_run_items
    ORDER BY payroll_run_id, id
) snapshot
WHERE snapshot.payroll_run_id = run.id;

CREATE INDEX IF NOT EXISTS idx_payroll_runs_payroll_period ON payroll_runs (payroll_period);
CREATE INDEX IF NOT EXISTS idx_payroll_runs_salary_currency ON payroll_runs (salary_currency);
CREATE INDEX IF NOT EXISTS idx_payroll_run_items_employee_number ON payroll_run_items (employee_number);
