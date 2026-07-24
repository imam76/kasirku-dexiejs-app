import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import { getSetupConfig } from '@/services/setupKeyService';
import { getFixedAssetPostedLines } from '@/services/fixedAssetService';
import { calculateDepreciationForPeriod } from '@/utils/fixedAssets/calculateDepreciation';
import {
  buildFiscalYearName,
  buildNextFiscalYearRange,
  bumpFiscalYearSync,
  findOrCreateAccountingFiscalYear,
} from '@/services/accountingFiscalYearService';
import {
  buildClosingJournalPreview,
  createClosingJournalEntry,
  getIncomeStatementReport,
  getRetainedEarningsAccount,
  getTrialBalanceReport,
  reverseClosingJournalEntry,
  type ClosingJournalPreview,
  type IncomeStatementReport,
  type TrialBalanceReport,
} from '@/services/generalLedgerService';
import {
  enqueueAccountingFiscalYearSync,
  enqueueAccountingPeriodSync,
  enqueueClosingRunSync,
  enqueueFiscalYearClosingRunSync,
} from '@/services/syncQueueService';
import type {
  AccountingFiscalYear,
  AccountingPeriod,
  AuthUser,
  ClosingRun,
  FiscalYearClosingRun,
} from '@/types';

type ClosingRunActor = Pick<AuthUser, 'id' | 'name'> | null | undefined;

export interface ClosingPrecheck {
  key: string;
  ok: boolean;
  blocking: boolean;
  message: string;
}

export interface PeriodClosingPreviewResult {
  period: AccountingPeriod;
  trial_balance: TrialBalanceReport;
  income_statement: IncomeStatementReport;
  prechecks: ClosingPrecheck[];
  can_post: boolean;
}

export interface FiscalYearClosingPreviewResult {
  fiscal_year: AccountingFiscalYear;
  preview: ClosingJournalPreview;
  trial_balance: TrialBalanceReport;
  income_statement: IncomeStatementReport;
  prechecks: ClosingPrecheck[];
  can_post: boolean;
}

export type ClosingPreviewResult = PeriodClosingPreviewResult;

const toDateOnly = (value: string) => value.slice(0, 10);

const bumpPeriodSync = (
  period: AccountingPeriod,
  actor: ClosingRunActor,
  updatedAt: string,
): AccountingPeriod => ({
  ...period,
  version: Math.max(1, Number(period.version || 1)) + 1,
  updated_by: actor?.id ?? period.updated_by,
  updated_by_name: actor?.name ?? period.updated_by_name,
  updated_at: updatedAt,
  sync_status: 'pending',
  sync_error: undefined,
});

const getPeriodOrThrow = async (periodId: string): Promise<AccountingPeriod> => {
  const period = await db.accountingPeriods.get(periodId);
  if (!period || period.deleted_at) {
    throw new Error('Periode tidak ditemukan.');
  }
  return period;
};

const getFiscalYearOrThrow = async (fiscalYearId: string): Promise<AccountingFiscalYear> => {
  const fiscalYear = await db.accountingFiscalYears.get(fiscalYearId);
  if (!fiscalYear || fiscalYear.deleted_at) {
    throw new Error('Tahun fiskal tidak ditemukan.');
  }
  return fiscalYear;
};

const getActivePostedClosingRun = async (periodId: string): Promise<ClosingRun | undefined> => {
  const runs = await db.closingRuns.where('period_id').equals(periodId).toArray();
  return runs.find((run) => !run.deleted_at && run.status === 'POSTED');
};

const getActivePostedFiscalYearClosingRun = async (
  fiscalYearId: string,
): Promise<FiscalYearClosingRun | undefined> => {
  const runs = await db.fiscalYearClosingRuns.where('fiscal_year_id').equals(fiscalYearId).toArray();
  return runs.find((run) => !run.deleted_at && run.status === 'POSTED');
};

