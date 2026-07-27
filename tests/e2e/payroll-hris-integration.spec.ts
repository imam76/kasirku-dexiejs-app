import { expect, test } from '@playwright/test';
import { loginAsBootstrappedOwner } from './helpers/auth';

test('payroll loads HR profile and assigned salary components into a draft snapshot', async ({ page }) => {
  await loginAsBootstrappedOwner(page);

  const employeeName = 'Payroll HRIS E2E';
  await page.evaluate(async ({ employeeName }) => {
    const hr = await import('/src/services/hrService.ts');

    const employee = await hr.createHrEmployee({
      name: employeeName,
      employment_status: 'PERMANENT',
      active_status: 'ACTIVE',
      work_schedule_type: 'FULL_TIME',
      salary_payment_method: 'BANK_TRANSFER',
      bank_name: 'BCA',
      bank_account_number: '0012345678',
      bank_account_holder: employeeName,
      base_salary: 4_000_000,
      salary_currency: 'IDR',
      payroll_period: 'MONTHLY',
      is_taxable: true,
      is_bpjs_participant: false,
    });
    const allowance = await hr.createSalaryComponent({
      code: 'E2E-TUNJ-PAYROLL',
      name: 'Tunjangan Payroll E2E',
      kind: 'EARNING',
      calculation: 'FIXED',
      default_value: 0,
      is_taxable: false,
      is_active: true,
    });
    const deduction = await hr.createSalaryComponent({
      code: 'E2E-POT-PAYROLL',
      name: 'Potongan Payroll E2E',
      kind: 'DEDUCTION',
      calculation: 'PERCENTAGE',
      default_value: 0,
      is_taxable: false,
      is_active: true,
    });
    await Promise.all([
      hr.upsertEmployeeSalaryComponent(employee.id, {
        salary_component_id: allowance.id,
        value: 200_000,
        is_active: true,
      }),
      hr.upsertEmployeeSalaryComponent(employee.id, {
        salary_component_id: deduction.id,
        value: 2,
        is_active: true,
      }),
    ]);
  }, { employeeName });

  await page.goto('/finance/payroll');
  await page.getByRole('button', { name: 'Buat Payroll' }).click();

  const workspace = page.getByTestId('payroll-workspace');
  await expect(workspace).toBeVisible();
  await workspace.getByRole('button', { name: 'Lanjut' }).click();

  const employeeRow = workspace.locator('tbody tr', { hasText: employeeName });
  await expect(employeeRow).toBeVisible();
  await expect(employeeRow).toContainText('Rp 4.000.000');
  await expect(employeeRow).toContainText('Siap');

  await workspace.getByRole('button', { name: 'Lanjut' }).click();
  const reviewRow = workspace.locator('tbody tr', { hasText: employeeName });
  await reviewRow.getByRole('button', { name: `Detail ${employeeName}` }).click();

  const drawer = page.getByRole('dialog', { name: `Detail Payroll — ${employeeName}` });
  await expect(drawer).toContainText('Tunjangan Payroll E2E: Rp 200.000');
  await expect(drawer).toContainText('Potongan Payroll E2E: 2% = Rp 80.000');

  const amounts = drawer.getByRole('spinbutton');
  await expect(amounts).toHaveCount(4);
  await expect(amounts.nth(0)).toHaveValue('Rp 4.000.000');
  await expect(amounts.nth(1)).toHaveValue('Rp 200.000');
  await expect(amounts.nth(2)).toHaveValue('Rp 0');
  await expect(amounts.nth(3)).toHaveValue('Rp 80.000');

  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await workspace.getByRole('button', { name: 'Simpan Draft' }).click();
  await expect(workspace).toBeHidden();

  const snapshot = await page.evaluate(async ({ employeeName }) => {
    const [{ db }, payroll] = await Promise.all([
      import('/src/lib/db.ts'),
      import('/src/services/payrollService.ts'),
    ]);
    const employee = await db.employees.where('name').equals(employeeName).first();
    const runs = await db.payrollRuns.orderBy('created_at').reverse().toArray();
    const run = runs[0];
    const item = employee && run
      ? await db.payrollRunItems
        .where('payroll_run_id')
        .equals(run.id)
        .filter((candidate) => candidate.employee_id === employee.id)
        .first()
      : undefined;
    let overlapError = '';
    if (run && item) {
      try {
        await payroll.createPayrollRun({
          period_start: run.period_start,
          period_end: run.period_end,
          payroll_period: run.payroll_period,
          salary_currency: run.salary_currency,
          items: [{
            employee_id: item.employee_id,
            base_salary: item.base_salary,
            allowance_amount: item.allowance_amount,
            bonus_amount: item.bonus_amount,
            other_deduction_amount: item.other_deduction_amount,
          }],
        });
      } catch (error) {
        overlapError = error instanceof Error ? error.message : String(error);
      }
    }
    return { run, item, overlapError };
  }, { employeeName });

  expect(snapshot.run).toMatchObject({
    payroll_period: 'MONTHLY',
    salary_currency: 'IDR',
    status: 'DRAFT',
  });
  expect(snapshot.item).toMatchObject({
    employee_name: employeeName,
    payroll_period: 'MONTHLY',
    salary_currency: 'IDR',
    salary_payment_method: 'BANK_TRANSFER',
    base_salary: 4_000_000,
    allowance_amount: 200_000,
    other_deduction_amount: 80_000,
    gross_amount: 4_200_000,
    net_amount: 4_120_000,
  });
  expect(snapshot.overlapError).toContain('periode beririsan');
});
