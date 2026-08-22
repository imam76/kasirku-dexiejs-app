import { beforeEach, describe, expect, test } from 'bun:test';
import type { Product } from '@/types';
import { useTransactionStore } from '@/store/transactionStore';
import { evaluateStockAvailability } from '@/utils/inventory/evaluateStockAvailability';

const product = (stock: number): Product => ({
  id: 'physical-product',
  name: 'Produk Fisik',
  purchase_unit: 'pcs',
  selling_unit: 'pcs',
  purchase_price: 4_000,
  selling_price: 7_000,
  stock,
  sku: 'PHY-001',
  created_at: '2026-08-22T00:00:00.000Z',
  updated_at: '2026-08-22T00:00:00.000Z',
});

describe('POS physical stock shortage', () => {
  beforeEach(() => {
    useTransactionStore.setState({ cart: [], activeDraftScope: undefined });
  });

  test('calculates only the shortage required by the sale', () => {
    expect(evaluateStockAvailability({ availableQuantity: 1, requestedQuantity: 3 }))
      .toEqual({
        availableQuantity: 1,
        requestedQuantity: 3,
        shortageQuantity: 2,
        isSufficient: false,
      });
    expect(evaluateStockAvailability({ availableQuantity: -2, requestedQuantity: 1 }).shortageQuantity)
      .toBe(3);
  });

  test('keeps an insufficient item blocked without cashier confirmation', () => {
    expect(useTransactionStore.getState().addToCart(product(0)))
      .toEqual({ success: false, error: { code: 'OUT_OF_STOCK' } });
    expect(useTransactionStore.getState().cart).toHaveLength(0);
  });

  test('adds an out-of-stock item only after physical presence confirmation', () => {
    expect(useTransactionStore.getState().addToCart(product(0), { confirmPhysicalStock: true }))
      .toEqual({ success: true });
    expect(useTransactionStore.getState().cart[0]).toMatchObject({
      quantity: 1,
      physical_stock_observation: { confirmed: true },
    });
  });

  test('requires confirmation again when quantity grows beyond system stock', () => {
    useTransactionStore.getState().addToCart(product(1));

    expect(useTransactionStore.getState().updateQuantity('physical-product', 3))
      .toEqual({
        success: false,
        error: { code: 'INSUFFICIENT_STOCK', stock: 1, unit: 'pcs' },
      });
    expect(useTransactionStore.getState().updateQuantity(
      'physical-product',
      3,
      { confirmPhysicalStock: true },
    )).toEqual({ success: true });
    expect(useTransactionStore.getState().cart[0]).toMatchObject({
      quantity: 3,
      physical_stock_observation: { confirmed: true },
    });
  });
});