const countUnhealthyQueueItems = async () => {
  const items = await db.syncQueue.toArray();
  const failed = items.filter((item) => item.status === 'failed').length;
  const pending = items.filter((item) => item.status === 'pending' || item.status === 'processing').length;
  return { failed, pending };
};

const hasDraftJournalInRange = async (startDate: string, endDate: string) => {
  const start = toDateOnly(startDate);
  const end = toDateOnly(endDate);
  const entries = await db.journalEntries.toArray();
  return entries.some((entry) => (
    entry.status === 'DRAFT' &&
    !entry.deleted_at &&
    toDateOnly(entry.entry_date) >= start &&
    toDateOnly(entry.entry_date) <= end
  ));
};

const getPeriodsWithinFiscalYear = async (fiscalYear: AccountingFiscalYear) => {
  const start = toDateOnly(fiscalYear.start_date);
  const end = toDateOnly(fiscalYear.end_date);
  const periods = await db.accountingPeriods.toArray();
  return periods
    .filter((period) => (
      !period.deleted_at &&
      toDateOnly(period.start_date) >= start &&
      toDateOnly(period.end_date) <= end
    ))
    .sort((left, right) => left.start_date.localeCompare(right.start_date));
};

const buildPeriodName = (
  startDate: string,
  endDate: string,
  periodType: AccountingPeriod['period_type'],
) => {
  if (periodType === 'MONTHLY') {
    return `Periode ${dayjs(startDate).format('MMM YYYY')}`;
  }

  const startYear = startDate.slice(0, 4);
  const endYear = endDate.slice(0, 4);
  return startYear === endYear
    ? `Tahun Buku ${startYear}`
    : `Tahun Buku ${startYear}-${endYear}`;
};

const buildNextAccountingPeriodRange = (period: AccountingPeriod) => {
  const nextStart = dayjs(toDateOnly(period.end_date)).add(1, 'day');
  const nextEnd = period.period_type === 'MONTHLY'
    ? nextStart.endOf('month')
    : nextStart.add(1, 'year').subtract(1, 'day');

  return {
    start: nextStart.format('YYYY-MM-DD'),
    end: nextEnd.format('YYYY-MM-DD'),
  };
};

const findOrCreateNextAccountingPeriod = async (
  period: AccountingPeriod,
  actor: ClosingRunActor,
  now: string,
) => {
  const range = buildNextAccountingPeriodRange(period);
  const periods = await db.accountingPeriods.toArray();
  const activePeriods = periods.filter((item) => !item.deleted_at);
  const exactPeriod = activePeriods.find((item) => (
    toDateOnly(item.start_date) === range.start &&
    toDateOnly(item.end_date) === range.end
  ));
  const overlappingPeriod = activePeriods.find((item) => (
    item.id !== exactPeriod?.id &&
    range.start <= toDateOnly(item.end_date) &&
    toDateOnly(item.start_date) <= range.end
  ));

  if (overlappingPeriod) {
    throw new Error(
      `Periode berikutnya tumpang tindih dengan "${overlappingPeriod.name}" (${toDateOnly(overlappingPeriod.start_date)} s/d ${toDateOnly(overlappingPeriod.end_date)}).`,
    );
  }

  if (exactPeriod) {
    return {
      period: exactPeriod,
      operation: undefined,
    };
  }

  const nextPeriod: AccountingPeriod = {
    id: crypto.randomUUID(),
    name: buildPeriodName(range.start, range.end, period.period_type),
    period_type: period.period_type,
    start_date: range.start,
    end_date: range.end,
    status: 'OPEN',
    notes: `Periode otomatis dibuat setelah tutup buku ${period.name}.`,
    version: 1,
    created_by: actor?.id,
    created_by_name: actor?.name,
    updated_by: actor?.id,
    updated_by_name: actor?.name,
    created_at: now,
    updated_at: now,
    sync_status: 'pending',
    sync_error: undefined,
  };

  await db.accountingPeriods.add(nextPeriod);
  return {
    period: nextPeriod,
    operation: 'create' as const,
  };
};

