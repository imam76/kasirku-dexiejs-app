import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { addFinanceTransaction } from '@/services/financeService';
import {
  createBudgetCommitment,
  deleteBudgetCommitment,
  updateBudgetCommitment,
  type BudgetCommitmentUpsertInput,
} from '@/services/budgetCommitmentService';
import type { BudgetCommitment, FinanceTransactionType, PaymentMethod } from '@/types';

export const useAllBudgetCommitments = () => useLiveQuery(() => db.budgetCommitments.toArray(), []);

export interface RealizeBudgetCommitmentTransactionInput {
  amount: number;
  category: string;
  description: string;
  payment_method?: PaymentMethod;
  payment_channel?: string;
  cash_account_id?: string;
}

export const useBudgetCommitments = (budgetId: string | undefined) => {
  const queryClient = useQueryClient();
  const [editingCommitment, setEditingCommitment] = useState<BudgetCommitment | null>(null);

  const queriedCommitments = useLiveQuery(
    () => (budgetId ? db.budgetCommitments.where('budget_id').equals(budgetId).toArray() : []),
    [budgetId],
  );
  const commitments = useMemo(() => queriedCommitments ?? [], [queriedCommitments]);

  const invalidateBudgetCommitments = () => {
    queryClient.invalidateQueries({ queryKey: ['budgetCommitments'] });
    queryClient.invalidateQueries({ queryKey: ['budgets'] });
  };

  const createMutation = useMutation({
    mutationFn: createBudgetCommitment,
    onSuccess: invalidateBudgetCommitments,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: BudgetCommitmentUpsertInput }) => updateBudgetCommitment(id, input),
    onSuccess: invalidateBudgetCommitments,
  });
  const deleteMutation = useMutation({
    mutationFn: deleteBudgetCommitment,
    onSuccess: invalidateBudgetCommitments,
  });

  const realizeMutation = useMutation({
    mutationFn: async ({
      commitment,
      transactionType,
      transaction,
    }: {
      commitment: BudgetCommitment;
      transactionType: FinanceTransactionType;
      transaction: RealizeBudgetCommitmentTransactionInput;
    }) => {
      // Record the real transaction first - losing the money record is worse than a commitment
      // stuck on PLANNED, so only flip the commitment to REALIZED once it's safely recorded.
      await addFinanceTransaction({
        type: transactionType,
        ...transaction,
        reference_id: commitment.id,
      });

      return updateBudgetCommitment(commitment.id, {
        budget_id: commitment.budget_id,
        description: commitment.description,
        amount: commitment.amount,
        notes: commitment.notes,
        status: 'REALIZED',
      });
    },
    onSuccess: () => {
      invalidateBudgetCommitments();
      queryClient.invalidateQueries({ queryKey: ['financeBalance'] });
      queryClient.invalidateQueries({ queryKey: ['financeTransactions'] });
      queryClient.invalidateQueries({ queryKey: ['profitBalance'] });
      queryClient.invalidateQueries({ queryKey: ['profitLogs'] });
    },
  });

  const resetForm = () => setEditingCommitment(null);
  const handleEdit = (commitment: BudgetCommitment) => setEditingCommitment(commitment);
  const submitForm = async (input: BudgetCommitmentUpsertInput) => {
    if (editingCommitment) {
      return updateMutation.mutateAsync({ id: editingCommitment.id, input });
    }

    return createMutation.mutateAsync(input);
  };

  const cancelCommitment = (commitment: BudgetCommitment) => updateMutation.mutateAsync({
    id: commitment.id,
    input: {
      budget_id: commitment.budget_id,
      description: commitment.description,
      amount: commitment.amount,
      notes: commitment.notes,
      status: 'CANCELLED',
    },
  });

  return {
    commitments,
    isLoading: queriedCommitments === undefined,
    editingCommitment,
    handleEdit,
    resetForm,
    submitForm,
    deleteCommitment: deleteMutation.mutateAsync,
    realizeWithTransaction: realizeMutation.mutateAsync,
    isRealizing: realizeMutation.isPending,
    cancelCommitment,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
};
