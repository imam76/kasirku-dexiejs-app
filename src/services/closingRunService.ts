import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import {
  buildClosingJournalPreview,
  createClosingJournalEntry,
  getIncomeStatementReport,
  getTrialBalanceReport,
  reverseClosingJournalEntry,
  type ClosingJournalPreview,
  type IncomeStatementReport,
  type TrialBalanceReport,
} from '@/services/generalLedgerService';
import { enqueueAccountingPeriodSync, enqueueClosingRunSync } from '@/services/syncQueueService';
import type { AccountingPeriod, AuthUser, ClosingRun } from '@/types';

type ClosingRunActor = Pick<AuthUser, 'id' | 'name'> | null | undefined;

export interface ClosingPrecheck {
  key: string;
  ok: boolean;
  blocking: boolean;
  message: string;
}

export interface ClosingPreviewResult {
  period: AccountingPeriod;
  preview: ClosingJournalPreview;
  trial_balance: TrialBalanceReport;
  income_statement: IncomeStatementReport;
  prechecks: ClosingPrecheck[];
  can_post: boolean;
}

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

const getActivePostedClosingRun = async (periodId: string): Promise<ClosingRun | undefined> => {
  const runs = await db.closingRuns.where('period_id').equals(periodId).toArray();
  return runs.find((run) => !run.deleted_at && run.status === 'POSTED');
};

const countUnhealthyQueueItems = async () => {
  const items = await db.syncQueue.toArray();
  const failed = items.filter((item) => item.status === 'failed').length;
  const pending = items.filter((item) => item.status === 'pending' || item.status === 'processing').length;
  return { failed, pending };
};

const hasDraftJournalInPeriod = async (period: AccountingPeriod) => {
  const start = period.start_date.slice(0, 10);
  const end = period.end_date.slice(0, 10);
  const entries = await db.journalEntries.toArray();
  return entries.some((entry) => (
    entry.status === 'DRAFT' &&
    !entry.deleted_at &&
    entry.entry_date.slice(0, 10) >= start &&
    entry.entry_date.slice(0, 10) <= end
  ));
};

