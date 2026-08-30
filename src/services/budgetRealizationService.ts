import { isExpenseReportFinanceTransaction, isIncomeReportFinanceTransaction } from '@/constants/finance';
import type { Budget, FinanceTransaction } from '@/types';

export interface BudgetRealization {
  budget: Budget;
  actual_amount: number;
  remaining_amount: number;
  usage_percent: number;
  status: 'SAFE' | 'WARNING' | 'OVER';
}

const getBudgetPeriodRange = (budget: Pick<Budget, 'period_type' | 'period_key'>) => {
  if (budget.period_type === 'MONTHLY') {
    const [yearText, monthText] = budget.period_key.split('-');
    const year = Number(yearText);
    const month = Number(monthText);
    return {
      start: new Date(Date.UTC(year, month - 1, 1)),
      end: new Date(Date.UTC(year, month, 1)),
    };
  }

  const year = Number(budget.period_key);
  return {
    start: new Date(Date.UTC(year, 0, 1)),
    end: new Date(Date.UTC(year + 1, 0, 1)),
  };
};

const isWithinPeriod = (createdAt: string, start: Date, end: Date) => {
  const timestamp = new Date(createdAt).getTime();
  return timestamp >= start.getTime() && timestamp < end.getTime();
};

const getBudgetStatus = (
  usagePercent: number,
  warningThresholdPercent: number,
): BudgetRealization['status'] => {
  if (usagePercent >= 100) return 'OVER';
  if (usagePercent >= warningThresholdPercent) return 'WARNING';
  return 'SAFE';
};

export const getBudgetRealization = (
  budget: Budget,
  transactions: FinanceTransaction[],
): BudgetRealization => {
  const { start, end } = getBudgetPeriodRange(budget);
  const isEligibleTransaction = budget.budget_type === 'EXPENSE'
    ? isExpenseReportFinanceTransaction
    : isIncomeReportFinanceTransaction;

  const actualAmount = transactions.reduce((total, transaction) => {
    if (transaction.category !== budget.category) return total;
    if (!isEligibleTransaction(transaction)) return total;
    if (!isWithinPeriod(transaction.created_at, start, end)) return total;

    return total + transaction.amount;
  }, 0);

  const usagePercent = budget.planned_amount > 0
    ? (actualAmount / budget.planned_amount) * 100
    : (actualAmount > 0 ? 100 : 0);

  return {
    budget,
    actual_amount: actualAmount,
    remaining_amount: budget.planned_amount - actualAmount,
    usage_percent: usagePercent,
    status: getBudgetStatus(usagePercent, budget.warning_threshold_percent),
  };
};
