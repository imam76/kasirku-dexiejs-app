import { describe, expect, test } from 'bun:test';
import dayjs from '@/lib/dayjs';
import type { Product, SalesDocument, SalesDocumentItem, SalesReturn, SalesReturnItem, Transaction, TransactionItem } from '@/types';
import { buildSlowMovingRows, classifySlowMovingProduct, DEFAULT_SLOW_MOVING_FILTERS, filterSlowMovingRows, getSlowMovingBounds, type SlowMovingInput } from '@/utils/inventory/slowMovingReport';
import { getDashboardPeriodRange } from '@/utils/dashboardDateRanges';
import { getRequiredPermissionForPath } from '@/auth/routePermissions';
import { isRouteEnabledForModules } from '@/auth/moduleAccess';
import { ROLE_PERMISSIONS } from '@/auth/permissions';

const date = '2026-09-28T05:00:00.000Z';
const product = (patch: Partial<Product> = {}): Product => ({ id: 'coffee', name: 'Kopi', sku: 'KOP-01', category: 'minuman',
  purchase_unit: 'pcs', selling_unit: 'pcs', stock: 20, purchase_price: 1000, selling_price: 2000,
  product_type: 'FINISHED_GOOD', is_visible_in_pos: true, created_at: '2026-08-01T00:00:00.000Z', updated_at: date, ...patch });
const transaction = (patch: Partial<Transaction> = {}): Transaction => ({ id: 'sale', transaction_number: 'POS-1',
  total_amount: 6000, payment_amount: 6000, change_amount: 0, payment_method: 'TUNAI', created_at: date, ...patch });
const item = (patch: Partial<TransactionItem> = {}): TransactionItem => ({ id: 'line', transaction_id: 'sale', product_id: 'coffee', product_name: 'Kopi',
  price: 2000, purchase_price: 1000, quantity: 3, unit: 'pcs', subtotal: 6000, profit: 3000, created_at: date, ...patch });
const invoice = (patch: Partial<SalesDocument> = {}): SalesDocument => ({ id: 'invoice', document_number: 'INV-1', type: 'SALES_INVOICE', status: 'ISSUED',
  customer_name: 'Pembeli', document_date: '2026-09-28', created_at: date, updated_at: date, ...patch });
const invoiceItem = (patch: Partial<SalesDocumentItem> = {}): SalesDocumentItem => ({ id: 'invoice-line', document_id: 'invoice', product_id: 'coffee', product_name: 'Kopi',
  unit: 'pcs', quantity: 4, created_at: date, ...patch });
const returned = (patch: Partial<SalesReturn> = {}): SalesReturn => ({ id: 'return', return_number: 'RET-1', status: 'ISSUED', source_type: 'POS_TRANSACTION',
  source_id: 'sale', source_number: 'POS-1', customer_name: 'Pembeli', document_date: '2026-09-28', resolution: 'REFUND', subtotal_amount: 2000, total_amount: 2000,
  created_at: date, updated_at: date, ...patch });
const returnItem = (patch: Partial<SalesReturnItem> = {}): SalesReturnItem => ({ id: 'return-line', return_id: 'return', source_item_id: 'line',
  product_id: 'coffee', product_name: 'Kopi', unit: 'pcs', quantity: 1, source_quantity: 3, price: 2000, subtotal: 2000, total_amount: 2000,
  condition: 'SELLABLE', created_at: date, ...patch });
const input = (patch: Partial<SlowMovingInput> = {}): SlowMovingInput => ({ products: [product()], transactions: [], transactionItems: [],
  invoices: [], invoiceItems: [], returns: [], returnItems: [], range: { startDate: '2026-09-01', endDate: '2026-09-28' }, ...patch });

