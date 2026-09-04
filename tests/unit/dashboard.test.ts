import { describe, expect, test } from 'bun:test';
import {
  buildDailySalesBuckets,
  buildPosSalesReportData,
} from '@/services/posSalesReportAggregator';
import type { DashboardPreference, DashboardWidgetLayout, Product, Transaction, TransactionItem } from '@/types';
import {
  DASHBOARD_COLUMNS,
  DASHBOARD_WIDGET_IDS,
  normalizeDashboardPreference,
} from '@/utils/dashboardPreferences';

const buildTransaction = (partial: Partial<Transaction>): Transaction => ({
  id: 'transaction-1',
  transaction_number: 'TRX-001',
  total_amount: 0,
  payment_amount: 0,
  change_amount: 0,
  payment_method: 'TUNAI',
  payment_method_code: 'CASH',
  payment_method_name: 'Tunai',
  payment_method_category: 'CASH',
  created_at: '2026-07-01T03:00:00.000Z',
  status: 'COMPLETED',
  ...partial,
});

const buildProduct = (id: string, name: string): Product => ({
  id,
  name,
  category: 'snack',
  purchase_unit: 'pcs',
  selling_unit: 'pcs',
  purchase_price: 1_000,
  selling_price: 2_000,
  stock: 10,
  created_at: '2026-07-01T00:00:00.000Z',
  updated_at: '2026-07-01T00:00:00.000Z',
});

const buildItem = (
  product: Product,
  subtotal: number,
  partial: Partial<TransactionItem> = {},
): TransactionItem => ({
  id: `item-${product.id}`,
  transaction_id: 'transaction-1',
  product_id: product.id,
  product_name: product.name,
  price: subtotal,
  purchase_price: 0,
  quantity: 1,
  unit: 'pcs',
  subtotal,
  profit: subtotal / 2,
  created_at: '2026-07-01T03:05:00.000Z',
  ...partial,
});

describe('dashboard POS aggregation', () => {
  test('builds daily sales buckets and ignores voided transactions', () => {
    const buckets = buildDailySalesBuckets([
      buildTransaction({
        id: 'active-1',
        total_amount: 100_000,
        created_at: '2026-07-01T04:00:00.000Z',
      }),
      buildTransaction({
        id: 'voided-1',
        total_amount: 500_000,
        status: 'VOIDED',
        created_at: '2026-07-02T04:00:00.000Z',
      }),
    ], '2026-07-01', '2026-07-03');

    expect(buckets).toHaveLength(3);
    expect(buckets.map((bucket) => bucket.date)).toEqual(['2026-07-01', '2026-07-02', '2026-07-03']);
    expect(buckets.map((bucket) => bucket.totalRevenue)).toEqual([100_000, 0, 0]);
    expect(buckets.map((bucket) => bucket.transactionCount)).toEqual([1, 0, 0]);
  });

  test('limits top products to five and ranks ties by product name', () => {
    const products = [
      buildProduct('p1', 'Delta'),
      buildProduct('p2', 'Alpha'),
      buildProduct('p3', 'Beta'),
      buildProduct('p4', 'Echo'),
      buildProduct('p5', 'Foxtrot'),
      buildProduct('p6', 'Golf'),
    ];
    const data = buildPosSalesReportData({
      transactions: [buildTransaction({ total_amount: 2_200_000 })],
      products,
      items: [
        buildItem(products[0], 400_000),
        buildItem(products[1], 500_000),
        buildItem(products[2], 500_000),
        buildItem(products[3], 300_000),
        buildItem(products[4], 200_000),
        buildItem(products[5], 100_000),
      ],
      startDate: '2026-07-01',
      endDate: '2026-07-01',
      topProductsLimit: 5,
    });

    expect(data.topProducts).toHaveLength(5);
    expect(data.topProducts.map((product) => product.product_id)).toEqual(['p2', 'p3', 'p1', 'p4', 'p5']);
    expect(data.topProducts[0].totalQuantity).toBe('1 pcs');
  });
});

describe('dashboard preference normalization', () => {
  test('drops unknown visible widgets and repairs missing layouts', () => {
    const preference: DashboardPreference = {
      id: 'dashboard:user-1',
      user_id: 'user-1',
      visible_widget_ids: ['revenue', 'unknown-widget'] as DashboardPreference['visible_widget_ids'],
      layouts: {
        lg: [
          { i: 'revenue', x: 99, y: 1, w: 99, h: 0 },
          { i: 'unknown-widget', x: 0, y: 0, w: 1, h: 1 } as unknown as DashboardWidgetLayout,
        ],
      },
      created_at: '2026-07-01T00:00:00.000Z',
      updated_at: '2026-07-01T00:00:00.000Z',
    };

    const normalized = normalizeDashboardPreference(preference, 'user-1');
    const largeLayouts = normalized.layouts.lg ?? [];
    const revenueLayout = largeLayouts.find((layout) => layout.i === 'revenue');

    expect(normalized.visible_widget_ids).toEqual(['revenue']);
    expect(largeLayouts.map((layout) => layout.i)).toEqual(DASHBOARD_WIDGET_IDS);
    expect(normalized.layouts.sm?.map((layout) => layout.i)).toEqual(DASHBOARD_WIDGET_IDS);
    expect(largeLayouts.some((layout) => layout.i === 'unknown-widget')).toBe(false);
    expect(revenueLayout?.w).toBe(DASHBOARD_COLUMNS.lg);
    expect(revenueLayout?.h).toBe(2);
    expect(revenueLayout?.h).toBeGreaterThanOrEqual(revenueLayout?.minH ?? 1);
  });
});
