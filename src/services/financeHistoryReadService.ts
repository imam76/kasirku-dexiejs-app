import Dexie from 'dexie';
import { getFinanceTransactionBusinessType, isInternalCashMovementFinanceCategory } from '@/constants/finance';
import { db } from '@/lib/db';
import type { FinanceTransaction } from '@/types';
import {
  normalizeCursorPageSize,
  type DateIdCursor,
  type DateIdCursorPage,
} from '@/services/shared/dateIdCursor';

export interface FinanceHistoryFilters {
  startDate: string;
  endDate: string;
  accountId?: string;
  accountType?: string;
}

export interface CashBankPeriodSummary {
  key: string;
  label: string;
  balance: number;
  inflow: number;
  outflow: number;
  count: number;
}

export interface FinancePeriodOverview {
  opening: number;
  income: number;
  expense: number;
  accountOptions: Array<{ value: string; label: string }>;
  accountTypeSummary: Record<string, number>;
  cashBankSummary: CashBankPeriodSummary[];
}

const FINANCE_PAGE_SIZE = 20;

const matchesFilters = (transaction: FinanceTransaction, filters: FinanceHistoryFilters) => {
  if (transaction.deleted_at) return false;

  const accountKey = transaction.account_id ?? 'UNMAPPED';
  const matchesAccount = !filters.accountId || filters.accountId === accountKey;
  const matchesAccountType = !filters.accountType
    || (filters.accountType === 'UNMAPPED'
      ? !transaction.account_type
      : transaction.account_type === filters.accountType);

  return matchesAccount && matchesAccountType;
};

export const listFinanceHistoryPage = async (
  filters: FinanceHistoryFilters & { cursor?: DateIdCursor; limit?: number },
): Promise<DateIdCursorPage<FinanceTransaction>> => {
  const limit = normalizeCursorPageSize(filters.limit, FINANCE_PAGE_SIZE);
  const useAccountIndex = Boolean(filters.accountId && filters.accountId !== 'UNMAPPED');
  const lowerBound = useAccountIndex
    ? [filters.accountId as string, filters.startDate, Dexie.minKey]
    : [filters.startDate, Dexie.minKey];
  const upperBound = useAccountIndex
    ? [
      filters.accountId as string,
      filters.cursor?.date ?? filters.endDate,
      filters.cursor?.id ?? Dexie.maxKey,
    ]
    : [filters.cursor?.date ?? filters.endDate, filters.cursor?.id ?? Dexie.maxKey];
  const index = useAccountIndex ? '[account_id+created_at+id]' : '[created_at+id]';
  const rows = await db.financeTransactions
    .where(index)
    .between(lowerBound, upperBound, true, !filters.cursor)
    .reverse()
    .filter((transaction) => matchesFilters(transaction, filters))
    .limit(limit + 1)
    .toArray();
  const visibleRows = rows.slice(0, limit);
  const lastVisible = visibleRows[visibleRows.length - 1];

  return {
    rows: visibleRows,
    nextCursor: rows.length > limit && lastVisible
      ? { date: lastVisible.created_at, id: lastVisible.id }
      : undefined,
  };
};

export const readFinancePeriodOverview = async (
  filters: FinanceHistoryFilters,
): Promise<FinancePeriodOverview> => {
  const overview: FinancePeriodOverview = {
    opening: 0,
    income: 0,
    expense: 0,
    accountOptions: [],
    accountTypeSummary: {},
    cashBankSummary: [],
  };
  const accountOptions = new Map<string, string>();
  const cashBankSummary = new Map<string, CashBankPeriodSummary>();

  await db.financeTransactions
    .where('created_at')
    .between(filters.startDate, filters.endDate, true, true)
    .each((transaction) => {
      if (transaction.deleted_at) return;

      if (!isInternalCashMovementFinanceCategory(transaction.category)) {
        const businessType = getFinanceTransactionBusinessType(transaction);
        if (businessType === 'OPENING_BALANCE') overview.opening += transaction.amount;
        else if (businessType === 'INCOME') overview.income += transaction.amount;
        else if (businessType === 'EXPENSE') overview.expense += transaction.amount;
      }

      if (transaction.account_id && transaction.account_code && transaction.account_name) {
        accountOptions.set(
          transaction.account_id,
          `${transaction.account_code} - ${transaction.account_name}`,
        );
      }

      if (matchesFilters(transaction, filters)) {
        const accountType = transaction.account_type ?? 'UNMAPPED';
        overview.accountTypeSummary[accountType] = (
          overview.accountTypeSummary[accountType] ?? 0
        ) + transaction.amount;
      }

      const cashAccountId = transaction.cash_account_id
        ?? (transaction.account_type === 'ASSET' ? transaction.account_id : undefined);
      const cashAccountCode = transaction.cash_account_code
        ?? (transaction.account_type === 'ASSET' ? transaction.account_code : undefined);
      const cashAccountName = transaction.cash_account_name
        ?? (transaction.account_type === 'ASSET' ? transaction.account_name : undefined);
      if (!cashAccountId || !cashAccountName) return;

      const businessType = getFinanceTransactionBusinessType(transaction);
      const signedAmount = businessType === 'EXPENSE' ? -transaction.amount : transaction.amount;
      const current = cashBankSummary.get(cashAccountId) ?? {
        key: cashAccountId,
        label: cashAccountCode ? `${cashAccountCode} - ${cashAccountName}` : cashAccountName,
        balance: 0,
        inflow: 0,
        outflow: 0,
        count: 0,
      };
      current.balance += signedAmount;
      if (signedAmount >= 0) current.inflow += signedAmount;
      else current.outflow += Math.abs(signedAmount);
      current.count += 1;
      cashBankSummary.set(cashAccountId, current);
    });

  overview.accountOptions = Array.from(accountOptions, ([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label));
  overview.cashBankSummary = Array.from(cashBankSummary.values())
    .sort((left, right) => left.label.localeCompare(right.label));

  return overview;
};
