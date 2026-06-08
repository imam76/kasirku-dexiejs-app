import { useMemo } from 'react';
import { getSetupConfig } from '@/services/setupKeyService';

/**
 * Mapping from setup module codes to route paths.
 * A route is visible only if at least one of its mapped module codes is enabled.
 * Routes not listed here are always visible.
 */
const MODULE_TO_ROUTES: Record<string, string[]> = {
  // Data Master
  PRODUCT: ['/master-data/products'],
  CONTACT: ['/master-data/contacts'],
  WAREHOUSE: ['/master-data/warehouses'],
  DEPARTMENT: ['/master-data/departments'],
  PROJECT: ['/master-data/projects'],
  TAX: ['/master-data/taxes'],
  PROMO: ['/master-data/promos'],
  UNIT: ['/master-data/units'],
  CURRENCY: ['/master-data/currencies'],
  // POS
  POS_TRANSACTION: ['/transaction', '/history'],
  SHOPPING_NOTE: ['/shopping-note'],
  // Sales
  SALES_QUOTATION: ['/sales'],
  SALES_ORDER: ['/sales'],
  SALES_DELIVERY: ['/sales'],
  SALES_INVOICE: ['/sales'],
  SALES_RETURN: ['/sales/returns'],
  // Purchases
  PURCHASE_ORDER: ['/purchases'],
  PURCHASE_RECEIPT: ['/purchases'],
  PURCHASE_INVOICE: ['/purchases'],
  PURCHASE_RETURN: ['/purchases'],
  // Finance
  CASH_FLOW: ['/finance/cash-flow'],
  RECEIVABLES: ['/finance/receivables'],
  PAYABLES: ['/finance/payables'],
  CHART_OF_ACCOUNTS: ['/finance/chart-of-accounts'],
  GENERAL_LEDGER: ['/finance/general-ledger'],
  // Reports
  REPORT_POS_SALES: ['/report/pos-sales-report'],
  REPORT_TRANSACTION_DETAIL: ['/report/transaction-detail-report'],
  REPORT_PURCHASE: ['/report/purchase-report'],
  REPORT_EXPENSE: ['/report/expense-report'],
  REPORT_AGING: ['/report/aging-report'],
  REPORT_PROFIT: ['/profit'],
};

/**
 * Build a reverse lookup: route path → which module codes enable it.
 */
const buildRouteToModules = (): Map<string, string[]> => {
  const map = new Map<string, string[]>();
  for (const [moduleCode, routes] of Object.entries(MODULE_TO_ROUTES)) {
    for (const route of routes) {
      const existing = map.get(route) ?? [];
      existing.push(moduleCode);
      map.set(route, existing);
    }
  }
  return map;
};

const ROUTE_TO_MODULES = buildRouteToModules();

/**
 * Hook to check if a given setup module is enabled.
 *
 * Returns:
 * - `isModuleEnabled(code)` — check single module
 * - `isRouteEnabled(path)` — check if a route's module(s) are enabled
 * - `enabledModules` — the raw list of enabled module codes
 * - `isConfigured` — whether setup config exists at all
 *
 * If no setup config exists (fresh install without developer setup),
 * everything is enabled by default.
 */
export const useEnabledModules = () => {
  const config = useMemo(() => getSetupConfig(), []);

  const enabledSet = useMemo(
    () => (config ? new Set(config.enabledModules) : null),
    [config],
  );

  const isModuleEnabled = useMemo(() => {
    if (!enabledSet) return (_code: string) => true; // no config = all enabled
    return (code: string) => enabledSet.has(code);
  }, [enabledSet]);

  const isRouteEnabled = useMemo(() => {
    if (!enabledSet) return (_path: string) => true;
    return (path: string) => {
      const moduleCodes = ROUTE_TO_MODULES.get(path);
      // Route has no module restriction → always visible
      if (!moduleCodes || moduleCodes.length === 0) return true;
      // Route is visible if ANY of its mapped module codes is enabled
      return moduleCodes.some((code) => enabledSet.has(code));
    };
  }, [enabledSet]);

  return {
    isModuleEnabled,
    isRouteEnabled,
    enabledModules: config?.enabledModules ?? [],
    isConfigured: config !== null,
  };
};
