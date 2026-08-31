import dayjs from '@/lib/dayjs';
import type { TranslationKey } from '@/i18n/messages';
import type { BudgetRealization } from '@/services/budgetRealizationService';
import type { Budget, BudgetCommitmentStatus } from '@/types';

export const formatBudgetPeriodLabel = (budget: Pick<Budget, 'period_type' | 'period_key'>): string => {
  if (budget.period_type === 'MONTHLY') {
    const parsed = dayjs(budget.period_key, 'YYYY-MM');
    return parsed.isValid() ? parsed.format('MMMM YYYY') : budget.period_key;
  }

  return budget.period_key;
};

export const BUDGET_STATUS_COLOR: Record<BudgetRealization['status'], string> = {
  SAFE: 'green',
  WARNING: 'gold',
  OVER: 'red',
};

export const BUDGET_STATUS_LABEL_KEY: Record<BudgetRealization['status'], TranslationKey> = {
  SAFE: 'budget.status.safe',
  WARNING: 'budget.status.warning',
  OVER: 'budget.status.over',
};

export const PROJECTED_BUDGET_STATUS_LABEL_KEY: Record<BudgetRealization['projected_status'], TranslationKey> = {
  SAFE: 'budget.projectedStatus.safe',
  WARNING: 'budget.projectedStatus.warning',
  OVER: 'budget.projectedStatus.over',
};

export const BUDGET_COMMITMENT_STATUS_COLOR: Record<BudgetCommitmentStatus, string> = {
  PLANNED: 'blue',
  REALIZED: 'green',
  CANCELLED: 'default',
};

export const BUDGET_COMMITMENT_STATUS_LABEL_KEY: Record<BudgetCommitmentStatus, TranslationKey> = {
  PLANNED: 'budget.commitment.status.planned',
  REALIZED: 'budget.commitment.status.realized',
  CANCELLED: 'budget.commitment.status.cancelled',
};
