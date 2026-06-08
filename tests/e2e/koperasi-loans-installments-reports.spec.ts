import { expect, test } from '@playwright/test';
import { setupAccountingReady } from './helpers/accounting';
import { loginAsBootstrappedOwner } from './helpers/auth';
import { demoMembers } from './helpers/data';
import {
  approveLoan,
  createActiveMember,
  expectCooperativeFinancialReportsGated,
  createLoanApplication,
  disburseLoan,
  expectCooperativeReportSummary,
  expectInstallmentSchedule,
  payFirstInstallment,
} from './helpers/koperasi';

test.describe.serial('pinjaman, angsuran, dan laporan koperasi', () => {
  test('REP-02 - laporan keuangan formal digate saat General Ledger belum ready', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await expectCooperativeFinancialReportsGated(page);
  });

  test('LOAN-01, LOAN-02, LOAN-04, LOAN-05, PAY-01, REP-01, LOAN-07, PAY-07 - alur pinjaman Budi', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await setupAccountingReady(page);
    await createActiveMember(page, demoMembers.budi);

    await createLoanApplication(page, demoMembers.budi);
    await approveLoan(page, demoMembers.budi);
    await disburseLoan(page, demoMembers.budi);
    await expectInstallmentSchedule(page, demoMembers.budi);
    await payFirstInstallment(page, demoMembers.budi);
    await expectCooperativeReportSummary(page);

    await page.goto('/finance/general-ledger');
    await expect(page.getByText(/Pencairan pinjaman .*KSU-002 - Budi Hartono/)).toBeVisible();
    await expect(page.getByText(/Pembayaran angsuran/)).toBeVisible();
  });
});