const buildCommonPrechecks = async (): Promise<ClosingPrecheck[]> => {
  const prechecks: ClosingPrecheck[] = [];
  const module = await db.enabledModules.get('GENERAL_LEDGER');
  const setting = await db.generalLedgerSetting.get('default');
  prechecks.push({
    key: 'general_ledger_ready',
    ok: Boolean(module?.is_enabled && setting?.is_ready),
    blocking: true,
    message: 'General Ledger aktif dan baseline awal sudah siap.',
  });

  const { failed, pending } = await countUnhealthyQueueItems();
  prechecks.push({
    key: 'sync_queue_no_failed',
    ok: failed === 0,
    blocking: true,
    message: 'Tidak ada sync queue yang gagal (failed).',
  });
  prechecks.push({
    key: 'sync_queue_settled',
    ok: pending === 0,
    blocking: false,
    message: 'Sync queue sudah tersinkron (tidak ada item pending).',
  });

  return prechecks;
};

const buildPeriodPrechecks = async (
  period: AccountingPeriod,
  trialBalance: TrialBalanceReport,
): Promise<ClosingPrecheck[]> => {
  const prechecks = await buildCommonPrechecks();
  const existingPosted = await getActivePostedClosingRun(period.id);
  prechecks.push({
    key: 'not_yet_closed',
    ok: period.status !== 'CLOSED' && !existingPosted,
    blocking: true,
    message: 'Periode belum pernah ditutup (tidak ada period closing run POSTED).',
  });
  prechecks.push({
    key: 'period_locked',
    ok: period.status === 'LOCKED',
    blocking: true,
    message: 'Periode sudah dikunci (LOCKED) sebelum tutup buku.',
  });
  prechecks.push({
    key: 'trial_balance_balanced',
    ok: trialBalance.is_balanced,
    blocking: true,
    message: 'Trial balance periode seimbang (debit = kredit).',
  });

  const draft = await hasDraftJournalInRange(period.start_date, period.end_date);
  prechecks.push({
    key: 'no_draft_journal',
    ok: !draft,
    blocking: true,
    message: 'Tidak ada jurnal draft/unposted di periode ini.',
  });

  const setup = getSetupConfig();
  const fixedAssetModuleEnabled = !setup || setup.enabledModules.includes('FIXED_ASSET');
  if (fixedAssetModuleEnabled && period.period_type === 'MONTHLY') {
    const [assets, postedLines, periodRuns] = await Promise.all([
      db.fixedAssets.filter((asset) => !asset.deleted_at && asset.is_active).toArray(),
      getFixedAssetPostedLines(),
      db.fixedAssetDepreciationRuns.where('period_id').equals(period.id).toArray(),
    ]);
    const linesBeforePeriod = postedLines.filter((line) => !line.period_end || line.period_end < period.start_date);
    const eligibleAssetIds = assets
      .filter((asset) => calculateDepreciationForPeriod(asset, linesBeforePeriod, period).eligible)
      .map((asset) => asset.id);
    const postedRunIds = new Set(periodRuns
      .filter((run) => !run.deleted_at && run.status === 'POSTED')
      .map((run) => run.id));
    const coveredAssetIds = new Set((await db.fixedAssetDepreciationRunLines.toArray())
      .filter((line) => postedRunIds.has(line.run_id))
      .map((line) => line.asset_id));
    const complete = eligibleAssetIds.every((assetId) => coveredAssetIds.has(assetId));
    prechecks.push({
      key: 'fixed_asset_depreciation_posted',
      ok: eligibleAssetIds.length === 0 || complete,
      blocking: true,
      message: eligibleAssetIds.length === 0
        ? 'Tidak ada aset tetap eligible yang perlu disusutkan pada periode ini.'
        : 'Penyusutan seluruh aset tetap eligible sudah diposting untuk periode ini.',
    });
  } else {
    prechecks.push({
      key: 'fixed_asset_depreciation_posted',
      ok: true,
      blocking: true,
      message: 'Module Aset Tetap tidak aktif; pre-check penyusutan dilewati.',
    });
  }

  return prechecks;
};

