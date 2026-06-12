import { getSetupConfig } from '@/services/setupKeyService';

/**
 * Mapping from route paths to setup module codes.
 * A route is accessible only if at least one of its mapped module codes is enabled.
 * Routes not listed here are always accessible.
 */
export const ROUTE_MODULE_MAP: Record<string, string[]> = {
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
  '/master-data/roles': ['ROLE_PERMISSION'],
  // POS
  '/transaction': ['POS_TRANSACTION'],
  '/history': ['POS_TRANSACTION'],
  // Legacy stock shopping route redirects to Purchase Receipt.
  '/shopping-note': ['PURCHASE_RECEIPT'],
  // Sales
  '/sales': ['SALES_QUOTATION', 'SALES_ORDER', 'SALES_DELIVERY', 'SALES_INVOICE', 'SALES_RETURN'],
  '/sales/returns': ['SALES_RETURN'],
  // Purchases
  '/purchases': ['PURCHASE_ORDER', 'PURCHASE_RECEIPT', 'PURCHASE_INVOICE', 'PURCHASE_RETURN'],
  // Finance
  '/finance/cash-flow': ['CASH_FLOW'],
  '/finance/receivables': ['RECEIVABLES'],
  '/finance/payables': ['PAYABLES'],
  '/finance/chart-of-accounts': ['CHART_OF_ACCOUNTS'],
  '/finance/general-ledger': ['GENERAL_LEDGER'],
  // Reports
  '/report/pos-sales-report': ['REPORT_POS_SALES'],
  '/report/deposit-report': ['REPORT_POS_SALES'],
  '/report/transaction-detail-report': ['REPORT_TRANSACTION_DETAIL'],
  '/report/purchase-report': ['REPORT_PURCHASE'],
  '/report/expense-report': ['REPORT_EXPENSE'],
  '/report/profit-loss-report': ['REPORT_PROFIT'],
  '/report/aging-report': ['REPORT_AGING'],
  '/report/stock-card': ['REPORT_STOCK_CARD'],
  '/profit': ['REPORT_PROFIT'],
  // Koperasi
  '/koperasi/anggota': ['KOPERASI_ANGGOTA'],
  '/koperasi/simpanan': ['KOPERASI_SIMPANAN_POKOK', 'KOPERASI_SIMPANAN_WAJIB', 'KOPERASI_SIMPANAN_SUKARELA'],
  '/koperasi/pinjaman': ['KOPERASI_PINJAMAN'],
  '/koperasi/angsuran': ['KOPERASI_ANGSURAN'],
  '/koperasi/penagihan': ['KOPERASI_PENAGIHAN'],
  '/koperasi/kas-petugas': ['KOPERASI_KAS_PETUGAS'],
  '/koperasi/laporan': ['KOPERASI_SHU'],
  '/koperasi/laporan-induk-anggota': ['KOPERASI_SHU'],
  '/koperasi/arus-kas': ['KOPERASI_SHU'],
  '/koperasi': [
    'KOPERASI_ANGGOTA',
    'KOPERASI_SIMPANAN_POKOK',
    'KOPERASI_SIMPANAN_WAJIB',
    'KOPERASI_SIMPANAN_SUKARELA',
    'KOPERASI_PINJAMAN',
    'KOPERASI_ANGSURAN',
    'KOPERASI_PENAGIHAN',
    'KOPERASI_KAS_PETUGAS',
    'KOPERASI_SHU'
  ],
};

const routeModuleEntries = Object.entries(ROUTE_MODULE_MAP)
  .sort(([left], [right]) => right.length - left.length);

const normalizePath = (path: string) => {
  if (path === '/') return path;
  return path.replace(/\/+$/, '');
};

export const getModuleCodesForPath = (path: string): string[] | undefined => {
  const normalizedPath = normalizePath(path);

  return routeModuleEntries.find(([routePath]) => {
    return normalizedPath === routePath || normalizedPath.startsWith(`${routePath}/`);
  })?.[1];
};

export const isRouteEnabledForModules = (
  path: string,
  enabledModules: Iterable<string> | null,
): boolean => {
  if (!enabledModules) return true;

  const moduleCodes = getModuleCodesForPath(path);
  if (!moduleCodes || moduleCodes.length === 0) return true;

  const enabledSet = enabledModules instanceof Set ? enabledModules : new Set(enabledModules);
  return moduleCodes.some((code) => enabledSet.has(code));
};

/**
 * Check if a route path is enabled by the setup config.
 * If no setup config exists, all routes are enabled (backwards compatible).
 */
export const isRouteEnabledBySetup = (
  path: string,
  options: { bypassSetupModuleLock?: boolean } = {},
): boolean => {
  if (options.bypassSetupModuleLock) return true;

  const config = getSetupConfig();
  // No setup config = all routes enabled (fresh install / no developer setup)
  return isRouteEnabledForModules(path, config?.enabledModules ?? null);
};
