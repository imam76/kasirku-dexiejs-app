import {
  SALES_DOCUMENT_TYPE_OPTIONS,
  getSalesDocumentTypeFromPathSegment,
} from '@/configs/sales-document';
import {
  PURCHASE_DOCUMENT_TYPE_OPTIONS,
  getPurchaseDocumentTypeFromPathSegment,
} from '@/configs/purchase-document';
import type { TranslationKey, TranslationParams } from '@/i18n/messages';

export type BreadcrumbTranslate = (
  key: TranslationKey,
  params?: TranslationParams,
) => string;

export type BreadcrumbItem = {
  label: string;
  to?: string;
  current: boolean;
};

type BreadcrumbDraft = Omit<BreadcrumbItem, 'current'>;

const STATIC_LABEL_KEYS: Record<string, TranslationKey> = {
  '/': 'nav.home',
  '/transaction': 'nav.transaction',
  '/pos-resto': 'nav.posRestaurant',
  '/sales': 'nav.sales',
  '/purchases': 'nav.purchases',
  '/master-data': 'nav.masterData',
  '/history': 'nav.history',
  '/finance': 'nav.finance',
  '/hr': 'nav.hr',
  '/koperasi': 'nav.cooperative',
  '/marketplace': 'nav.marketplace',
  '/marketplace/shopee': 'nav.marketplace.shopee',
  '/report': 'nav.reports',
  '/sync-db': 'nav.syncDb',
  '/settings': 'nav.settings',
  '/profit': 'nav.report.profit',

  '/master-data/products': 'nav.product',
  '/master-data/production': 'nav.production',
  '/master-data/stock-opname': 'nav.stockOpname',
  '/master-data/promos': 'nav.promos',
  '/master-data/contacts': 'nav.contacts',
  '/master-data/warehouses': 'nav.warehouses',
  '/master-data/payment-methods': 'nav.paymentMethods',
  '/master-data/currencies': 'nav.currencies',
  '/master-data/areas': 'nav.areas',
  '/master-data/employees': 'nav.employees',
  '/master-data/roles': 'nav.roles',
  '/master-data/departments': 'nav.departments',
  '/master-data/projects': 'nav.projects',
  '/master-data/fixed-assets': 'nav.fixedAssets',
  '/master-data/taxes': 'nav.taxes',
  '/master-data/units': 'nav.units',

  '/finance/cash-flow': 'nav.finance.cashFlow',
  '/finance/cash-bank-reconciliation': 'breadcrumb.finance.cashBankReconciliation',
  '/finance/receivables': 'nav.finance.receivables',
  '/finance/receivables/overpayments': 'salesOverpayments.title',
  '/finance/payables': 'nav.finance.payables',
  '/finance/payroll': 'nav.finance.payroll',
  '/finance/chart-of-accounts': 'nav.finance.chartOfAccounts',
  '/finance/opening-balances': 'nav.finance.openingBalances',
  '/finance/opening-balances/accounts': 'openingBalances.modules.account.short',
  '/finance/opening-balances/receivables': 'openingBalances.modules.receivable.short',
  '/finance/opening-balances/payables': 'openingBalances.modules.payable.short',
  '/finance/opening-balances/advance-received': 'openingBalances.modules.advanceReceived.short',
  '/finance/opening-balances/advance-paid': 'openingBalances.modules.advancePaid.short',
  '/finance/general-ledger': 'nav.finance.generalLedger',
  '/finance/closing': 'closing.title',
  '/finance/sales': 'nav.finance.sales',
  '/finance/purchases': 'nav.finance.purchases',
  '/finance/purchases/pending-costs': 'breadcrumb.purchases.pendingCosts',
  '/purchases/pending-costs': 'breadcrumb.purchases.pendingCosts',

  '/koperasi/anggota': 'nav.cooperative.members',
  '/koperasi/simpanan': 'nav.cooperative.savings',
  '/koperasi/migrasi-simpanan': 'nav.cooperative.savingMigration',
  '/koperasi/pinjaman': 'nav.cooperative.loans',
  '/koperasi/migrasi-pinjaman': 'nav.cooperative.loanMigration',
  '/koperasi/angsuran': 'nav.cooperative.installments',
  '/koperasi/penagihan': 'cooperative.billing.title',
  '/koperasi/kas-petugas': 'nav.cooperative.fieldCash',
  '/koperasi/laporan': 'nav.cooperative.reports',
  '/koperasi/laporan/ringkasan': 'nav.cooperative.reportsOverview',
  '/koperasi/laporan/arus-kas': 'cooperative.reports.tabs.cashFlowStatement',
  '/koperasi/laporan/simpanan-sukarela': 'nav.cooperative.voluntarySavingsReport',
  '/koperasi/laporan/tabungan-masuk': 'nav.cooperative.savingInReport',
  '/koperasi/laporan/tabungan-keluar': 'nav.cooperative.savingOutReport',
  '/koperasi/laporan/buku-angsuran': 'nav.cooperative.installmentBook',
  '/koperasi/laporan/iptw': 'nav.cooperative.iptwReport',
  '/koperasi/laporan/tunai': 'nav.cooperative.cashReport',
  '/koperasi/laporan/target-harian': 'nav.cooperative.dailyTarget',
  '/koperasi/laporan/kas-harian-pdl': 'cooperative.reportIndex.items.dailyFieldCash',
  '/koperasi/laporan/storting-harian': 'nav.cooperative.dailyStorting',
  '/koperasi/laporan/drop-harian': 'nav.cooperative.dailyDrop',
  '/koperasi/laporan/drop-mingguan': 'nav.cooperative.weeklyDrop',
  '/koperasi/laporan/perkembangan-resort': 'nav.cooperative.resortDevelopment',
  '/koperasi/laporan/induk-anggota': 'nav.cooperative.memberRegister',

  '/report/pos-sales-report': 'nav.report.posSales',
  '/report/sales-report': 'nav.report.sales',
  '/report/deposit-report': 'nav.report.deposit',
  '/report/transaction-detail-report': 'nav.report.transactionDetail',
  '/report/purchase-report': 'nav.report.purchase',
  '/report/income-report': 'nav.report.income',
  '/report/expense-report': 'nav.report.expense',
  '/report/cash-flow-report': 'nav.report.cashFlow',
  '/report/payroll-report': 'nav.report.payroll',
  '/report/profit-loss-report': 'breadcrumb.report.profitLoss',
  '/report/balance-sheet-report': 'nav.report.balanceSheet',
  '/report/buku-besar': 'nav.report.ledger',
  '/report/aging-report': 'nav.report.aging',
  '/report/stock-card': 'breadcrumb.report.stockCard',
};

