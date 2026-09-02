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

/**
 * Returns the COGS snapshot of a transaction line.
 *
 * POS checkout calculates `profit` from the exact FIFO consumption total.  A
 * unit HPP multiplied by the sold quantity is only a display approximation: it
 * can differ after FIFO splits or currency rounding.  Prefer the immutable
 * relation `net sales - profit` so reports and journals use the same HPP that
 * was used when the transaction was recorded.  The multiplication fallback is
 * retained for legacy rows that do not have a usable profit snapshot.
 */
export const getTransactionItemCost = (item: TransactionItem) => {
  const subtotal = Number(item.subtotal);
  const profit = Number(item.profit);

  if (Number.isFinite(subtotal) && Number.isFinite(profit)) {
    return Math.round((subtotal - profit + Number.EPSILON) * 100) / 100;
  }

  const purchasePrice = Number(item.purchase_price);
  const quantity = Number(item.quantity);
  const fallbackCost =
    (Number.isFinite(purchasePrice) ? purchasePrice : 0) *
    (Number.isFinite(quantity) ? quantity : 0);

  return Math.round((fallbackCost + Number.EPSILON) * 100) / 100;
};
