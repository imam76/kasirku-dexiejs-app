import type { Product, Transaction, TransactionItem } from '@/types';

export const normalizeTransactionHistorySearch = (value: string) => value.trim().toLowerCase();

const includesSearch = (value: string | undefined, searchTerm: string) => (
  value?.toLowerCase().includes(searchTerm) ?? false
);

export const filterTransactionHistory = (
  transactions: Transaction[],
  items: TransactionItem[],
  products: Product[],
  search: string,
) => {
  const searchTerm = normalizeTransactionHistorySearch(search);
  if (!searchTerm) return transactions;

  const matchingProductIds = new Set(
    products
      .filter((product) => (
        includesSearch(product.name, searchTerm)
        || includesSearch(product.sku, searchTerm)
      ))
      .map((product) => product.id),
  );

  const matchingTransactionIds = new Set(
    items
      .filter((item) => (
        includesSearch(item.product_name, searchTerm)
        || matchingProductIds.has(item.product_id)
      ))
      .map((item) => item.transaction_id),
  );

  return transactions.filter((transaction) => (
    matchingTransactionIds.has(transaction.id)
    || includesSearch(transaction.transaction_number, searchTerm)
    || includesSearch(transaction.cashier_user_name, searchTerm)
    || includesSearch(transaction.member_number, searchTerm)
    || includesSearch(transaction.member_name, searchTerm)
    || includesSearch(transaction.member_phone, searchTerm)
    || includesSearch(transaction.payment_reference, searchTerm)
  ));
};
