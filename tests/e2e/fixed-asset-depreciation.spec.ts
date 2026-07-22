import { expect, test } from '@playwright/test';
import { loginAsBootstrappedOwner } from './helpers/auth';
import { saveInitialAccountingSetupFixture } from './helpers/accounting';

test.describe.serial('penyusutan aset tetap', () => {
  test('FA-01 sampai FA-08 - aset baru/lama, posting idempotent, closing, reversal, dan snapshot', async ({ page }) => {
    await loginAsBootstrappedOwner(page);
    await saveInitialAccountingSetupFixture(page, {
      enabledModules: ['CURRENCY', 'CHART_OF_ACCOUNTS', 'GENERAL_LEDGER', 'FIXED_ASSET'],
      cutoffDate: '2026-01-01',
      fiscalPeriodStart: '2026-01-01',
      fiscalPeriodEnd: '2026-12-31',
      currentPeriodStart: '2026-02-01',
      currentPeriodEnd: '2026-02-28',
    });

    const result = await page.evaluate(async () => {
      const { db } = await import('/src/lib/db.ts');
      const {
        createDepreciationRunDraft,
        createFixedAsset,
        getFixedAssetPostedLines,
        postDepreciationRun,
        reverseDepreciationRun,
        updateFixedAsset,
      } = await import('/src/services/fixedAssetService.ts');
      const { getClosingPreview } = await import('/src/services/closingRunService.ts');
      const { calculateFixedAssetPosition } = await import('/src/utils/fixedAssets/calculateDepreciation.ts');

      const accounts = await db.chartOfAccounts.toArray();
      const account = (code: string) => {
        const match = accounts.find((item) => item.code === code && item.is_active && item.is_postable);
        if (!match) throw new Error(`Akun ${code} tidak tersedia.`);
        return match;
      };
      const assetAccount = account('1510');
      const accumulatedAccount = account('1590');
      const expenseAccount = account('6080');
      const period = (await db.accountingPeriods.toArray()).find((item) => (
        item.period_type === 'MONTHLY' && item.start_date === '2026-02-01' && item.end_date === '2026-02-28'
      ));
      if (!period) throw new Error('Periode bulanan fixture tidak tersedia.');
      const now = new Date().toISOString();
      await db.accountingPeriods.add({
        id: 'e2e-period-2026-01',
        name: 'Periode Jan 2026',
        period_type: 'MONTHLY',
        start_date: '2026-01-01',
        end_date: '2026-01-31',
        status: 'CLOSED',
        created_at: now,
        updated_at: now,
      });

      const common = {
        category: 'OFFICE_EQUIPMENT' as const,
        acquisition_cost: 12_000_000,
        residual_value: 0,
        useful_life_months: 12,
        asset_account_id: assetAccount.id,
        accumulated_depreciation_account_id: accumulatedAccount.id,
        depreciation_expense_account_id: expenseAccount.id,
        is_active: true,
      };
      const newAsset = await createFixedAsset({
        ...common,
        asset_code: 'ast-e2e-new',
        name: 'Laptop Finance',
        registration_type: 'NEW',
        acquisition_date: '2026-01-10',
        available_for_use_date: '2026-01-15',
        opening_accumulated_depreciation: 0,
      });
      let duplicateCodeError = '';
      try {
        await createFixedAsset({
          ...common,
          asset_code: 'AST-E2E-NEW',
          name: 'Duplikat',
          registration_type: 'NEW',
          acquisition_date: '2026-01-10',
          available_for_use_date: '2026-01-15',
          opening_accumulated_depreciation: 0,
        });
      } catch (error) {
        duplicateCodeError = error instanceof Error ? error.message : String(error);
      }
      let invalidAccountError = '';
      try {
        await createFixedAsset({
          ...common,
          asset_code: 'AST-E2E-BAD-ACCOUNT',
          name: 'Akun Tidak Valid',
          registration_type: 'NEW',
          acquisition_date: '2026-01-10',
          available_for_use_date: '2026-01-15',
          opening_accumulated_depreciation: 0,
          accumulated_depreciation_account_id: assetAccount.id,
        });
      } catch (error) {
        invalidAccountError = error instanceof Error ? error.message : String(error);
      }
      let closedBaselineError = '';
      try {
        await createFixedAsset({
          ...common,
          asset_code: 'AST-E2E-BAD-BASELINE',
          name: 'Baseline Tidak Valid',
          registration_type: 'EXISTING',
          acquisition_date: '2025-01-10',
          available_for_use_date: '2025-01-15',
          opening_balance_date: '2025-12-31',
          opening_accumulated_depreciation: 3_000_000,
          opening_remaining_useful_life_months: 9,
        });
      } catch (error) {
        closedBaselineError = error instanceof Error ? error.message : String(error);
      }
      const existingAsset = await createFixedAsset({
        ...common,
        asset_code: 'ast-e2e-old',
        name: 'Printer Lama',
        registration_type: 'EXISTING',
        acquisition_date: '2025-01-10',
        available_for_use_date: '2025-01-15',
        opening_balance_date: '2026-01-31',
        opening_accumulated_depreciation: 4_000_000,
        opening_remaining_useful_life_months: 8,
      });

      const financeTransactionsBefore = await db.financeTransactions.count();
      const journalsBefore = await db.journalEntries.count();
      const closingBefore = await getClosingPreview(period.id);
      const draft = await createDepreciationRunDraft(period.id, 'E2E Februari');
      const draftLines = await db.fixedAssetDepreciationRunLines.where('run_id').equals(draft.id).toArray();
      const posted = await postDepreciationRun(draft.id);
      const postedAgain = await postDepreciationRun(draft.id);
      const closingAfterPost = await getClosingPreview(period.id);

      const editedAsset = await updateFixedAsset(newAsset.id, {
        ...common,
        asset_code: newAsset.asset_code,
        name: 'Laptop Finance Diedit',
        registration_type: 'NEW',
        acquisition_date: newAsset.acquisition_date,
        available_for_use_date: newAsset.available_for_use_date,
        opening_accumulated_depreciation: 0,
      });
      let lockedFieldError = '';
      try {
        await updateFixedAsset(newAsset.id, {
          ...common,
          acquisition_cost: 13_000_000,
          asset_code: newAsset.asset_code,
          name: editedAsset.name,
          registration_type: 'NEW',
          acquisition_date: newAsset.acquisition_date,
          available_for_use_date: newAsset.available_for_use_date,
          opening_accumulated_depreciation: 0,
        });
      } catch (error) {
        lockedFieldError = error instanceof Error ? error.message : String(error);
      }

      const reversed = await reverseDepreciationRun(posted.id, 'Koreksi data E2E');
      const reversedAgain = await reverseDepreciationRun(posted.id, 'Koreksi data E2E');
      const closingAfterReversal = await getClosingPreview(period.id);
      const replacementDraft = await createDepreciationRunDraft(period.id, 'Draft pengganti E2E');
      const replacement = await postDepreciationRun(replacementDraft.id);
      const closingAfterReplacement = await getClosingPreview(period.id);
      await db.accountingPeriods.update(period.id, { status: 'CLOSED', updated_at: new Date().toISOString() });
      const editedAfterClose = await updateFixedAsset(newAsset.id, {
        ...common,
        asset_code: newAsset.asset_code,
        name: 'Laptop Finance Setelah Closing',
        registration_type: 'NEW',
        acquisition_date: newAsset.acquisition_date,
        available_for_use_date: newAsset.available_for_use_date,
        opening_accumulated_depreciation: 0,
      });

      const [allJournals, allJournalLines, allRuns, allRunLines, postedLines] = await Promise.all([
        db.journalEntries.where('source_type').equals('FIXED_ASSET_DEPRECIATION').toArray(),
        db.journalEntryLines.toArray(),
        db.fixedAssetDepreciationRuns.toArray(),
        db.fixedAssetDepreciationRunLines.toArray(),
        getFixedAssetPostedLines(),
      ]);
      const journalLines = allJournalLines.filter((line) => allJournals.some((journal) => journal.id === line.journal_entry_id));
      const debit = journalLines.reduce((sum, line) => sum + line.debit, 0);
      const credit = journalLines.reduce((sum, line) => sum + line.credit, 0);
      const originalSnapshot = allRunLines.find((line) => line.run_id === posted.id && line.asset_id === newAsset.id);
      const replacementSnapshot = allRunLines.find((line) => line.run_id === replacement.id && line.asset_id === newAsset.id);
      const newPosition = calculateFixedAssetPosition(editedAsset, postedLines, period.end_date);
      const oldPosition = calculateFixedAssetPosition(existingAsset, postedLines, period.end_date);
      const fixedCheck = (preview: Awaited<ReturnType<typeof getClosingPreview>>) => (
        preview.prechecks.find((item) => item.key === 'fixed_asset_depreciation_posted')?.ok
      );

      return {
        normalizedCodes: [newAsset.asset_code, existingAsset.asset_code],
        regularAmounts: [newAsset.regular_depreciation_amount, existingAsset.regular_depreciation_amount],
        draftAssetCount: draft.asset_count,
        draftTotal: draft.total_depreciation,
        draftLineCount: draftLines.length,
        postingIdempotent: posted.id === postedAgain.id,
        reversalIdempotent: reversed.id === reversedAgain.id,
        lockedFieldError,
        duplicateCodeError,
        invalidAccountError,
        closedBaselineError,
        originalSnapshotName: originalSnapshot?.asset_name,
        replacementSnapshotName: replacementSnapshot?.asset_name,
        editableFieldAfterClose: editedAfterClose.name,
        fixedClosingBefore: fixedCheck(closingBefore),
        fixedClosingAfterPost: fixedCheck(closingAfterPost),
        fixedClosingAfterReversal: fixedCheck(closingAfterReversal),
        fixedClosingAfterReplacement: fixedCheck(closingAfterReplacement),
        statuses: allRuns.sort((left, right) => left.run_number.localeCompare(right.run_number)).map((run) => run.status),
        journalCount: allJournals.length,
        journalBalanced: debit === credit,
        financeTransactionsUnchanged: financeTransactionsBefore === await db.financeTransactions.count(),
        journalCreatedOnlyOnPosting: journalsBefore === 0,
        newAccumulated: newPosition.accumulatedDepreciation,
        oldAccumulated: oldPosition.accumulatedDepreciation,
        newBookValue: newPosition.bookValue,
      };
    });

    expect(result).toMatchObject({
      normalizedCodes: ['AST-E2E-NEW', 'AST-E2E-OLD'],
      regularAmounts: [1_000_000, 1_000_000],
      draftAssetCount: 2,
      draftTotal: 2_000_000,
      draftLineCount: 2,
      postingIdempotent: true,
      reversalIdempotent: true,
      originalSnapshotName: 'Laptop Finance',
      replacementSnapshotName: 'Laptop Finance Diedit',
      editableFieldAfterClose: 'Laptop Finance Setelah Closing',
      fixedClosingBefore: false,
      fixedClosingAfterPost: true,
      fixedClosingAfterReversal: false,
      fixedClosingAfterReplacement: true,
      statuses: ['REVERSED', 'POSTED'],
      journalCount: 3,
      journalBalanced: true,
      financeTransactionsUnchanged: true,
      journalCreatedOnlyOnPosting: true,
      newAccumulated: 1_000_000,
      oldAccumulated: 5_000_000,
      newBookValue: 11_000_000,
    });
    expect(result.lockedFieldError).toContain('tidak dapat diubah');
    expect(result.duplicateCodeError).toContain('sudah digunakan');
    expect(result.invalidAccountError).toContain('normal balance kredit');
    expect(result.closedBaselineError).toContain('periode tertutup terakhir');

    await page.goto('/master-data');
    await expect(page.getByText('Aset Tetap', { exact: true })).toBeVisible();
    await page.goto('/master-data/fixed-assets');
    await expect(page.getByText('Daftar Aset', { exact: true })).toBeVisible();
    await page.getByPlaceholder('Cari kode, nama, atau lokasi aset').fill('AST-E2E-NEW');
    await expect(page.getByRole('row', { name: /AST-E2E-NEW/ })).toContainText('Laptop Finance Setelah Closing');
    await page.getByRole('tab', { name: 'Proses Penyusutan' }).click();
    await expect(page.getByRole('button', { name: 'DEP-202602-0002' })).toBeVisible();
    await expect(page.getByText('Posted', { exact: true }).first()).toBeVisible();
  });
});
