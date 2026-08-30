import dayjs from '@/lib/dayjs';
import type { TranslationKey } from '@/i18n/messages';
import type { BudgetRealization } from '@/services/budgetRealizationService';
import type { Budget } from '@/types';

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
