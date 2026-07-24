import { expect, test } from '@playwright/test';
import { loginAsBootstrappedOwner } from './helpers/auth';
import { seedIptwReportFixture } from './helpers/koperasiIptwReport';

test('laporan IPTW bulanan per karyawan dan anggota', async ({ page }) => {
  await loginAsBootstrappedOwner(page);
  await page.goto('/koperasi/laporan');
  await expect(page.getByTestId('cooperative-report-link-iptw')).toHaveAttribute(
    'href',
    '/koperasi/laporan/iptw',
  );

  await page.goto('/koperasi/laporan/iptw');
  await seedIptwReportFixture(page);

  const report = page.getByTestId('koperasi-iptw-report');
  await expect(report).toBeVisible();
  await expect(report).toContainText('LAPORAN IPTW');
  await expect(report).toContainText('Karyawan IPTW A - PDL');
  await expect(report).toContainText('Karyawan IPTW B - Kolektor');

  const row = report.locator('tbody tr').first();
  const cells = row.locator('td');
  await expect(cells.nth(0)).toHaveText('AGT-IPTW-001');
  await expect(cells.nth(2)).toHaveText('Anggota Penerima IPTW');
  await expect(cells.nth(3)).toHaveText('Jl. Laporan Koperasi No. 1');
  await expect(cells.nth(4)).toContainText('Rp 40.000');
  await expect(cells.nth(5)).toContainText('Rp 30.000');
  await expect(cells.nth(6)).toContainText('Rp 70.000');

  const total = page.getByTestId('koperasi-iptw-total');
  await expect(total).toContainText('Rp 40.000');
  await expect(total).toContainText('Rp 30.000');
  await expect(total).toContainText('Rp 70.000');
  await expect(page.getByRole('textbox', { name: 'Select month' })).not.toHaveValue('');
});
