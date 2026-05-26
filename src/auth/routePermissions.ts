import type { Permission, UserRole } from '@/types';
import { hasPermission } from './permissions';

type RoutePermissionRule = Permission | Permission[];

const ROUTE_PERMISSIONS: Record<string, RoutePermissionRule> = {
  '/transaction': 'CASHIER_ACCESS',
  '/history': 'CASHIER_ACCESS',
  '/master-data': ['STOCK_ACCESS', 'SETTINGS_ACCESS'],
  '/master-data/products': 'STOCK_ACCESS',
  '/master-data/units': 'STOCK_ACCESS',
  '/master-data/promos': 'SETTINGS_ACCESS',
  '/master-data/contacts': 'SETTINGS_ACCESS',
  '/master-data/departments': 'SETTINGS_ACCESS',
  '/master-data/projects': 'SETTINGS_ACCESS',
  '/master-data/taxes': 'SETTINGS_ACCESS',
  '/shopping-note': 'STOCK_PURCHASE_ACCESS',
  '/finance': 'FINANCE_ACCESS',
  '/finance/cash-flow': 'FINANCE_ACCESS',
  '/finance/receivables': 'FINANCE_ACCESS',
  '/finance/chart-of-accounts': 'FINANCE_ACCESS',
  '/finance/general-ledger': 'FINANCE_ACCESS',
  '/finance/sales': 'FINANCE_ACCESS',
  '/finance/sales/returns': 'SALES_RETURN_MANAGE',
  '/settings': 'SETTINGS_ACCESS',
  '/profit': 'PROFIT_VIEW',
  '/report': ['CASHIER_ACCESS', 'STOCK_PURCHASE_ACCESS', 'FINANCE_ACCESS'],
  '/report/sales-report': 'CASHIER_ACCESS',
  '/report/transaction-detail-report': 'CASHIER_ACCESS',
  '/report/purchase-report': 'STOCK_PURCHASE_ACCESS',
  '/report/expense-report': 'FINANCE_ACCESS',
};

const routeEntries = Object.entries(ROUTE_PERMISSIONS)
  .sort(([left], [right]) => right.length - left.length);

const normalizePath = (path: string) => {
  if (path === '/') return path;
  return path.replace(/\/+$/, '');
};

export const getRequiredPermissionForPath = (path: string): RoutePermissionRule | undefined => {
  const normalizedPath = normalizePath(path);

  return routeEntries.find(([routePath]) => {
    return normalizedPath === routePath || normalizedPath.startsWith(`${routePath}/`);
  })?.[1];
};

export const canAccessPermissionRule = (
  role: UserRole | undefined,
  rule: RoutePermissionRule | undefined,
) => {
  if (!rule) return true;
  if (Array.isArray(rule)) {
    return rule.some((permission) => hasPermission(role, permission));
  }

  return hasPermission(role, rule);
};

export const canAccessPath = (role: UserRole | undefined, path: string) => {
  return canAccessPermissionRule(role, getRequiredPermissionForPath(path));
};
