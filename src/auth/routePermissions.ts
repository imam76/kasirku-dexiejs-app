import type { AuthUser, Permission, Role, UserRole } from '@/types';
import { hasPermission } from './permissions';
import { isPermissionEnabledBySetup } from './permissionCatalog';
import { canBypassSetupModuleLockForUser, shouldBypassSetupModuleLock } from '@/services/setupKeyService';
import { getDocumentPermissionRuleForPath } from './documentPermissions';
import {
  COOPERATIVE_REPORT_PERMISSION_LIST,
  GENERAL_REPORT_PERMISSION_LIST,
  getReportAccessForPath,
} from './reportPermissions';

type RoutePermissionRule = Permission | Permission[];

const ROUTE_PERMISSIONS: Record<string, RoutePermissionRule> = {
  '/transaction': 'CASHIER_ACCESS',
  '/history': 'CASHIER_ACCESS',
  '/master-data': [
    'PRODUCT_MANAGE',
    'PRODUCTION_MANAGE',
    'STOCK_OPNAME_MANAGE',
    'PROMO_MANAGE',
    'CONTACT_MANAGE',
    'WAREHOUSE_MANAGE',
    'CURRENCY_MANAGE',
    'AREA_MANAGE',
    'EMPLOYEE_MANAGE',
    'USER_MANAGE',
    'DEPARTMENT_MANAGE',
    'PROJECT_MANAGE',
    'TAX_MANAGE',
    'UNIT_MANAGE',
  ],
  '/master-data/products': 'PRODUCT_MANAGE',
  '/master-data/production': 'PRODUCTION_MANAGE',
  '/master-data/stock-opname': 'STOCK_OPNAME_MANAGE',
  '/master-data/units': 'UNIT_MANAGE',
  '/master-data/promos': 'PROMO_MANAGE',
  '/master-data/contacts': 'CONTACT_MANAGE',
  '/master-data/warehouses': 'WAREHOUSE_MANAGE',
  '/master-data/currencies': 'CURRENCY_MANAGE',
  '/master-data/areas': 'AREA_MANAGE',
  '/master-data/employees': 'EMPLOYEE_MANAGE',
  '/master-data/roles': 'USER_MANAGE',
  '/master-data/departments': 'DEPARTMENT_MANAGE',
  '/master-data/projects': 'PROJECT_MANAGE',
  '/master-data/taxes': 'TAX_MANAGE',
  '/shopping-note': 'PURCHASE_RECEIPT_MANAGE',
  '/finance': 'FINANCE_ACCESS',
  '/finance/cash-flow': 'FINANCE_ACCESS',
  '/finance/receivables': 'FINANCE_ACCESS',
  '/finance/payables': 'FINANCE_ACCESS',
  '/finance/payroll': 'FINANCE_ACCESS',
  '/finance/chart-of-accounts': 'FINANCE_ACCESS',
  '/finance/general-ledger': 'FINANCE_ACCESS',
  '/koperasi': [
    'COOPERATIVE_MEMBER_VIEW',
    'COOPERATIVE_SAVING_VIEW',
    'COOPERATIVE_LOAN_VIEW',
    'COOPERATIVE_INSTALLMENT_VIEW',
    'COOPERATIVE_BILLING_ACCESS',
    'COOPERATIVE_FIELD_CASH_VIEW',
  ],
  '/koperasi/anggota': 'COOPERATIVE_MEMBER_VIEW',
  '/koperasi/simpanan': 'COOPERATIVE_SAVING_VIEW',
  '/koperasi/pinjaman': 'COOPERATIVE_LOAN_VIEW',
  '/koperasi/migrasi-pinjaman': 'COOPERATIVE_LOAN_DISBURSE',
  '/koperasi/angsuran': 'COOPERATIVE_INSTALLMENT_VIEW',
  '/koperasi/penagihan': 'COOPERATIVE_BILLING_ACCESS',
  '/koperasi/kas-petugas': 'COOPERATIVE_FIELD_CASH_VIEW',
  '/sync-db': 'SETTINGS_ACCESS',
  '/settings': 'SETTINGS_ACCESS',
  '/profit': 'PROFIT_VIEW',
  '/report': GENERAL_REPORT_PERMISSION_LIST,
};

const routeEntries = Object.entries(ROUTE_PERMISSIONS)
  .sort(([left], [right]) => right.length - left.length);

const normalizePath = (path: string) => {
  if (path === '/') return path;
  return path.replace(/\/+$/, '');
};

export const getRequiredPermissionForPath = (path: string): RoutePermissionRule | undefined => {
  const normalizedPath = normalizePath(path);
  const documentPermissionRule = getDocumentPermissionRuleForPath(normalizedPath);
  if (documentPermissionRule) return documentPermissionRule;
  const reportAccess = getReportAccessForPath(normalizedPath);
  if (reportAccess) return reportAccess.permission;
  if (normalizedPath === '/koperasi') {
    const baseRule = ROUTE_PERMISSIONS['/koperasi'];
    return [
      ...(Array.isArray(baseRule) ? baseRule : baseRule ? [baseRule] : []),
      ...COOPERATIVE_REPORT_PERMISSION_LIST,
    ];
  }

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
