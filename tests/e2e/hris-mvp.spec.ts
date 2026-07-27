import { expect, test } from '@playwright/test';
import { loginAsBootstrappedOwner } from './helpers/auth';

test('HRIS MVP persists its core lifecycle and exposes all six HR pages', async ({ page }) => {
  await loginAsBootstrappedOwner(page);

  const result = await page.evaluate(async () => {
    const [{ db }, hr] = await Promise.all([
      import('/src/lib/db.ts'),
      import('/src/services/hrService.ts'),
    ]);

    const department = await hr.createHrDepartment({
      code: 'E2E-HR',
      name: 'Human Resources E2E',
      description: 'Departemen pengujian HRIS MVP',
      is_active: true,
    });
    const position = await hr.createHrPosition({
      code: 'E2E-HRM',
      name: 'HR Manager E2E',
      department_id: department.id,
      level: 'Manager',
      is_active: true,
    });
    const employeeInput = {
      name: 'Karyawan HRIS E2E',
      preferred_name: 'HRIS E2E',
      personal_email: 'hris.e2e@example.test',
      nik: '0012345678901234',
      company_unit: 'Unit E2E',
      department_id: department.id,
      job_position_id: position.id,
      join_date: '2026-07-01',
      employment_status: 'CONTRACT' as const,
      active_status: 'ACTIVE' as const,
      work_schedule_type: 'FULL_TIME' as const,
      salary_payment_method: 'CASH' as const,
      base_salary: 5_000_000,
      salary_currency: 'IDR',
      payroll_period: 'MONTHLY' as const,
      is_taxable: true,
      ptkp_status: 'TK/0',
      is_bpjs_participant: true,
    };
    const employee = await hr.createHrEmployee(employeeInput);
    await hr.updateHrEmployee(employee.id, {
      ...employeeInput,
      employment_status: 'PERMANENT',
    });
    await hr.setHrEmployeeActiveStatus(employee.id, 'INACTIVE');
    const activeEmployee = await hr.setHrEmployeeActiveStatus(employee.id, 'ACTIVE');

    const draft = await hr.createEmploymentContract({
      contract_number: 'E2E/HR/001',
      employee_id: employee.id,
      contract_type: 'FIXED_TERM',
      start_date: '2026-07-01',
      end_date: '2027-06-30',
      job_position_id: position.id,
      department_id: department.id,
      base_salary: 5_000_000,
      status: 'DRAFT',
      notes: 'Draft awal',
    });
    const updatedDraft = await hr.updateDraftEmploymentContract(draft.id, {
      contract_number: draft.contract_number,
      employee_id: employee.id,
      contract_type: 'FIXED_TERM',
      start_date: '2026-07-01',
      end_date: '2027-06-30',
      job_position_id: position.id,
      department_id: department.id,
      base_salary: 5_000_000,
      status: 'ACTIVE',
      notes: 'Draft diperiksa',
    });
    await hr.setEmploymentContractStatus(draft.id, 'ACTIVE');
    const renewal = await hr.renewEmploymentContract(draft.id, {
      contract_number: 'E2E/HR/001-R1',
      employee_id: employee.id,
      contract_type: 'FIXED_TERM',
      start_date: '2027-07-01',
      end_date: '2028-06-30',
      job_position_id: position.id,
      department_id: department.id,
      base_salary: 5_500_000,
      status: 'DRAFT',
      notes: 'Perpanjangan pertama',
    });
    const terminatedRenewal = await hr.setEmploymentContractStatus(renewal.id, 'TERMINATED');

    const salaryComponent = await hr.createSalaryComponent({
      code: 'E2E-TUNJ',
      name: 'Tunjangan E2E',
      kind: 'EARNING',
      calculation: 'FIXED',
      default_value: 250_000,
      is_taxable: true,
      is_active: true,
    });
    const assignment = await hr.upsertEmployeeSalaryComponent(employee.id, {
      salary_component_id: salaryComponent.id,
      value: 300_000,
      is_active: true,
    });
    const inactiveComponent = await hr.updateSalaryComponent(salaryComponent.id, {
      code: salaryComponent.code,
      name: salaryComponent.name,
      kind: salaryComponent.kind,
      calculation: salaryComponent.calculation,
      default_value: salaryComponent.default_value,
      is_taxable: salaryComponent.is_taxable,
      is_active: false,
    });

    const sourceAfterRenewal = await db.employmentContracts.get(draft.id);
    const auditLogs = await db.activityLogs
      .filter((log) => [
        employee.id,
        draft.id,
        renewal.id,
        salaryComponent.id,
        assignment.id,
      ].includes(log.entity_id ?? ''))
      .toArray();

    return {
      employeeNumber: activeEmployee.employee_number,
      nik: activeEmployee.nik,
      activeStatus: activeEmployee.active_status,
      employmentStatus: activeEmployee.employment_status,
      updatedDraftStatus: updatedDraft.status,
      sourceStatus: sourceAfterRenewal?.status,
      renewalStatus: terminatedRenewal.status,
      renewalSourceId: renewal.renewed_from_contract_id,
      componentActive: inactiveComponent.is_active,
      assignmentValue: assignment.value,
      structuredAuditCount: auditLogs.filter((log) => (log.changes?.length ?? 0) > 0).length,
    };
  });

  expect(result).toMatchObject({
    employeeNumber: 'EMP-00001',
    nik: '0012345678901234',
    activeStatus: 'ACTIVE',
    employmentStatus: 'PERMANENT',
    updatedDraftStatus: 'DRAFT',
    sourceStatus: 'RENEWED',
    renewalStatus: 'TERMINATED',
    renewalSourceId: expect.any(String),
    componentActive: false,
    assignmentValue: 300_000,
  });
  expect(result.structuredAuditCount).toBeGreaterThanOrEqual(5);

  await page.goto('/hr');
  const payrollMenu = page.locator('a[href="/finance/payroll"]');
  await expect(payrollMenu).toBeVisible();
  await expect(payrollMenu).toContainText('Payroll');

  const pages = [
    ['/hr/dashboard', 'Dashboard HR'],
    ['/hr/employees', 'Karyawan'],
    ['/hr/departments', 'Departemen'],
    ['/hr/positions', 'Jabatan'],
    ['/hr/contracts', 'Kontrak Kerja'],
    ['/hr/salary-components', 'Komponen Gaji'],
  ] as const;

  for (const [path, heading] of pages) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await expect(page.getByText(/gagal dimuat/i)).toHaveCount(0);
  }
});