const buildFiscalYearPrechecks = async (
  fiscalYear: AccountingFiscalYear,
  preview: ClosingJournalPreview,
  trialBalance: TrialBalanceReport,
): Promise<ClosingPrecheck[]> => {
  const prechecks = await buildCommonPrechecks();
  const existingPosted = await getActivePostedFiscalYearClosingRun(fiscalYear.id);
  const periods = await getPeriodsWithinFiscalYear(fiscalYear);
  const allPeriodsClosed = periods.length > 0 && periods.every((period) => period.status === 'CLOSED');

  prechecks.push({
    key: 'fiscal_year_open',
    ok: fiscalYear.status === 'OPEN' && !existingPosted,
    blocking: true,
    message: 'Tahun fiskal masih OPEN dan belum memiliki closing run POSTED.',
  });
  prechecks.push({
    key: 'periods_closed',
    ok: allPeriodsClosed,
    blocking: true,
    message: 'Semua periode operasional dalam tahun fiskal sudah CLOSED.',
  });
  prechecks.push({
    key: 'trial_balance_balanced',
    ok: trialBalance.is_balanced,
    blocking: true,
    message: 'Trial balance tahun fiskal seimbang (debit = kredit).',
  });
  prechecks.push({
    key: 'closing_preview_balanced',
    ok: preview.is_balanced,
    blocking: true,
    message: 'Jurnal penutup tahun fiskal seimbang.',
  });

  const draft = await hasDraftJournalInRange(fiscalYear.start_date, fiscalYear.end_date);
  prechecks.push({
    key: 'no_draft_journal',
    ok: !draft,
    blocking: true,
    message: 'Tidak ada jurnal draft/unposted di tahun fiskal ini.',
  });

  return prechecks;
};

export const getClosingPreview = async (periodId: string): Promise<PeriodClosingPreviewResult> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'PERIOD_CLOSE');

  const period = await getPeriodOrThrow(periodId);
  const filters = {
    startDate: toDateOnly(period.start_date),
    endDate: toDateOnly(period.end_date),
    includeClosingEntries: true,
  };

  const [trialBalance, incomeStatement] = await Promise.all([
    getTrialBalanceReport(filters),
    getIncomeStatementReport(filters),
  ]);
  const prechecks = await buildPeriodPrechecks(period, trialBalance);
  const canPost = prechecks.every((precheck) => !precheck.blocking || precheck.ok);

  return {
    period,
    trial_balance: trialBalance,
    income_statement: incomeStatement,
    prechecks,
    can_post: canPost,
  };
};

export const getFiscalYearClosingPreview = async (
  fiscalYearId: string,
): Promise<FiscalYearClosingPreviewResult> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'PERIOD_CLOSE');

  const fiscalYear = await getFiscalYearOrThrow(fiscalYearId);
  const filters = {
    startDate: toDateOnly(fiscalYear.start_date),
    endDate: toDateOnly(fiscalYear.end_date),
  };

  const [preview, trialBalance, incomeStatement] = await Promise.all([
    buildClosingJournalPreview(filters),
    getTrialBalanceReport({ ...filters, includeClosingEntries: true }),
    getIncomeStatementReport(filters),
  ]);
  const prechecks = await buildFiscalYearPrechecks(fiscalYear, preview, trialBalance);
  const canPost = prechecks.every((precheck) => !precheck.blocking || precheck.ok);

  return {
    fiscal_year: fiscalYear,
    preview,
    trial_balance: trialBalance,
    income_statement: incomeStatement,
    prechecks,
    can_post: canPost,
  };
};

export interface PostClosingRunInput {
  period_id: string;
  notes?: string;
}