const buildPrechecks = async (
  period: AccountingPeriod,
  preview: ClosingJournalPreview,
  trialBalance: TrialBalanceReport,
): Promise<ClosingPrecheck[]> => {
  const prechecks: ClosingPrecheck[] = [];

  const module = await db.enabledModules.get('GENERAL_LEDGER');
  const setting = await db.generalLedgerSetting.get('default');
  prechecks.push({
    key: 'general_ledger_ready',
    ok: Boolean(module?.is_enabled && setting?.is_ready),
    blocking: true,
    message: 'General Ledger aktif dan opening balance sudah posted.',
  });

  const existingPosted = await getActivePostedClosingRun(period.id);
  prechecks.push({
    key: 'not_yet_closed',
    ok: period.status !== 'CLOSED' && !existingPosted,
    blocking: true,
    message: 'Periode belum pernah ditutup (tidak ada closing run POSTED).',
  });

  prechecks.push({
    key: 'period_locked',
    ok: period.status === 'LOCKED',
    blocking: true,
    message: 'Periode sudah dikunci (LOCKED) sebelum posting tutup buku.',
  });

  prechecks.push({
    key: 'trial_balance_balanced',
    ok: trialBalance.is_balanced,
    blocking: true,
    message: 'Trial balance seimbang (debit = kredit).',
  });

  prechecks.push({
    key: 'closing_preview_balanced',
    ok: preview.is_balanced,
    blocking: true,
    message: 'Jurnal penutup seimbang.',
  });

  const draft = await hasDraftJournalInPeriod(period);
  prechecks.push({
    key: 'no_draft_journal',
    ok: !draft,
    blocking: true,
    message: 'Tidak ada jurnal draft/unposted di periode ini.',
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

export const getClosingPreview = async (periodId: string): Promise<ClosingPreviewResult> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'PERIOD_CLOSE');

  const period = await getPeriodOrThrow(periodId);
  const filters = {
    startDate: period.start_date.slice(0, 10),
    endDate: period.end_date.slice(0, 10),
  };

  const [preview, trialBalance, incomeStatement] = await Promise.all([
    buildClosingJournalPreview(filters),
    getTrialBalanceReport(filters),
    getIncomeStatementReport(filters),
  ]);

  const prechecks = await buildPrechecks(period, preview, trialBalance);
  const canPost = prechecks.every((precheck) => !precheck.blocking || precheck.ok);

  return {
    period,
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

  // Pre-check di luar transaksi (kualitas data + sync health).
  const previewResult = await getClosingPreview(input.period_id);
  if (!previewResult.can_post) {
    const blocker = previewResult.prechecks.find((precheck) => precheck.blocking && !precheck.ok);
    throw new Error(`Pre-check tutup buku gagal: ${blocker?.message ?? 'periksa kembali data periode.'}`);
  }

  await db.transaction(
    'rw',
    [db.accountingPeriods, db.closingRuns, db.journalEntries, db.journalEntryLines, db.chartOfAccounts, db.activityLogs],
    async () => {
      const period = await getPeriodOrThrow(input.period_id);
      if (period.status !== 'LOCKED') {
        throw new Error('Periode harus berstatus LOCKED sebelum tutup buku.');
      }
      const existingPosted = await getActivePostedClosingRun(period.id);
      if (existingPosted) {
        throw new Error('Periode ini sudah memiliki closing run POSTED.');
      }

      // Hitung ulang preview di dalam transaksi agar konsisten dengan data terbaru.
      const preview = await buildClosingJournalPreview({
        startDate: period.start_date.slice(0, 10),
        endDate: period.end_date.slice(0, 10),
      });
      if (!preview.is_balanced) {
        throw new Error('Jurnal penutup tidak seimbang. Tutup buku dibatalkan.');
      }

      // Jika tidak ada saldo akun nominal, tidak ada jurnal penutup yang dibuat
      // (periode tetap ditutup, closing run tercatat dengan net income 0).
      const closingEntry = preview.lines.length >= 2
        ? await createClosingJournalEntry({
          periodId: period.id,
          periodName: period.name,
          entryDate: period.end_date.slice(0, 10),
          lines: preview.lines,
          actor: currentUser,
        })
        : undefined;

      closingRun = {
        id: crypto.randomUUID(),
        period_id: period.id,
        period_name: period.name,
        start_date: period.start_date.slice(0, 10),
        end_date: period.end_date.slice(0, 10),
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
      await db.closingRuns.add(closingRun);

      closedPeriod = bumpPeriodSync({
        ...period,
        status: 'CLOSED',
        closed_at: now,
        closed_by: currentUser?.id,
        closed_by_name: currentUser?.name,
        closing_journal_entry_id: closingEntry?.id,
      }, currentUser, now);
      await db.accountingPeriods.put(closedPeriod);

      await writeActivityLog({
        user: currentUser,
        action: 'YEAR_END_CLOSING_POSTED',
        entity: 'closingRuns',
        entity_id: closingRun.id,
        description: `${currentUser?.name ?? 'User'} menutup buku periode ${period.name}. Laba/SHU periode: ${preview.net_income_amount}.`,
      });
    },
  );

  // Enqueue sync sesuai urutan remote: period (CLOSED) + closing run.
  // Journal bundle di-enqueue otomatis oleh createClosingJournalEntry.
  await enqueueAccountingPeriodSync(closedPeriod, 'update');
  await enqueueClosingRunSync(closingRun, 'update');

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
    [db.accountingPeriods, db.closingRuns, db.journalEntries, db.journalEntryLines, db.activityLogs],
    async () => {
      const period = await getPeriodOrThrow(input.period_id);
      if (period.status !== 'CLOSED') {
        throw new Error('Hanya periode CLOSED yang bisa dibuka ulang.');
      }

      const postedRun = await getActivePostedClosingRun(period.id);

      // Reversal jurnal penutup bila ada.
      let reversalEntryId: string | undefined;
      if (period.closing_journal_entry_id) {
        const reversal = await reverseClosingJournalEntry({
          entryId: period.closing_journal_entry_id,
          reason: `Reopen periode ${period.name}: ${reason}`,
          entryDate: period.end_date.slice(0, 10),
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
        action: 'YEAR_END_CLOSING_REVERSED',
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

export const listClosingRuns = async (): Promise<ClosingRun[]> => {
  const runs = await db.closingRuns.toArray();
  return runs
    .filter((run) => !run.deleted_at)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
};
