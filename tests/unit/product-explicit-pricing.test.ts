import { describe, expect, test } from 'bun:test';
import type { Product } from '@/types';
import {
  getPrice,
  getPurchasePrice,
  konversiSatuanProduk,
} from '@/utils/pricing';

const product: Product = {
  id: 'box-to-bundle',
  name: 'Produk Box dan Ikat',
  purchase_unit: 'box',
  selling_unit: 'box',
  purchase_price: 50_000,
  selling_price: 50_000,
  stock: 10,
  product_type: 'FINISHED_GOOD',
  is_visible_in_pos: true,
  sellable_units: ['box', 'ikat'],
  unit_mappings: [{
    from_quantity: 1,
    from_unit: 'box',
    to_quantity: 10,
    to_unit: 'ikat',
  }],
  created_at: '2026-08-04T00:00:00.000Z',
  updated_at: '2026-08-04T00:00:00.000Z',
};

describe('explicit product equation pricing', () => {
  test('calculates 1 ikat as one tenth of a Rp50.000 box', () => {
    expect(getPrice(product, 1, 'ikat')).toBe(5_000);
    expect(getPurchasePrice(product, 'ikat')).toBe(5_000);
    expect(konversiSatuanProduk(1, product, 'ikat', 'box')).toBe(0.1);
    expect(konversiSatuanProduk(1, product, 'box', 'ikat')).toBe(10);
  });

  test('fails closed instead of pricing a contradictory graph as 1:1', () => {
    const contradictoryProduct: Product = {
      ...product,
      unit_mappings: [
        ...product.unit_mappings!,
        { from_quantity: 1, from_unit: 'box', to_quantity: 5, to_unit: 'pack' },
        { from_quantity: 1, from_unit: 'pack', to_quantity: 3, to_unit: 'ikat' },
      ],
    };

    expect(() => getPrice(contradictoryProduct, 1, 'ikat')).toThrow('saling bertentangan');
  });

  test('interprets a new wholesale unit price in the selected tier unit', () => {
    const wholesaleProduct: Product = {
      ...product,
      wholesale_prices: [{
        min_quantity: 2,
        unit: 'ikat',
        price: 4_500,
        price_type: 'unit',
      }],
    };

    expect(getPrice(wholesaleProduct, 1, 'ikat')).toBe(5_000);
    expect(getPrice(wholesaleProduct, 2, 'ikat')).toBe(4_500);
    expect(getPrice(wholesaleProduct, 0.2, 'box')).toBe(45_000);
  });
});
