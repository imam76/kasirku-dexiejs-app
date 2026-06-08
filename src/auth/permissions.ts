import type { Permission, UserRole } from '@/types';

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

export const hasPermission = (role: UserRole | undefined, permission: Permission) => {
  if (!role) return false;
  return ROLE_PERMISSIONS[role]?.includes(permission) ?? false;
};