describe('slow-moving product report', () => {
  test('includes unsold and hidden finished products, excludes raw materials and products created after the period', () => {
    const rows = buildSlowMovingRows(input({ products: [product(), product({ id: 'hidden', is_visible_in_pos: false }),
      product({ id: 'raw', product_type: 'RAW_MATERIAL' }), product({ id: 'future', created_at: '2026-10-01T00:00:00Z' }),
      product({ id: 'new', created_at: date })] }));
    expect(rows.map((row) => row.id)).toEqual(['coffee', 'hidden', 'new']);
    expect(rows[2].isNew).toBe(true);
    expect(rows[0]).toMatchObject({ sold: 0, netSold: 0, saleCount: 0, isNew: false });
    expect(classifySlowMovingProduct(rows[0], 5)).toBe('NO_SALES');
  });

  test('uses header dates and excludes voids, expenses, orphan lines and sales outside the Jakarta boundaries', () => {
    const transactions = [transaction({ id: 'start', created_at: '2026-08-31T17:00:00.000Z' }),
      transaction({ id: 'end', created_at: '2026-09-28T16:59:59.999Z' }),
      transaction({ id: 'before', created_at: '2026-08-31T16:59:59.999Z' }),
      transaction({ id: 'after', created_at: '2026-09-28T17:00:00.000Z' }),
      transaction({ id: 'void', status: 'VOIDED' }), transaction({ id: 'expense', business_type: 'EXPENSE' })];
    const row = buildSlowMovingRows(input({ transactions, transactionItems: [
      ...transactions.map((sale) => item({ id: sale.id, transaction_id: sale.id, quantity: 1, created_at: '2020-01-01T00:00:00Z' })), item(),
      item({ id: 'second-start-line', transaction_id: 'start', quantity: 0.5 }),
    ] }))[0];
    expect(row).toMatchObject({ sold: 2.5, netSold: 2.5, saleCount: 2, lastSale: '2026-09-28T16:59:59.999Z' });
    expect(row.dailyAverage).toBeCloseTo(2.5 / 28, 6);
    expect(classifySlowMovingProduct(row, 2.5)).toBe('SLOW');
    expect(classifySlowMovingProduct(row, 2)).toBe('MOVING');
  });

  test('counts issued invoices once, ignoring quotations, deliveries, draft and voided invoices', () => {
    const invoices = [invoice(), invoice({ id: 'delivery', type: 'SALES_DELIVERY' }), invoice({ id: 'quote', type: 'SALES_QUOTATION' }),
      invoice({ id: 'draft', status: 'DRAFT' }), invoice({ id: 'void', status: 'VOIDED' }), invoice({ id: 'old', document_date: '2026-08-31' })];
    const row = buildSlowMovingRows(input({ invoices, invoiceItems: invoices.map((doc) => invoiceItem({ id: doc.id, document_id: doc.id })),
      transactions: [transaction()], transactionItems: [item()] }))[0];
    expect(row).toMatchObject({ sold: 7, saleCount: 2 });
  });

  test('subtracts issued returns in this period, even for old sales, without counting voided returns or delivery returns', () => {
    const returns = [returned(), returned({ id: 'void', status: 'VOIDED' }), returned({ id: 'draft', status: 'DRAFT' }),
      returned({ id: 'future', document_date: '2026-10-01' }), returned({ id: 'delivery', source_type: 'SALES_DELIVERY' })];
    const row = buildSlowMovingRows(input({ transactions: [transaction({ created_at: '2026-08-20T00:00:00Z' })], transactionItems: [item()],
      returns, returnItems: returns.map((doc) => returnItem({ id: doc.id, return_id: doc.id })) }))[0];
    expect(row).toMatchObject({ sold: 0, returned: 1, netSold: -1, saleCount: 0 });
    expect(classifySlowMovingProduct(row, 5)).toBe('NO_NET_SALES');
    const voidSource = buildSlowMovingRows(input({ transactions: [transaction({ status: 'VOIDED' })], returns: [returned()], returnItems: [returnItem()] }))[0];
    expect(voidSource.returned).toBe(0);
  });

  test('nets full POS and invoice returns, including damaged returns that are not restocked', () => {
    const row = buildSlowMovingRows(input({ transactions: [transaction()], transactionItems: [item()], invoices: [invoice()], invoiceItems: [invoiceItem()],
      returns: [returned(), returned({ id: 'invoice-return', source_type: 'SALES_INVOICE', source_id: 'invoice' })],
      returnItems: [returnItem({ quantity: 3, restock_quantity: 0 }), returnItem({ id: 'invoice-return-line', return_id: 'invoice-return', quantity: 4 })] }))[0];
    expect(row).toMatchObject({ sold: 7, returned: 7, netSold: 0 });
    expect(classifySlowMovingProduct(row, 5)).toBe('NO_NET_SALES');
  });

  test('normalizes mixed units and keeps original POS conversion snapshots for sales and returns', () => {
    const packaged = product({ unit_mappings: [{ from_quantity: 1, from_unit: 'box', to_quantity: 24, to_unit: 'pcs' }] });
    const row = buildSlowMovingRows(input({ products: [packaged], transactions: [transaction()],
      transactionItems: [item({ unit: 'box', quantity: 2, base_unit: 'pcs', conversion_value: 12 }), item({ id: 'loose', quantity: 1 })],
      returns: [returned()], returnItems: [returnItem({ unit: 'box', quantity: 1 })] }))[0];
    expect(row).toMatchObject({ sold: 25, returned: 12, netSold: 13, saleCount: 1 });
    const weighted = buildSlowMovingRows(input({ products: [product({ purchase_unit: 'kg', selling_unit: 'gram' })], transactions: [transaction()],
      transactionItems: [item({ quantity: 500, unit: 'gram', base_unit: 'gram', conversion_value: 1 })] }))[0];
    expect(weighted.netSold).toBe(0.5);
  });

  test('flags missing or invalid unit conversions rather than guessing or labelling them unsold', () => {
    for (const line of [item({ unit: 'unmapped' }), item({ quantity: NaN }), item({ quantity: -1 }),
      item({ base_unit: 'pcs', conversion_value: 0 })]) {
      const row = buildSlowMovingRows(input({ transactions: [transaction()], transactionItems: [line] }))[0];
      expect(classifySlowMovingProduct(row, 5)).toBe('REVIEW');
    }
  });

  test('filters attention products and sorts ascending, separating out-of-stock from slow-moving products', () => {
    const rows = buildSlowMovingRows(input({ products: [product(), product({ id: 'empty', stock: 0 }), product({ id: 'negative', stock: -1 }), product({ id: 'sold', sku: 'ABC', category: 'sembako' })],
      transactions: [transaction()], transactionItems: [item({ product_id: 'sold' })] }));
    expect(filterSlowMovingRows(rows, DEFAULT_SLOW_MOVING_FILTERS, 5).map((row) => row.id)).toEqual(['coffee', 'sold']);
    expect(filterSlowMovingRows(rows, { ...DEFAULT_SLOW_MOVING_FILTERS, search: ' abc ', category: 'sembako' }, 5).map((row) => row.id)).toEqual(['sold']);
    expect(filterSlowMovingRows(rows, { search: '', stock: 'ALL', status: 'OUT_OF_STOCK' }, 5).map((row) => row.id)).toEqual(['empty', 'negative']);
    expect(filterSlowMovingRows(rows, DEFAULT_SLOW_MOVING_FILTERS, 0).map((row) => row.id)).toEqual(['coffee']);
  });

  test('supports local calendar presets, leap months and validated custom ranges', () => {
    const now = dayjs.tz('2026-09-28T12:00:00');
    expect(getDashboardPeriodRange('today', undefined, now)).toEqual({ startDate: '2026-09-28', endDate: '2026-09-28' });
    expect(getDashboardPeriodRange('this-week', undefined, now)).toEqual({ startDate: '2026-09-28', endDate: '2026-09-28' });
    expect(getDashboardPeriodRange('last-week', undefined, now)).toEqual({ startDate: '2026-09-21', endDate: '2026-09-27' });
    expect(getDashboardPeriodRange('this-month', undefined, now)).toEqual({ startDate: '2026-09-01', endDate: '2026-09-28' });
    expect(getDashboardPeriodRange('last-month', undefined, now)).toEqual({ startDate: '2026-08-01', endDate: '2026-08-31' });
    expect(getSlowMovingBounds({ startDate: '2024-02-01', endDate: '2024-02-29' }).days).toBe(29);
    expect(getSlowMovingBounds({ startDate: '2026-09-28', endDate: '2026-09-28' })).toEqual({ start: '2026-09-27T17:00:00.000Z', end: '2026-09-28T16:59:59.999Z', days: 1 });
    expect(() => getSlowMovingBounds({ startDate: '2026-02-30', endDate: '2026-03-01' })).toThrow();
    expect(() => getSlowMovingBounds({ startDate: '2026-09-29', endDate: '2026-09-28' })).toThrow();
    expect(() => getSlowMovingBounds({ startDate: '', endDate: '2026-09-28' })).toThrow();
  });

  test('requires a dedicated report permission with product or POS report module access', () => {
    expect(getRequiredPermissionForPath('/report/slow-moving-report')).toBe('REPORT_SLOW_MOVING_VIEW');
    expect(isRouteEnabledForModules('/report/slow-moving-report', ['PRODUCT'])).toBe(true);
    expect(isRouteEnabledForModules('/report/slow-moving-report', ['REPORT_POS_SALES'])).toBe(true);
    expect(isRouteEnabledForModules('/report/slow-moving-report', ['REPORT_PURCHASE'])).toBe(false);
    for (const role of ['OWNER', 'ADMIN', 'GUDANG'] as const) expect(ROLE_PERMISSIONS[role]).toContain('REPORT_SLOW_MOVING_VIEW');
    expect(ROLE_PERMISSIONS.KASIR).not.toContain('REPORT_SLOW_MOVING_VIEW');
  });
});
