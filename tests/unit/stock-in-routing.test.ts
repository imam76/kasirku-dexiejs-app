import { describe, expect, test } from 'bun:test';
import type { Product } from '@/types';
import { resolveStockInRouting } from '@/utils/stockIn/stockInRouting';
import {
  buildOpeningBalanceLines,
  buildPurchasePayload,
  assertNewProductsCarryNoStock,
} from '@/utils/stockIn/stockInPayload';
import type { StockInLine } from '@/utils/stockIn/stockInCsv';
import { buildManualStockInLine } from '@/utils/stockIn/stockInLine';

const CUTOFF = '2026-06-30';

const product: Product = {
  id: 'product-a',
  sku: 'A',
  name: 'Produk A',
  category: 'sembako',
  purchase_unit: 'pcs',
  selling_unit: 'pcs',
  purchase_price: 10_000,
  selling_price: 12_000,
  stock: 0,
  product_type: 'FINISHED_GOOD',
  is_visible_in_pos: true,
  wholesale_prices: [],
  sellable_units: ['pcs'],
  unit_mappings: [],
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
};

const line = (overrides: Partial<StockInLine> = {}): StockInLine => ({
  rowNumber: 2,
  rawRow: [],
  product,
  isNewProduct: false,
  quantity: 10,
  unit: 'dus',
  baseQuantity: 240,
  costPerUnit: 240_000,
  costPerBaseUnit: 10_000,
  totalValue: 2_400_000,
  ...overrides,
});

describe('stock-in routing by date', () => {
  test('a date after the cutoff becomes a purchase invoice when the price is known', () => {
    const routing = resolveStockInRouting({
      documentDate: '2026-08-06',
      cutoffDate: CUTOFF,
      hasFinalPrice: true,
    });

    expect(routing).toEqual({
      mode: 'PURCHASE',
      purchaseDocumentType: 'PURCHASE_INVOICE',
      openingBlocker: undefined,
      redirectedFromOpening: false,
    });
  });

  test('a date after the cutoff becomes a receipt when the price is still pending', () => {
    const routing = resolveStockInRouting({
      documentDate: '2026-08-06',
      cutoffDate: CUTOFF,
      hasFinalPrice: false,
    });

    expect(routing.mode).toBe('PURCHASE');
    expect(routing.purchaseDocumentType).toBe('PURCHASE_RECEIPT');
  });

  test('a date on or before the cutoff takes the opening route', () => {
    const onCutoff = resolveStockInRouting({
      documentDate: CUTOFF,
      cutoffDate: CUTOFF,
      hasFinalPrice: true,
    });
    const beforeCutoff = resolveStockInRouting({
      documentDate: '2026-01-15',
      cutoffDate: CUTOFF,
      hasFinalPrice: true,
    });

    expect(onCutoff.mode).toBe('OPENING');
    expect(onCutoff.purchaseDocumentType).toBeUndefined();
    expect(beforeCutoff.mode).toBe('OPENING');
  });

  test('a draft opening batch still allows the opening route', () => {
    const routing = resolveStockInRouting({
      documentDate: '2026-01-15',
      cutoffDate: CUTOFF,
      openingBatch: { status: 'DRAFT' },
      hasFinalPrice: true,
    });

    expect(routing.mode).toBe('OPENING');
  });

  test('a posted opening batch pushes the document forward to a purchase', () => {
    const routing = resolveStockInRouting({
      documentDate: '2026-01-15',
      cutoffDate: CUTOFF,
      openingBatch: { status: 'POSTED' },
      hasFinalPrice: true,
    });

    expect(routing.mode).toBe('PURCHASE');
    expect(routing.openingBlocker).toBe('BATCH_POSTED');
    expect(routing.redirectedFromOpening).toBe(true);
  });

  test('a locked opening batch is reported separately from a posted one', () => {
    const routing = resolveStockInRouting({
      documentDate: '2026-01-15',
      cutoffDate: CUTOFF,
      openingBatch: { status: 'LOCKED' },
      hasFinalPrice: true,
    });

    expect(routing.openingBlocker).toBe('BATCH_LOCKED');
    expect(routing.redirectedFromOpening).toBe(true);
  });

  test('without a cutoff every date is a purchase', () => {
    const routing = resolveStockInRouting({
      documentDate: '2020-01-01',
      hasFinalPrice: true,
    });

    expect(routing.mode).toBe('PURCHASE');
    expect(routing.openingBlocker).toBe('NO_CUTOFF');
    expect(routing.redirectedFromOpening).toBe(false);
  });
});

