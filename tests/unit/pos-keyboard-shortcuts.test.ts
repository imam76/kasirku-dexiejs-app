import { beforeEach, describe, expect, test } from 'bun:test';
import type { CartItem, Product } from '@/types';
import { useTransactionStore } from '@/store/transactionStore';
import { getAdjacentProductSellableUnit } from '@/utils/productUnits';

const buildProduct = (overrides: Partial<Product> = {}): Product => ({
  id: 'pos-keyboard-product',
  name: 'Produk Shortcut POS',
  purchase_unit: 'pcs',
  selling_unit: 'pcs',
  purchase_price: 5_000,
  selling_price: 10_000,
  stock: 120,
  sku: 'POS-KEYBOARD',
  sellable_units: ['pcs', 'pack', 'dus'],
  unit_mappings: [
    { unit: 'pack', base_unit: 'pcs', ratio: 6 },
    { unit: 'dus', base_unit: 'pcs', ratio: 12 },
  ],
  created_at: '2026-07-23T00:00:00.000Z',
  updated_at: '2026-07-23T00:00:00.000Z',
  ...overrides,
});

const setCart = (items: CartItem[]) => {
  useTransactionStore.setState({
    cart: items,
    activeDraftScope: undefined,
  });
};

describe('POS numpad unit shortcuts', () => {
  beforeEach(() => {
    setCart([]);
  });

  test('cycles sellable units forward, backward, and with wrap-around', () => {
    const product = buildProduct();

    expect(getAdjacentProductSellableUnit(product, 'pcs', 1)).toBe('pack');
    expect(getAdjacentProductSellableUnit(product, 'pack', 1)).toBe('dus');
    expect(getAdjacentProductSellableUnit(product, 'dus', 1)).toBe('pcs');
    expect(getAdjacentProductSellableUnit(product, 'pcs', -1)).toBe('dus');
  });

  test('keeps the only available unit unchanged', () => {
    const product = buildProduct({
      sellable_units: ['pcs'],
      unit_mappings: [],
    });

    expect(getAdjacentProductSellableUnit(product, 'pcs', 1)).toBe('pcs');
    expect(getAdjacentProductSellableUnit(product, 'pcs', -1)).toBe('pcs');
  });

  test('rejects a unit change that would exceed stock without mutating the cart', () => {
    const product = buildProduct({ stock: 20 });
    setCart([{ product, quantity: 2, unit: 'pcs' }]);

    const result = useTransactionStore.getState().updateUnit(product.id, 'dus');

    expect(result).toEqual({
      success: false,
      error: {
        code: 'INSUFFICIENT_STOCK',
        stock: 20,
        unit: 'pcs',
      },
    });
    expect(useTransactionStore.getState().cart[0]).toMatchObject({
      quantity: 2,
      unit: 'pcs',
    });
  });

  test('changes to a valid unit while preserving the numeric quantity', () => {
    const product = buildProduct({ stock: 24 });
    setCart([{ product, quantity: 2, unit: 'pcs' }]);

    const result = useTransactionStore.getState().updateUnit(product.id, 'dus');

    expect(result).toEqual({ success: true });
    expect(useTransactionStore.getState().cart[0]).toMatchObject({
      quantity: 2,
      unit: 'dus',
    });
  });
});
