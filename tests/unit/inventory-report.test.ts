import { describe, expect, test } from 'bun:test';
import type { InventoryLot, Product } from '@/types';
import { accumulateInventoryLot, buildInventoryReportRows, filterInventoryReportRows, summarizeInventoryReport, type InventoryLotSummary } from '@/utils/inventory/inventoryReport';
import { getRequiredPermissionForPath } from '@/auth/routePermissions';
import { getModuleCodesForPath, isRouteEnabledForModules } from '@/auth/moduleAccess';

const date = '2026-09-28T00:00:00.000Z';
const product = (overrides: Partial<Product> = {}): Product => ({
  id: 'coffee', name: 'Kopi', sku: 'KOP-01', category: 'minuman', purchase_unit: 'pcs', selling_unit: 'pcs',
  stock: 5, purchase_price: 999, selling_price: 2000, product_type: 'FINISHED_GOOD',
  is_visible_in_pos: true, created_at: date, updated_at: date, ...overrides,
});
const lot = (overrides: Partial<InventoryLot> = {}): InventoryLot => ({
  id: 'lot-1', product_id: 'coffee', product_name: 'Kopi', source_type: 'PURCHASE_RECEIPT',
  quantity_received: 10, quantity_remaining: 10, fifo_remaining: 5, cost_per_unit: 100,
  received_at: date, created_at: date, updated_at: date, ...overrides,
});
const report = (products: Product[], lots: InventoryLot[]) => {
  const summary = new Map<string, InventoryLotSummary>();
  lots.forEach((item) => accumulateInventoryLot(summary, item));
  return buildInventoryReportRows(products, summary);
};

describe('current inventory valuation', () => {
  test('values remaining FIFO layers rather than master price or stale quantity_remaining', () => {
    const rows = report([product()], [lot({ fifo_remaining: 2 }), lot({ id: 'new', fifo_remaining: 3, cost_per_unit: 200 })]);
    expect(rows[0]).toMatchObject({ stock: 5, lotQuantity: 5, value: 800, unitCost: 160, valuationStatus: 'FIFO', discrepancy: false });
  });

  test('ignores consumed and opening-replaced lots, including pending costs on consumed lots', () => {
    expect(report([product()], [lot(), lot({ id: 'old', fifo_remaining: 0, cost_status: 'PENDING' }),
      lot({ id: 'replaced', fifo_excluded: true, fifo_remaining: 20 })])[0].value).toBe(500);
  });

  test('includes estimated costs with explicit status and does not turn pending cost into zero', () => {
    const estimated = report([product()], [lot({ cost_status: 'ESTIMATED', cost_per_unit: 150 })]);
    expect(estimated[0]).toMatchObject({ value: 750, valuationStatus: 'ESTIMATED' });
    expect(summarizeInventoryReport(estimated)).toMatchObject({ value: 750, estimatedCount: 1 });
    const pending = report([product()], [lot({ cost_status: 'PENDING', cost_per_unit: 0 })]);
    expect(pending[0]).toMatchObject({ value: null, unitCost: null, valuationStatus: 'UNVALUED' });
    expect(summarizeInventoryReport(pending)).toMatchObject({ value: 0, unvaluedCount: 1 });
  });

  test('makes both excess and missing lot stock an explicit master-price estimate', () => {
    for (const lots of [[], [lot({ fifo_remaining: 2 })], [lot({ fifo_remaining: 8 })]]) {
      expect(report([product({ purchase_price: 100 })], lots)[0])
        .toMatchObject({ value: 500, unitCost: 100, discrepancy: true, valuationStatus: 'MASTER_PRICE' });
    }
    expect(report([product({ purchase_price: 0 })], [])[0].value).toBeNull();
  });

  test('supports explicit zero-cost final lots and fractional quantities', () => {
    expect(report([product()], [lot({ cost_per_unit: 0 })])[0]).toMatchObject({ value: 0, valuationStatus: 'FIFO' });
    expect(report([product({ stock: 0.3 })], [lot({ fifo_remaining: 0.1, cost_per_unit: 10 }),
      lot({ id: 'two', fifo_remaining: 0.2, cost_per_unit: 20 })])[0]).toMatchObject({ value: 5, discrepancy: false });
  });

  test('does not claim reliable value for negative stock or invalid lot balances/cost', () => {
    expect(report([product({ stock: -1 })], [])[0].value).toBeNull();
    for (const invalid of [lot({ fifo_remaining: undefined }), lot({ fifo_remaining: -1 }),
      lot({ cost_per_unit: NaN }), lot({ cost_per_unit: -1 })]) {
      expect(report([product()], [invalid])[0].value).toBeNull();
    }
    expect(report([product({ stock: 0 })], [lot()])[0]).toMatchObject({ value: 0, discrepancy: true });
  });

  test('filters before summing all products and keeps kg separate from pcs', () => {
    const rows = report([
      product(), product({ id: 'rice', name: 'Beras', sku: 'RICE', category: 'sembako', purchase_unit: 'kg', stock: 2.5, product_type: 'RAW_MATERIAL' }),
      product({ id: 'empty', name: 'Kosong', stock: 0 }),
    ], []);
    const inStock = filterInventoryReportRows(rows, { search: '', stock: 'IN_STOCK' });
    expect(summarizeInventoryReport(inStock)).toMatchObject({ productCount: 2, quantities: [{ unit: 'kg', quantity: 2.5 }, { unit: 'pcs', quantity: 5 }] });
    expect(filterInventoryReportRows(rows, { search: ' rice ', stock: 'ALL', category: 'sembako', productType: 'RAW_MATERIAL' }).map((row) => row.id)).toEqual(['rice']);
    expect(filterInventoryReportRows(rows, { search: '', stock: 'OUT' }).map((row) => row.id)).toEqual(['empty']);
    expect(filterInventoryReportRows(rows, { search: '', stock: 'LOW' }).length).toBe(2);
    expect(summarizeInventoryReport([])).toMatchObject({ productCount: 0, value: 0, quantities: [] });
  });

  test('requires its own permission and is available with the existing product module', () => {
    expect(getRequiredPermissionForPath('/report/inventory-report')).toBe('REPORT_INVENTORY_VIEW');
    expect(getModuleCodesForPath('/report/inventory-report')).toEqual(['PRODUCT', 'REPORT_STOCK_CARD']);
    expect(isRouteEnabledForModules('/report/inventory-report', ['PRODUCT'])).toBe(true);
    expect(isRouteEnabledForModules('/report', ['PRODUCT'])).toBe(true);
    expect(isRouteEnabledForModules('/report/inventory-report', ['REPORT_POS_SALES'])).toBe(false);
  });
});