export const postClosingRun = async (input: PostClosingRunInput): Promise<ClosingRun> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'PERIOD_CLOSE');

  const now = new Date().toISOString();
  let closingRun!: ClosingRun;
  let closedPeriod!: AccountingPeriod;
  let nextPeriodChange: { record: AccountingPeriod; operation: 'create' } | undefined;

  const previewResult = await getClosingPreview(input.period_id);
  if (!previewResult.can_post) {
    const blocker = previewResult.prechecks.find((precheck) => precheck.blocking && !precheck.ok);
    throw new Error(`Pre-check tutup buku periode gagal: ${blocker?.message ?? 'periksa kembali data periode.'}`);
  }

  await db.transaction(
    'rw',
    [db.accountingPeriods, db.closingRuns, db.chartOfAccounts, db.activityLogs],
    async () => {
      const period = await getPeriodOrThrow(input.period_id);
      if (period.status !== 'LOCKED') {
        throw new Error('Periode harus berstatus LOCKED sebelum tutup buku.');
      }
      const existingPosted = await getActivePostedClosingRun(period.id);
      if (existingPosted) {
        throw new Error('Periode ini sudah memiliki period closing run POSTED.');
      }

      const retainedEarningsAccount = await getRetainedEarningsAccount();
      closingRun = {
        id: crypto.randomUUID(),
        period_id: period.id,
        period_name: period.name,
        start_date: toDateOnly(period.start_date),
        end_date: toDateOnly(period.end_date),
        status: 'POSTED',
        retained_earning_account_id: retainedEarningsAccount.id,
        retained_earning_account_code: retainedEarningsAccount.code,
        retained_earning_account_name: retainedEarningsAccount.name,
        net_income_amount: 0,
        total_revenue_amount: 0,
        total_contra_revenue_amount: 0,
        total_expense_amount: 0,
        posted_at: now,
        notes: input.notes?.trim() || undefined,
        version: 1,
        created_by: currentUser?.id,
        created_by_name: currentUser?.name,
        updated_by: currentUser?.id,
        updated_by_name: currentUser?.name,
        created_at: now,
        updated_at: now,
        sync_status: 'pending',
        sync_error: undefined,
      };
      await db.closingRuns.add(closingRun);

      closedPeriod = bumpPeriodSync({
        ...period,
        status: 'CLOSED',
        closed_at: now,
        closed_by: currentUser?.id,
        closed_by_name: currentUser?.name,
        closing_journal_entry_id: undefined,
      }, currentUser, now);
      await db.accountingPeriods.put(closedPeriod);

      const nextPeriod = await findOrCreateNextAccountingPeriod(period, currentUser, now);
      if (nextPeriod.operation) {
        nextPeriodChange = {
          record: nextPeriod.period,
          operation: nextPeriod.operation,
        };
      }

      await writeActivityLog({
        user: currentUser,
        action: 'PERIOD_CLOSING_POSTED',
        entity: 'closingRuns',
        entity_id: closingRun.id,
        description: `${currentUser?.name ?? 'User'} menutup periode ${period.name}.`,
      });
    },
  );

  await enqueueAccountingPeriodSync(closedPeriod, 'update');
  if (nextPeriodChange) {
    await enqueueAccountingPeriodSync(nextPeriodChange.record, nextPeriodChange.operation);
  }
  await enqueueClosingRunSync(closingRun, 'update');

  return closingRun;
};

export interface PostFiscalYearClosingRunInput {
  fiscal_year_id: string;
  notes?: string;
}

