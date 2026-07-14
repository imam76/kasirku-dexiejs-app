import { expect, type Page } from '@playwright/test';
import { demoOpeningBalance } from './data';
import { fillControlByTestId } from './ui';

type AccountingSetupBusinessTemplate = 'RETAIL' | 'COOPERATIVE' | 'GENERAL_TRADING' | 'GENERAL_SERVICE';

interface InitialAccountingSetupFixtureInput {
  baseCurrencyCode?: string;
  businessTemplateCode?: AccountingSetupBusinessTemplate;
  configuredBy?: string;
  currentPeriodEnd?: string;
  currentPeriodStart?: string;
  cutoffDate?: string;
  enabledModules?: string[];
  fiscalPeriodEnd?: string;
  fiscalPeriodStart?: string;
}

const defaultInitialAccountingSetupInput = {
  baseCurrencyCode: 'IDR',
  businessTemplateCode: 'RETAIL' as AccountingSetupBusinessTemplate,
  configuredBy: 'e2e-regression',
  cutoffDate: '2026-01-01',
  fiscalPeriodStart: '2026-01-01',
  fiscalPeriodEnd: '2026-12-31',
  currentPeriodStart: '2026-01-01',
  currentPeriodEnd: '2026-12-31',
  enabledModules: [
    'PRODUCT',
    'CONTACT',
    'CURRENCY',
    'SALES_INVOICE',
    'CASH_FLOW',
    'CHART_OF_ACCOUNTS',
    'GENERAL_LEDGER',
    'REPORT_CASH_FLOW',
  ],
};

const requiredKspAccounts = [
  { code: '1010', name: 'Kas Tunai' },
  { code: '1020', name: 'Bank / Non Tunai' },
  { code: '1120', name: 'Piutang Pinjaman Anggota' },
  { code: '2300', name: 'Simpanan Anggota' },
  { code: '3000', name: 'Modal Pemilik' },
  { code: '4040', name: 'Pendapatan Bunga Pinjaman Anggota' },
  { code: '4050', name: 'Pendapatan Denda Pinjaman Anggota' },
] as const;

export async function saveInitialAccountingSetupFixture(
  page: Page,
  input: InitialAccountingSetupFixtureInput = {},
) {
  const setupInput = {
    ...defaultInitialAccountingSetupInput,
    ...input,
  };

  return page.evaluate(async (fixtureInput) => {
    const { saveInitialAccountingSetup } = await import('/src/services/accountingInitialSetupService.ts');

    return saveInitialAccountingSetup({
      enabledModules: fixtureInput.enabledModules,
      configuredBy: fixtureInput.configuredBy,
      business_template_code: fixtureInput.businessTemplateCode,
      cutoff_date: fixtureInput.cutoffDate,
      fiscal_period_start: fixtureInput.fiscalPeriodStart,
      fiscal_period_end: fixtureInput.fiscalPeriodEnd,
      current_period_start: fixtureInput.currentPeriodStart,
      current_period_end: fixtureInput.currentPeriodEnd,
      base_currency_code: fixtureInput.baseCurrencyCode,
    });
  }, setupInput);
}

export async function readAccountingSetupRegressionState(page: Page) {
  return page.evaluate(async () => {
    const { SETUP_CONFIG_STORAGE_KEY } = await import('/src/constants/setupModules.ts');
    const { db } = await import('/src/lib/db.ts');

    const [
      setup,
      profile,
      ledger,
      periods,
      currencies,
      accounts,
      mappings,
      syncQueue,
    ] = await Promise.all([
      db.accountingInitialSetupSetting.get('default'),
      db.accountingProfileSetting.get('default'),
      db.generalLedgerSetting.get('default'),
      db.accountingPeriods.toArray(),
      db.currencies.toArray(),
      db.chartOfAccounts.toArray(),
      db.financeAccountMappings.toArray(),
      db.syncQueue.toArray(),
    ]);
    const setupConfigRaw = localStorage.getItem(SETUP_CONFIG_STORAGE_KEY);

    return {
      setup,
      profile,
      ledger,
      periods,
      setupConfig: setupConfigRaw ? JSON.parse(setupConfigRaw) : null,
      baseCurrency: currencies.find((currency) => currency.is_base),
      accountCodes: accounts.map((account) => account.code).sort(),
      mappingByKey: Object.fromEntries(mappings.map((mapping) => [mapping.key, {
        account_code: mapping.account_code,
        account_name: mapping.account_name,
      }])),
      counts: {
        accounts: accounts.length,
        mappings: mappings.length,
        periods: periods.length,
        setupRows: setup ? 1 : 0,
      },
      syncStatuses: {
        setup: setup?.sync_status,
        profile: profile?.sync_status,
        ledger: ledger?.sync_status,
        period: periods[0]?.sync_status,
        baseCurrency: currencies.find((currency) => currency.is_base)?.sync_status,
      },
      syncQueueEntities: syncQueue.map((item) => item.entity),
    };
  });
}

