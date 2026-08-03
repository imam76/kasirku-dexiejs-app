import { describe, expect, test } from 'bun:test';
import type { Product, Transaction, TransactionItem } from '@/types';
import { filterTransactionHistory } from '@/utils/transactionHistorySearch';

const transactions = [
  {
    id: 'transaction-coffee',
    transaction_number: 'TRX-0001',
    member_name: 'Budi Santoso',
  },
  {
    id: 'transaction-tea',
    transaction_number: 'TRX-0002',
  },
] as Transaction[];

const items = [
  {
    id: 'item-coffee',
    transaction_id: 'transaction-coffee',
    product_id: 'product-coffee',
    product_name: 'Kopi Susu',
  },
  {
    id: 'item-tea',
    transaction_id: 'transaction-tea',
    product_id: 'product-tea',
    product_name: 'Teh Melati',
  },
] as TransactionItem[];

const products = [
  {
    id: 'product-coffee',
    name: 'Kopi Susu',
    sku: '8991234567890',
  },
  {
    id: 'product-tea',
    name: 'Teh Melati',
    sku: 'TEA-001',
  },
] as Product[];

describe('transaction history search', () => {
  test('finds a transaction by scanned product barcode', () => {
    const result = filterTransactionHistory(transactions, items, products, '8991234567890');

    expect(result.map((transaction) => transaction.id)).toEqual(['transaction-coffee']);
  });

  test('supports manual search by transaction number, product, and member', () => {
    expect(filterTransactionHistory(transactions, items, products, '0002'))
      .toHaveLength(1);
    expect(filterTransactionHistory(transactions, items, products, 'kopi susu'))
      .toHaveLength(1);
    expect(filterTransactionHistory(transactions, items, products, '  BUDI  '))
      .toHaveLength(1);
  });

  test('returns no transaction for an unknown barcode', () => {
    expect(filterTransactionHistory(transactions, items, products, '8990000000000'))
      .toEqual([]);
  });
});
