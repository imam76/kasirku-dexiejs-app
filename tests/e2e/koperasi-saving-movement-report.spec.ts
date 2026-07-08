import { expect, type Page, test } from '@playwright/test';
import { loginAsBootstrappedOwner } from './helpers/auth';
import {
  savingMovementFixtureExpected,
  seedSavingMovementReportFixture,
} from './helpers/koperasiSavingMovementReport';
import { selectAntdOptionByTestId } from './helpers/ui';

async function selectJune2026(page: Page) {
  const monthInput = page.getByTestId('koperasi-saving-movement-month-filter').locator('input').first();
  await monthInput.click();
  await page
    .locator('.ant-picker-dropdown:not(.ant-picker-dropdown-hidden)')
    .last()
    .locator('.ant-picker-cell-inner')
    .filter({ hasText: /^Jun$/ })
    .click();
  await expect(monthInput).toHaveValue('June 2026');
}

const currencyText = (value: number) => `Rp ${value.toLocaleString('id-ID')}`;

test.describe('laporan tabungan masuk dan keluar koperasi', () => {
  test('menampilkan tabungan masuk valid, group harian, filter tipe, dan filter karyawan', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await seedSavingMovementReportFixture(page);
    await page.goto('/koperasi/laporan-tabungan-masuk');
    await selectJune2026(page);

    const report = page.getByTestId('koperasi-saving-movement-report');
    await expect(report).toBeVisible();
    await expect(report).toContainText('LAPORAN TABUNGAN MASUK');
    await expect(report).toContainText(currencyText(savingMovementFixtureExpected.incomingTotal));

    const june3Group = page.getByTestId('koperasi-saving-movement-group-2026-06-03');
    await expect(june3Group).toContainText(currencyText(savingMovementFixtureExpected.incomingJune3Total));
    await expect(page.getByTestId('koperasi-saving-movement-group-2026-06-04')).toContainText('Setoran wajib anggota B');
    await expect(page.getByTestId('koperasi-saving-movement-row-e2e-saving-in-pokok-a')).toBeVisible();
    await expect(page.getByTestId('koperasi-saving-movement-row-e2e-saving-in-sukarela-b-cash-a')).toBeVisible();
    await expect(page.getByTestId('koperasi-saving-movement-row-e2e-saving-in-wajib-b')).toBeVisible();
    await expect(page.getByTestId('koperasi-saving-movement-row-e2e-saving-reversed-original')).toHaveCount(0);
    await expect(report).not.toContainText('Anggota Reversal');
    await expect(report).not.toContainText('Setoran luar bulan');
    await expect(page.getByRole('button', { name: /Export/ })).toBeEnabled();

    await selectAntdOptionByTestId(page, 'koperasi-saving-movement-type-filter', 'Sukarela');
    await expect(report).toContainText(currencyText(savingMovementFixtureExpected.incomingVoluntaryTotal));
    await expect(page.getByTestId('koperasi-saving-movement-row-e2e-saving-in-sukarela-b-cash-a')).toBeVisible();
    await expect(page.getByTestId('koperasi-saving-movement-row-e2e-saving-in-pokok-a')).toHaveCount(0);
    await expect(page.getByTestId('koperasi-saving-movement-row-e2e-saving-in-wajib-b')).toHaveCount(0);

    await selectAntdOptionByTestId(page, 'koperasi-saving-movement-type-filter', 'Semua jenis simpanan');
    await selectAntdOptionByTestId(page, 'koperasi-saving-movement-employee-filter', 'Petugas Tabungan A - PDL A');
    await expect(report).toContainText(currencyText(savingMovementFixtureExpected.incomingEmployeeATotal));
    await expect(page.getByTestId('koperasi-saving-movement-row-e2e-saving-in-pokok-a')).toBeVisible();
    await expect(page.getByTestId('koperasi-saving-movement-row-e2e-saving-in-sukarela-b-cash-a')).toBeVisible();
    await expect(page.getByTestId('koperasi-saving-movement-row-e2e-saving-in-wajib-b')).toHaveCount(0);
  });

  test('menampilkan tabungan keluar valid dan mengecualikan setoran serta reversal', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await seedSavingMovementReportFixture(page);
    await page.goto('/koperasi/laporan-tabungan-keluar');
    await selectJune2026(page);

    const report = page.getByTestId('koperasi-saving-movement-report');
    await expect(report).toBeVisible();
    await expect(report).toContainText('LAPORAN TABUNGAN KELUAR');
    await expect(report).toContainText(currencyText(savingMovementFixtureExpected.outgoingTotal));

    const june5Group = page.getByTestId('koperasi-saving-movement-group-2026-06-05');
    await expect(june5Group).toContainText(currencyText(savingMovementFixtureExpected.outgoingJune5Total));
    await expect(page.getByTestId('koperasi-saving-movement-row-e2e-saving-out-a')).toBeVisible();
    await expect(page.getByTestId('koperasi-saving-movement-row-e2e-saving-out-interest-b')).toBeVisible();
    await expect(report).toContainText('Saldo simpanan');
    await expect(report).toContainText('Jasa simpanan');
    await expect(page.getByTestId('koperasi-saving-movement-row-e2e-saving-in-pokok-a')).toHaveCount(0);
    await expect(page.getByTestId('koperasi-saving-movement-row-e2e-saving-reversed-withdrawal')).toHaveCount(0);
    await expect(report).not.toContainText('Anggota Reversal');
    await expect(page.getByRole('button', { name: /Export/ })).toBeEnabled();
  });
});