export async function createFinanceTransactionLockSignal(page: Page) {
  await page.evaluate(async () => {
    const { FINANCE_CATEGORIES } = await import('/src/constants/finance.ts');
    const { addFinanceTransaction } = await import('/src/services/financeService.ts');

    await addFinanceTransaction({
      type: 'INCOME',
      category: FINANCE_CATEGORIES.SALES,
      amount: 125000,
      description: 'E2E lock signal transaction',
      payment_method: 'TUNAI',
    });
  });
}

async function ensureAccountingReferenceSetting(page: Page) {
  await page.evaluate(async () => {
    const { saveAccountingReferenceSetting } = await import('/src/services/accountingReferenceSettingService.ts');

    await saveAccountingReferenceSetting({
      cutoff_date: '2026-01-01',
      inventory_policy: 'PERPETUAL_INVENTORY',
      period_start: '2026-01-01',
      period_end: '2026-12-31',
    });
  });
}

async function gotoOpeningBalancePage(page: Page, pageNumber: number) {
  const targetPage = page.locator(`li[title="${pageNumber}"]`).last();
  if (await targetPage.count()) {
    await targetPage.click();
  }
}

async function gotoOpeningBalanceAccount(page: Page, accountCode: string) {
  const accountInput = page.getByTestId(`gl-opening-balance-debit-${accountCode}`);
  const firstPage = page.locator('li[title="1"]').last();
  if (await firstPage.count()) {
    await firstPage.click();
  }

  for (let pageNumber = 0; pageNumber < 20; pageNumber += 1) {
    if (await accountInput.isVisible()) return;
    const nextButton = page.locator('li[title="Next Page"]').last().getByRole('button');
    if (await nextButton.count() === 0 || !await nextButton.isEnabled({ timeout: 1000 })) break;
    await nextButton.click();
  }
}

async function fillOpeningBalanceAmount(page: Page, accountCode: string, side: 'debit' | 'credit', amount: string) {
  await gotoOpeningBalanceAccount(page, accountCode);
  const testId = `gl-opening-balance-${side}-${accountCode}`;
  await expect(page.getByTestId(testId)).toBeVisible();
  await fillControlByTestId(page, testId, amount);
}

async function skipEmptyDetailOpeningBalanceModules(page: Page) {
  await page.evaluate(async () => {
    const { markOpeningBalanceModuleSkipped } = await import('/src/services/openingBalanceService.ts');
    await markOpeningBalanceModuleSkipped('RECEIVABLE', 'Tidak ada saldo awal piutang untuk fixture E2E.');
    await markOpeningBalanceModuleSkipped('PAYABLE', 'Tidak ada saldo awal hutang untuk fixture E2E.');
    await markOpeningBalanceModuleSkipped('ADVANCE_RECEIVED', 'Tidak ada saldo awal uang muka masuk untuk fixture E2E.');
    await markOpeningBalanceModuleSkipped('ADVANCE_PAID', 'Tidak ada saldo awal uang muka keluar untuk fixture E2E.');
  });
}

async function expectFinanceMappingVisible(page: Page, label: string) {
  const mapping = page.getByText(label, { exact: true });
  const firstPage = page.locator('li[title="1"]').last();
  if (await firstPage.count()) {
    await firstPage.click();
  }

  for (let pageNumber = 0; pageNumber < 10; pageNumber += 1) {
    if (await mapping.isVisible()) return;
    const nextButton = page.locator('li[title="Next Page"]').last().getByRole('button');
    if (!await nextButton.isEnabled()) break;
    await nextButton.click();
  }

  await expect(mapping).toBeVisible();
}

async function expectKspMappingsAvailable(page: Page) {
  const mappings = await page.evaluate(async () => {
    const { FINANCE_CATEGORIES } = await import('/src/constants/finance.ts');
    const { db } = await import('/src/lib/db.ts');
    const requiredKeys = [
      FINANCE_CATEGORIES.KSP_SAVING_DEPOSIT,
      FINANCE_CATEGORIES.KSP_SAVING_WITHDRAWAL,
      FINANCE_CATEGORIES.KSP_LOAN_DISBURSEMENT,
      FINANCE_CATEGORIES.KSP_LOAN_PAYMENT,
      FINANCE_CATEGORIES.KSP_IPTW,
    ];

    return Object.fromEntries(await Promise.all(requiredKeys.map(async (key) => {
      const mapping = await db.financeAccountMappings.get(key);
      return [key, mapping ? {
        account_code: mapping.account_code,
        account_name: mapping.account_name,
      } : null];
    })));
  });

  expect(mappings.KSP_SETORAN_SIMPANAN).toMatchObject({ account_code: '2300' });
  expect(mappings.KSP_PENARIKAN_SIMPANAN).toMatchObject({ account_code: '2300' });
  expect(mappings.KSP_PENCAIRAN_PINJAMAN).toMatchObject({ account_code: '1120' });
  expect(mappings.KSP_PEMBAYARAN_ANGSURAN).toMatchObject({ account_code: '1000' });
  expect(mappings.KSP_INSENTIF_PEMBAYARAN_TEPAT_WAKTU).toMatchObject({ account_code: '6900' });
}

