import { getBudgetMatchingTransactions, getBudgetRealization, type BudgetRealization } from '@/services/budgetRealizationService';
import type { Budget, BudgetCommitment, FinanceTransaction } from '@/types';

export interface BudgetReportData {
  budget: Budget;
  realization: BudgetRealization;
  realizedTransactions: FinanceTransaction[];
  plannedCommitments: BudgetCommitment[];
  cancelledCommitments: BudgetCommitment[];
}

export const buildBudgetReport = (
  budget: Budget,
  transactions: FinanceTransaction[],
  commitments: BudgetCommitment[],
): BudgetReportData => {
  const budgetCommitments = commitments.filter((commitment) => commitment.budget_id === budget.id);

  return {
    budget,
    realization: getBudgetRealization(budget, transactions, commitments),
    realizedTransactions: getBudgetMatchingTransactions(budget, transactions),
    plannedCommitments: budgetCommitments.filter((commitment) => commitment.status === 'PLANNED'),
    cancelledCommitments: budgetCommitments.filter((commitment) => commitment.status === 'CANCELLED'),
  };
};
