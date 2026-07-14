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
    await expect(page.getByText('Setup Cutoff dan Opening Balance')).toBeVisible();
    await expect(page.getByText('1 Januari 2026 00:00').first()).toBeVisible();
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
  });

  test('AIS-SETUP-04 - cutoff ditolak setelah opening balance posted', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await saveInitialAccountingSetupFixture(page);

    await page.evaluate(async () => {
      const { db } = await import('/src/lib/db.ts');
      const { postOpeningBalanceJournal } = await import('/src/services/generalLedgerService.ts');
      const accounts = await db.chartOfAccounts.toArray();
      const accountIdByCode = new Map(accounts.map((account) => [account.code, account.id]));
      const requireAccountId = (code: string) => {
        const accountId = accountIdByCode.get(code);
        if (!accountId) throw new Error(`Akun ${code} tidak tersedia untuk opening balance.`);
        return accountId;
      };

      await postOpeningBalanceJournal({
        cutoff_date: '2026-01-01T00:00:00.000',
        inventory_policy: 'PERPETUAL_INVENTORY',
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

  test('AIS-SETUP-06 - periode berjalan di luar periode fiskal ditolak tanpa write parsial', async ({ page }) => {
    await loginAsBootstrappedOwner(page);

    const errorMessage = await page.evaluate(async () => {
      const { saveInitialAccountingSetup } = await import('/src/services/accountingInitialSetupService.ts');
      const { db } = await import('/src/lib/db.ts');

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
        const setup = await db.accountingInitialSetupSetting.get('default');
        if (setup) return 'unexpected setup snapshot write';
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