export const postFiscalYearClosingRun = async (
  input: PostFiscalYearClosingRunInput,
): Promise<FiscalYearClosingRun> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'PERIOD_CLOSE');

  const now = new Date().toISOString();
  let closingRun!: FiscalYearClosingRun;
  let closedFiscalYear!: AccountingFiscalYear;
  let nextFiscalYearChange: { record: AccountingFiscalYear; operation: 'create' } | undefined;

  const previewResult = await getFiscalYearClosingPreview(input.fiscal_year_id);
  if (!previewResult.can_post) {
    const blocker = previewResult.prechecks.find((precheck) => precheck.blocking && !precheck.ok);
    throw new Error(`Pre-check tutup buku tahun fiskal gagal: ${blocker?.message ?? 'periksa kembali data tahun fiskal.'}`);
  }

  await db.transaction(
    'rw',
    [
      db.accountingFiscalYears,
      db.fiscalYearClosingRuns,
      db.accountingPeriods,
      db.journalEntries,
      db.journalEntryLines,
      db.chartOfAccounts,
      db.activityLogs,
    ],
    async () => {
      const fiscalYear = await getFiscalYearOrThrow(input.fiscal_year_id);
      if (fiscalYear.status !== 'OPEN') {
        throw new Error('Tahun fiskal harus berstatus OPEN sebelum tutup buku.');
      }
      const existingPosted = await getActivePostedFiscalYearClosingRun(fiscalYear.id);
      if (existingPosted) {
        throw new Error('Tahun fiskal ini sudah memiliki closing run POSTED.');
      }

      const periods = await getPeriodsWithinFiscalYear(fiscalYear);
      if (periods.length === 0 || periods.some((period) => period.status !== 'CLOSED')) {
        throw new Error('Semua periode operasional dalam tahun fiskal harus CLOSED sebelum tutup buku tahunan.');
      }

      const preview = await buildClosingJournalPreview({
        startDate: toDateOnly(fiscalYear.start_date),
        endDate: toDateOnly(fiscalYear.end_date),
      });
      if (!preview.is_balanced) {
        throw new Error('Jurnal penutup tahun fiskal tidak seimbang. Tutup buku dibatalkan.');
      }

      const closingEntry = preview.lines.length >= 2
        ? await createClosingJournalEntry({
          periodId: fiscalYear.id,
          periodName: fiscalYear.name,
          entryDate: toDateOnly(fiscalYear.end_date),
          lines: preview.lines,
          actor: currentUser,
        })
        : undefined;

      closingRun = {
        id: crypto.randomUUID(),
        fiscal_year_id: fiscalYear.id,
        fiscal_year_name: fiscalYear.name,
        start_date: toDateOnly(fiscalYear.start_date),
        end_date: toDateOnly(fiscalYear.end_date),
        status: 'POSTED',
        retained_earning_account_id: preview.retained_earning_account_id,
        retained_earning_account_code: preview.retained_earning_account_code,
        retained_earning_account_name: preview.retained_earning_account_name,
        net_income_amount: preview.net_income_amount,
        total_revenue_amount: preview.total_revenue_amount,
        total_contra_revenue_amount: preview.total_contra_revenue_amount,
        total_expense_amount: preview.total_expense_amount,
        closing_journal_entry_id: closingEntry?.id,
        posted_at: now,
        notes: input.notes?.trim() || undefined,
        version: 1,
        created_by: currentUser?.id,
        created_by_name: currentUser?.name,
        updated_by: currentUser?.id,
        updated_by_name: currentUser?.name,
        created_at: now,
        updated_at: now,
        sync_status: 'pending',
        sync_error: undefined,
      };
      await db.fiscalYearClosingRuns.add(closingRun);

      closedFiscalYear = bumpFiscalYearSync({
        ...fiscalYear,
        status: 'CLOSED',
        closed_at: now,
        closed_by: currentUser?.id,
        closed_by_name: currentUser?.name,
        closing_journal_entry_id: closingEntry?.id,
      }, currentUser, now);
      await db.accountingFiscalYears.put(closedFiscalYear);

      const nextRange = buildNextFiscalYearRange(fiscalYear);
      const nextFiscalYear = await findOrCreateAccountingFiscalYear({
        fiscalStart: nextRange.start,
        fiscalEnd: nextRange.end,
        now,
        actorId: currentUser?.id,
        actorName: currentUser?.name,
        notes: `Tahun fiskal otomatis dibuat setelah tutup buku ${fiscalYear.name}.`,
      });
      if (nextFiscalYear.operation) {
        nextFiscalYearChange = {
          record: nextFiscalYear.fiscalYear,
          operation: nextFiscalYear.operation,
        };
      }

      await writeActivityLog({
        user: currentUser,
        action: 'FISCAL_YEAR_CLOSING_POSTED',
        entity: 'fiscalYearClosingRuns',
        entity_id: closingRun.id,
        description: `${currentUser?.name ?? 'User'} menutup tahun fiskal ${fiscalYear.name}. Laba/SHU: ${preview.net_income_amount}.`,
      });
    },
  );

  await enqueueAccountingFiscalYearSync(closedFiscalYear, 'update');
  if (nextFiscalYearChange) {
    await enqueueAccountingFiscalYearSync(nextFiscalYearChange.record, nextFiscalYearChange.operation);
  }
  await enqueueFiscalYearClosingRunSync(closingRun, 'update');

  return closingRun;
};

