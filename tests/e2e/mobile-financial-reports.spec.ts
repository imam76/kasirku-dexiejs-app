import { expect, test, type Locator, type Page } from '@playwright/test';
import { saveInitialAccountingSetupFixture } from './helpers/accounting';
import { loginAsBootstrappedOwner } from './helpers/auth';

const mobileWidths = [320, 360, 390, 430] as const;

const cashFlowFixture = {
  incomeDescription: 'E2E mobile arus kas pemasukan unik',
  expenseDescription: 'E2E mobile arus kas pengeluaran unik dengan deskripsi panjang yang harus membungkus',
  incomeAmount: 1_250_000,
  expenseAmount: 350_000,
} as const;

const profitLossFixture = {
  revenueAmount: 2_000_000,
  expenseAmount: 2_500_000,
} as const;

interface SeededFinancialReportFixture {
  expenseAccountLabel: string;
  expenseAccountName: string;
  revenueAccountLabel: string;
  revenueAccountName: string;
}

const expectNoDocumentOverflow = async (page: Page) => {
  await expect.poll(() => page.evaluate(() => (
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth
  ))).toBeLessThanOrEqual(1);
};

const expectMetric = async (report: Locator, label: string, amount: string) => {
  const metric = report.getByText(label, { exact: true }).first().locator('..');
  await expect(metric).toContainText(amount);
};

const chooseAntSelectOption = async (
  page: Page,
  container: Locator,
  fieldLabel: string,
  optionLabel: string,
) => {
  const field = container
    .getByText(fieldLabel, { exact: true })
    .first()
    .locator('xpath=ancestor::div[contains(@class, "min-w-0")][1]');
  await field.locator('.ant-select').first().click({ timeout: 10_000 });
  await page
    .locator('.ant-select-dropdown:visible .ant-select-item-option-content')
    .filter({ hasText: optionLabel })
    .click({ timeout: 10_000 });
};

const exerciseMobileExportDrawer = async (page: Page, formats: string[]) => {
  await page.getByRole('button', { name: /Export/ }).first().click({ timeout: 10_000 });
  await expect(page.getByRole('heading', { name: 'Export', exact: true })).toBeVisible();

  for (const format of formats) {
    await expect(page.getByText(format, { exact: true }).last()).toBeVisible();
  }

  await page.getByRole('button', { name: /Tutup pilihan export|Close export options/ }).click();
  await expect(page.getByRole('heading', { name: 'Export', exact: true })).toHaveCount(0);
};

