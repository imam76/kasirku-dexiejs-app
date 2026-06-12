import type { AuthUser, Permission, Role, UserRole } from '@/types';
import { hasPermission } from './permissions';
import { isPermissionEnabledBySetup } from './permissionCatalog';
import { canBypassSetupModuleLockForUser, shouldBypassSetupModuleLock } from '@/services/setupKeyService';

type RoutePermissionRule = Permission | Permission[];

const ROUTE_PERMISSIONS: Record<string, RoutePermissionRule> = {
  '/transaction': 'CASHIER_ACCESS',
  '/history': 'CASHIER_ACCESS',
  '/master-data': ['STOCK_ACCESS', 'SETTINGS_ACCESS'],
  '/master-data/products': 'STOCK_ACCESS',
  '/master-data/units': 'STOCK_ACCESS',
  '/master-data/promos': 'SETTINGS_ACCESS',
  '/master-data/contacts': 'SETTINGS_ACCESS',
  '/master-data/warehouses': 'SETTINGS_ACCESS',
  '/master-data/currencies': 'SETTINGS_ACCESS',
  '/master-data/areas': 'SETTINGS_ACCESS',
  '/master-data/employees': 'SETTINGS_ACCESS',
  '/master-data/roles': 'USER_MANAGE',
  '/master-data/departments': 'SETTINGS_ACCESS',
  '/master-data/projects': 'SETTINGS_ACCESS',
  '/master-data/taxes': 'SETTINGS_ACCESS',
  '/shopping-note': 'FINANCE_ACCESS',
  '/sales': 'FINANCE_ACCESS',
  '/sales/returns': 'SALES_RETURN_MANAGE',
  '/purchases': 'FINANCE_ACCESS',
  '/finance': 'FINANCE_ACCESS',
  '/finance/cash-flow': 'FINANCE_ACCESS',
  '/finance/receivables': 'FINANCE_ACCESS',
  '/finance/payables': 'FINANCE_ACCESS',
  '/finance/chart-of-accounts': 'FINANCE_ACCESS',
  '/finance/general-ledger': 'FINANCE_ACCESS',
  '/finance/sales': 'FINANCE_ACCESS',
  '/finance/purchases': 'FINANCE_ACCESS',
  '/finance/sales/returns': 'SALES_RETURN_MANAGE',
  '/koperasi': [
    'COOPERATIVE_MEMBER_VIEW',
    'COOPERATIVE_SAVING_VIEW',
    'COOPERATIVE_LOAN_VIEW',
    'COOPERATIVE_INSTALLMENT_VIEW',
    'COOPERATIVE_BILLING_ACCESS',
    'COOPERATIVE_FIELD_CASH_VIEW',
    'COOPERATIVE_REPORT_VIEW',
  ],
  '/koperasi/anggota': 'COOPERATIVE_MEMBER_VIEW',
  '/koperasi/simpanan': 'COOPERATIVE_SAVING_VIEW',
  '/koperasi/pinjaman': 'COOPERATIVE_LOAN_VIEW',
  '/koperasi/angsuran': 'COOPERATIVE_INSTALLMENT_VIEW',
  '/koperasi/penagihan': 'COOPERATIVE_BILLING_ACCESS',
  '/koperasi/kas-petugas': 'COOPERATIVE_FIELD_CASH_VIEW',
  '/koperasi/laporan': 'COOPERATIVE_REPORT_VIEW',
  '/koperasi/laporan-induk-anggota': 'COOPERATIVE_REPORT_VIEW',
  '/koperasi/arus-kas': 'COOPERATIVE_REPORT_VIEW',
  '/koperasi/buku-besar': 'COOPERATIVE_REPORT_VIEW',
  '/sync-db': 'SETTINGS_ACCESS',
  '/settings': 'SETTINGS_ACCESS',
  '/profit': 'PROFIT_VIEW',
  '/report': ['CASHIER_ACCESS', 'STOCK_PURCHASE_ACCESS', 'FINANCE_ACCESS'],
  '/report/pos-sales-report': 'CASHIER_ACCESS',
  '/report/sales-report': 'CASHIER_ACCESS',
  '/report/deposit-report': 'CASHIER_ACCESS',
  '/report/transaction-detail-report': 'CASHIER_ACCESS',
  '/report/purchase-report': 'STOCK_PURCHASE_ACCESS',
  '/report/expense-report': 'FINANCE_ACCESS',
  '/report/profit-loss-report': 'FINANCE_ACCESS',
  '/report/aging-report': 'FINANCE_ACCESS',
  '/report/stock-card': 'STOCK_ACCESS',
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
  roleOrUser: UserRole | AuthUser | undefined,
  rule: RoutePermissionRule | undefined,
  options: { permissionSet?: Set<Permission>; currentRole?: Role | null } = {},
) => {
  if (!rule) return true;
  const permissions = Array.isArray(rule) ? rule : [rule];
  const user = typeof roleOrUser === 'object' ? roleOrUser : undefined;
  const legacyRole = typeof roleOrUser === 'string' ? roleOrUser : user?.role;
  const bypassSetupModuleLock =
    canBypassSetupModuleLockForUser(user, options.currentRole) ||
    (legacyRole === 'OWNER' && shouldBypassSetupModuleLock());

  if (!permissions.some((permission) => isPermissionEnabledBySetup(permission, { bypassSetupModuleLock }))) {
    return false;
  }

  if (options.currentRole?.is_owner || legacyRole === 'OWNER') {
    return true;
  }

  if (user?.role_id && options.permissionSet) {
    return permissions.some((permission) => (
      isPermissionEnabledBySetup(permission, { bypassSetupModuleLock }) && options.permissionSet?.has(permission)
    ));
  }

  if (Array.isArray(rule)) {
    return rule.some((permission) => hasPermission(legacyRole, permission, { bypassSetupModuleLock }));
  }

  return hasPermission(legacyRole, rule, { bypassSetupModuleLock });
};

export const canAccessPath = (
  roleOrUser: UserRole | AuthUser | undefined,
  path: string,
  options: { permissionSet?: Set<Permission>; currentRole?: Role | null } = {},
) => {
  return canAccessPermissionRule(roleOrUser, getRequiredPermissionForPath(path), options);
};
