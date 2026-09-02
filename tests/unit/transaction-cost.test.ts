import { describe, expect, test } from 'bun:test';
import type { Product, TransactionItem } from '@/types';
import { normalisasiHargaProduk } from '@/utils/pricing';
import { getTransactionItemCost } from '@/utils/transactions';

const product: Product = {
  id: 'product-box-pcs',
  name: 'Produk BOX ke PCS',
  category: 'non_consumable',
  purchase_unit: 'box',
  selling_unit: 'pcs',
  purchase_price: 18_000,
  selling_price: 2_000,
  stock: 1,
  product_type: 'FINISHED_GOOD',
  is_visible_in_pos: true,
  sellable_units: ['pcs', 'box'],
  unit_mappings: [{
    from_quantity: 1,
    from_unit: 'box',
    to_quantity: 12,
    to_unit: 'pcs',
  }],
  created_at: '2026-09-02T00:00:00.000Z',
  updated_at: '2026-09-02T00:00:00.000Z',
};

const buildTransactionItem = (partial: Partial<TransactionItem> = {}): TransactionItem => ({
  id: 'transaction-item-1',
  transaction_id: 'transaction-1',
  product_id: product.id,
  product_name: product.name,
  price: 2_000,
  purchase_price: 1_500,
  quantity: 1,
  unit: 'pcs',
  subtotal: 2_000,
  profit: 500,
  created_at: '2026-09-02T00:00:00.000Z',
  ...partial,
});

describe('transaction COGS snapshots with multiple units', () => {
  test('normalizes BOX HPP to PCS before the sale snapshot is recorded', () => {
    expect(normalisasiHargaProduk(18_000, product, 'box', 'pcs')).toBe(1_500);

    const item = buildTransactionItem();
    expect(getTransactionItemCost(item)).toBe(1_500);
    expect(item.subtotal - getTransactionItemCost(item)).toBe(500);
  });

  test('uses the FIFO-derived profit snapshot instead of rounded unit HPP times quantity', () => {
    const item = buildTransactionItem({
      purchase_price: 1.33,
      quantity: 3,
      subtotal: 10,
      profit: 6,
    });

    expect(getTransactionItemCost(item)).toBe(4);
    expect(item.purchase_price * item.quantity).toBeCloseTo(3.99, 2);
  });
});