test('employee salary assignment supports fixed and percentage methods with contextual input', async ({ page }) => {
  await loginAsBootstrappedOwner(page);

  const fixture = await page.evaluate(async () => {
    const hr = await import('/src/services/hrService.ts');
    const employee = await hr.createHrEmployee({
      name: 'Metode Komponen E2E',
      employment_status: 'PERMANENT',
      active_status: 'ACTIVE',
      work_schedule_type: 'FULL_TIME',
      salary_payment_method: 'CASH',
      base_salary: 5_000_000,
      salary_currency: 'IDR',
      payroll_period: 'MONTHLY',
      is_taxable: true,
      is_bpjs_participant: false,
    });
    const component = await hr.createSalaryComponent({
      code: 'E2E-METODE',
      name: 'Komponen Metode E2E',
      kind: 'EARNING',
      calculation: 'FIXED',
      default_value: 250_000,
      is_taxable: false,
      is_active: true,
    });
    await hr.upsertEmployeeSalaryComponent(employee.id, {
      salary_component_id: component.id,
      calculation: 'FIXED',
      value: 250_000,
      is_active: true,
    });
    return { employeeId: employee.id, employeeName: employee.name };
  });

  await page.goto('/hr/employees');
  const employeeRow = page.locator('tbody tr', { hasText: fixture.employeeName });
  await employeeRow.getByRole('button', { name: 'Edit' }).click();

  const dialog = page.getByRole('dialog', { name: /Edit EMP-/ });
  await dialog.getByRole('tab', { name: 'Penggajian' }).click();
  await expect(dialog.locator('#base_salary')).toHaveValue('5.000.000');
  await expect(dialog.getByText('Rupiah Indonesia (Rp)', { exact: true })).toBeVisible();
  await expect(dialog.getByText('Pendapatan (+)')).toBeVisible();
  await expect(dialog.getByText('Nominal tetap dalam Rp')).toBeVisible();
  await expect(dialog.locator('#salary_components_0_value')).toHaveValue('250.000');

  await dialog.locator('#salary_components_0_calculation').click();
  await page.locator('.ant-select-dropdown:visible').getByText('Persentase', { exact: true }).click();
  await expect(dialog.getByText('Dihitung dari gaji pokok')).toBeVisible();
  await dialog.locator('#salary_components_0_value').fill('2');
  await dialog.getByRole('button', { name: 'Simpan' }).click();
  await expect(page.locator('.ant-message-notice').last()).toContainText('berhasil');
  await expect(dialog).toBeHidden();

  const assignment = await page.evaluate(async ({ employeeId }) => {
    const { db } = await import('/src/lib/db.ts');
    return db.employeeSalaryComponents.where('employee_id').equals(employeeId).first();
  }, { employeeId: fixture.employeeId });

  expect(assignment).toMatchObject({
    calculation: 'PERCENTAGE',
    value: 2,
  });
});
