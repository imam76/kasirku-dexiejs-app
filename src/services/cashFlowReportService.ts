import { getCurrentSessionUser, requireUserPermission } from '@/auth/authService';
import { getFinanceTransactionBusinessType } from '@/constants/finance';
import { db } from '@/lib/db';
import type { ChartOfAccount, FinanceTransaction, FinanceTransactionType } from '@/types';

export const CASH_FLOW_ALL_CLASSIFICATION = 'ALL';

export type CashFlowReportClassification =
  | typeof CASH_FLOW_ALL_CLASSIFICATION
  | `TYPE:${FinanceTransactionType}`
  | `CATEGORY:${string}`;

export interface CashFlowReportFilters {
  startDate?: string;
  endDate?: string;
  classification?: CashFlowReportClassification;
  currencyCode?: string;
  includeZeroBalance?: boolean;
}

export interface CashFlowReportGroup {
  key: string;
  accountCode?: string;
  accountName: string;
  cashIn: number;
  cashOut: number;
  net: number;
  transactions: FinanceTransaction[];
}

export interface CashFlowReportTotals {
  cashIn: number;
  cashOut: number;
  net: number;
}

export interface CashFlowReportData {
  groups: CashFlowReportGroup[];
  totals: CashFlowReportTotals;
  categoryOptions: string[];
  transactionCount: number;
}

type CurrencyAwareFinanceTransaction = FinanceTransaction & {
  currency_code?: string;
  base_currency_code?: string;
};

export const getCashFlowSignedAmount = (transaction: FinanceTransaction) => (
  getFinanceTransactionBusinessType(transaction) === 'EXPENSE'
    ? -Number(transaction.amount || 0)
    : Number(transaction.amount || 0)
);

const getCashFlowAccountKey = (transaction: FinanceTransaction) => (
  transaction.cash_account_id ?? transaction.account_id ?? 'UNMAPPED'
);

const getCashFlowAccountName = (transaction: FinanceTransaction) => (
  transaction.cash_account_name ?? transaction.account_name ?? 'Tanpa Akun'
);

const getCashFlowAccountCode = (transaction: FinanceTransaction) => (
  transaction.cash_account_code ?? transaction.account_code
);

const matchesCurrency = (transaction: FinanceTransaction, currencyCode?: string) => {
  const normalizedCurrencyCode = currencyCode?.trim();
  if (!normalizedCurrencyCode) return true;

  const currencyAwareTransaction = transaction as CurrencyAwareFinanceTransaction;
  if (!currencyAwareTransaction.currency_code && !currencyAwareTransaction.base_currency_code) return true;

  return currencyAwareTransaction.currency_code === normalizedCurrencyCode ||
    currencyAwareTransaction.base_currency_code === normalizedCurrencyCode;
};

const matchesClassification = (
  transaction: FinanceTransaction,
  classification: CashFlowReportClassification = CASH_FLOW_ALL_CLASSIFICATION,
) => {
  if (classification === CASH_FLOW_ALL_CLASSIFICATION) return true;

  if (classification.startsWith('TYPE:')) {
    const type = classification.replace('TYPE:', '') as FinanceTransactionType;
    return getFinanceTransactionBusinessType(transaction) === type;
  }

  if (classification.startsWith('CATEGORY:')) {
    return transaction.category === classification.replace('CATEGORY:', '');
  }

  return true;
};

const getCashBankAccounts = async () => db.chartOfAccounts
  .orderBy('code')
  .filter((account) => account.type === 'ASSET' && account.is_active && account.is_postable)
  .toArray();

const createZeroBalanceGroup = (account: ChartOfAccount): CashFlowReportGroup => ({
  key: account.id,
  accountCode: account.code,
  accountName: account.name,
  cashIn: 0,
  cashOut: 0,
  net: 0,
  transactions: [],
});

const getTransactionsInRange = async (filters: CashFlowReportFilters) => {
  let collection = db.financeTransactions.orderBy('created_at');

  if (filters.startDate && filters.endDate) {
    collection = db.financeTransactions
      .where('created_at')
      .between(filters.startDate, filters.endDate, true, true);
  } else if (filters.startDate) {
    collection = db.financeTransactions
      .where('created_at')
      .aboveOrEqual(filters.startDate);
  } else if (filters.endDate) {
    collection = db.financeTransactions
      .where('created_at')
      .belowOrEqual(filters.endDate);
  }

  return (await collection.toArray())
    .filter((transaction) => matchesCurrency(transaction, filters.currencyCode))
    .sort((left, right) => left.created_at.localeCompare(right.created_at));
};

export const getCashFlowReport = async (
  filters: CashFlowReportFilters = {},
): Promise<CashFlowReportData> => {
  await requireUserPermission(await getCurrentSessionUser(), 'REPORT_CASH_FLOW_VIEW');

  const [rangeTransactions, cashBankAccounts] = await Promise.all([
    getTransactionsInRange(filters),
    filters.includeZeroBalance ? getCashBankAccounts() : Promise.resolve([]),
  ]);
  const classification = filters.classification ?? CASH_FLOW_ALL_CLASSIFICATION;
  const categoryOptions = Array.from(new Set(rangeTransactions.map((transaction) => transaction.category)))
    .filter(Boolean)
    .sort();
  const transactions = rangeTransactions.filter((transaction) => matchesClassification(transaction, classification));
  const groupMap = new Map<string, CashFlowReportGroup>();

  cashBankAccounts.forEach((account) => {
    groupMap.set(account.id, createZeroBalanceGroup(account));
  });

  transactions.forEach((transaction) => {
    const key = getCashFlowAccountKey(transaction);
    const signedAmount = getCashFlowSignedAmount(transaction);
    const current = groupMap.get(key) ?? {
      key,
      accountCode: getCashFlowAccountCode(transaction),
      accountName: getCashFlowAccountName(transaction),
      cashIn: 0,
      cashOut: 0,
      net: 0,
      transactions: [],
    };

    current.transactions.push(transaction);
    if (signedAmount >= 0) current.cashIn += signedAmount;
    else current.cashOut += Math.abs(signedAmount);
    current.net = current.cashIn - current.cashOut;
    groupMap.set(key, current);
  });

  const groups = Array.from(groupMap.values())
    .filter((group) => filters.includeZeroBalance || group.transactions.length > 0 || Math.abs(group.net) > 0)
    .sort((left, right) => `${left.accountCode ?? ''}${left.accountName}`.localeCompare(
      `${right.accountCode ?? ''}${right.accountName}`,
      undefined,
      { numeric: true },
    ));
  const totals = groups.reduce<CashFlowReportTotals>((acc, group) => {
    acc.cashIn += group.cashIn;
    acc.cashOut += group.cashOut;
    acc.net += group.net;
    return acc;
  }, { cashIn: 0, cashOut: 0, net: 0 });

  return {
    groups,
    totals,
    categoryOptions,
    transactionCount: transactions.length,
  };
};
