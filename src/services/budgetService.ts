import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import { budgetSchema } from '@/lib/validations/budget';
import { enqueueBudgetSync } from '@/services/syncQueueService';
import type { Budget, BudgetPeriodType, BudgetTransactionType } from '@/types';

export interface BudgetUpsertInput {
  name: string;
  budget_type: BudgetTransactionType;
  category: string;
  period_type: BudgetPeriodType;
  period_key: string;
  planned_amount: number;
  warning_threshold_percent?: number;
  notes?: string;
}

type SanitizedBudgetInput =
  Required<Pick<BudgetUpsertInput, 'name' | 'budget_type' | 'category' | 'period_type' | 'period_key' | 'planned_amount' | 'warning_threshold_percent'>> &
  Omit<BudgetUpsertInput, 'name' | 'budget_type' | 'category' | 'period_type' | 'period_key' | 'planned_amount' | 'warning_threshold_percent'>;

const sanitizeBudgetInput = (input: BudgetUpsertInput): SanitizedBudgetInput => {
  const parsed = budgetSchema.parse(input);

  return {
    ...parsed,
    warning_threshold_percent: parsed.warning_threshold_percent ?? 80,
  };
};

const assertNoActiveDuplicate = async (
  input: Pick<Budget, 'category' | 'period_type' | 'period_key'>,
  excludeBudgetId?: string,
) => {
  const duplicate = await db.budgets
    .where('category')
    .equals(input.category)
    .and((budget) => (
      budget.id !== excludeBudgetId &&
      budget.is_active &&
      budget.period_type === input.period_type &&
      budget.period_key === input.period_key
    ))
    .first();

  if (duplicate) {
    throw new Error('Anggaran aktif untuk kategori dan periode ini sudah ada.');
  }
};

const withPendingSync = (budget: Budget): Budget => ({
  ...budget,
  sync_status: 'pending',
  sync_error: undefined,
});

export const createBudget = async (input: BudgetUpsertInput): Promise<Budget> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'FINANCE_ACCESS');

  const sanitizedInput = sanitizeBudgetInput(input);
  await assertNoActiveDuplicate(sanitizedInput);

  const now = new Date().toISOString();
  const budget: Budget = withPendingSync({
    id: crypto.randomUUID(),
    ...sanitizedInput,
    is_active: true,
    created_at: now,
    updated_at: now,
  });

  await db.budgets.add(budget);
  await writeActivityLog({
    user: currentUser,
    action: 'BUDGET_CREATED',
    entity: 'budgets',
    entity_id: budget.id,
    description: `${currentUser?.name ?? 'User'} membuat anggaran ${budget.name}.`,
  });
  await enqueueBudgetSync(budget, 'create');

  return budget;
};

export const updateBudget = async (id: string, input: BudgetUpsertInput): Promise<Budget> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'FINANCE_ACCESS');

  const existingBudget = await db.budgets.get(id);
  if (!existingBudget) {
    throw new Error('Anggaran tidak ditemukan.');
  }

  const sanitizedInput = sanitizeBudgetInput(input);
  await assertNoActiveDuplicate(sanitizedInput, id);

  const updatedBudget: Budget = withPendingSync({
    ...existingBudget,
    ...sanitizedInput,
    updated_at: new Date().toISOString(),
  });

  await db.budgets.put(updatedBudget);
  await writeActivityLog({
    user: currentUser,
    action: 'BUDGET_UPDATED',
    entity: 'budgets',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} memperbarui anggaran ${updatedBudget.name}.`,
  });
  await enqueueBudgetSync(updatedBudget, 'update');

  return updatedBudget;
};

export const archiveBudget = async (id: string): Promise<Budget> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'FINANCE_ACCESS');

  const budget = await db.budgets.get(id);
  if (!budget) {
    throw new Error('Anggaran tidak ditemukan.');
  }

  const archivedBudget: Budget = withPendingSync({
    ...budget,
    is_active: false,
    updated_at: new Date().toISOString(),
  });

  await db.budgets.put(archivedBudget);
  await writeActivityLog({
    user: currentUser,
    action: 'BUDGET_ARCHIVED',
    entity: 'budgets',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} mengarsipkan anggaran ${budget.name}.`,
  });
  await enqueueBudgetSync(archivedBudget, 'delete');

  return archivedBudget;
};

export const restoreBudget = async (id: string): Promise<Budget> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'FINANCE_ACCESS');

  const budget = await db.budgets.get(id);
  if (!budget) {
    throw new Error('Anggaran tidak ditemukan.');
  }

  await assertNoActiveDuplicate(budget, id);

  const restoredBudget: Budget = withPendingSync({
    ...budget,
    is_active: true,
    updated_at: new Date().toISOString(),
  });

  await db.budgets.put(restoredBudget);
  await writeActivityLog({
    user: currentUser,
    action: 'BUDGET_RESTORED',
    entity: 'budgets',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} memulihkan anggaran ${budget.name}.`,
  });
  await enqueueBudgetSync(restoredBudget, 'update');

  return restoredBudget;
};
