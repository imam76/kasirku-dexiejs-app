import { expect, test, type Page } from '@playwright/test';
import { loginAsBootstrappedOwner } from './helpers/auth';
import {
  payrollSlipFixtureIds,
  seedPayrollSlipFixture,
} from './helpers/payrollSlip';

async function exportSlipPdfFromMenu(page: Page, testId: string) {
  const downloadPromise = page.waitForEvent('download');

  await page.getByTestId(testId).click();
  await page.getByRole('menuitem', { name: 'Simpan ke File' }).click();

  return await downloadPromise;
}

test('slip gaji hanya tersedia setelah payroll paid dan dapat diexport PDF', async ({ page }) => {
  await loginAsBootstrappedOwner(page);
  await page.goto('/finance/payroll');
  await seedPayrollSlipFixture(page);

  await expect(page.getByRole('heading', { name: 'Payroll Karyawan' })).toBeVisible();
  await expect(page.getByText('PYR-E2E-PAID')).toBeVisible();
  await expect(page.getByText('PYR-E2E-DRAFT')).toBeVisible();
  await expect(page.getByText('PYR-E2E-APPROVED')).toBeVisible();
  await expect(page.getByText('PYR-E2E-VOIDED')).toBeVisible();

  await expect(page.getByTestId(/^payroll-slip-all-/)).toHaveCount(1);
  await expect(page.getByTestId(`payroll-slip-all-${payrollSlipFixtureIds.paidRun}`)).toBeVisible();
  await expect(
    page.locator('tr', { hasText: 'PYR-E2E-DRAFT' }).getByText('Slip Gabungan'),
  ).toHaveCount(0);
  await expect(
    page.locator('tr', { hasText: 'PYR-E2E-APPROVED' }).getByText('Slip Gabungan'),
  ).toHaveCount(0);
  await expect(
    page.locator('tr', { hasText: 'PYR-E2E-VOIDED' }).getByText('Slip Gabungan'),
  ).toHaveCount(0);

  await page
    .locator('tr', { hasText: 'PYR-E2E-PAID' })
    .first()
    .locator('.ant-table-row-expand-icon')
    .click();

  await expect(page.getByTestId(/^payroll-slip-item-/)).toHaveCount(2);
  await expect(
    page.getByTestId(`payroll-slip-item-${payrollSlipFixtureIds.paidRun}-${payrollSlipFixtureIds.firstEmployee}`),
  ).toBeVisible();

  const combinedDownload = await exportSlipPdfFromMenu(page, `payroll-slip-all-${payrollSlipFixtureIds.paidRun}`);
  expect(combinedDownload.suggestedFilename()).toBe('slip-gaji-pyr-e2e-paid.pdf');

  const employeeDownload = await exportSlipPdfFromMenu(
    page,
    `payroll-slip-item-${payrollSlipFixtureIds.paidRun}-${payrollSlipFixtureIds.firstEmployee}`,
  );
  expect(employeeDownload.suggestedFilename()).toBe('slip-gaji-pyr-e2e-paid-adi-payroll.pdf');
});
