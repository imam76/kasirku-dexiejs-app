import { describe, expect, test } from 'bun:test';
import {
  getMobileHomeServiceSelection,
  getUserInitials,
  prioritizeMobileHomeServices,
} from '@/utils/mobileHome';
import { buildMobileHomeData } from '@/services/mobileHomeService';
import type { Transaction } from '@/types';

const buildTransaction = (partial: Partial<Transaction> = {}): Transaction => ({
  id: 'transaction-1',
  transaction_number: 'TRX-001',
  total_amount: 100_000,
  payment_amount: 100_000,
  change_amount: 0,
  payment_method: 'TUNAI',
  created_at: '2026-08-12T03:00:00.000Z',
  status: 'COMPLETED',
  ...partial,
});

describe('mobile Home helpers', () => {
  test('builds compact user initials', () => {
    expect(getUserInitials('Imam')).toBe('I');
    expect(getUserInitials('Imam Maulana Yusuf')).toBe('IM');
    expect(getUserInitials('   ')).toBe('?');
  });

  test('prioritizes operational routes while preserving unknown route order', () => {
    const items = [
      { to: '/settings', label: 'Settings' },
      { to: '/custom-a', label: 'A' },
      { to: '/transaction', label: 'POS' },
      { to: '/report', label: 'Report' },
      { to: '/custom-b', label: 'B' },
    ];

    expect(prioritizeMobileHomeServices(items).map((item) => item.to)).toEqual([
      '/transaction',
      '/report',
      '/settings',
      '/custom-a',
      '/custom-b',
    ]);
  });

  test('reserves the eighth cell for More when services overflow', () => {
    const items = Array.from({ length: 10 }, (_, index) => ({
      to: `/custom-${index}`,
      label: `Service ${index}`,
    }));

    const selection = getMobileHomeServiceSelection(items);

    expect(selection.items).toHaveLength(7);
    expect(selection.hasMore).toBe(true);
    expect(selection.hiddenCount).toBe(3);
  });

  test('shows all permitted services when they fit', () => {
    const items = [
      { to: '/master-data', label: 'Master Data' },
      { to: '/purchases', label: 'Purchases' },
    ];

    const selection = getMobileHomeServiceSelection(items);

    expect(selection.items).toEqual(items);
    expect(selection.hasMore).toBe(false);
    expect(selection.hiddenCount).toBe(0);
  });

  test('summarizes only active sale transactions and keeps newest first', () => {
    const data = buildMobileHomeData([
      buildTransaction({ id: 'older', total_amount: 100_000 }),
      buildTransaction({
        id: 'newer',
        transaction_number: 'TRX-002',
        total_amount: 200_000,
        created_at: '2026-08-12T04:00:00.000Z',
      }),
      buildTransaction({ id: 'voided', total_amount: 900_000, status: 'VOIDED' }),
      buildTransaction({ id: 'expense', total_amount: 300_000, business_type: 'EXPENSE' }),
    ]);

    expect(data.totalRevenue).toBe(300_000);
    expect(data.averageTransaction).toBe(150_000);
    expect(data.transactions.map((transaction) => transaction.id)).toEqual(['newer', 'older']);
  });
});
