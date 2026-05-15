import type { Transaction, TransactionItem } from '@/types';

export const isTransactionVoided = (transaction: Pick<Transaction, 'status'>) =>
  transaction.status === 'VOIDED';

export const isTransactionActive = (transaction: Pick<Transaction, 'status'>) =>
  !isTransactionVoided(transaction);

export const filterActiveTransactions = <T extends Pick<Transaction, 'status'>>(transactions: T[]) =>
  transactions.filter(isTransactionActive);

export const getTransactionProfit = (items: TransactionItem[]) =>
  items.reduce((sum, item) => sum + (item.profit || 0), 0);