const seedFinancialReportFixture = async (page: Page): Promise<SeededFinancialReportFixture> => {
  const accountingPeriod = await page.evaluate(async () => {
    const { default: dayjs } = await import('/src/lib/dayjs.ts');
    const today = dayjs.tz();

    return {
      today: today.format('YYYY-MM-DD'),
      yearStart: today.startOf('year').format('YYYY-MM-DD'),
      yearEnd: today.endOf('year').format('YYYY-MM-DD'),
    };
  });

  await saveInitialAccountingSetupFixture(page, {
    cutoffDate: accountingPeriod.yearStart,
    fiscalPeriodStart: accountingPeriod.yearStart,
    fiscalPeriodEnd: accountingPeriod.yearEnd,
    currentPeriodStart: accountingPeriod.yearStart,
    currentPeriodEnd: accountingPeriod.yearEnd,
    enabledModules: [
      'PRODUCT',
      'CONTACT',
      'CURRENCY',
      'SALES_INVOICE',
      'CASH_FLOW',
      'CHART_OF_ACCOUNTS',
      'GENERAL_LEDGER',
      'REPORT_CASH_FLOW',
      'REPORT_PROFIT',
    ],
  });

  return page.evaluate(async ({ cashFixture, entryDate, profitFixture }) => {
    const { FINANCE_CATEGORIES } = await import('/src/constants/finance.ts');
    const { db } = await import('/src/lib/db.ts');
    const { addFinanceTransaction } = await import('/src/services/financeService.ts');
    const { postBalancedJournalEntry } = await import('/src/services/generalLedgerService.ts');
    const accounts = await db.chartOfAccounts.toArray();
    const now = new Date().toISOString();
    const generalLedgerModule = await db.enabledModules.get('GENERAL_LEDGER');
    const generalLedgerSetting = await db.generalLedgerSetting.get('default');
    const cashAccount = accounts.find((account) => account.code === '1010' && account.is_postable);
    const revenueAccount = accounts.find((account) => account.code === '4000' && account.is_postable)
      ?? accounts.find((account) => account.type === 'REVENUE' && account.is_postable);
    const expenseAccount = accounts.find((account) => account.code === '6110' && account.is_postable)
      ?? accounts.find((account) => account.type === 'EXPENSE' && account.is_postable && /^6/.test(account.code));

    if (!generalLedgerModule || !generalLedgerSetting || !cashAccount || !revenueAccount || !expenseAccount) {
      throw new Error('Setup General Ledger atau akun fixture laporan mobile tidak tersedia.');
    }

    await db.enabledModules.put({
      ...generalLedgerModule,
      is_enabled: true,
      updated_at: now,
    });
    await db.generalLedgerSetting.put({
      ...generalLedgerSetting,
      is_ready: true,
      inventory_policy: 'PERPETUAL_INVENTORY',
      activated_at: generalLedgerSetting.activated_at ?? now,
      updated_at: now,
    });

    await addFinanceTransaction({
      type: 'INCOME',
      category: FINANCE_CATEGORIES.SALES,
      amount: cashFixture.incomeAmount,
      description: cashFixture.incomeDescription,
      payment_method: 'TUNAI',
      cash_account_id: cashAccount.id,
    });
    await addFinanceTransaction({
      type: 'EXPENSE',
      category: FINANCE_CATEGORIES.OPERATIONAL,
      amount: cashFixture.expenseAmount,
      description: cashFixture.expenseDescription,
      payment_method: 'TUNAI',
      cash_account_id: cashAccount.id,
    });

    const revenueEntry = await postBalancedJournalEntry({
      source_type: 'MANUAL_JOURNAL',
      source_id: 'e2e-mobile-financial-report-revenue',
      source_number: 'E2E-MOBILE-REVENUE',
      source_event: 'MANUAL_JOURNAL_POSTED',
      entry_date: entryDate,
      description: 'E2E mobile jurnal pendapatan unik',
      lines: [
        { account: cashAccount, debit: profitFixture.revenueAmount, description: 'Kas pendapatan mobile E2E' },
        { account: revenueAccount, credit: profitFixture.revenueAmount, description: 'Pendapatan mobile E2E' },
      ],
    });
    const expenseEntry = await postBalancedJournalEntry({
      source_type: 'MANUAL_JOURNAL',
      source_id: 'e2e-mobile-financial-report-expense',
      source_number: 'E2E-MOBILE-EXPENSE',
      source_event: 'MANUAL_JOURNAL_POSTED',
      entry_date: entryDate,
      description: 'E2E mobile jurnal beban unik',
      lines: [
        { account: expenseAccount, debit: profitFixture.expenseAmount, description: 'Beban mobile E2E' },
        { account: cashAccount, credit: profitFixture.expenseAmount, description: 'Kas untuk beban mobile E2E' },
      ],
    });

    if (!revenueEntry || !expenseEntry) {
      throw new Error('General Ledger tidak menerima jurnal fixture laporan mobile.');
    }

    return {
      expenseAccountLabel: `${expenseAccount.code} - ${expenseAccount.name}`,
      expenseAccountName: expenseAccount.name,
      revenueAccountLabel: `${revenueAccount.code} - ${revenueAccount.name}`,
      revenueAccountName: revenueAccount.name,
    };
  }, {
    cashFixture: cashFlowFixture,
    entryDate: accountingPeriod.today,
    profitFixture: profitLossFixture,
  });
};

