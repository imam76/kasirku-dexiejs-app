import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  archiveBudget,
  createBudget,
  restoreBudget,
  updateBudget,
  type BudgetUpsertInput,
} from '@/services/budgetService';
import { getBudgetRealization, type BudgetRealization } from '@/services/budgetRealizationService';
import { useAllBudgetCommitments } from '@/hooks/useBudgetCommitments';
import type { Budget, BudgetPeriodType, BudgetTransactionType } from '@/types';

export type BudgetTypeFilter = BudgetTransactionType | 'ALL';
export type BudgetActiveFilter = 'active' | 'inactive' | 'all';
export type BudgetStatusFilter = BudgetRealization['status'] | 'ALL';
export type BudgetPeriodTypeFilter = BudgetPeriodType | 'ALL';

export const getCurrentMonthPeriodKey = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
};

export const getCurrentYearPeriodKey = () => String(new Date().getFullYear());

export const useBudgets = () => {
  const queryClient = useQueryClient();
  const [editingBudget, setEditingBudget] = useState<Budget | null>(null);
  const [searchText, setSearchText] = useState('');
  const [periodTypeFilter, setPeriodTypeFilter] = useState<BudgetPeriodTypeFilter>('ALL');
  const [periodKeyFilter, setPeriodKeyFilter] = useState(getCurrentMonthPeriodKey());
  const [typeFilter, setTypeFilter] = useState<BudgetTypeFilter>('ALL');
  const [activeFilter, setActiveFilter] = useState<BudgetActiveFilter>('active');
  const [statusFilter, setStatusFilter] = useState<BudgetStatusFilter>('ALL');

  const queriedBudgets = useLiveQuery(
    () => db.budgets.orderBy('period_key').reverse().toArray(),
    [],
  );
  const budgets = useMemo(() => queriedBudgets ?? [], [queriedBudgets]);

  const { data: transactions = [] } = useQuery({
    queryKey: ['financeTransactions'],
    queryFn: async () => db.financeTransactions.orderBy('created_at').reverse().toArray(),
  });

  const queriedCommitments = useAllBudgetCommitments();
  const commitments = useMemo(() => queriedCommitments ?? [], [queriedCommitments]);

  const budgetsWithRealization = useMemo<BudgetRealization[]>(
    () => budgets
      .slice()
      .sort((a, b) => (
        a.period_key === b.period_key ? a.name.localeCompare(b.name) : b.period_key.localeCompare(a.period_key)
      ))
      .map((budget) => getBudgetRealization(budget, transactions, commitments)),
    [budgets, transactions, commitments],
  );

  const changePeriodTypeFilter = (nextPeriodType: BudgetPeriodTypeFilter) => {
    setPeriodTypeFilter(nextPeriodType);
    if (nextPeriodType === 'MONTHLY') setPeriodKeyFilter(getCurrentMonthPeriodKey());
    else if (nextPeriodType === 'YEARLY') setPeriodKeyFilter(getCurrentYearPeriodKey());
  };

  const filteredBudgetsWithRealization = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return budgetsWithRealization.filter((realization) => {
      const { budget } = realization;
      const matchesSearch = !query || [budget.name, budget.category, budget.notes]
        .some((value) => value?.toLowerCase().includes(query));
      const matchesPeriod = periodTypeFilter === 'ALL' || (
        budget.period_type === periodTypeFilter && budget.period_key === periodKeyFilter
      );
      const matchesType = typeFilter === 'ALL' || budget.budget_type === typeFilter;
      const matchesActive =
        activeFilter === 'all' ||
        (activeFilter === 'active' ? budget.is_active : !budget.is_active);
      const matchesStatus = statusFilter === 'ALL' || realization.status === statusFilter;

      return matchesSearch && matchesPeriod && matchesType && matchesActive && matchesStatus;
    });
  }, [activeFilter, budgetsWithRealization, periodKeyFilter, periodTypeFilter, searchText, statusFilter, typeFilter]);

  const invalidateBudgets = () => {
    queryClient.invalidateQueries({ queryKey: ['budgets'] });
  };

  const createMutation = useMutation({
    mutationFn: createBudget,
    onSuccess: invalidateBudgets,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: BudgetUpsertInput }) => updateBudget(id, input),
    onSuccess: invalidateBudgets,
  });
  const archiveMutation = useMutation({
    mutationFn: archiveBudget,
    onSuccess: invalidateBudgets,
  });
  const restoreMutation = useMutation({
    mutationFn: restoreBudget,
    onSuccess: invalidateBudgets,
  });

  const resetForm = () => setEditingBudget(null);
  const handleEdit = (budget: Budget) => setEditingBudget(budget);
  const submitForm = async (input: BudgetUpsertInput) => {
    if (editingBudget) {
      return updateMutation.mutateAsync({ id: editingBudget.id, input });
    }

    return createMutation.mutateAsync(input);
  };

  return {
    budgets,
    isLoading: queriedBudgets === undefined,
    budgetsWithRealization,
    filteredBudgetsWithRealization,
    editingBudget,
    searchText,
    setSearchText,
    periodTypeFilter,
    setPeriodTypeFilter: changePeriodTypeFilter,
    periodKeyFilter,
    setPeriodKeyFilter,
    typeFilter,
    setTypeFilter,
    activeFilter,
    setActiveFilter,
    statusFilter,
    setStatusFilter,
    handleEdit,
    resetForm,
    submitForm,
    archiveBudget: archiveMutation.mutateAsync,
    restoreBudget: restoreMutation.mutateAsync,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
    isArchiving: archiveMutation.isPending,
    isRestoring: restoreMutation.isPending,
  };
};
