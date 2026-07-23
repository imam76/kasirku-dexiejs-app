import { expect, test } from '@playwright/test';
import { loginAsBootstrappedOwner } from './helpers/auth';
import {
  cashReportFixtureIds,
  seedCashReportFixture,
} from './helpers/koperasiCashReport';

test('laporan tunai harian per karyawan dan export', async ({ page }) => {
  await loginAsBootstrappedOwner(page);
  await page.goto('/koperasi/laporan/tunai');
  await seedCashReportFixture(page);

  const report = page.getByTestId('koperasi-cash-report');
  await expect(report).toBeVisible();
  await expect(report).toContainText('LAPORAN TUNAI');
  await expect(page.getByRole('textbox', { name: 'Select date' })).not.toHaveValue('');

  const employeeReport = page.getByTestId(
    `koperasi-cash-report-employee-${cashReportFixtureIds.employee}`,
  );
  await expect(employeeReport).toContainText('Petugas Tunai (KAS-PDL-01)');

  const rows = employeeReport.locator('tbody tr');
  await expect(rows.nth(0).locator('td').nth(0)).toHaveText('STORTING');
  await expect(rows.nth(0).locator('td').nth(1)).toContainText('Rp 500.000');
  await expect(rows.nth(0).locator('td').nth(2)).toContainText('Rp 0');
  await expect(rows.nth(1).locator('td').nth(0)).toHaveText('DROP');
  await expect(rows.nth(1).locator('td').nth(1)).toContainText('Rp 1.000.000');
  await expect(rows.nth(1).locator('td').nth(2)).toContainText('Rp 800.000');
  await expect(rows.nth(2).locator('td').nth(0)).toHaveText('TABUNGAN');
  await expect(rows.nth(2).locator('td').nth(1)).toContainText('Rp 100.000');
  await expect(rows.nth(2).locator('td').nth(2)).toContainText('Rp 50.000');
  await expect(rows.nth(3).locator('td').nth(0)).toHaveText('IPTW');
  await expect(rows.nth(3).locator('td').nth(1)).toContainText('Rp 0');
  await expect(rows.nth(3).locator('td').nth(2)).toContainText('Rp 0');
  await expect(rows.nth(4).locator('td').nth(0)).toHaveText('JUMLAH');
  await expect(rows.nth(4).locator('td').nth(1)).toContainText('Rp 1.600.000');
  await expect(rows.nth(4).locator('td').nth(2)).toContainText('Rp 850.000');
  await expect(employeeReport).toContainText('TOTAL SALDO');
  await expect(employeeReport).toContainText('Rp 750.000');

  const secondEmployeeReport = page.getByTestId(
    `koperasi-cash-report-employee-${cashReportFixtureIds.secondEmployee}`,
  );
  await expect(secondEmployeeReport).toBeVisible();

  await page.getByTestId('koperasi-cash-report-employee-filter').click();
  await page
    .locator('.ant-select-dropdown:not(.ant-select-dropdown-hidden)')
    .last()
    .locator('.ant-select-item-option')
    .filter({ hasText: 'Petugas Tunai (KAS-PDL-01)' })
    .click();

  await expect(employeeReport).toBeVisible();
  await expect(secondEmployeeReport).toHaveCount(0);

  await page.getByRole('button', { name: /Export/ }).click();
  await expect(page.getByText('PDF', { exact: true })).toBeVisible();
  await expect(page.getByText('HTML', { exact: true })).toBeVisible();
  await expect(page.getByText('CSV', { exact: true })).toBeVisible();
});
