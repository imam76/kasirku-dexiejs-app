import { getSetupConfig } from '@/services/setupKeyService';

/**
 * Mapping from route paths to setup module codes.
 * A route is accessible only if at least one of its mapped module codes is enabled.
 * Routes not listed here are always accessible.
 */
const ROUTE_MODULE_MAP: Record<string, string[]> = {
  // Data Master
  '/master-data/products': ['PRODUCT'],
  '/master-data/contacts': ['CONTACT'],
  '/master-data/warehouses': ['WAREHOUSE'],
  '/master-data/departments': ['DEPARTMENT'],
  '/master-data/projects': ['PROJECT'],
  '/master-data/taxes': ['TAX'],
  '/master-data/promos': ['PROMO'],
  '/master-data/units': ['UNIT'],
  '/master-data/currencies': ['CURRENCY'],
  // POS
  '/transaction': ['POS_TRANSACTION'],
  '/history': ['POS_TRANSACTION'],
  // Shopping Note
  '/shopping-note': ['SHOPPING_NOTE'],
  // Sales
  '/sales': ['SALES_QUOTATION', 'SALES_ORDER', 'SALES_DELIVERY', 'SALES_INVOICE'],
  '/sales/returns': ['SALES_RETURN'],
  // Purchases
  '/purchases': ['PURCHASE_ORDER', 'PURCHASE_RECEIPT', 'PURCHASE_INVOICE'],
  // Finance
  '/finance/cash-flow': ['CASH_FLOW'],
  '/finance/receivables': ['RECEIVABLES'],
  '/finance/payables': ['PAYABLES'],
  '/finance/chart-of-accounts': ['CHART_OF_ACCOUNTS'],
  '/finance/general-ledger': ['GENERAL_LEDGER'],
  // Reports
  '/report/pos-sales-report': ['REPORT_POS_SALES'],
  '/report/transaction-detail-report': ['REPORT_TRANSACTION_DETAIL'],
  '/report/purchase-report': ['REPORT_PURCHASE'],
  '/report/expense-report': ['REPORT_EXPENSE'],
  '/report/aging-report': ['REPORT_AGING'],
  '/profit': ['REPORT_PROFIT'],
  // Koperasi
  '/koperasi/anggota': ['KOPERASI_ANGGOTA'],
  '/koperasi/simpanan': ['KOPERASI_SIMPANAN_POKOK', 'KOPERASI_SIMPANAN_WAJIB', 'KOPERASI_SIMPANAN_SUKARELA'],
  '/koperasi/pinjaman': ['KOPERASI_PINJAMAN'],
  '/koperasi/angsuran': ['KOPERASI_ANGSURAN'],
  '/koperasi/laporan': ['KOPERASI_SHU'],
  '/koperasi': [
    'KOPERASI_ANGGOTA',
    'KOPERASI_SIMPANAN_POKOK',
    'KOPERASI_SIMPANAN_WAJIB',
    'KOPERASI_SIMPANAN_SUKARELA',
    'KOPERASI_PINJAMAN',
    'KOPERASI_ANGSURAN',
    'KOPERASI_SHU'
  ],
};

const routeModuleEntries = Object.entries(ROUTE_MODULE_MAP)
  .sort(([left], [right]) => right.length - left.length);

/**
 * Check if a route path is enabled by the setup config.
 * If no setup config exists, all routes are enabled (backwards compatible).
 */
export const isRouteEnabledBySetup = (path: string): boolean => {
  const config = getSetupConfig();
  // No setup config = all routes enabled (fresh install / no developer setup)
  if (!config) return true;

  const normalizedPath = path === '/' ? path : path.replace(/\/+$/, '');
  const enabledSet = new Set(config.enabledModules);

  const match = routeModuleEntries.find(([routePath]) => {
    return normalizedPath === routePath || normalizedPath.startsWith(`${routePath}/`);
  });

  // Route has no module restriction → always accessible
  if (!match) return true;

  const [, moduleCodes] = match;
  // Route is accessible if ANY of its mapped module codes is enabled
  return moduleCodes.some((code) => enabledSet.has(code));
};
