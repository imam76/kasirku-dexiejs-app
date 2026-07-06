import { expect, test } from '@playwright/test';
import { loginAsBootstrappedOwner } from './helpers/auth';
import {
  expectMigrationRejectedForInvalidSettledInstallment,
  migrateLoan,
} from './helpers/koperasi';
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
      disbursementWeekday: migrationFixtureMember.officerWeekday,
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

  test('LOAN-MIG-02 - rekonsiliasi migrasi: payment & finance tidak false warning, 1120 tetap warning', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await seedMigrationFixture(page);

    await migrateLoan(page, migrationFixtureMember, {
      principal: '1200000',
      ratePercent: '1',
      tenor: '12',
      settledThrough: '4',
      disbursementWeekday: migrationFixtureMember.officerWeekday,
      expectedOutstanding: 'Rp 800.000',
    });

    await page.goto('/koperasi/laporan');
    await expect(page.getByRole('heading', { name: 'Laporan Koperasi' })).toBeVisible();

    // paid_* historis migrasi tidak lagi dihitung sebagai mismatch payment-vs-installment.
    const paymentRow = page.getByTestId('koperasi-reconciliation-row-PAYMENT_INSTALLMENT');
    await expect(paymentRow).toBeVisible();
    await expect(paymentRow.getByText('OK', { exact: true })).toBeVisible();

    // Pencairan migrasi tanpa financeTransaction tidak lagi menjadi mismatch.
    const financeRow = page.getByTestId('koperasi-reconciliation-row-FINANCE_TRANSACTION');
    await expect(financeRow).toBeVisible();
    await expect(financeRow.getByText('OK', { exact: true })).toBeVisible();

    // Opening balance 1120 belum diisi -> warning valid (masalah setup GL), sisa pokok 800.000.
    const receivableRow = page.getByTestId('koperasi-reconciliation-row-LOAN_MIGRATION_OPENING');
    await expect(receivableRow).toBeVisible();
    await expect(receivableRow.getByText('Warning', { exact: true })).toBeVisible();
    await expect(receivableRow).toContainText('Rp 800.000');
  });

  test('LOAN-MIG-03 - laporan perkembangan resort menaruh migrasi di saldo lalu, bukan drop', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await seedMigrationFixture(page);

    await migrateLoan(page, migrationFixtureMember, {
      principal: '1200000',
      ratePercent: '1',
      tenor: '12',
      settledThrough: '4',
      disbursementWeekday: migrationFixtureMember.officerWeekday,
      expectedOutstanding: 'Rp 800.000',
    });

    await page.goto('/koperasi/laporan-perkembangan-resort');
    await expect(page.getByRole('heading', { name: 'LAPORAN PERKEMBANGAN RESORT/KARYAWAN' })).toBeVisible();

    const grandTotalCells = page.getByTestId('koperasi-resort-development-grand-total').locator('td');
    await expect(grandTotalCells.nth(1)).toHaveText('Rp 896.000');
    await expect(grandTotalCells.nth(2)).toHaveText('-');
    await expect(grandTotalCells.nth(4)).toHaveText('-');
    await expect(grandTotalCells.nth(5)).toHaveText('Rp 896.000');
    await expect(grandTotalCells.nth(7)).toHaveText('Rp 896.000');
  });

  test('LOAN-MIG-04 - migrasi ditolak untuk angsuran lunas melebihi tenor tanpa data parsial', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await seedMigrationFixture(page);

    await expectMigrationRejectedForInvalidSettledInstallment(page, migrationFixtureMember, {
      tenor: '12',
      settledThrough: '20',
      disbursementWeekday: migrationFixtureMember.officerWeekday,
    });
  });
});