const SEGMENT_LABEL_KEYS: Record<string, TranslationKey> = {
  new: 'breadcrumb.new',
  edit: 'breadcrumb.edit',
  reconcile: 'breadcrumb.reconcile',
};

const LOGICAL_HIERARCHIES: Record<string, Array<{ path: string; labelKey: TranslationKey }>> = {
  '/master-data/areas': [
    { path: '/', labelKey: 'nav.home' },
    { path: '/hr', labelKey: 'nav.hr' },
    { path: '/master-data/areas', labelKey: 'nav.areas' },
  ],
  '/master-data/employees': [
    { path: '/', labelKey: 'nav.home' },
    { path: '/hr', labelKey: 'nav.hr' },
    { path: '/master-data/employees', labelKey: 'nav.employees' },
  ],
  '/finance/payroll': [
    { path: '/', labelKey: 'nav.home' },
    { path: '/hr', labelKey: 'nav.hr' },
    { path: '/finance/payroll', labelKey: 'nav.finance.payroll' },
  ],
  '/profit': [
    { path: '/', labelKey: 'nav.home' },
    { path: '/report', labelKey: 'nav.reports' },
    { path: '/profit', labelKey: 'nav.report.profit' },
  ],
};

const NON_LINKABLE_PATHS = new Set([
  '/marketplace',
  '/marketplace/shopee/orders',
]);

const HIDDEN_PATHS = new Set([
  '/shopping-note',
  '/finance/general-ledger/setup',
]);

const ACTION_SEGMENTS = new Set(Object.keys(SEGMENT_LABEL_KEYS));
const OPAQUE_SEGMENT_PATTERN =
  /^(?:\d+|[0-9a-f]{8}-[0-9a-f-]{27,}|(?=.{16,}$)(?=.*\d)[a-z0-9_-]+)$/i;

