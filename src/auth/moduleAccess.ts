import { getSetupConfig } from '@/services/setupKeyService';
import { getDocumentModuleCodesForPath } from './documentPermissions';
import { getReportAccessForPath } from './reportPermissions';

/**
 * Mapping from route paths to setup module codes.
 * A route is accessible only if at least one of its mapped module codes is enabled.
 * Routes not listed here are always accessible.
 */
export const ROUTE_MODULE_MAP: Record<string, string[]> = {
  // Data Master
  '/master-data/products': ['PRODUCT'],
  '/master-data/production': ['PRODUCTION'],
  '/master-data/stock-opname': ['STOCK_OPNAME'],
  '/master-data/contacts': ['CONTACT'],
  '/master-data/warehouses': ['WAREHOUSE'],
  '/master-data/areas': ['AREA'],
  '/master-data/employees': ['EMPLOYEE'],
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
  // Finance
  '/finance/cash-flow': ['CASH_FLOW'],
  '/finance/receivables': ['RECEIVABLES'],
  '/finance/payables': ['PAYABLES'],
  '/finance/chart-of-accounts': ['CHART_OF_ACCOUNTS'],
  '/finance/general-ledger': ['GENERAL_LEDGER'],
  // Reports
  '/profit': ['REPORT_PROFIT'],
  // Koperasi
  '/koperasi/anggota': ['KOPERASI_ANGGOTA'],
  '/koperasi/simpanan': ['KOPERASI_SIMPANAN_POKOK', 'KOPERASI_SIMPANAN_WAJIB', 'KOPERASI_SIMPANAN_SUKARELA'],
  '/koperasi/pinjaman': ['KOPERASI_PINJAMAN'],
  '/koperasi/angsuran': ['KOPERASI_ANGSURAN'],
  '/koperasi/penagihan': ['KOPERASI_PENAGIHAN'],
  '/koperasi/kas-petugas': ['KOPERASI_KAS_PETUGAS'],
  '/koperasi': [
    'KOPERASI_ANGGOTA',
    'KOPERASI_SIMPANAN_POKOK',
    'KOPERASI_SIMPANAN_WAJIB',
    'KOPERASI_SIMPANAN_SUKARELA',
    'KOPERASI_PINJAMAN',
    'KOPERASI_ANGSURAN',
    'KOPERASI_PENAGIHAN',
    'KOPERASI_KAS_PETUGAS',
    'KOPERASI_SHU',
    'KOPERASI_REPORT_CASH',
    'KOPERASI_REPORT_DAILY_TARGET',
    'KOPERASI_REPORT_DAILY_STORTING',
    'KOPERASI_REPORT_DAILY_DROP',
    'KOPERASI_REPORT_WEEKLY_DROP',
    'KOPERASI_REPORT_IPTW',
    'KOPERASI_REPORT_MEMBER_REGISTER',
    'KOPERASI_REPORT_INSTALLMENT_BOOK',
    'KOPERASI_REPORT_CASH_FLOW',
    'KOPERASI_REPORT_LEDGER'
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
  const documentModuleCodes = getDocumentModuleCodesForPath(normalizedPath);
  if (documentModuleCodes) return documentModuleCodes;
  const reportAccess = getReportAccessForPath(normalizedPath);
  if (reportAccess) return [reportAccess.moduleCode];

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
