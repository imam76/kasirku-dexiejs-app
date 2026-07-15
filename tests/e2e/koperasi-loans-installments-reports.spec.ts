import { expect, test } from '@playwright/test';
import { setupAccountingReady } from './helpers/accounting';
import { loginAsBootstrappedOwner } from './helpers/auth';
import { demoMembers } from './helpers/data';
import {
  approveLoan,
  createActiveMember,
  expectCooperativeFinancialReportsUnavailable,
  createLoanApplication,
  disburseLoan,
  expectFlexibleInstallmentAllocation,
  expectCooperativeReportSummary,
  expectInstallmentSchedule,
  payRemainingInstallments,
  payFirstInstallment,
  payFlexibleInstallmentAmount,
} from './helpers/koperasi';

test.describe.serial('pinjaman, angsuran, dan laporan koperasi', () => {
  test('REP-02 - laporan keuangan formal digate saat General Ledger belum available', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await expectCooperativeFinancialReportsUnavailable(page);
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

    await payRemainingInstallments(page, demoMembers.budi);
    await page.goto('/koperasi/pinjaman');
    await expect(page.getByTestId(`koperasi-loan-row-${demoMembers.budi.memberNumber}`).first())
      .toContainText(/Paid Off|Lunas/);

    await page.goto('/finance/general-ledger');
    await expect(page.getByText(/IPTW 5% pelunasan tepat waktu/)).toBeVisible();
    await expect(page.getByText(/Rp 150.000/).first()).toBeVisible();
  });

  test('PAY-08 - pembayaran nominal bebas dialokasikan ke cicilan tertua', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await createActiveMember(page, demoMembers.rani);

    await createLoanApplication(page, demoMembers.rani);
    await approveLoan(page, demoMembers.rani);
    await disburseLoan(page, demoMembers.rani);
    await payFlexibleInstallmentAmount(page, demoMembers.rani, 795000);
    await expectFlexibleInstallmentAllocation(page, demoMembers.rani);
  });
});