export async function expectDefaultKspAccounts(page: Page) {
  await page.goto('/finance/chart-of-accounts');
  await expect(page.getByText('Daftar Akun').first()).toBeVisible();

  const search = page.getByPlaceholder('Cari kode, nama, parent, atau deskripsi akun...');
  for (const account of requiredKspAccounts) {
    await search.fill(account.code);
    await expect(page.getByText(account.code, { exact: true })).toBeVisible();
    await expect(page.getByText(account.name, { exact: true })).toBeVisible();
  }
  await search.fill('');
}

export async function expectAccountingMappingReady(page: Page) {
  await page.goto('/finance/chart-of-accounts');
  await page.getByRole('tab', { name: 'Mapping & Template' }).click();

  await expect(page.getByText('Profile & Template')).toBeVisible();
  await expect(page.getByText('SAK EMKM')).toBeVisible();
  await expect(page.getByTitle('Retail')).toBeVisible();
  await expect(page.getByText('Module Activation')).toBeVisible();
  await expect(page.getByTestId('accounting-module-general-ledger-switch')).toBeVisible();

  await expectFinanceMappingVisible(page, 'Penjualan');
  await expectFinanceMappingVisible(page, 'Pembelian Stok');
  await expectFinanceMappingVisible(page, 'Payroll');
  await expectKspMappingsAvailable(page);
}

export async function postOpeningBalance(
  page: Page,
  options: { equityAccountCode?: string; expectInactiveModule?: boolean } = {},
) {
  const { equityAccountCode = '3000', expectInactiveModule = true } = options;

  await ensureAccountingReferenceSetting(page);

  await page.goto('/finance/opening-balances/accounts');
  await expect(page.getByText('Saldo Awal Akun').first()).toBeVisible();
  await expect(page.getByTestId('gl-opening-balance-save-draft-button')).toHaveCount(0);

  await gotoOpeningBalancePage(page, 1);
  await fillOpeningBalanceAmount(page, '1010', 'debit', demoOpeningBalance[0].debit);
  await expect(page.getByText('Selisih debit/kredit').first()).toBeVisible();

  await fillOpeningBalanceAmount(page, equityAccountCode, 'credit', '4000000');

  await fillOpeningBalanceAmount(page, '1020', 'debit', demoOpeningBalance[1].debit);

  await fillOpeningBalanceAmount(page, equityAccountCode, 'credit', demoOpeningBalance[2].credit);
  await expect(page.getByTestId('gl-opening-balance-post-button')).toBeEnabled();
  await page.getByTestId('gl-opening-balance-post-button').click();
  await skipEmptyDetailOpeningBalanceModules(page);

  await page.goto('/finance/general-ledger');

  if (expectInactiveModule) {
    await expect(page.getByText('General Ledger belum aktif')).toBeVisible();
  }
  await expect(page.getByText('Siap', { exact: true })).toBeVisible();
}

export async function activateGeneralLedger(page: Page) {
  await page.goto('/finance/chart-of-accounts');
  await page.getByRole('tab', { name: 'Mapping & Template' }).click();

  const generalLedgerSwitch = page.getByTestId('accounting-module-general-ledger-switch');
  await expect(generalLedgerSwitch).toBeVisible();

  if (await generalLedgerSwitch.getAttribute('aria-checked') !== 'true') {
    await generalLedgerSwitch.click();
  }

  await expect(generalLedgerSwitch).toHaveAttribute('aria-checked', 'true');
}

export async function expectGeneralLedgerReportsReady(page: Page) {
  await page.goto('/finance/general-ledger');

  await expect(page.getByText('Siap', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Jurnal' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Buku Besar' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Trial Balance' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Laba Rugi' })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Neraca' })).toBeVisible();
}

export async function setupAccountingReady(page: Page) {
  await expectDefaultKspAccounts(page);
  await expectAccountingMappingReady(page);
  await postOpeningBalance(page);
  await activateGeneralLedger(page);
  await expectGeneralLedgerReportsReady(page);
}