export interface ReopenPeriodInput {
  period_id: string;
  reason: string;
}

export const reopenClosedPeriod = async (input: ReopenPeriodInput): Promise<AccountingPeriod> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'PERIOD_REOPEN');

  const reason = input.reason.trim();
  if (!reason) {
    throw new Error('Alasan reopen wajib diisi.');
  }

  const { failed } = await countUnhealthyQueueItems();
  if (failed > 0) {
    throw new Error('Ada sync queue yang gagal. Selesaikan sync sebelum reopen periode.');
  }

  const now = new Date().toISOString();
  let reopenedPeriod!: AccountingPeriod;
  let reversedRun: ClosingRun | undefined;

  await db.transaction(
    'rw',
    [db.accountingPeriods, db.closingRuns, db.activityLogs],
    async () => {
      const period = await getPeriodOrThrow(input.period_id);
      if (period.status !== 'CLOSED') {
        throw new Error('Hanya periode CLOSED yang bisa dibuka ulang.');
      }

      const postedRun = await getActivePostedClosingRun(period.id);
      if (postedRun) {
        reversedRun = {
          ...postedRun,
          status: 'REVERSED',
          reversed_at: now,
          reversed_by: currentUser?.id,
          reversed_by_name: currentUser?.name,
          reversal_reason: reason,
          version: Math.max(1, Number(postedRun.version || 1)) + 1,
          updated_by: currentUser?.id,
          updated_by_name: currentUser?.name,
          updated_at: now,
          sync_status: 'pending',
          sync_error: undefined,
        };
        await db.closingRuns.put(reversedRun);
      }

      reopenedPeriod = bumpPeriodSync({
        ...period,
        status: 'OPEN',
        closing_journal_entry_id: undefined,
        closed_at: undefined,
        closed_by: undefined,
        closed_by_name: undefined,
        locked_at: undefined,
        locked_by: undefined,
        locked_by_name: undefined,
        reopened_at: now,
        reopened_by: currentUser?.id,
        reopened_by_name: currentUser?.name,
        reopen_reason: reason,
      }, currentUser, now);
      await db.accountingPeriods.put(reopenedPeriod);

      await writeActivityLog({
        user: currentUser,
        action: 'PERIOD_CLOSING_REVERSED',
        entity: 'accountingPeriods',
        entity_id: period.id,
        description: `${currentUser?.name ?? 'User'} membuka ulang periode ${period.name}. Alasan: ${reason}.`,
      });
    },
  );

  await enqueueAccountingPeriodSync(reopenedPeriod, 'update');
  if (reversedRun) {
    await enqueueClosingRunSync(reversedRun, 'update');
  }

  return reopenedPeriod;
};

