import { expect, test } from '@playwright/test';
import { loginAsBootstrappedOwner } from './helpers/auth';
import { migrateLoan } from './helpers/koperasi';
import { migrationFixtureMember, seedMigrationFixture } from './helpers/koperasiMigration';

test.describe.serial('migrasi pinjaman koperasi', () => {
  test('LOAN-MIG-01 - migrasi mencatat sisa pokok & menandai angsuran lunas historis tanpa jurnal', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await seedMigrationFixture(page);

    // Pokok 1.200.000, tenor 12, bunga 1%/bln (flat): pokok/angsuran = 100.000, bunga/angsuran = 12.000.
    // Lunas s/d angsuran ke-4 -> sisa pokok 8 x 100.000 = 800.000.
    await migrateLoan(page, migrationFixtureMember, {
      principal: '1200000',
      ratePercent: '1',
      tenor: '12',
      settledThrough: '4',
      akadWeekday: migrationFixtureMember.officerWeekday,
      expectedOutstanding: 'Rp 800.000',
    });

    // Angsuran 1-4 ditandai lunas historis -> tersembunyi dari daftar penagihan;
    // angsuran ke-5 masih terbuka dengan total 112.000 (pokok 100.000 + bunga 12.000).
    await page.goto('/koperasi/angsuran');
    await expect(page.getByText('Pembayaran Angsuran', { exact: true })).toBeVisible();
    await expect(page.getByTestId(`koperasi-installment-row-${migrationFixtureMember.memberNumber}-1`)).toBeHidden();
    await expect(page.getByTestId(`koperasi-installment-row-${migrationFixtureMember.memberNumber}-4`)).toBeHidden();

    const fifthInstallment = page.getByTestId(`koperasi-installment-row-${migrationFixtureMember.memberNumber}-5`);
    await expect(fifthInstallment).toBeVisible();
    await expect(fifthInstallment).toContainText('Rp 112.000');

    // Jembatan saldo awal: total sisa pokok migrasi (800.000) disurfacing sebagai panduan
    // untuk baris Piutang Pinjaman (1120) di form opening balance.
    await page.goto('/finance/general-ledger');
    await expect(page.getByText('Setup Cutoff dan Opening Balance')).toBeVisible();
    const fillButton = page.getByTestId('gl-opening-balance-fill-migration');
    await expect(fillButton).toBeVisible();
    await expect(page.getByText(/Rp\s*800\.000/)).toBeVisible();
  });
});
