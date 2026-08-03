import type { Transaction, TransactionItem } from '@/types';

export const isTransactionVoided = (transaction: Pick<Transaction, 'status'>) =>
  transaction.status === 'VOIDED';

export const isTransactionActive = (transaction: Pick<Transaction, 'status'>) =>
  !isTransactionVoided(transaction);

export const isTransactionExpense = (
  transaction: Pick<Transaction, 'business_type'>,
) => transaction.business_type === 'EXPENSE';

export const isTransactionSale = (
  transaction: Pick<Transaction, 'business_type'>,
) => !isTransactionExpense(transaction);

export const filterActiveTransactions = <T extends Pick<Transaction, 'status'>>(transactions: T[]) =>
  transactions.filter(isTransactionActive);

export const filterActiveSaleTransactions = <
  T extends Pick<Transaction, 'status' | 'business_type'>,
>(transactions: T[]) => transactions.filter((transaction) => (
  isTransactionActive(transaction) && isTransactionSale(transaction)
));

export const getTransactionProfit = (items: TransactionItem[]) =>
  items.reduce((sum, item) => sum + (item.profit || 0), 0);
