import { FINANCE_CATEGORIES } from '@/constants/finance';
import type { BudgetTransactionType } from '@/types';

export const BUDGET_EXPENSE_CATEGORIES = [
  FINANCE_CATEGORIES.STOCK_PURCHASE,
  FINANCE_CATEGORIES.OPERATIONAL,
  FINANCE_CATEGORIES.PAYROLL,
  'PERLENGKAPAN',
  'MAKAN',
  'TRANSPORT',
] as const;

export const BUDGET_INCOME_CATEGORIES = [
  FINANCE_CATEGORIES.OTHER,
  FINANCE_CATEGORIES.SERVICE,
  FINANCE_CATEGORIES.BONUS_GRANT,
] as const;

export const getBudgetCategoryChoices = (budgetType: BudgetTransactionType): readonly string[] => (
  budgetType === 'EXPENSE' ? BUDGET_EXPENSE_CATEGORIES : BUDGET_INCOME_CATEGORIES
);
