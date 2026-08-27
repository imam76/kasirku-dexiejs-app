import { expect, test } from '@playwright/test';
import { loginAsBootstrappedOwner } from './helpers/auth';

test('filter jadwal Pembayaran Angsuran menampilkan tiga cakupan tagihan belum lunas', async ({ page }) => {
  await loginAsBootstrappedOwner(page);
  await page.goto('/koperasi/angsuran');

  await expect(page.getByText('Pembayaran Angsuran', { exact: true })).toBeVisible();

  const scheduleFilter = page.getByTestId('koperasi-installment-schedule-filter');
  await expect(scheduleFilter).toBeVisible();
  await expect(scheduleFilter.getByText('Hari Ini', { exact: true })).toBeVisible();
  await expect(scheduleFilter.getByText('Minggu Ini', { exact: true })).toBeVisible();
  await expect(scheduleFilter.getByText('Semua Belum Lunas', { exact: true })).toBeVisible();
  await expect(scheduleFilter.locator('.ant-segmented-item-selected'))
    .toContainText('Semua Belum Lunas');

  await scheduleFilter.getByText('Hari Ini', { exact: true }).click();
  await expect(scheduleFilter.locator('.ant-segmented-item-selected')).toContainText('Hari Ini');

  await scheduleFilter.getByText('Minggu Ini', { exact: true }).click();
  await expect(scheduleFilter.locator('.ant-segmented-item-selected')).toContainText('Minggu Ini');

  await page.getByRole('tab', { name: 'Riwayat Pembayaran', exact: true }).click();
  await expect(scheduleFilter).toHaveCount(0);
});
