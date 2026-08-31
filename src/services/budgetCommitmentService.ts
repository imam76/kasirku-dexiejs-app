import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import { budgetCommitmentSchema } from '@/lib/validations/budgetCommitment';
import { enqueueBudgetCommitmentSync } from '@/services/syncQueueService';
import type { BudgetCommitment, BudgetCommitmentStatus } from '@/types';

// This module is a pure planning/read layer, same principle as budgetService.ts: it must never
// call addFinanceTransaction, recalculateFinance, or any budgetService.ts mutator.

export interface BudgetCommitmentUpsertInput {
  budget_id: string;
  description: string;
  amount: number;
  status?: BudgetCommitmentStatus;
  notes?: string;
}

const sanitizeBudgetCommitmentInput = (input: BudgetCommitmentUpsertInput) => budgetCommitmentSchema.parse(input);

const assertBudgetIsActiveForNewCommitment = async (budgetId: string) => {
  const budget = await db.budgets.get(budgetId);
  if (!budget || !budget.is_active) {
    throw new Error('Anggaran tidak ditemukan atau tidak aktif.');
  }
};

const resolveResolvedAt = (
  previousStatus: BudgetCommitmentStatus,
  nextStatus: BudgetCommitmentStatus,
  previousResolvedAt: string | undefined,
): string | undefined => {
  if (nextStatus === 'PLANNED') {
    return undefined;
  }
  if (previousStatus === 'PLANNED') {
    return new Date().toISOString();
  }
  return previousResolvedAt;
};

const withPendingSync = (commitment: BudgetCommitment): BudgetCommitment => ({
  ...commitment,
  sync_status: 'pending',
  sync_error: undefined,
});

export const createBudgetCommitment = async (input: BudgetCommitmentUpsertInput): Promise<BudgetCommitment> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'FINANCE_ACCESS');

  const sanitizedInput = sanitizeBudgetCommitmentInput(input);
  await assertBudgetIsActiveForNewCommitment(sanitizedInput.budget_id);

  const now = new Date().toISOString();
  const commitment: BudgetCommitment = withPendingSync({
    id: crypto.randomUUID(),
    budget_id: sanitizedInput.budget_id,
    description: sanitizedInput.description,
    amount: sanitizedInput.amount,
    status: sanitizedInput.status ?? 'PLANNED',
    notes: sanitizedInput.notes,
    resolved_at: undefined,
    created_at: now,
    updated_at: now,
  });

  await db.budgetCommitments.add(commitment);
  await writeActivityLog({
    user: currentUser,
    action: 'BUDGET_COMMITMENT_CREATED',
    entity: 'budgetCommitments',
    entity_id: commitment.id,
    description: `${currentUser?.name ?? 'User'} membuat komitmen anggaran ${commitment.description}.`,
  });
  await enqueueBudgetCommitmentSync(commitment, 'create');

  return commitment;
};

export const updateBudgetCommitment = async (
  id: string,
  input: BudgetCommitmentUpsertInput,
): Promise<BudgetCommitment> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'FINANCE_ACCESS');

  const existingCommitment = await db.budgetCommitments.get(id);
  if (!existingCommitment) {
    throw new Error('Komitmen anggaran tidak ditemukan.');
  }

  const sanitizedInput = sanitizeBudgetCommitmentInput(input);
  const nextStatus = sanitizedInput.status ?? existingCommitment.status;

  const updatedCommitment: BudgetCommitment = withPendingSync({
    ...existingCommitment,
    budget_id: sanitizedInput.budget_id,
    description: sanitizedInput.description,
    amount: sanitizedInput.amount,
    notes: sanitizedInput.notes,
    status: nextStatus,
    resolved_at: resolveResolvedAt(existingCommitment.status, nextStatus, existingCommitment.resolved_at),
    updated_at: new Date().toISOString(),
  });

  await db.budgetCommitments.put(updatedCommitment);
  await writeActivityLog({
    user: currentUser,
    action: 'BUDGET_COMMITMENT_UPDATED',
    entity: 'budgetCommitments',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} memperbarui komitmen anggaran ${updatedCommitment.description}.`,
  });
  await enqueueBudgetCommitmentSync(updatedCommitment, 'update');

  return updatedCommitment;
};

export const deleteBudgetCommitment = async (id: string): Promise<void> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'FINANCE_ACCESS');

  const commitment = await db.budgetCommitments.get(id);
  if (!commitment) {
    throw new Error('Komitmen anggaran tidak ditemukan.');
  }

  await db.budgetCommitments.delete(id);
  await writeActivityLog({
    user: currentUser,
    action: 'BUDGET_COMMITMENT_DELETED',
    entity: 'budgetCommitments',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} menghapus komitmen anggaran ${commitment.description}.`,
  });
  await enqueueBudgetCommitmentSync(commitment, 'delete');
};