export interface ReopenFiscalYearInput {
  fiscal_year_id: string;
  reason: string;
}

export const reopenClosedFiscalYear = async (
  input: ReopenFiscalYearInput,
): Promise<AccountingFiscalYear> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'PERIOD_REOPEN');

  const reason = input.reason.trim();
  if (!reason) {
    throw new Error('Alasan reopen wajib diisi.');
  }

  const { failed } = await countUnhealthyQueueItems();
  if (failed > 0) {
    throw new Error('Ada sync queue yang gagal. Selesaikan sync sebelum reopen tahun fiskal.');
  }

  const now = new Date().toISOString();
  let reopenedFiscalYear!: AccountingFiscalYear;
  let reversedRun: FiscalYearClosingRun | undefined;

  await db.transaction(
    'rw',
    [db.accountingFiscalYears, db.fiscalYearClosingRuns, db.journalEntries, db.journalEntryLines, db.activityLogs],
    async () => {
      const fiscalYear = await getFiscalYearOrThrow(input.fiscal_year_id);
      if (fiscalYear.status !== 'CLOSED') {
        throw new Error('Hanya tahun fiskal CLOSED yang bisa dibuka ulang.');
      }

      const postedRun = await getActivePostedFiscalYearClosingRun(fiscalYear.id);
      let reversalEntryId: string | undefined;
      if (fiscalYear.closing_journal_entry_id) {
        const reversal = await reverseClosingJournalEntry({
          entryId: fiscalYear.closing_journal_entry_id,
          reason: `Reopen tahun fiskal ${fiscalYear.name}: ${reason}`,
          entryDate: toDateOnly(fiscalYear.end_date),
          actor: currentUser,
        });
        reversalEntryId = reversal?.id;
      }

      if (postedRun) {
        reversedRun = {
          ...postedRun,
          status: 'REVERSED',
          reversed_at: now,
          reversed_by: currentUser?.id,
          reversed_by_name: currentUser?.name,
          reversal_journal_entry_id: reversalEntryId,
          reversal_reason: reason,
          version: Math.max(1, Number(postedRun.version || 1)) + 1,
          updated_by: currentUser?.id,
          updated_by_name: currentUser?.name,
          updated_at: now,
          sync_status: 'pending',
          sync_error: undefined,
        };
        await db.fiscalYearClosingRuns.put(reversedRun);
      }

      reopenedFiscalYear = bumpFiscalYearSync({
        ...fiscalYear,
        status: 'OPEN',
        closing_journal_entry_id: undefined,
        closed_at: undefined,
        closed_by: undefined,
        closed_by_name: undefined,
        reopened_at: now,
        reopened_by: currentUser?.id,
        reopened_by_name: currentUser?.name,
        reopen_reason: reason,
      }, currentUser, now);
      await db.accountingFiscalYears.put(reopenedFiscalYear);

      await writeActivityLog({
        user: currentUser,
        action: 'FISCAL_YEAR_CLOSING_REVERSED',
        entity: 'accountingFiscalYears',
        entity_id: fiscalYear.id,
        description: `${currentUser?.name ?? 'User'} membuka ulang tahun fiskal ${fiscalYear.name}. Alasan: ${reason}.`,
      });
    },
  );

  await enqueueAccountingFiscalYearSync(reopenedFiscalYear, 'update');
  if (reversedRun) {
    await enqueueFiscalYearClosingRunSync(reversedRun, 'update');
  }

  return reopenedFiscalYear;
};

export const listClosingRuns = async (): Promise<ClosingRun[]> => {
  const runs = await db.closingRuns.toArray();
  return runs
    .filter((run) => !run.deleted_at)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
};

export const listFiscalYearClosingRuns = async (): Promise<FiscalYearClosingRun[]> => {
  const runs = await db.fiscalYearClosingRuns.toArray();
  return runs
    .filter((run) => !run.deleted_at)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
};

export const getDefaultFiscalYearName = buildFiscalYearName;
