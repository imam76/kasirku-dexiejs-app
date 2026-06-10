import type { Permission, UserRole } from '@/types';
import { isPermissionEnabledBySetup } from './permissionCatalog';
import { shouldBypassSetupModuleLock } from '@/services/setupKeyService';

export const ROLE_LABEL: Record<UserRole, string> = {
  OWNER: 'Owner',
  ADMIN: 'Admin',
  KASIR: 'Kasir',
  GUDANG: 'Gudang',
};

export const ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  OWNER: [
    'TRANSACTION_VOID',
    'TRANSACTION_DELETE',
    'TRANSACTION_EDIT_PRICE',
    'PROFIT_VIEW',
    'CASHIER_ACCESS',
    'STOCK_ACCESS',
    'STOCK_PURCHASE_ACCESS',
    'FINANCE_ACCESS',
    'JOURNAL_MANAGE',
    'SALES_RETURN_MANAGE',
    'COOPERATIVE_MEMBER_VIEW',
    'COOPERATIVE_MEMBER_MANAGE',
    'COOPERATIVE_SAVING_VIEW',
    'COOPERATIVE_SAVING_MANAGE',
    'COOPERATIVE_LOAN_VIEW',
    'COOPERATIVE_LOAN_MANAGE',
    'COOPERATIVE_INSTALLMENT_VIEW',
    'COOPERATIVE_PAYMENT_CREATE',
    'COOPERATIVE_BILLING_ACCESS',
    'COOPERATIVE_REPORT_VIEW',
    'COOPERATIVE_AREA_ALL',
    'SETTINGS_ACCESS',
    'USER_MANAGE',
    'ACTIVITY_LOG_VIEW',
  ],
  ADMIN: [
    'TRANSACTION_VOID',
    'TRANSACTION_DELETE',
    'TRANSACTION_EDIT_PRICE',
    'PROFIT_VIEW',
    'CASHIER_ACCESS',
    'STOCK_ACCESS',
    'STOCK_PURCHASE_ACCESS',
    'FINANCE_ACCESS',
    'SALES_RETURN_MANAGE',
    'COOPERATIVE_MEMBER_VIEW',
    'COOPERATIVE_MEMBER_MANAGE',
    'COOPERATIVE_SAVING_VIEW',
    'COOPERATIVE_SAVING_MANAGE',
    'COOPERATIVE_LOAN_VIEW',
    'COOPERATIVE_LOAN_MANAGE',
    'COOPERATIVE_INSTALLMENT_VIEW',
    'COOPERATIVE_PAYMENT_CREATE',
    'COOPERATIVE_BILLING_ACCESS',
    'COOPERATIVE_REPORT_VIEW',
    'COOPERATIVE_AREA_ALL',
    'SETTINGS_ACCESS',
    'ACTIVITY_LOG_VIEW',
  ],
  KASIR: [
    'CASHIER_ACCESS',
    'TRANSACTION_VOID',
  ],
  GUDANG: [
    'STOCK_ACCESS',
    'STOCK_PURCHASE_ACCESS',
  ],
};

export const hasPermission = (
  role: UserRole | undefined,
  permission: Permission,
  options: { bypassSetupModuleLock?: boolean } = {},
) => {
  if (!role) return false;
  const bypassSetupModuleLock = options.bypassSetupModuleLock ?? (role === 'OWNER' && shouldBypassSetupModuleLock());
  if (!isPermissionEnabledBySetup(permission, { bypassSetupModuleLock })) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
};