test('laporan arus kas dan laba rugi memakai kartu mobile tanpa overflow lalu kembali ke desktop', async ({ page }) => {
  test.setTimeout(240_000);
  page.setDefaultTimeout(10_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await loginAsBootstrappedOwner(page);
  const fixture = await seedFinancialReportFixture(page);

  await page.goto('/report/cash-flow-report');

  const cashFlowReport = page.getByTestId('cash-flow-report-mobile');
  const cashFlowFilterFab = page.getByTestId('cash-flow-filter-fab');
  await expect(cashFlowReport).toBeVisible();
  await expect(cashFlowFilterFab).toBeVisible();
  await expect(page.getByTestId('cash-flow-report-desktop')).toHaveCount(0);
  await expect(cashFlowReport).toContainText(cashFlowFixture.incomeDescription);
  await expect(cashFlowReport).toContainText(cashFlowFixture.expenseDescription);
  await expectMetric(cashFlowReport, 'Total Kas Masuk', '1.250.000');
  await expectMetric(cashFlowReport, 'Total Kas Keluar', '350.000');
  await expectMetric(cashFlowReport, 'Net', '900.000');
  await expect(cashFlowReport).toContainText('1010 - Kas Tunai');

  await cashFlowFilterFab.click();
  let cashFlowFilterSheet = page.getByTestId('cash-flow-filter-sheet');
  await expect(cashFlowFilterSheet).toBeVisible();
  await chooseAntSelectOption(page, cashFlowFilterSheet, 'Klasifikasi', 'Pengeluaran');
  await cashFlowFilterSheet.getByRole('button', { name: 'Terapkan', exact: true }).click();
  await expect(cashFlowFilterSheet).toHaveCount(0);
  await expect(cashFlowReport).toContainText(cashFlowFixture.expenseDescription);
  await expect(cashFlowReport).not.toContainText(cashFlowFixture.incomeDescription);

  await cashFlowFilterFab.click();
  cashFlowFilterSheet = page.getByTestId('cash-flow-filter-sheet');
  await chooseAntSelectOption(page, cashFlowFilterSheet, 'Klasifikasi', 'Semua Klasifikasi');
  await cashFlowFilterSheet.getByRole('checkbox', { name: 'Show zero balance' }).check();
  await cashFlowFilterSheet.getByRole('button', { name: 'Terapkan', exact: true }).click();
  await expect(cashFlowReport).toContainText('Zero balance');

  await cashFlowFilterFab.click();
  cashFlowFilterSheet = page.getByTestId('cash-flow-filter-sheet');
  await cashFlowFilterSheet.getByRole('button', { name: 'Reset', exact: true }).click();
  await cashFlowFilterSheet.getByRole('button', { name: 'Terapkan', exact: true }).click();
  await expect(cashFlowReport).toContainText(cashFlowFixture.incomeDescription);
  await expect(cashFlowReport).not.toContainText('Zero balance');

  await cashFlowFilterFab.click();
  cashFlowFilterSheet = page.getByTestId('cash-flow-filter-sheet');
  await chooseAntSelectOption(page, cashFlowFilterSheet, 'Shortcut', 'Bulan Lalu');
  await cashFlowFilterSheet.getByRole('button', { name: 'Terapkan', exact: true }).click();
  await expect(cashFlowReport).toContainText('Belum ada transaksi arus kas untuk filter ini.');

  await cashFlowFilterFab.click();
  cashFlowFilterSheet = page.getByTestId('cash-flow-filter-sheet');
  await cashFlowFilterSheet.getByRole('button', { name: 'Reset', exact: true }).click();
  await cashFlowFilterSheet.getByRole('button', { name: 'Terapkan', exact: true }).click();
  await expect(cashFlowReport).toContainText(cashFlowFixture.incomeDescription);
  await exerciseMobileExportDrawer(page, ['PDF', 'HTML', 'CSV']);

  for (const width of mobileWidths) {
    await page.setViewportSize({ width, height: 844 });
    await expect(cashFlowReport).toBeVisible();
    await expect(page.getByTestId('cash-flow-report-desktop')).toHaveCount(0);
    await expect(cashFlowFilterFab).toBeVisible();
    await expectNoDocumentOverflow(page);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/report/profit-loss-report');

  const profitLossReport = page.getByTestId('profit-loss-report-mobile');
  const profitLossFilterFab = page.getByTestId('profit-loss-filter-fab');
  await expect(profitLossReport).toBeVisible();
  await expect(profitLossFilterFab).toBeVisible();
  await expect(page.getByTestId('profit-loss-report-desktop')).toHaveCount(0);
  await expect(profitLossReport).toContainText(fixture.revenueAccountName);
  await expect(profitLossReport).toContainText(fixture.expenseAccountName);
  await expectMetric(profitLossReport, 'Pendapatan Bersih', '2.000.000');
  await expectMetric(profitLossReport, 'Total Laba Kotor', '2.000.000');
  await expectMetric(profitLossReport, 'Laba/Rugi Bersih', '-500.000');
  await expect(profitLossReport.locator('.text-red-600').filter({ hasText: '500.000' }).first()).toBeVisible();

  await profitLossFilterFab.click();
  let profitLossFilterSheet = page.getByTestId('profit-loss-filter-sheet');
  await expect(profitLossFilterSheet).toBeVisible();
  await chooseAntSelectOption(page, profitLossFilterSheet, 'Filter akun', fixture.revenueAccountLabel);
  await profitLossFilterSheet.getByRole('button', { name: 'Terapkan', exact: true }).click();
  await expect(profitLossReport).toContainText(fixture.revenueAccountName);
  await expect(profitLossReport).not.toContainText(fixture.expenseAccountName);

  await profitLossFilterFab.click();
  profitLossFilterSheet = page.getByTestId('profit-loss-filter-sheet');
  await profitLossFilterSheet.getByRole('button', { name: 'Reset', exact: true }).click();
  await profitLossFilterSheet.getByRole('button', { name: 'Terapkan', exact: true }).click();
  await expect(profitLossReport).toContainText(fixture.expenseAccountName);

  await page.getByRole('button', { name: /Refresh/ }).click();
  await expect(profitLossReport).toContainText(fixture.revenueAccountName);
  await exerciseMobileExportDrawer(page, ['PDF', 'Excel']);

  for (const width of mobileWidths) {
    await page.setViewportSize({ width, height: 844 });
    await expect(profitLossReport).toBeVisible();
    await expect(page.getByTestId('profit-loss-report-desktop')).toHaveCount(0);
    await expect(profitLossFilterFab).toBeVisible();
    await expectNoDocumentOverflow(page);
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.getByTestId('profit-loss-report-desktop')).toBeVisible();
  await expect(page.getByTestId('profit-loss-report-mobile')).toHaveCount(0);
  await expect(page.getByTestId('profit-loss-report-desktop')).toContainText(fixture.revenueAccountName);
  await expect(page.getByTestId('profit-loss-report-desktop')).toContainText(fixture.expenseAccountName);

  await page.goto('/report/cash-flow-report');
  await expect(page.getByTestId('cash-flow-report-desktop')).toBeVisible();
  await expect(page.getByTestId('cash-flow-report-mobile')).toHaveCount(0);
  await expect(page.getByTestId('cash-flow-report-desktop')).toContainText(cashFlowFixture.incomeDescription);
});
