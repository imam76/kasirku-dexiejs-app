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
  expectFlexibleInstallmentAllocation,
  expectCooperativeReportSummary,
  expectInstallmentSchedule,
  payRemainingInstallments,
  payFirstInstallment,
  payFirstInstallmentFromBillingShortcut,
  payFlexibleInstallmentAmount,
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

    await payRemainingInstallments(page, demoMembers.budi);
    await page.goto('/koperasi/pinjaman');
    await expect(page.getByTestId(`koperasi-loan-row-${demoMembers.budi.memberNumber}`).first())
      .toContainText('Paid Off');

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

  test('PAY-09 - shortcut pembayaran setoran penagihan mencatat angsuran tanpa modal', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await createActiveMember(page, demoMembers.siti);

    await createLoanApplication(page, demoMembers.siti);
    await approveLoan(page, demoMembers.siti);
    await disburseLoan(page, demoMembers.siti);
    await payFirstInstallmentFromBillingShortcut(page, demoMembers.siti);

    await page.goto('/koperasi/angsuran');
    await expect(page.getByTestId(`koperasi-installment-row-${demoMembers.siti.memberNumber}-1`)).toBeHidden();
    await expect(page.getByTestId(`koperasi-installment-row-${demoMembers.siti.memberNumber}-2`)).toBeVisible();
  });
});
