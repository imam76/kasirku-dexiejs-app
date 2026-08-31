import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  createBudgetCommitment,
  deleteBudgetCommitment,
  updateBudgetCommitment,
  type BudgetCommitmentUpsertInput,
} from '@/services/budgetCommitmentService';
import type { BudgetCommitment } from '@/types';

export const useAllBudgetCommitments = () => useLiveQuery(() => db.budgetCommitments.toArray(), []);

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

  const resetForm = () => setEditingCommitment(null);
  const handleEdit = (commitment: BudgetCommitment) => setEditingCommitment(commitment);
  const submitForm = async (input: BudgetCommitmentUpsertInput) => {
    if (editingCommitment) {
      return updateMutation.mutateAsync({ id: editingCommitment.id, input });
    }

    return createMutation.mutateAsync(input);
  };

  const markRealized = (commitment: BudgetCommitment) => updateMutation.mutateAsync({
    id: commitment.id,
    input: {
      budget_id: commitment.budget_id,
      description: commitment.description,
      amount: commitment.amount,
      notes: commitment.notes,
      status: 'REALIZED',
    },
  });

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
    markRealized,
    cancelCommitment,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
    isDeleting: deleteMutation.isPending,
  };
};
