import { db } from '@/lib/db';
import { isTauriRuntime, budgetPostgresAdapter, type RemoteBudgetDto } from '@/services/postgresAdapter';
import type { Budget, BudgetPeriodType, BudgetTransactionType } from '@/types';
import { toCanonicalIsoTimestamp } from '@/utils/timestamps';

export interface BudgetReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

const EMPTY_BUDGET_READ_SYNC_RESULT: BudgetReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
};

let isRefreshingBudgetsFromPostgres = false;

const isBudgetTransactionType = (value: string): value is BudgetTransactionType => (
  value === 'EXPENSE' || value === 'INCOME'
);

const isBudgetPeriodType = (value: string): value is BudgetPeriodType => (
  value === 'MONTHLY' || value === 'YEARLY'
);

const mapRemoteBudgetToLocal = (
  remoteBudget: RemoteBudgetDto,
  syncedAt: string,
): Budget => ({
  id: remoteBudget.id,
  name: remoteBudget.name,
  budget_type: isBudgetTransactionType(remoteBudget.budget_type) ? remoteBudget.budget_type : 'EXPENSE',
  category: remoteBudget.category,
  period_type: isBudgetPeriodType(remoteBudget.period_type) ? remoteBudget.period_type : 'MONTHLY',
  period_key: remoteBudget.period_key,
  planned_amount: remoteBudget.planned_amount,
  warning_threshold_percent: remoteBudget.warning_threshold_percent,
  notes: remoteBudget.notes ?? undefined,
  is_active: remoteBudget.deleted_at ? false : remoteBudget.is_active,
  created_at: toCanonicalIsoTimestamp(remoteBudget.created_at),
  updated_at: toCanonicalIsoTimestamp(remoteBudget.updated_at),
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: toCanonicalIsoTimestamp(remoteBudget.updated_at),
});

const hasLocalUnsyncedChanges = (budget: Budget) => (
  budget.sync_status === 'pending' || budget.sync_status === 'failed'
);

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const shouldApplyRemoteBudget = (
  localBudget: Budget | undefined,
  remoteBudget: RemoteBudgetDto,
) => {
  if (!localBudget) return true;
  if (hasLocalUnsyncedChanges(localBudget)) return false;

  const localRemoteUpdatedAt = localBudget.remote_updated_at ?? localBudget.updated_at;
  const remoteTimestamp = toTimestamp(remoteBudget.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteBudget.updated_at >= localRemoteUpdatedAt;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

export const mergeRemoteBudgetsIntoDexie = async (
  remoteBudgets: RemoteBudgetDto[],
  syncedAt = new Date().toISOString(),
): Promise<BudgetReadSyncResult> => {
  const result: BudgetReadSyncResult = {
    ...EMPTY_BUDGET_READ_SYNC_RESULT,
    fetched: remoteBudgets.length,
  };
  if (remoteBudgets.length === 0) return result;

  const budgetsToPut: Budget[] = [];

  await db.transaction('rw', db.budgets, async () => {
    for (const remoteBudget of remoteBudgets) {
      const localBudget = await db.budgets.get(remoteBudget.id);
      if (!shouldApplyRemoteBudget(localBudget, remoteBudget)) {
        result.skipped += 1;
        continue;
      }

      budgetsToPut.push(mapRemoteBudgetToLocal(remoteBudget, syncedAt));
      if (localBudget) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }

    if (budgetsToPut.length > 0) {
      await db.budgets.bulkPut(budgetsToPut);
    }
  });

  return result;
};

export const refreshBudgetsFromPostgres = async (): Promise<BudgetReadSyncResult> => {
  if (isRefreshingBudgetsFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_BUDGET_READ_SYNC_RESULT };
  }

  isRefreshingBudgetsFromPostgres = true;
  try {
    const remoteBudgets = await budgetPostgresAdapter.list();
    return mergeRemoteBudgetsIntoDexie(remoteBudgets);
  } finally {
    isRefreshingBudgetsFromPostgres = false;
  }
};
