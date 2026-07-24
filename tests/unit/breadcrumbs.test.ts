import { describe, expect, test } from 'bun:test';
import { translate, type Locale } from '@/i18n/messages';
import {
  getBreadcrumbItems,
  normalizeBreadcrumbPath,
  shouldShowBreadcrumbs,
  type BreadcrumbTranslate,
} from '@/navigation/breadcrumbs';

const translator = (locale: Locale): BreadcrumbTranslate => (
  (key, params) => translate(locale, key, params)
);

const id = translator('id');
const en = translator('en');

const labels = (pathname: string, t: BreadcrumbTranslate = id) => (
  getBreadcrumbItems(pathname, t).map((item) => item.label)
);

describe('global breadcrumb resolver', () => {
  test('normalizes trailing slashes, query strings, and hashes', () => {
    expect(normalizeBreadcrumbPath('/master-data/products///?tab=active#top'))
      .toBe('/master-data/products');
    expect(normalizeBreadcrumbPath('/')).toBe('/');
    expect(labels('/master-data/products/')).toEqual([
      'Home',
      'Master Data',
      'Produk',
    ]);
  });

  test('uses the logical HR hierarchy for routes hosted by other modules', () => {
    expect(getBreadcrumbItems('/master-data/areas', id)).toEqual([
      { label: 'Home', to: '/', current: false },
      { label: 'HR', to: '/hr', current: false },
      { label: 'Area', current: true },
    ]);

    expect(labels('/master-data/employees')).toEqual(['Home', 'HR', 'Karyawan']);
    expect(labels('/finance/payroll')).toEqual(['Home', 'HR', 'Payroll']);
  });

  test('builds deep cooperative report and opening-balance hierarchies', () => {
    expect(labels('/koperasi/laporan/drop-harian')).toEqual([
      'Home',
      'Koperasi',
      'Laporan',
      'Drop Harian',
    ]);
    expect(labels('/finance/opening-balances/advance-received')).toEqual([
      'Home',
      'Keuangan',
      'Saldo Awal',
      'Uang Muka Masuk',
    ]);
  });

  test('uses semantic actions for sales and purchase document routes', () => {
    const salesItems = getBreadcrumbItems(
      '/sales/si/550e8400-e29b-41d4-a716-446655440000/edit',
      id,
    );
    expect(salesItems.map((item) => item.label)).toEqual([
      'Home',
      'Sales',
      'Sales Invoice',
      'Detail',
      'Edit',
    ]);
    expect(salesItems[3].to)
      .toBe('/sales/si/550e8400-e29b-41d4-a716-446655440000');
    expect(salesItems.map((item) => item.label).join(' '))
      .not.toContain('550e8400-e29b-41d4-a716-446655440000');

    expect(labels('/purchases/gr/document-123/reconcile')).toEqual([
      'Home',
      'Purchases',
      'Purchase Receipt',
      'Detail',
      'Rekonsiliasi',
    ]);
    expect(labels('/sales/returns/new')).toEqual([
      'Home',
      'Sales',
      'Retur Sales',
      'Baru',
    ]);
  });

  test('keeps finance aliases inside the finance hierarchy', () => {
    expect(labels('/finance/sales/si/document-123')).toEqual([
      'Home',
      'Keuangan',
      'Dokumen Sales',
      'Sales Invoice',
      'Detail',
    ]);
    expect(labels('/finance/purchases/pending-costs')).toEqual([
      'Home',
      'Keuangan',
      'Purchases',
      'Biaya Pembelian Tertunda',
    ]);
  });

  test('keeps structural marketplace parents non-clickable and hides order ids', () => {
    const items = getBreadcrumbItems(
      '/marketplace/shopee/orders/220724ABC123456789',
      id,
    );

    expect(items).toEqual([
      { label: 'Home', to: '/', current: false },
      { label: 'Marketplace', current: false },
      { label: 'Shopee', to: '/marketplace/shopee', current: false },
      { label: 'Detail Pesanan', current: true },
    ]);
    expect(JSON.stringify(items)).not.toContain('220724ABC123456789');
  });

  test('humanizes unknown routes and protects opaque fallback ids', () => {
    expect(labels('/future-tools/customer-groups')).toEqual([
      'Home',
      'Future Tools',
      'Customer Groups',
    ]);

    const items = getBreadcrumbItems(
      '/future-tools/orders/550e8400-e29b-41d4-a716-446655440000/edit',
      id,
    );
    expect(items.map((item) => item.label)).toEqual([
      'Home',
      'Future Tools',
      'Orders',
      'Detail',
      'Edit',
    ]);
    expect(items.map((item) => item.label).join(' '))
      .not.toContain('550e8400-e29b-41d4-a716-446655440000');
  });

  test('reacts to locale changes without changing route data', () => {
    expect(labels('/koperasi/laporan/drop-harian', en)).toEqual([
      'Home',
      'Cooperative',
      'Reports',
      'Daily Drop',
    ]);
    expect(labels('/finance/opening-balances/advance-received', en)).toEqual([
      'Home',
      'Finance',
      'Opening Balances',
      'Advance Received',
    ]);
  });

  test('only shows hierarchical, non-redirect breadcrumbs', () => {
    expect(shouldShowBreadcrumbs('/', getBreadcrumbItems('/', id))).toBeFalse();
    expect(shouldShowBreadcrumbs('/transaction', getBreadcrumbItems('/transaction', id)))
      .toBeFalse();
    expect(shouldShowBreadcrumbs('/settings', getBreadcrumbItems('/settings', id)))
      .toBeFalse();
    expect(shouldShowBreadcrumbs(
      '/master-data/products',
      getBreadcrumbItems('/master-data/products', id),
    )).toBeTrue();
    expect(shouldShowBreadcrumbs(
      '/finance/general-ledger/setup',
      getBreadcrumbItems('/finance/general-ledger/setup', id),
    )).toBeFalse();
  });
});
