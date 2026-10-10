import { isExpenseReportFinanceTransaction, isIncomeReportFinanceTransaction, isProfitAffectingFinanceTransaction } from '@/constants/finance';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import type { FinanceTransaction, Transaction, TransactionItem } from '@/types';
import { isTransactionActive } from '@/utils/transactions';

export interface DashboardOperationalMetrics {
  income: number;
  expense: number;
  estimatedNetIncome: number;
}

interface BuildDashboardOperationalMetricsInput {
  financeTransactions: FinanceTransaction[];
  transactions: Transaction[];
  transactionItems: TransactionItem[];
  startDate?: string;
  endDate?: string;
}

const getRangeBounds = (startDate?: string, endDate?: string) => ({
  start: startDate ? dayjs.tz(startDate).startOf('day').valueOf() : undefined,
  end: endDate ? dayjs.tz(endDate).endOf('day').valueOf() : undefined,
});

const isWithinRange = (value: string, start?: number, end?: number) => {
  const timestamp = dayjs(value).valueOf();
  return Number.isFinite(timestamp) && (!start || timestamp >= start) && (!end || timestamp <= end);
};

export const buildDashboardOperationalMetrics = ({
  financeTransactions,
  transactions,
  transactionItems,
  startDate,
  endDate,
}: BuildDashboardOperationalMetricsInput): DashboardOperationalMetrics => {
  const bounds = getRangeBounds(startDate, endDate);
  const rangeFinanceTransactions = financeTransactions.filter((transaction) => (
    isWithinRange(transaction.created_at, bounds.start, bounds.end)
  ));
  const rangePosTransactions = transactions.filter((transaction) => (
    isTransactionActive(transaction) &&
    isWithinRange(transaction.created_at, bounds.start, bounds.end)
  ));
  const posTransactionIds = new Set(rangePosTransactions.map((transaction) => transaction.id));
  const itemProfit = transactionItems.reduce((total, item) => (
    posTransactionIds.has(item.transaction_id) ? total + Number(item.profit || 0) : total
  ), 0);
  const financeProfit = rangeFinanceTransactions
    .filter((transaction) => isProfitAffectingFinanceTransaction(transaction.type, transaction.category))
    .reduce((total, transaction) => (
      total + (transaction.type === 'EXPENSE' ? -Number(transaction.amount || 0) : Number(transaction.amount || 0))
    ), 0);
  const posExpense = rangePosTransactions
    .filter((transaction) => transaction.business_type === 'EXPENSE')
    .reduce((total, transaction) => total + Number(transaction.total_amount || 0), 0);

  return {
    income: rangeFinanceTransactions
      .filter(isIncomeReportFinanceTransaction)
      .reduce((total, transaction) => total + Number(transaction.amount || 0), 0),
    expense: rangeFinanceTransactions
      .filter(isExpenseReportFinanceTransaction)
      .reduce((total, transaction) => total + Number(transaction.amount || 0), 0) + posExpense,
    estimatedNetIncome: itemProfit + financeProfit,
  };
};

const getIsoRange = (startDate?: string, endDate?: string) => ({
  start: startDate ? dayjs.tz(startDate).startOf('day').toISOString() : undefined,
  end: endDate ? dayjs.tz(endDate).endOf('day').toISOString() : undefined,
});

const getTransactionsInRange = async (start?: string, end?: string) => {
  if (start && end) {
    return db.transactions.where('created_at').between(start, end, true, true).toArray();
  }
  if (start) return db.transactions.where('created_at').aboveOrEqual(start).toArray();
  if (end) return db.transactions.where('created_at').belowOrEqual(end).toArray();
  return db.transactions.toArray();
};

const getFinanceTransactionsInRange = async (start?: string, end?: string) => {
  if (start && end) {
    return db.financeTransactions.where('created_at').between(start, end, true, true).toArray();
  }
  if (start) return db.financeTransactions.where('created_at').aboveOrEqual(start).toArray();
  if (end) return db.financeTransactions.where('created_at').belowOrEqual(end).toArray();
  return db.financeTransactions.toArray();
};

export const getDashboardOperationalMetrics = async (
  startDate?: string,
  endDate?: string,
): Promise<DashboardOperationalMetrics> => {
  const range = getIsoRange(startDate, endDate);
  const [financeTransactions, transactions] = await Promise.all([
    getFinanceTransactionsInRange(range.start, range.end),
    getTransactionsInRange(range.start, range.end),
  ]);
  const activeTransactionIds = transactions
    .filter(isTransactionActive)
    .map((transaction) => transaction.id);
  const transactionItems = activeTransactionIds.length > 0
    ? await db.transactionItems.where('transaction_id').anyOf(activeTransactionIds).toArray()
    : [];

  return buildDashboardOperationalMetrics({
    financeTransactions,
    transactions,
    transactionItems,
    startDate,
    endDate,
  });
};