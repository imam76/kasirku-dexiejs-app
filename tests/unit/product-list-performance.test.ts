import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  buildProductSearchKey,
  buildProductSearchKeyPrefix,
  buildProductSearchKeys,
} from '../../src/lib/database/checkoutReadModels';
import type { Product } from '../../src/types';

const readSource = (path: string) => readFileSync(
  new URL(`../../${path}`, import.meta.url),
  'utf8',
);

const posCatalogSource = readSource('src/services/posCatalogReadService.ts');
const productListSource = readSource('src/services/productListReadService.ts');
const stockHookSource = readSource('src/hooks/useStockManagement.tsx');

const product: Product = {
  id: 'product-1',
  name: 'Indomie Goreng Spesial',
  sku: 'IDM-001',
  category: 'makanan_instan',
  purchase_unit: 'pcs',
  selling_unit: 'pcs',
  purchase_price: 2_000,
  selling_price: 3_000,
  stock: 20,
  product_type: 'FINISHED_GOOD',
  is_visible_in_pos: true,
  created_at: '2026-09-16T00:00:00.000Z',
  updated_at: '2026-09-16T00:00:00.000Z',
};

describe('bounded product list architecture', () => {
  test('uses resumable indexes instead of deep offsets', () => {
    expect(posCatalogSource).not.toContain('.offset(');
    expect(posCatalogSource).not.toContain('typeof optionsOrPage');
    expect(productListSource).not.toContain('.offset(');
    expect(posCatalogSource).toContain("where('[name+id]')");
    expect(productListSource).toContain("where('[created_at+id]')");
    expect(posCatalogSource).toContain('.limit(limit + 1)');
    expect(productListSource).toContain('.limit(limit + 1)');
  });

  test('master screen no longer subscribes to the whole products table', () => {
    expect(stockHookSource).not.toContain("db.products.orderBy('created_at').reverse().toArray()");
    expect(stockHookSource).not.toContain('db.products.count()');
    expect(stockHookSource).toContain('useInfiniteQuery');
    expect(stockHookSource).toContain('readProductListPage');
  });

  test('one exact n-gram key per product makes substring search cursor-safe', () => {
    const allPrefix = buildProductSearchKeyPrefix('domie');
    const keys = buildProductSearchKeys(product);

    expect(keys.filter((key) => key.startsWith(allPrefix))).toHaveLength(1);
    expect(keys).toContain(buildProductSearchKey(product, 'domie'));
    expect(keys).toContain(buildProductSearchKey(product, 'idm-001'));
  });
});