export const normalizeBreadcrumbPath = (pathname: string) => {
  const normalized = pathname.split(/[?#]/, 1)[0].replace(/\/+$/, '');
  return normalized || '/';
};

const humanizeSegment = (segment: string) => {
  const decoded = (() => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  })();

  return decoded
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
};

const isOpaqueSegment = (segment: string) => OPAQUE_SEGMENT_PATTERN.test(segment);

const finishItems = (drafts: BreadcrumbDraft[]): BreadcrumbItem[] => (
  drafts.map((item, index) => ({
    ...item,
    to: index === drafts.length - 1 ? undefined : item.to,
    current: index === drafts.length - 1,
  }))
);

const getStaticLabel = (
  path: string,
  segment: string,
  t: BreadcrumbTranslate,
) => {
  const pathKey = STATIC_LABEL_KEYS[path];
  if (pathKey) return t(pathKey);

  const segmentKey = SEGMENT_LABEL_KEYS[segment];
  if (segmentKey) return t(segmentKey);

  if (isOpaqueSegment(segment)) return t('breadcrumb.detail');
  return humanizeSegment(segment);
};

const buildGenericItems = (
  pathname: string,
  t: BreadcrumbTranslate,
): BreadcrumbItem[] => {
  if (pathname === '/') {
    return finishItems([{ label: t('nav.home'), to: '/' }]);
  }

  const segments = pathname.split('/').filter(Boolean);
  const drafts: BreadcrumbDraft[] = [{ label: t('nav.home'), to: '/' }];
  let accumulatedPath = '';

  for (const segment of segments) {
    accumulatedPath += `/${segment}`;
    const isAction = ACTION_SEGMENTS.has(segment);
    drafts.push({
      label: getStaticLabel(accumulatedPath, segment, t),
      to: isAction || NON_LINKABLE_PATHS.has(accumulatedPath)
        ? undefined
        : accumulatedPath,
    });
  }

  return finishItems(drafts);
};

const buildLogicalHierarchy = (
  pathname: string,
  t: BreadcrumbTranslate,
) => {
  const hierarchy = LOGICAL_HIERARCHIES[pathname];
  if (!hierarchy) return undefined;

  return finishItems(hierarchy.map(({ path, labelKey }) => ({
    label: t(labelKey),
    to: path,
  })));
};

const buildDocumentRootItems = (
  prefix: string,
  t: BreadcrumbTranslate,
): BreadcrumbDraft[] => {
  if (prefix.startsWith('/finance/')) {
    const documentRoot = prefix.endsWith('/sales')
      ? 'nav.finance.sales'
      : 'nav.finance.purchases';
    return [
      { label: t('nav.home'), to: '/' },
      { label: t('nav.finance'), to: '/finance' },
      { label: t(documentRoot), to: prefix },
    ];
  }

  return [
    { label: t('nav.home'), to: '/' },
    {
      label: t(prefix === '/sales' ? 'nav.sales' : 'nav.purchases'),
      to: prefix,
    },
  ];
};

const buildSalesDocumentItems = (
  pathname: string,
  prefix: '/sales' | '/finance/sales',
  t: BreadcrumbTranslate,
): BreadcrumbItem[] | undefined => {
  const remainder = pathname.slice(prefix.length).split('/').filter(Boolean);
  if (remainder.length === 0) return finishItems(buildDocumentRootItems(prefix, t));

  if (remainder[0] === 'returns') {
    const returnsPath = `${prefix}/returns`;
    const drafts = [
      ...buildDocumentRootItems(prefix, t),
      { label: t('salesReturns.title'), to: returnsPath },
    ];

    if (remainder.length === 1) return finishItems(drafts);
    if (remainder[1] === 'new') {
      drafts.push({ label: t('breadcrumb.new') });
      return finishItems(drafts);
    }

    const detailPath = `${returnsPath}/${remainder[1]}`;
    drafts.push({ label: t('breadcrumb.detail'), to: detailPath });
    if (remainder[2] === 'edit') drafts.push({ label: t('breadcrumb.edit') });
    return finishItems(drafts);
  }

  const documentType = getSalesDocumentTypeFromPathSegment(remainder[0]);
  if (!documentType) return undefined;

  const typeOption = SALES_DOCUMENT_TYPE_OPTIONS.find(({ value }) => value === documentType);
  if (!typeOption) return undefined;

  const typePath = `${prefix}/${remainder[0]}`;
  const drafts = [
    ...buildDocumentRootItems(prefix, t),
    { label: t(typeOption.labelKey), to: typePath },
  ];

  if (remainder.length === 1) return finishItems(drafts);
  if (remainder[1] === 'new') {
    drafts.push({ label: t('breadcrumb.new') });
    return finishItems(drafts);
  }

  const detailPath = `${typePath}/${remainder[1]}`;
  drafts.push({ label: t('breadcrumb.detail'), to: detailPath });
  if (remainder[2] === 'edit') drafts.push({ label: t('breadcrumb.edit') });
  return finishItems(drafts);
};

const buildPurchaseDocumentItems = (
  pathname: string,
  prefix: '/purchases' | '/finance/purchases',
  t: BreadcrumbTranslate,
): BreadcrumbItem[] | undefined => {
  const remainder = pathname.slice(prefix.length).split('/').filter(Boolean);
  if (remainder.length === 0) return finishItems(buildDocumentRootItems(prefix, t));
  if (remainder[0] === 'pending-costs') return buildGenericItems(pathname, t);

  const documentType = getPurchaseDocumentTypeFromPathSegment(remainder[0]);
  if (!documentType) return undefined;

  const typeOption = PURCHASE_DOCUMENT_TYPE_OPTIONS.find(({ value }) => value === documentType);
  if (!typeOption) return undefined;

  const typePath = `${prefix}/${remainder[0]}`;
  const drafts = [
    ...buildDocumentRootItems(prefix, t),
    { label: t(typeOption.labelKey), to: typePath },
  ];

  if (remainder.length === 1) return finishItems(drafts);
  if (remainder[1] === 'new') {
    drafts.push({ label: t('breadcrumb.new') });
    return finishItems(drafts);
  }

  const detailPath = `${typePath}/${remainder[1]}`;
  drafts.push({ label: t('breadcrumb.detail'), to: detailPath });
  if (remainder[2] === 'edit') drafts.push({ label: t('breadcrumb.edit') });
  if (remainder[2] === 'reconcile') drafts.push({ label: t('breadcrumb.reconcile') });
  return finishItems(drafts);
};

const buildMarketplaceItems = (
  pathname: string,
  t: BreadcrumbTranslate,
): BreadcrumbItem[] | undefined => {
  if (!pathname.startsWith('/marketplace/shopee')) return undefined;

  const drafts: BreadcrumbDraft[] = [
    { label: t('nav.home'), to: '/' },
    { label: t('nav.marketplace') },
    { label: t('nav.marketplace.shopee'), to: '/marketplace/shopee' },
  ];

  const remainder = pathname.slice('/marketplace/shopee'.length).split('/').filter(Boolean);
  if (remainder[0] === 'orders' && remainder[1]) {
    drafts.push({ label: t('breadcrumb.marketplace.orderDetail') });
  }

  return finishItems(drafts);
};

export const getBreadcrumbItems = (
  pathname: string,
  t: BreadcrumbTranslate,
): BreadcrumbItem[] => {
  const normalizedPath = normalizeBreadcrumbPath(pathname);

  const logicalItems = buildLogicalHierarchy(normalizedPath, t);
  if (logicalItems) return logicalItems;

  const marketplaceItems = buildMarketplaceItems(normalizedPath, t);
  if (marketplaceItems) return marketplaceItems;

  if (normalizedPath === '/sales' || normalizedPath.startsWith('/sales/')) {
    return buildSalesDocumentItems(normalizedPath, '/sales', t)
      ?? buildGenericItems(normalizedPath, t);
  }

  if (normalizedPath === '/finance/sales' || normalizedPath.startsWith('/finance/sales/')) {
    return buildSalesDocumentItems(normalizedPath, '/finance/sales', t)
      ?? buildGenericItems(normalizedPath, t);
  }

  if (normalizedPath === '/purchases' || normalizedPath.startsWith('/purchases/')) {
    return buildPurchaseDocumentItems(normalizedPath, '/purchases', t)
      ?? buildGenericItems(normalizedPath, t);
  }

  if (normalizedPath === '/finance/purchases' || normalizedPath.startsWith('/finance/purchases/')) {
    return buildPurchaseDocumentItems(normalizedPath, '/finance/purchases', t)
      ?? buildGenericItems(normalizedPath, t);
  }

  return buildGenericItems(normalizedPath, t);
};

export const shouldShowBreadcrumbs = (
  pathname: string,
  items: BreadcrumbItem[],
) => (
  items.length >= 3 && !HIDDEN_PATHS.has(normalizeBreadcrumbPath(pathname))
);
