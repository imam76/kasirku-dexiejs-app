import { expect, test } from '@playwright/test';
import { loginAsBootstrappedOwner } from './helpers/auth';
import {
  expectGeneralLedgerReportsReady,
  saveInitialAccountingSetupFixture,
} from './helpers/accounting';

test.describe.serial('tutup buku periode dan tahun fiskal', () => {
  test('CLS-01 - period close manual, fiscal close journal, dan saldo awal periode berikutnya computed', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await saveInitialAccountingSetupFixture(page, {
      fiscalPeriodStart: '2026-01-01',
      fiscalPeriodEnd: '2026-02-28',
      currentPeriodStart: '2026-01-01',
      currentPeriodEnd: '2026-01-31',
    });

    await page.evaluate(async () => {
      const { db } = await import('/src/lib/db.ts');
      const {
        markOpeningBalanceModuleSkipped,
        postAccountOpeningBalanceBatch,
      } = await import('/src/services/openingBalanceService.ts');
      const accounts = await db.chartOfAccounts.toArray();
      const cash = accounts.find((account) => account.code === '1010' && account.is_postable);
      const bank = accounts.find((account) => account.code === '1020' && account.is_postable);
      const equity = accounts.find((account) => account.type === 'EQUITY' && account.is_postable);
      if (!cash || !bank || !equity) throw new Error('Akun saldo awal fixture tidak lengkap.');

      await postAccountOpeningBalanceBatch({
        lines: [
          { account_id: cash.id, debit: 4000000, credit: 0 },
          { account_id: bank.id, debit: 1000000, credit: 0 },
          { account_id: equity.id, debit: 0, credit: 5000000 },
        ],
      });
      await markOpeningBalanceModuleSkipped('RECEIVABLE', 'Tidak ada saldo awal piutang untuk fixture closing.');
      await markOpeningBalanceModuleSkipped('PAYABLE', 'Tidak ada saldo awal hutang untuk fixture closing.');
      await markOpeningBalanceModuleSkipped('ADVANCE_RECEIVED', 'Tidak ada saldo awal uang muka masuk untuk fixture closing.');
      await markOpeningBalanceModuleSkipped('ADVANCE_PAID', 'Tidak ada saldo awal uang muka keluar untuk fixture closing.');
    });

    await expectGeneralLedgerReportsReady(page);

    await page.evaluate(async () => {
      const { db } = await import('/src/lib/db.ts');
      const { postBalancedJournalEntry } = await import('/src/services/generalLedgerService.ts');
      const accounts = await db.chartOfAccounts.toArray();
      const cash = accounts.find((account) => account.code === '1010' && account.is_postable);
      const revenue = accounts.find((account) => account.type === 'REVENUE' && account.is_postable);
      if (!cash || !revenue) throw new Error('Akun kas atau pendapatan tidak tersedia.');

      await postBalancedJournalEntry({
        source_type: 'MANUAL_JOURNAL',
        source_id: 'e2e-fiscal-close-revenue',
        source_number: 'E2E-FISCAL-CLOSE',
        source_event: 'MANUAL_JOURNAL_POSTED',
        entry_date: '2026-01-15',
        description: 'Pendapatan fixture tutup fiskal E2E',
        lines: [
          { account: cash, debit: 500000, description: 'Kas dari pendapatan E2E' },
          { account: revenue, credit: 500000, description: 'Pendapatan E2E' },
        ],
      });
    });

    await page.goto('/finance/closing');
    await expect(page.getByText('Tutup Buku Periode & Tahun Fiskal').first()).toBeVisible();

    const januaryRow = page.getByRole('row', { name: /Periode Jan 2026/ });
    await expect(januaryRow).toBeVisible();
    await expect(januaryRow.getByText('Terbuka')).toBeVisible();

    await januaryRow.getByRole('button', { name: 'Kunci', exact: true }).click();
    await expect(januaryRow.getByText('Terkunci')).toBeVisible();
    await januaryRow.getByRole('button', { name: 'Tutup Buku', exact: true }).click();
    await expect(page.getByText('Preview Tutup Periode')).toBeVisible();
    await expect(page.getByText('Tidak ada jurnal penutup yang dibuat.')).toBeVisible();
    await expect(page.getByTestId('gl-closing-post')).toBeEnabled();
    await page.getByTestId('gl-closing-post').click();
    await expect(page.getByRole('row', { name: /Periode Jan 2026/ }).getByText('Ditutup')).toBeVisible();

    const openingState = await page.evaluate(async () => {
      const { db } = await import('/src/lib/db.ts');
      const { getTrialBalanceReport } = await import('/src/services/generalLedgerService.ts');
      const cash = await db.chartOfAccounts.where('code').equals('1010').first();
      if (!cash) throw new Error('Akun kas tidak tersedia.');
      const february = await db.accountingPeriods
        .filter((period) => period.start_date.slice(0, 10) === '2026-02-01')
        .first();
      const report = await getTrialBalanceReport({
        startDate: '2026-02-01',
        endDate: '2026-02-28',
        accountId: cash.id,
      });
      const cashRow = report.rows.find((row) => row.account_id === cash.id);
      const january = await db.accountingPeriods
        .filter((period) => period.start_date.slice(0, 10) === '2026-01-01')
        .first();
      const januaryClosingRuns = january
        ? await db.closingRuns.where('period_id').equals(january.id).toArray()
        : [];
      const januaryClosingJournalCount = january
        ? await db.journalEntries
          .where('source_type')
          .equals('CLOSING_JOURNAL')
          .filter((entry) => entry.source_id === january.id)
          .count()
        : 0;

      return {
        nextPeriodStatus: february?.status,
        openingBalance: cashRow?.opening_balance ?? 0,
        januaryClosingJournalCount,
        periodClosingRunStatus: januaryClosingRuns[0]?.status,
        periodClosingJournalEntryId: januaryClosingRuns[0]?.closing_journal_entry_id,
      };
    });
    expect(openingState).toMatchObject({
      nextPeriodStatus: 'OPEN',
      januaryClosingJournalCount: 0,
      periodClosingRunStatus: 'POSTED',
    });
    expect(openingState.periodClosingJournalEntryId).toBeFalsy();
    expect(openingState.openingBalance).toBeGreaterThan(0);

    const februaryRow = page.getByRole('row', { name: /Periode Feb 2026/ });
    await expect(februaryRow).toBeVisible();
    await februaryRow.getByRole('button', { name: 'Kunci', exact: true }).click();
    await expect(februaryRow.getByText('Terkunci')).toBeVisible();
    await februaryRow.getByRole('button', { name: 'Tutup Buku', exact: true }).click();
    await expect(page.getByText('Preview Tutup Periode')).toBeVisible();
    await page.getByTestId('gl-closing-post').click();
    await expect(page.getByRole('row', { name: /Periode Feb 2026/ }).getByText('Ditutup')).toBeVisible();

    await page.getByRole('tab', { name: 'Tahun Fiskal' }).click();
    const fiscalYearRow = page.getByRole('row', { name: /Tahun Fiskal 2026/ });
    await expect(fiscalYearRow).toBeVisible();
    await fiscalYearRow.getByRole('button', { name: 'Tutup Tahun Fiskal', exact: true }).click();
    await expect(page.getByText('Preview Tutup Tahun Fiskal')).toBeVisible();
    await expect(page.getByText('Jurnal Penutup', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Posting Tutup Tahun Fiskal' }).click();
    await expect(page.getByRole('row', { name: /Tahun Fiskal 2026/ }).getByText('Ditutup')).toBeVisible();

    const fiscalState = await page.evaluate(async () => {
      const { db } = await import('/src/lib/db.ts');
      const { getBalanceSheetReport, getIncomeStatementReport } = await import('/src/services/generalLedgerService.ts');
      const fiscalYear = await db.accountingFiscalYears
        .filter((item) => item.start_date.slice(0, 10) === '2026-01-01')
        .first();
      const fiscalRuns = fiscalYear
        ? await db.fiscalYearClosingRuns.where('fiscal_year_id').equals(fiscalYear.id).toArray()
        : [];
      const closingJournals = await db.journalEntries
        .where('source_type')
        .equals('CLOSING_JOURNAL')
        .toArray();
      const income = await getIncomeStatementReport({
        startDate: '2026-01-01',
        endDate: '2026-02-28',
      });
      const balanceSheet = await getBalanceSheetReport({ endDate: '2026-02-28' });

      return {
        fiscalYearStatus: fiscalYear?.status,
        fiscalRunStatus: fiscalRuns[0]?.status,
        fiscalRunJournalId: fiscalRuns[0]?.closing_journal_entry_id,
        closingJournalCount: closingJournals.length,
        netIncome: income.net_income,
        balanceSheetBalanced: balanceSheet.is_balanced,
      };
    });

    expect(fiscalState).toMatchObject({
      fiscalYearStatus: 'CLOSED',
      fiscalRunStatus: 'POSTED',
      closingJournalCount: 1,
      netIncome: 500000,
      balanceSheetBalanced: true,
    });
    expect(fiscalState.fiscalRunJournalId).toBeTruthy();
  });
});