describe('stock-in payload mapping', () => {
  test('opening lines are expressed in the product stock unit', () => {
    const lines = buildOpeningBalanceLines([line({ notes: 'gudang lama' })]);

    expect(lines).toEqual([{
      product_id: 'product-a',
      opening_quantity: 240,
      cost_per_unit: 10_000,
      notes: 'gudang lama',
    }]);
  });

  test('purchase items keep the unit the user typed', () => {
    const { document, items } = buildPurchasePayload({
      lines: [line()],
      documentDate: '2026-08-06',
      documentType: 'PURCHASE_INVOICE',
      supplierName: 'PT Contoh',
    });

    expect(document).toMatchObject({
      type: 'PURCHASE_INVOICE',
      status: 'DRAFT',
      document_date: '2026-08-06',
      supplier_name: 'PT Contoh',
    });
    expect(document.cost_status).toBeUndefined();
    expect(items[0]).toMatchObject({
      product_id: 'product-a',
      unit: 'dus',
      quantity: 10,
      received_quantity: 10,
      price: 240_000,
    });
  });

  test('a receipt with any pending price is marked pending, not final', () => {
    const pending = buildPurchasePayload({
      lines: [line(), line({ costPerUnit: undefined, costPerBaseUnit: undefined })],
      documentDate: '2026-08-06',
      documentType: 'PURCHASE_RECEIPT',
    });
    const priced = buildPurchasePayload({
      lines: [line()],
      documentDate: '2026-08-06',
      documentType: 'PURCHASE_RECEIPT',
    });

    expect(pending.document.cost_status).toBe('PENDING');
    expect(priced.document.cost_status).toBe('FINAL');
  });

  test('a manually typed row converts exactly like an uploaded one', () => {
    const multiUnit: Product = {
      ...product,
      unit_mappings: [{ unit: 'dus', base_unit: 'pcs', ratio: 24 }],
      sellable_units: ['pcs', 'dus'],
    };
    const result = buildManualStockInLine({
      rowNumber: 1,
      product: multiUnit,
      quantity: 10,
      unit: 'dus',
      costPerUnit: 240_000,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.line).toMatchObject({
      baseQuantity: 240,
      costPerBaseUnit: 10_000,
      totalValue: 2_400_000,
    });
  });

  test('a manual row falls back to the product stock unit and rejects bad input', () => {
    const fallback = buildManualStockInLine({ rowNumber: 1, product, quantity: 3 });
    const zeroQuantity = buildManualStockInLine({ rowNumber: 1, product, quantity: 0 });
    const unknownUnit = buildManualStockInLine({
      rowNumber: 1,
      product,
      quantity: 3,
      unit: 'dus',
    });
    const negativePrice = buildManualStockInLine({
      rowNumber: 1,
      product,
      quantity: 3,
      costPerUnit: -1,
    });

    expect(fallback.ok && fallback.line.unit).toBe('pcs');
    expect(zeroQuantity.ok).toBe(false);
    expect(unknownUnit.ok).toBe(false);
    expect(!unknownUnit.ok && unknownUnit.error).toContain('tidak dikenal');
    expect(negativePrice.ok).toBe(false);
  });

  test('refuses a new product that arrived carrying stock', () => {
    expect(() => assertNewProductsCarryNoStock([
      line({ isNewProduct: true, product: { ...product, stock: 5 } }),
    ])).toThrow('tidak boleh membawa stok awal');

    expect(() => assertNewProductsCarryNoStock([
      line({ isNewProduct: true }),
    ])).not.toThrow();
  });
});
