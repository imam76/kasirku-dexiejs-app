import { expect, test } from '@playwright/test';
import { loginAsBootstrappedOwner } from './helpers/auth';
import {
  activateGeneralLedger,
  createFinanceTransactionLockSignal,
  expectAccountingMappingReady,
  expectDefaultKspAccounts,
  expectGeneralLedgerReportsReady,
  postOpeningBalance,
  readAccountingSetupRegressionState,
  saveInitialAccountingSetupFixture,
} from './helpers/accounting';

test.describe.serial('setup accounting dasar KSU', () => {
  test('ACC-01 sampai ACC-07 - akun default, mapping, opening balance, aktivasi GL, dan report awal', async ({ page }) => {
    await loginAsBootstrappedOwner(page);

    await expectDefaultKspAccounts(page);
    await expectAccountingMappingReady(page);
    await postOpeningBalance(page);
    await activateGeneralLedger(page);
    await expectGeneralLedgerReportsReady(page);
  });
});

test.describe.serial('accounting initial setup regression', () => {
  test('AIS-SETUP-01 dan AIS-SETUP-08 - setup retail tersimpan dan maintenance UI membaca baseline yang sama', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await saveInitialAccountingSetupFixture(page);

    const state = await readAccountingSetupRegressionState(page);

    expect(state.setup).toMatchObject({
      business_template_code: 'RETAIL',
      accounting_profile: 'SAK_EMKM',
      industry_extension: 'RETAIL',
      template_id: 'default-sak-emkm-retail',
      cutoff_date: '2026-01-01',
      fiscal_period_start: '2026-01-01',
      fiscal_period_end: '2026-12-31',
      current_period_start: '2026-01-01',
      current_period_end: '2026-12-31',
      base_currency_code: 'IDR',
    });
    expect(state.setupConfig?.enabledModules).toEqual(expect.arrayContaining([
      'CURRENCY',
      'SALES_INVOICE',
      'CHART_OF_ACCOUNTS',
      'GENERAL_LEDGER',
    ]));
    expect(state.profile).toMatchObject({
      accounting_profile: 'SAK_EMKM',
      industry_extension: 'RETAIL',
      template_id: 'default-sak-emkm-retail',
    });
    expect(state.ledger).toMatchObject({
      cutoff_date: '2026-01-01T00:00:00.000',
      inventory_policy: 'PERPETUAL_INVENTORY',
    });
    expect(state.periods).toEqual(expect.arrayContaining([
      expect.objectContaining({
        start_date: '2026-01-01',
        end_date: '2026-12-31',
        status: 'OPEN',
      }),
    ]));
    expect(state.baseCurrency).toMatchObject({ code: 'IDR', is_base: true, is_active: true });
    expect(state.accountCodes).toEqual(expect.arrayContaining(['1010', '1100', '1200', '4000', '5000']));
    expect(state.mappingByKey.PENJUALAN).toMatchObject({ account_code: '4010' });
    expect([...new Set(state.syncQueueEntities)]).toEqual(expect.arrayContaining([
      'accountingInitialSetupSetting',
      'generalLedgerSetting',
      'accountingPeriods',
    ]));
    expect(state.syncStatuses).toMatchObject({
      setup: expect.stringMatching(/^(pending|failed|synced)$/),
      ledger: expect.stringMatching(/^(pending|failed|synced)$/),
      period: expect.stringMatching(/^(pending|failed|synced)$/),
      baseCurrency: expect.stringMatching(/^(pending|failed|synced)$/),
    });

    await page.goto('/settings');
    await expect(page.getByText('Setup awal akuntansi sudah tersimpan')).toBeVisible();
    await expect(page.getByText('1 Januari 2026').first()).toBeVisible();
    await expect(page.getByText('IDR').first()).toBeVisible();

    await page.goto('/finance/chart-of-accounts');
    await page.getByRole('tab', { name: 'Mapping & Template' }).click();
    await expect(page.getByText('Profile & Template')).toBeVisible();
    await expect(page.getByText('default-sak-emkm-retail')).toBeVisible();
    await expect(page.getByText('SAK EMKM')).toBeVisible();
    await expect(page.getByTitle('Retail')).toBeVisible();

    await page.goto('/master-data/currencies');
    await expect(page.getByText('Base currency masih mengikuti setup awal')).toBeVisible();
    await expect(page.getByRole('row', { name: /IDR/ })).toContainText('Base');

    await page.goto('/finance/general-ledger');
    await expect(page.getByText('General Ledger').first()).toBeVisible();
    await expect(page.getByText('Readiness')).toBeVisible();
    await expect(page.getByText('Bisa Dibuka', { exact: true })).toBeVisible();
    await expect(page.getByText('Saldo awal belum lengkap', { exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Jurnal' })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Trial Balance' })).toBeVisible();
    await expect(page.getByText('1 Januari 2026 00:00').first()).toBeVisible();

    const glAvailability = await page.evaluate(async () => {
      const { db } = await import('/src/lib/db.ts');
      const { updateEnabledModule } = await import('/src/services/chartOfAccountService.ts');
      const { getGeneralLedgerReadiness } = await import('/src/utils/accounting/getGeneralLedgerReadiness.ts');

      const before = await getGeneralLedgerReadiness();
      await updateEnabledModule('GENERAL_LEDGER', true);
      const after = await getGeneralLedgerReadiness();
      const module = await db.enabledModules.get('GENERAL_LEDGER');

      return {
        beforeIsAvailable: before.isAvailable,
        beforeIsReady: before.isReady,
        afterIsAvailable: after.isAvailable,
        afterIsReady: after.isReady,
        moduleEnabled: module?.is_enabled,
      };
    });

    expect(glAvailability).toMatchObject({
      beforeIsAvailable: true,
      beforeIsReady: false,
      afterIsAvailable: true,
      afterIsReady: false,
      moduleEnabled: true,
    });

    await page.goto('/report/profit-loss-report');
    await expect(page.getByText('Laporan ditampilkan, baseline belum final')).toBeVisible();
    await expect(page.getByText('Laba/Rugi Bersih').first()).toBeVisible();

    await page.goto('/report/balance-sheet-report');
    await expect(page.getByText('Laporan ditampilkan, baseline belum final')).toBeVisible();
    await expect(page.getByText('Total Harta').first()).toBeVisible();
  });

  test('AIS-SETUP-01B - setup COA otomatis mengaktifkan ledger tanpa apply manual', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await saveInitialAccountingSetupFixture(page, {
      enabledModules: ['CASH_FLOW', 'CHART_OF_ACCOUNTS'],
    });

    const state = await readAccountingSetupRegressionState(page);
    expect(state.setupConfig?.enabledModules).toEqual(expect.arrayContaining([
      'CASH_FLOW',
      'CHART_OF_ACCOUNTS',
      'GENERAL_LEDGER',
    ]));
    expect(state.ledger).toMatchObject({
      is_ready: true,
      cutoff_date: '2026-01-01T00:00:00.000',
      inventory_policy: 'PERPETUAL_INVENTORY',
    });

    const result = await page.evaluate(async () => {
      const { FINANCE_CATEGORIES } = await import('/src/constants/finance.ts');
      const { db } = await import('/src/lib/db.ts');
      const { updateFinanceAccountMapping } = await import('/src/services/chartOfAccountService.ts');
      const { getGeneralLedgerReadiness } = await import('/src/utils/accounting/getGeneralLedgerReadiness.ts');

      const revenueAccount = await db.chartOfAccounts.where('code').equals('4010').first();
      if (!revenueAccount) throw new Error('Akun 4010 tidak tersedia untuk remapping.');

      await updateFinanceAccountMapping(FINANCE_CATEGORIES.SALES, revenueAccount.id);

      const [module, mapping, readiness] = await Promise.all([
        db.enabledModules.get('GENERAL_LEDGER'),
        db.financeAccountMappings.get(FINANCE_CATEGORIES.SALES),
        getGeneralLedgerReadiness(),
      ]);

      return {
        moduleEnabled: module?.is_enabled,
        moduleSource: module?.source,
        mappingAccountCode: mapping?.account_code,
        isLedgerAvailable: readiness.isAvailable,
        isLedgerReady: readiness.isReady,
      };
    });

    expect(result).toMatchObject({
      moduleEnabled: true,
      moduleSource: 'PROFILE',
      mappingAccountCode: '4010',
      isLedgerAvailable: true,
      isLedgerReady: false,
    });

    await page.goto('/finance/general-ledger');
    await expect(page.getByText('General Ledger').first()).toBeVisible();
    await expect(page.getByText('Bisa Dibuka', { exact: true })).toBeVisible();
    await expect(page.getByText('Saldo awal belum lengkap', { exact: true })).toBeVisible();
    await expect(page.getByRole('tab', { name: 'Jurnal' })).toBeVisible();
  });

  test('AIS-SETUP-02 - setup koperasi menerapkan template dan mapping koperasi', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await saveInitialAccountingSetupFixture(page, {
      businessTemplateCode: 'COOPERATIVE',
      enabledModules: [
        'CASH_FLOW',
        'CHART_OF_ACCOUNTS',
        'GENERAL_LEDGER',
        'KOPERASI_ANGGOTA',
        'KOPERASI_SIMPANAN_SUKARELA',
        'KOPERASI_PINJAMAN',
        'KOPERASI_ANGSURAN',
      ],
    });

    const state = await readAccountingSetupRegressionState(page);

    expect(state.setup).toMatchObject({
      business_template_code: 'COOPERATIVE',
      accounting_profile: 'SAK_ETAP',
      industry_extension: 'COOPERATIVE',
      template_id: 'default-sak-etap-koperasi',
      base_currency_code: 'IDR',
    });
    expect(state.profile).toMatchObject({
      accounting_profile: 'SAK_ETAP',
      industry_extension: 'COOPERATIVE',
      template_id: 'default-sak-etap-koperasi',
    });
    expect(state.ledger).toMatchObject({
      inventory_policy: 'CASH_FLOW_ONLY',
      cutoff_date: '2026-01-01T00:00:00.000',
    });
    expect(state.accountCodes).toEqual(expect.arrayContaining(['1120', '2300', '2310', '2320', '2330']));
    expect(state.mappingByKey.KSP_PENCAIRAN_PINJAMAN).toMatchObject({ account_code: '1120' });
    expect(state.mappingByKey.KSP_SETORAN_SIMPANAN).toMatchObject({ account_code: '2330' });
    expect(state.mappingByKey.KSP_PENARIKAN_SIMPANAN).toMatchObject({ account_code: '2330' });
    expect(state.mappingByKey.KSP_ADMIN_PINJAMAN).toMatchObject({ account_code: '4050' });
    expect(state.mappingByKey.KSP_INSENTIF_PEMBAYARAN_TEPAT_WAKTU).toMatchObject({ account_code: '6090' });

    await page.goto('/koperasi/laporan#shu');
    await expect(page.getByRole('heading', { name: 'Laporan Koperasi' })).toBeVisible();
    await expect(page.getByText('Laporan ditampilkan, baseline belum final.')).toBeVisible();
    await expect(page.getByTestId('koperasi-shu-report')).toBeVisible();
  });

  test('AIS-SETUP-04 - cutoff ditolak setelah opening balance posted', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await saveInitialAccountingSetupFixture(page);

    await page.evaluate(async () => {
      const { db } = await import('/src/lib/db.ts');
      const { postAccountOpeningBalanceBatch } = await import('/src/services/openingBalanceService.ts');
      const accounts = await db.chartOfAccounts.toArray();
      const accountIdByCode = new Map(accounts.map((account) => [account.code, account.id]));
      const requireAccountId = (code: string) => {
        const accountId = accountIdByCode.get(code);
        if (!accountId) throw new Error(`Akun ${code} tidak tersedia untuk opening balance.`);
        return accountId;
      };

      await postAccountOpeningBalanceBatch({
        lines: [
          { account_id: requireAccountId('1010'), debit: 5000000, credit: 0 },
          { account_id: requireAccountId('1020'), debit: 10000000, credit: 0 },
          { account_id: requireAccountId('3010'), debit: 0, credit: 15000000 },
        ],
      });
    });

    const result = await page.evaluate(async () => {
      const { saveAccountingReferenceSetting } = await import('/src/services/accountingReferenceSettingService.ts');
      const { db } = await import('/src/lib/db.ts');

      try {
        await saveAccountingReferenceSetting({
          cutoff_date: '2026-02-01',
          inventory_policy: 'PERPETUAL_INVENTORY',
          period_start: '2026-01-01',
          period_end: '2026-12-31',
        });
        return {
          message: '',
          cutoffDate: (await db.generalLedgerSetting.get('default'))?.cutoff_date,
        };
      } catch (error) {
        return {
          message: error instanceof Error ? error.message : String(error),
          cutoffDate: (await db.generalLedgerSetting.get('default'))?.cutoff_date,
        };
      }
    });

    expect(result.message).toContain('opening balance');
    expect(result.cutoffDate).toBe('2026-01-01T00:00:00.000');
  });

  test('OBA-05 - saldo awal akun posted terkunci dan tidak bisa di-post ulang', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await saveInitialAccountingSetupFixture(page, {
      currentPeriodStart: '2026-07-01',
      currentPeriodEnd: '2026-07-31',
    });

    await page.evaluate(async () => {
      const { db } = await import('/src/lib/db.ts');
      const { postAccountOpeningBalanceBatch } = await import('/src/services/openingBalanceService.ts');
      const accounts = await db.chartOfAccounts.toArray();
      const accountIdByCode = new Map(accounts.map((account) => [account.code, account.id]));
      const requireAccountId = (code: string) => {
        const accountId = accountIdByCode.get(code);
        if (!accountId) throw new Error(`Akun ${code} tidak tersedia untuk opening balance.`);
        return accountId;
      };

      await postAccountOpeningBalanceBatch({
        lines: [
          { account_id: requireAccountId('1010'), debit: 1000000, credit: 0 },
          { account_id: requireAccountId('3010'), debit: 0, credit: 1000000 },
        ],
      });
    });

    await page.goto('/finance/opening-balances/accounts');
    await expect(page.getByText('Opening balance sudah posted.')).toBeVisible();
    await expect(page.getByTestId('gl-opening-balance-debit-1010')).toBeDisabled();
    await expect(page.getByTestId('gl-opening-balance-save-draft-button')).toHaveCount(0);
    await expect(page.getByTestId('gl-opening-balance-post-button')).toBeDisabled();

    const result = await page.evaluate(async () => {
      const { db } = await import('/src/lib/db.ts');
      const {
        ACCOUNT_OPENING_BALANCE_SOURCE_EVENT,
        postAccountOpeningBalanceBatch,
      } = await import('/src/services/openingBalanceService.ts');
      const accounts = await db.chartOfAccounts.toArray();
      const accountIdByCode = new Map(accounts.map((account) => [account.code, account.id]));
      const requireAccountId = (code: string) => {
        const accountId = accountIdByCode.get(code);
        if (!accountId) throw new Error(`Akun ${code} tidak tersedia untuk opening balance.`);
        return accountId;
      };

      await postAccountOpeningBalanceBatch({
        lines: [
          { account_id: requireAccountId('1010'), debit: 1500000, credit: 0 },
          { account_id: requireAccountId('3010'), debit: 0, credit: 1500000 },
        ],
      });

      const batch = await db.openingBalanceBatches.get('opening-balance-account-2026-01-01');
      const setting = await db.generalLedgerSetting.get('default');
      const entries = await db.journalEntries
        .where('source_type')
        .equals('OPENING_BALANCE')
        .filter((entry) => entry.source_id === 'opening-balance-account-2026-01-01')
        .toArray();
      const activeEntry = entries.find(
        (entry) => entry.status === 'POSTED' && entry.source_event === ACCOUNT_OPENING_BALANCE_SOURCE_EVENT,
      );
      const lines = batch
        ? await db.openingBalanceLines.where('batch_id').equals(batch.id).toArray()
        : [];
      const openingFinanceTransactions = batch
        ? await db.financeTransactions
          .where('category')
          .equals('SALDO_AWAL')
          .filter((transaction) => (
            !transaction.deleted_at &&
            transaction.reference_id?.startsWith(`${batch.id}-line-`) === true
          ))
          .toArray()
        : [];
      const cashOpeningFinance = openingFinanceTransactions.find((transaction) => (
        transaction.cash_account_code === '1010'
      ));
      const financeBalance = await db.financeBalance.get('current');

      return {
        batchStatus: batch?.status,
        batchTotalDebit: batch?.total_debit,
        batchTotalCredit: batch?.total_credit,
        batchJournalEntryId: batch?.journal_entry_id,
        settingJournalEntryId: setting?.opening_balance_journal_id,
        activeTotalDebit: activeEntry?.total_debit,
        activeTotalCredit: activeEntry?.total_credit,
        activePostedEntryCount: entries.filter(
          (entry) => entry.status === 'POSTED' && entry.source_event === ACCOUNT_OPENING_BALANCE_SOURCE_EVENT,
        ).length,
        reversedEntryCount: entries.filter((entry) => entry.status === 'REVERSED').length,
        reversalEntryCount: entries.filter((entry) => entry.source_event === `${ACCOUNT_OPENING_BALANCE_SOURCE_EVENT}:REVERSAL`).length,
        cashLineDebit: lines.find((line) => line.account_code === '1010')?.debit,
        equityAdjustmentCredit: lines.find((line) => line.account_code === '3050')?.credit,
        openingFinanceTransactionCount: openingFinanceTransactions.length,
        cashOpeningFinanceAmount: cashOpeningFinance?.amount,
        cashOpeningFinanceAccountCode: cashOpeningFinance?.account_code,
        cashOpeningFinanceCashAccountCode: cashOpeningFinance?.cash_account_code,
        financeBalanceAmount: financeBalance?.amount,
      };
    });

    expect(result).toMatchObject({
      batchStatus: 'POSTED',
      batchTotalDebit: 1000000,
      batchTotalCredit: 1000000,
      activeTotalDebit: 1000000,
      activeTotalCredit: 1000000,
      activePostedEntryCount: 1,
      reversedEntryCount: 0,
      reversalEntryCount: 0,
      cashLineDebit: 1000000,
      openingFinanceTransactionCount: 1,
      cashOpeningFinanceAmount: 1000000,
      cashOpeningFinanceAccountCode: '1010',
      cashOpeningFinanceCashAccountCode: '1010',
      financeBalanceAmount: 1000000,
    });
    expect(result.batchJournalEntryId).toBe(result.settingJournalEntryId);
    expect(result.equityAdjustmentCredit ?? 0).toBe(0);
  });

  test('OBA-06 - koreksi modal pemilik setelah saldo awal akun posted', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await saveInitialAccountingSetupFixture(page);

    const result = await page.evaluate(async () => {
      const { db } = await import('/src/lib/db.ts');
      const {
        ACCOUNT_OPENING_BALANCE_ADJUSTMENT_SOURCE_EVENT,
        ACCOUNT_OPENING_BALANCE_SOURCE_EVENT,
        postAccountOpeningBalanceAdjustment,
        postAccountOpeningBalanceBatch,
      } = await import('/src/services/openingBalanceService.ts');
      const accounts = await db.chartOfAccounts.toArray();
      const accountIdByCode = new Map(accounts.map((account) => [account.code, account.id]));
      const requireAccountId = (code: string) => {
        const accountId = accountIdByCode.get(code);
        if (!accountId) throw new Error(`Akun ${code} tidak tersedia untuk opening balance.`);
        return accountId;
      };

      const batch = await postAccountOpeningBalanceBatch({
        lines: [
          { account_id: requireAccountId('1010'), debit: 1000000, credit: 0 },
        ],
      });
      const batchBefore = await db.openingBalanceBatches.get(batch.id);
      const openingLinesBefore = await db.openingBalanceLines.where('batch_id').equals(batch.id).toArray();

      const adjustmentEntry = await postAccountOpeningBalanceAdjustment({
        lines: [
          { account_id: requireAccountId('3050'), debit: 1000000, credit: 0, notes: 'Koreksi modal pemilik E2E' },
          { account_id: requireAccountId('3000'), debit: 0, credit: 1000000, notes: 'Koreksi modal pemilik E2E' },
        ],
        notes: 'Koreksi modal pemilik E2E',
      });

      const batchAfter = await db.openingBalanceBatches.get(batch.id);
      const openingLinesAfter = await db.openingBalanceLines.where('batch_id').equals(batch.id).toArray();
      const adjustmentLines = await db.journalEntryLines
        .where('journal_entry_id')
        .equals(adjustmentEntry.id)
        .toArray();
      const openingEntries = await db.journalEntries
        .where('source_type')
        .equals('OPENING_BALANCE')
        .filter((entry) => entry.source_id === batch.id || entry.source_id?.startsWith(`${batch.id}:adjustment:`) === true)
        .toArray();

      return {
        batchStatus: batchAfter?.status,
        batchJournalEntryIdBefore: batchBefore?.journal_entry_id,
        batchJournalEntryIdAfter: batchAfter?.journal_entry_id,
        batchTotalDebitBefore: batchBefore?.total_debit,
        batchTotalDebitAfter: batchAfter?.total_debit,
        batchTotalCreditBefore: batchBefore?.total_credit,
        batchTotalCreditAfter: batchAfter?.total_credit,
        openingLineCountBefore: openingLinesBefore.length,
        openingLineCountAfter: openingLinesAfter.length,
        openingEquityCredit: openingLinesAfter.find((line) => line.account_code === '3050')?.credit,
        adjustmentSourceId: adjustmentEntry.source_id,
        adjustmentSourceNumber: adjustmentEntry.source_number,
        adjustmentSourceEvent: adjustmentEntry.source_event,
        adjustmentTotalDebit: adjustmentEntry.total_debit,
        adjustmentTotalCredit: adjustmentEntry.total_credit,
        adjustmentEquityDebit: adjustmentLines.find((line) => line.account_code === '3050')?.debit,
        adjustmentOwnerCapitalCredit: adjustmentLines.find((line) => line.account_code === '3000')?.credit,
        adjustmentProfitLossLineCount: adjustmentLines.filter((line) => (
          line.account_type === 'REVENUE' ||
          line.account_type === 'CONTRA_REVENUE' ||
          line.account_type === 'EXPENSE'
        )).length,
        postedOpeningEntryCount: openingEntries.filter(
          (entry) => entry.status === 'POSTED' && entry.source_event === ACCOUNT_OPENING_BALANCE_SOURCE_EVENT,
        ).length,
        postedAdjustmentEntryCount: openingEntries.filter(
          (entry) => entry.status === 'POSTED' && entry.source_event === ACCOUNT_OPENING_BALANCE_ADJUSTMENT_SOURCE_EVENT,
        ).length,
        reversedEntryCount: openingEntries.filter((entry) => entry.status === 'REVERSED').length,
      };
    });

    expect(result).toMatchObject({
      batchStatus: 'POSTED',
      batchTotalDebitBefore: 1000000,
      batchTotalDebitAfter: 1000000,
      batchTotalCreditBefore: 1000000,
      batchTotalCreditAfter: 1000000,
      openingLineCountBefore: 2,
      openingLineCountAfter: 2,
      openingEquityCredit: 1000000,
      adjustmentSourceEvent: 'ACCOUNT_OPENING_BALANCE_ADJUSTMENT_POSTED',
      adjustmentTotalDebit: 1000000,
      adjustmentTotalCredit: 1000000,
      adjustmentEquityDebit: 1000000,
      adjustmentOwnerCapitalCredit: 1000000,
      adjustmentProfitLossLineCount: 0,
      postedOpeningEntryCount: 1,
      postedAdjustmentEntryCount: 1,
      reversedEntryCount: 0,
    });
    expect(result.batchJournalEntryIdAfter).toBe(result.batchJournalEntryIdBefore);
    expect(result.adjustmentSourceId).toContain('opening-balance-account-2026-01-01:adjustment:');
    expect(result.adjustmentSourceNumber).toBe('opening-balance-account-2026-01-01');
  });

  test('OBA-06B - koreksi saldo awal kas memperbarui saldo finance tanpa mengubah batch posted', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await saveInitialAccountingSetupFixture(page);

    const result = await page.evaluate(async () => {
      const { db } = await import('/src/lib/db.ts');
      const { FINANCE_CATEGORIES } = await import('/src/constants/finance.ts');
      const {
        postAccountOpeningBalanceAdjustment,
        postAccountOpeningBalanceBatch,
      } = await import('/src/services/openingBalanceService.ts');
      const { getTrialBalanceReport } = await import('/src/services/generalLedgerService.ts');
      const accounts = await db.chartOfAccounts.toArray();
      const accountIdByCode = new Map(accounts.map((account) => [account.code, account.id]));
      const requireAccountId = (code: string) => {
        const accountId = accountIdByCode.get(code);
        if (!accountId) throw new Error(`Akun ${code} tidak tersedia untuk opening balance.`);
        return accountId;
      };

      const batch = await postAccountOpeningBalanceBatch({
        lines: [
          { account_id: requireAccountId('1010'), debit: 1000000, credit: 0 },
        ],
      });
      const financeBalanceBefore = await db.financeBalance.get('current');

      const adjustmentEntry = await postAccountOpeningBalanceAdjustment({
        lines: [
          { account_id: requireAccountId('3050'), debit: 250000, credit: 0, notes: 'Koreksi kas saldo awal E2E' },
          { account_id: requireAccountId('1010'), debit: 0, credit: 250000, notes: 'Koreksi kas saldo awal E2E' },
        ],
        notes: 'Koreksi kas saldo awal E2E',
      });

      const batchAfter = await db.openingBalanceBatches.get(batch.id);
      const openingLinesAfter = await db.openingBalanceLines.where('batch_id').equals(batch.id).toArray();
      const adjustmentLines = await db.journalEntryLines
        .where('journal_entry_id')
        .equals(adjustmentEntry.id)
        .toArray();
      const adjustmentCashLine = adjustmentLines.find((line) => line.account_code === '1010');
      const financeTransactions = await db.financeTransactions
        .where('category')
        .equals(FINANCE_CATEGORIES.OPENING_BALANCE)
        .filter((transaction) => !transaction.deleted_at && transaction.cash_account_code === '1010')
        .toArray();
      const cashAdjustmentFinance = financeTransactions.find((transaction) => (
        transaction.reference_id === adjustmentCashLine?.id
      ));
      const financeBalanceAfter = await db.financeBalance.get('current');
      const trialBalance = await getTrialBalanceReport();
      const cashTrialRow = trialBalance.rows.find((row) => row.account_code === '1010');

      return {
        batchStatus: batchAfter?.status,
        batchTotalDebit: batchAfter?.total_debit,
        batchTotalCredit: batchAfter?.total_credit,
        openingLineCashDebit: openingLinesAfter.find((line) => line.account_code === '1010')?.debit,
        financeBalanceBefore: financeBalanceBefore?.amount,
        financeBalanceAfter: financeBalanceAfter?.amount,
        cashFinanceTransactionCount: financeTransactions.length,
        cashOpeningFinanceAmount: financeTransactions.find((transaction) => (
          transaction.reference_id?.startsWith(`${batch.id}-line-`) === true
        ))?.amount,
        cashAdjustmentFinanceAmount: cashAdjustmentFinance?.amount,
        cashAdjustmentFinanceType: cashAdjustmentFinance?.type,
        cashAdjustmentFinanceReferenceId: cashAdjustmentFinance?.reference_id,
        cashAdjustmentLineId: adjustmentCashLine?.id,
        cashTrialDebitBalance: cashTrialRow?.debit_balance,
        cashTrialCreditBalance: cashTrialRow?.credit_balance,
      };
    });

    expect(result).toMatchObject({
      batchStatus: 'POSTED',
      batchTotalDebit: 1000000,
      batchTotalCredit: 1000000,
      openingLineCashDebit: 1000000,
      financeBalanceBefore: 1000000,
      financeBalanceAfter: 750000,
      cashFinanceTransactionCount: 2,
      cashOpeningFinanceAmount: 1000000,
      cashAdjustmentFinanceAmount: -250000,
      cashAdjustmentFinanceType: 'OPENING_BALANCE',
      cashTrialDebitBalance: 750000,
      cashTrialCreditBalance: 0,
    });
    expect(result.cashAdjustmentFinanceReferenceId).toBe(result.cashAdjustmentLineId);
  });

  test('OB-03 - saldo awal piutang muncul di AR dan bisa dibayar sebagian lalu lunas', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await saveInitialAccountingSetupFixture(page, {
      enabledModules: [
        'PRODUCT',
        'CONTACT',
        'CURRENCY',
        'SALES_INVOICE',
        'RECEIVABLES',
        'CASH_FLOW',
        'CHART_OF_ACCOUNTS',
        'GENERAL_LEDGER',
        'REPORT_CASH_FLOW',
      ],
    });

    const result = await page.evaluate(async () => {
      const { createContact } = await import('/src/services/contactService.ts');
      const {
        postAccountOpeningBalanceBatch,
        postOpeningBalanceDetailBatch,
      } = await import('/src/services/openingBalanceService.ts');
      const {
        listAccountsReceivableRows,
        recordOpeningReceivablePayment,
      } = await import('/src/services/accountsReceivableService.ts');
      const { db } = await import('/src/lib/db.ts');

      const accounts = await db.chartOfAccounts.toArray();
      const accountIdByCode = new Map(accounts.map((account) => [account.code, account.id]));
      const requireAccountId = (code: string) => {
        const accountId = accountIdByCode.get(code);
        if (!accountId) throw new Error(`Akun ${code} tidak tersedia.`);
        return accountId;
      };

      await postAccountOpeningBalanceBatch({
        lines: [
          { account_id: requireAccountId('1010'), debit: 1000000, credit: 0 },
          { account_id: requireAccountId('3010'), debit: 0, credit: 1000000 },
        ],
      });

      const customer = await createContact({
        name: 'PT Saldo Awal Piutang E2E',
        contact_type: 'CUSTOMER',
      });

      const batch = await postOpeningBalanceDetailBatch({
        module: 'RECEIVABLE',
        lines: [{
          contact_id: customer.id,
          party_name: customer.name,
          document_number: 'OBR-E2E-001',
          document_date: '2026-01-01T00:00:00.000',
          due_date: '2026-01-31T00:00:00.000',
          currency_code: 'IDR',
          fx_rate: 1,
          amount: 1000000,
          notes: 'E2E saldo awal piutang',
        }],
      });

      const afterPostRows = await listAccountsReceivableRows({ search: 'OBR-E2E-001' });
      const postedRow = afterPostRows[0];
      if (!postedRow?.opening_balance_line_id) {
        throw new Error('Row saldo awal piutang tidak muncul di read model AR.');
      }

      const firstPayment = await recordOpeningReceivablePayment(postedRow.opening_balance_line_id, {
        amount: 400000,
        paid_at: '2026-02-01T00:00:00.000',
        payment_method: 'TUNAI',
      });
      const afterPartialRows = await listAccountsReceivableRows({ search: 'OBR-E2E-001' });

      const secondPayment = await recordOpeningReceivablePayment(postedRow.opening_balance_line_id, {
        amount: 600000,
        paid_at: '2026-02-02T00:00:00.000',
        payment_method: 'TUNAI',
      });
      const afterPaidRows = await listAccountsReceivableRows({ search: 'OBR-E2E-001' });
      const line = await db.openingBalanceLines.get(postedRow.opening_balance_line_id);
      const paymentJournals = await db.journalEntries
        .where('source_type')
        .equals('OPENING_BALANCE')
        .filter((entry) => [firstPayment.id, secondPayment.id].includes(entry.source_id ?? ''))
        .toArray();

      return {
        batchStatus: batch.status,
        batchTotalDebit: batch.total_debit,
        batchTotalCredit: batch.total_credit,
        afterPost: afterPostRows[0],
        afterPartial: afterPartialRows[0],
        afterPaid: afterPaidRows[0],
        lineSettlementStatus: line?.settlement_status,
        linePaidAmount: line?.paid_amount,
        lineRemainingAmount: line?.remaining_amount,
        paymentJournalEvents: paymentJournals.map((entry) => entry.source_event).sort(),
        paymentJournalBalances: paymentJournals
          .map((entry) => ({
            debit: entry.total_debit,
            credit: entry.total_credit,
          }))
          .sort((left, right) => left.debit - right.debit),
      };
    });

    expect(result.batchStatus).toBe('POSTED');
    expect(result.batchTotalDebit).toBe(1000000);
    expect(result.batchTotalCredit).toBe(1000000);
    expect(result.afterPost).toMatchObject({
      source_type: 'OPENING_RECEIVABLE',
      is_opening_balance: true,
      payment_status: 'UNPAID',
      balance_due: 1000000,
    });
    expect(result.afterPartial).toMatchObject({
      payment_status: 'PARTIAL',
      paid_amount: 400000,
      balance_due: 600000,
    });
    expect(result.afterPaid).toMatchObject({
      payment_status: 'PAID',
      paid_amount: 1000000,
      balance_due: 0,
    });
    expect(result.lineSettlementStatus).toBe('PAID');
    expect(result.linePaidAmount).toBe(1000000);
    expect(result.lineRemainingAmount).toBe(0);
    expect(result.paymentJournalEvents).toEqual([
      'OPENING_RECEIVABLE_PAYMENT_POSTED',
      'OPENING_RECEIVABLE_PAYMENT_POSTED',
    ]);
    expect(result.paymentJournalBalances).toEqual([
      { debit: 400000, credit: 400000 },
      { debit: 600000, credit: 600000 },
    ]);

    await page.goto('/finance/receivables');
    await page.getByPlaceholder('Cari invoice atau customer').fill('OBR-E2E-001');
    await expect(page.getByText('OBR-E2E-001')).toBeVisible();
    await expect(page.getByRole('table').getByText('Saldo Awal', { exact: true })).toBeVisible();
  });

  test('OB-04 - saldo awal hutang muncul di AP dan bisa dibayar sebagian lalu lunas', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await saveInitialAccountingSetupFixture(page, {
      enabledModules: [
        'PRODUCT',
        'CONTACT',
        'CURRENCY',
        'PURCHASE_INVOICE',
        'PAYABLES',
        'CASH_FLOW',
        'CHART_OF_ACCOUNTS',
        'GENERAL_LEDGER',
        'REPORT_CASH_FLOW',
      ],
    });

    const result = await page.evaluate(async () => {
      const { createContact } = await import('/src/services/contactService.ts');
      const {
        postAccountOpeningBalanceBatch,
        postOpeningBalanceDetailBatch,
      } = await import('/src/services/openingBalanceService.ts');
      const {
        listAccountsPayableRows,
        recordOpeningPayablePayment,
      } = await import('/src/services/accountsPayableService.ts');
      const { db } = await import('/src/lib/db.ts');

      const accounts = await db.chartOfAccounts.toArray();
      const accountIdByCode = new Map(accounts.map((account) => [account.code, account.id]));
      const requireAccountId = (code: string) => {
        const accountId = accountIdByCode.get(code);
        if (!accountId) throw new Error(`Akun ${code} tidak tersedia.`);
        return accountId;
      };

      await postAccountOpeningBalanceBatch({
        lines: [
          { account_id: requireAccountId('1010'), debit: 1000000, credit: 0 },
          { account_id: requireAccountId('3010'), debit: 0, credit: 1000000 },
        ],
      });

      const supplier = await createContact({
        name: 'PT Saldo Awal Hutang E2E',
        contact_type: 'SUPPLIER',
      });

      const batch = await postOpeningBalanceDetailBatch({
        module: 'PAYABLE',
        lines: [{
          contact_id: supplier.id,
          party_name: supplier.name,
          document_number: 'OBP-E2E-001',
          document_date: '2026-01-01T00:00:00.000',
          due_date: '2026-01-31T00:00:00.000',
          currency_code: 'IDR',
          fx_rate: 1,
          amount: 1000000,
          notes: 'E2E saldo awal hutang',
        }],
      });

      const afterPostRows = await listAccountsPayableRows({ search: 'OBP-E2E-001' });
      const postedRow = afterPostRows[0];
      if (!postedRow?.opening_balance_line_id) {
        throw new Error('Row saldo awal hutang tidak muncul di read model AP.');
      }

      const firstPayment = await recordOpeningPayablePayment(postedRow.opening_balance_line_id, {
        amount: 400000,
        paid_at: '2026-02-01T00:00:00.000',
        payment_method: 'TUNAI',
      });
      const afterPartialRows = await listAccountsPayableRows({ search: 'OBP-E2E-001' });

      const secondPayment = await recordOpeningPayablePayment(postedRow.opening_balance_line_id, {
        amount: 600000,
        paid_at: '2026-02-02T00:00:00.000',
        payment_method: 'TUNAI',
      });
      const afterPaidRows = await listAccountsPayableRows({ search: 'OBP-E2E-001' });
      const line = await db.openingBalanceLines.get(postedRow.opening_balance_line_id);
      const paymentJournals = await db.journalEntries
        .where('source_type')
        .equals('OPENING_BALANCE')
        .filter((entry) => [firstPayment.id, secondPayment.id].includes(entry.source_id ?? ''))
        .toArray();

      return {
        batchStatus: batch.status,
        batchTotalDebit: batch.total_debit,
        batchTotalCredit: batch.total_credit,
        afterPost: afterPostRows[0],
        afterPartial: afterPartialRows[0],
        afterPaid: afterPaidRows[0],
        lineSettlementStatus: line?.settlement_status,
        linePaidAmount: line?.paid_amount,
        lineRemainingAmount: line?.remaining_amount,
        paymentJournalEvents: paymentJournals.map((entry) => entry.source_event).sort(),
        paymentJournalBalances: paymentJournals
          .map((entry) => ({
            debit: entry.total_debit,
            credit: entry.total_credit,
          }))
          .sort((left, right) => left.debit - right.debit),
      };
    });

    expect(result.batchStatus).toBe('POSTED');
    expect(result.batchTotalDebit).toBe(1000000);
    expect(result.batchTotalCredit).toBe(1000000);
    expect(result.afterPost).toMatchObject({
      source_type: 'OPENING_PAYABLE',
      is_opening_balance: true,
      payment_status: 'UNPAID',
      balance_due: 1000000,
    });
    expect(result.afterPartial).toMatchObject({
      payment_status: 'PARTIAL',
      paid_amount: 400000,
      balance_due: 600000,
    });
    expect(result.afterPaid).toMatchObject({
      payment_status: 'PAID',
      paid_amount: 1000000,
      balance_due: 0,
    });
    expect(result.lineSettlementStatus).toBe('PAID');
    expect(result.linePaidAmount).toBe(1000000);
    expect(result.lineRemainingAmount).toBe(0);
    expect(result.paymentJournalEvents).toEqual([
      'OPENING_PAYABLE_PAYMENT_POSTED',
      'OPENING_PAYABLE_PAYMENT_POSTED',
    ]);
    expect(result.paymentJournalBalances).toEqual([
      { debit: 400000, credit: 400000 },
      { debit: 600000, credit: 600000 },
    ]);

    await page.goto('/finance/payables');
    await page.getByPlaceholder('Cari invoice atau supplier').fill('OBP-E2E-001');
    await expect(page.getByText('OBP-E2E-001')).toBeVisible();
    await expect(page.getByRole('table').getByText('Saldo Awal', { exact: true })).toBeVisible();
  });

  test('OB-05 - saldo awal uang muka masuk dan keluar posted dengan akun khusus dan trace jurnal', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await saveInitialAccountingSetupFixture(page, {
      enabledModules: [
        'PRODUCT',
        'CONTACT',
        'CURRENCY',
        'SALES_INVOICE',
        'PURCHASE_INVOICE',
        'CASH_FLOW',
        'CHART_OF_ACCOUNTS',
        'GENERAL_LEDGER',
        'REPORT_CASH_FLOW',
      ],
    });

    const result = await page.evaluate(async () => {
      const { createContact } = await import('/src/services/contactService.ts');
      const {
        postAccountOpeningBalanceBatch,
        postOpeningBalanceDetailBatch,
      } = await import('/src/services/openingBalanceService.ts');
      const {
        getOpeningAdvanceBalanceReport,
        listOpeningAdvanceBalanceRows,
        recordOpeningAdvanceSettlement,
      } = await import('/src/services/openingAdvanceBalanceService.ts');
      const { db } = await import('/src/lib/db.ts');

      const accounts = await db.chartOfAccounts.toArray();
      const accountIdByCode = new Map(accounts.map((account) => [account.code, account.id]));
      const requireAccountId = (code: string) => {
        const accountId = accountIdByCode.get(code);
        if (!accountId) throw new Error(`Akun ${code} tidak tersedia.`);
        return accountId;
      };

      await postAccountOpeningBalanceBatch({
        lines: [
          { account_id: requireAccountId('1010'), debit: 1000000, credit: 0 },
          { account_id: requireAccountId('3010'), debit: 0, credit: 1000000 },
        ],
      });

      const customer = await createContact({
        name: 'PT Uang Muka Masuk E2E',
        contact_type: 'CUSTOMER',
      });
      const supplier = await createContact({
        name: 'PT Uang Muka Keluar E2E',
        contact_type: 'SUPPLIER',
      });

      const receivedBatch = await postOpeningBalanceDetailBatch({
        module: 'ADVANCE_RECEIVED',
        lines: [{
          contact_id: customer.id,
          party_name: customer.name,
          document_number: 'OBAR-E2E-001',
          document_date: '2026-01-01T00:00:00.000',
          currency_code: 'IDR',
          fx_rate: 1,
          amount: 700000,
          notes: 'E2E saldo awal uang muka masuk',
        }],
      });
      const paidBatch = await postOpeningBalanceDetailBatch({
        module: 'ADVANCE_PAID',
        lines: [{
          contact_id: supplier.id,
          party_name: supplier.name,
          document_number: 'OBAP-E2E-001',
          document_date: '2026-01-01T00:00:00.000',
          currency_code: 'IDR',
          fx_rate: 1,
          amount: 450000,
          notes: 'E2E saldo awal uang muka keluar',
        }],
      });

      const [receivedRows, paidRows, allRows] = await Promise.all([
        listOpeningAdvanceBalanceRows({ module: 'ADVANCE_RECEIVED', search: 'OBAR-E2E-001' }),
        listOpeningAdvanceBalanceRows({ module: 'ADVANCE_PAID', search: 'OBAP-E2E-001' }),
        listOpeningAdvanceBalanceRows({ search: 'E2E' }),
      ]);
      const advanceLines = await db.openingBalanceLines
        .where('batch_id')
        .anyOf([receivedBatch.id, paidBatch.id])
        .toArray();
      const receivedLine = advanceLines.find((line) => line.module === 'ADVANCE_RECEIVED');
      const paidLine = advanceLines.find((line) => line.module === 'ADVANCE_PAID');
      if (!receivedLine || !paidLine) {
        throw new Error('Line saldo awal uang muka tidak lengkap.');
      }

      const receivedSettlement = await recordOpeningAdvanceSettlement(receivedLine.id, {
        amount: 250000,
        settlement_account_id: requireAccountId('4010'),
        settled_at: '2026-01-15T00:00:00.000',
        notes: 'Settlement parsial uang muka masuk E2E',
      });
      const paidSettlement = await recordOpeningAdvanceSettlement(paidLine.id, {
        amount: 450000,
        settlement_account_id: requireAccountId('6900'),
        settled_at: '2026-01-16T00:00:00.000',
        notes: 'Settlement penuh uang muka keluar E2E',
      });
      const advanceReport = await getOpeningAdvanceBalanceReport({ search: 'E2E' });
      const settledAdvanceLines = await db.openingBalanceLines
        .where('batch_id')
        .anyOf([receivedBatch.id, paidBatch.id])
        .toArray();
      const journalEntries = await db.journalEntries
        .where('source_type')
        .equals('OPENING_BALANCE')
        .filter((entry) => [receivedBatch.id, paidBatch.id].includes(entry.source_id ?? ''))
        .toArray();
      const settlementJournalEntries = await db.journalEntries
        .where('source_type')
        .equals('OPENING_BALANCE')
        .filter((entry) => entry.source_event?.includes('OPENING_BALANCE_SETTLED') ?? false)
        .toArray();
      const syncQueueEntities = (await db.syncQueue.toArray()).map((item) => item.entity);

      return {
        receivedBatch: {
          status: receivedBatch.status,
          totalDebit: receivedBatch.total_debit,
          totalCredit: receivedBatch.total_credit,
        },
        paidBatch: {
          status: paidBatch.status,
          totalDebit: paidBatch.total_debit,
          totalCredit: paidBatch.total_credit,
        },
        receivedLine,
        paidLine,
        settledReceivedLine: settledAdvanceLines.find((line) => line.module === 'ADVANCE_RECEIVED'),
        settledPaidLine: settledAdvanceLines.find((line) => line.module === 'ADVANCE_PAID'),
        receivedRow: receivedRows[0],
        paidRow: paidRows[0],
        receivedSettlementRow: receivedSettlement.row,
        paidSettlementRow: paidSettlement.row,
        advanceReportSummary: advanceReport.summary,
        allRowCount: allRows.length,
        journalEvents: journalEntries.map((entry) => entry.source_event).sort(),
        settlementJournalEvents: settlementJournalEntries.map((entry) => entry.source_event).sort(),
        settlementJournalBalances: Object.fromEntries(settlementJournalEntries.map((entry) => [
          entry.source_event,
          { debit: entry.total_debit, credit: entry.total_credit },
        ])),
        syncQueueEntities,
      };
    });

    expect(result.receivedBatch).toMatchObject({
      status: 'POSTED',
      totalDebit: 700000,
      totalCredit: 700000,
    });
    expect(result.paidBatch).toMatchObject({
      status: 'POSTED',
      totalDebit: 450000,
      totalCredit: 450000,
    });
    expect(result.receivedLine).toMatchObject({
      account_code: '2210',
      account_name: 'Uang Muka Diterima',
      credit: 700000,
      settlement_status: 'OPEN',
    });
    expect(result.paidLine).toMatchObject({
      account_code: '1310',
      account_name: 'Uang Muka Dibayar',
      debit: 450000,
      settlement_status: 'OPEN',
    });
    expect(result.receivedRow).toMatchObject({
      module: 'ADVANCE_RECEIVED',
      direction: 'IN',
      document_number: 'OBAR-E2E-001',
      remaining_amount: 700000,
    });
    expect(result.paidRow).toMatchObject({
      module: 'ADVANCE_PAID',
      direction: 'OUT',
      document_number: 'OBAP-E2E-001',
      remaining_amount: 450000,
    });
    expect(result.receivedSettlementRow).toMatchObject({
      settlement_status: 'PARTIAL',
      paid_amount: 250000,
      remaining_amount: 450000,
    });
    expect(result.paidSettlementRow).toMatchObject({
      settlement_status: 'PAID',
      paid_amount: 450000,
      remaining_amount: 0,
    });
    expect(result.settledReceivedLine).toMatchObject({
      settlement_status: 'PARTIAL',
      paid_amount: 250000,
      remaining_amount: 450000,
    });
    expect(result.settledPaidLine).toMatchObject({
      settlement_status: 'PAID',
      paid_amount: 450000,
      remaining_amount: 0,
    });
    expect(result.advanceReportSummary).toMatchObject({
      total_count: 2,
      total_base_amount: 1150000,
      total_settled_amount: 700000,
      total_remaining_amount: 450000,
      advance_received_remaining_amount: 450000,
      advance_paid_remaining_amount: 0,
      partial_count: 1,
      paid_count: 1,
    });
    expect(result.allRowCount).toBeGreaterThanOrEqual(2);
    expect(result.journalEvents).toEqual([
      'ADVANCE_PAID_OPENING_BALANCE_POSTED',
      'ADVANCE_RECEIVED_OPENING_BALANCE_POSTED',
    ]);
    expect(result.settlementJournalEvents).toEqual([
      'ADVANCE_PAID_OPENING_BALANCE_SETTLED',
      'ADVANCE_RECEIVED_OPENING_BALANCE_SETTLED',
    ]);
    expect(result.settlementJournalBalances).toMatchObject({
      ADVANCE_RECEIVED_OPENING_BALANCE_SETTLED: { debit: 250000, credit: 250000 },
      ADVANCE_PAID_OPENING_BALANCE_SETTLED: { debit: 450000, credit: 450000 },
    });
    expect(result.syncQueueEntities).toEqual(expect.arrayContaining(['openingBalanceBatches']));
  });

  test('AIS-SETUP-06 - periode berjalan di luar periode fiskal ditolak tanpa write parsial', async ({ page }) => {
    await loginAsBootstrappedOwner(page);

    const errorMessage = await page.evaluate(async () => {
      const { saveInitialAccountingSetup } = await import('/src/services/accountingInitialSetupService.ts');
      const { db } = await import('/src/lib/db.ts');
      const [setupBefore, periodCountBefore, fiscalYearCountBefore] = await Promise.all([
        db.accountingInitialSetupSetting.get('default'),
        db.accountingPeriods.count(),
        db.accountingFiscalYears.count(),
      ]);

      try {
        await saveInitialAccountingSetup({
          enabledModules: ['CASH_FLOW', 'CHART_OF_ACCOUNTS', 'GENERAL_LEDGER'],
          configuredBy: 'e2e-invalid-period',
          business_template_code: 'RETAIL',
          cutoff_date: '2026-01-01',
          fiscal_period_start: '2026-01-01',
          fiscal_period_end: '2026-12-31',
          current_period_start: '2027-01-01',
          current_period_end: '2027-01-31',
          base_currency_code: 'IDR',
        });
        return '';
      } catch (error) {
        const [setupAfter, periodCountAfter, fiscalYearCountAfter] = await Promise.all([
          db.accountingInitialSetupSetting.get('default'),
          db.accountingPeriods.count(),
          db.accountingFiscalYears.count(),
        ]);
        if (
          JSON.stringify(setupAfter) !== JSON.stringify(setupBefore) ||
          periodCountAfter !== periodCountBefore ||
          fiscalYearCountAfter !== fiscalYearCountBefore
        ) {
          return 'unexpected setup snapshot write';
        }
        return error instanceof Error ? error.message : String(error);
      }
    });

    expect(errorMessage).toContain('Periode berjalan harus berada di dalam periode fiskal.');
  });

  test('AIS-SETUP-05 dan idempotency - save ulang tidak duplicate dan guard menolak ganti baseline setelah transaksi', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await saveInitialAccountingSetupFixture(page);
    const before = await readAccountingSetupRegressionState(page);

    await saveInitialAccountingSetupFixture(page);
    const afterResave = await readAccountingSetupRegressionState(page);
    expect(afterResave.counts).toEqual(before.counts);

    await createFinanceTransactionLockSignal(page);

    const guardMessages = await page.evaluate(async () => {
      const { saveInitialAccountingSetup } = await import('/src/services/accountingInitialSetupService.ts');
      const input = {
        enabledModules: ['CASH_FLOW', 'CHART_OF_ACCOUNTS', 'GENERAL_LEDGER'],
        configuredBy: 'e2e-guard',
        cutoff_date: '2026-01-01',
        fiscal_period_start: '2026-01-01',
        fiscal_period_end: '2026-12-31',
        current_period_start: '2026-01-01',
        current_period_end: '2026-12-31',
      };
      const messages: string[] = [];

      try {
        await saveInitialAccountingSetup({
          ...input,
          business_template_code: 'COOPERATIVE',
          base_currency_code: 'IDR',
        });
      } catch (error) {
        messages.push(error instanceof Error ? error.message : String(error));
      }

      try {
        await saveInitialAccountingSetup({
          ...input,
          business_template_code: 'RETAIL',
          base_currency_code: 'USD',
        });
      } catch (error) {
        messages.push(error instanceof Error ? error.message : String(error));
      }

      return messages;
    });

    expect(guardMessages[0]).toContain('Jenis bisnis sudah terkunci');
    expect(guardMessages[1]).toContain('Base currency sudah terkunci');

    await page.goto('/settings');
    await expect(page.getByText(/Baseline akuntansi sudah terkunci/)).toBeVisible();

    await page.goto('/finance/chart-of-accounts');
    await page.getByRole('tab', { name: 'Mapping & Template' }).click();
    await expect(page.getByText('Template akuntansi terkunci')).toBeVisible();

    await page.goto('/master-data/currencies');
    await expect(page.getByText('Base currency terkunci')).toBeVisible();
  });
});
