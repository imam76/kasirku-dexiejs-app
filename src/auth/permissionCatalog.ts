import { getSetupConfig } from '@/services/setupKeyService';
import type { Permission } from '@/types';

export interface PermissionCatalogItem {
  code: Permission;
  label: string;
  description?: string;
  group: string;
  moduleCodes: string[];
  isSensitive?: boolean;
}

const GENERAL_MODULES = ['POS_TRANSACTION', 'PRODUCT', 'CASH_FLOW'];

export const PERMISSION_CATALOG: PermissionCatalogItem[] = [
  {
    code: 'CASHIER_ACCESS',
    label: 'Akses Kasir',
    group: 'POS',
    moduleCodes: ['POS_TRANSACTION'],
  },
  {
    code: 'TRANSACTION_VOID',
    label: 'Void Transaksi',
    group: 'POS',
    moduleCodes: ['POS_TRANSACTION'],
    isSensitive: true,
  },
  {
    code: 'TRANSACTION_DELETE',
    label: 'Hapus Transaksi',
    group: 'POS',
    moduleCodes: ['POS_TRANSACTION'],
    isSensitive: true,
  },
  {
    code: 'TRANSACTION_EDIT_PRICE',
    label: 'Ubah Harga Transaksi',
    group: 'POS',
    moduleCodes: ['POS_TRANSACTION'],
    isSensitive: true,
  },
  {
    code: 'STOCK_ACCESS',
    label: 'Akses Stok',
    group: 'Stok',
    moduleCodes: ['PRODUCT', 'WAREHOUSE', 'UNIT'],
  },
  {
    code: 'STOCK_PURCHASE_ACCESS',
    label: 'Akses Pembelian Stok',
    group: 'Stok',
    moduleCodes: ['PURCHASE_ORDER', 'PURCHASE_RECEIPT', 'PURCHASE_INVOICE'],
  },
  {
    code: 'PROFIT_VIEW',
    label: 'Lihat Profit',
    group: 'Laporan',
    moduleCodes: ['REPORT_PROFIT'],
    isSensitive: true,
  },
  {
    code: 'FINANCE_ACCESS',
    label: 'Akses Keuangan Umum',
    group: 'Keuangan',
    moduleCodes: ['CASH_FLOW', 'RECEIVABLES', 'PAYABLES', 'CHART_OF_ACCOUNTS', 'GENERAL_LEDGER'],
    isSensitive: true,
  },
  {
    code: 'JOURNAL_MANAGE',
    label: 'Kelola Jurnal Manual',
    group: 'Keuangan',
    moduleCodes: ['GENERAL_LEDGER'],
    isSensitive: true,
  },
  {
    code: 'SALES_RETURN_MANAGE',
    label: 'Kelola Retur Penjualan',
    group: 'Sales',
    moduleCodes: ['SALES_RETURN'],
  },
  {
    code: 'COOPERATIVE_MEMBER_VIEW',
    label: 'Lihat Anggota Koperasi',
    group: 'Koperasi',
    moduleCodes: ['KOPERASI_ANGGOTA'],
  },
  {
    code: 'COOPERATIVE_MEMBER_MANAGE',
    label: 'Kelola Anggota Koperasi',
    group: 'Koperasi',
    moduleCodes: ['KOPERASI_ANGGOTA'],
  },
  {
    code: 'COOPERATIVE_SAVING_VIEW',
    label: 'Lihat Simpanan Koperasi',
    group: 'Koperasi',
    moduleCodes: ['KOPERASI_SIMPANAN_POKOK', 'KOPERASI_SIMPANAN_WAJIB', 'KOPERASI_SIMPANAN_SUKARELA'],
  },
  {
    code: 'COOPERATIVE_SAVING_MANAGE',
    label: 'Kelola Simpanan Koperasi',
    group: 'Koperasi',
    moduleCodes: ['KOPERASI_SIMPANAN_POKOK', 'KOPERASI_SIMPANAN_WAJIB', 'KOPERASI_SIMPANAN_SUKARELA'],
  },
  {
    code: 'COOPERATIVE_LOAN_VIEW',
    label: 'Lihat Pinjaman Koperasi',
    group: 'Koperasi',
    moduleCodes: ['KOPERASI_PINJAMAN'],
  },
  {
    code: 'COOPERATIVE_LOAN_MANAGE',
    label: 'Kelola Pinjaman Koperasi',
    group: 'Koperasi',
    moduleCodes: ['KOPERASI_PINJAMAN'],
    isSensitive: true,
  },
  {
    code: 'COOPERATIVE_INSTALLMENT_VIEW',
    label: 'Lihat Angsuran Koperasi',
    group: 'Koperasi',
    moduleCodes: ['KOPERASI_ANGSURAN'],
  },
  {
    code: 'COOPERATIVE_PAYMENT_CREATE',
    label: 'Catat Pembayaran Koperasi',
    group: 'Koperasi',
    moduleCodes: ['KOPERASI_ANGSURAN', 'KOPERASI_PENAGIHAN'],
    isSensitive: true,
  },
  {
    code: 'COOPERATIVE_BILLING_ACCESS',
    label: 'Akses Penagihan Koperasi',
    group: 'Koperasi',
    moduleCodes: ['KOPERASI_PENAGIHAN'],
  },
  {
    code: 'COOPERATIVE_REPORT_VIEW',
    label: 'Lihat Laporan Koperasi',
    group: 'Koperasi',
    moduleCodes: ['KOPERASI_SHU'],
  },
  {
    code: 'COOPERATIVE_AREA_ALL',
    label: 'Lihat Semua Area Koperasi',
    group: 'Koperasi',
    moduleCodes: ['KOPERASI_ANGGOTA', 'KOPERASI_ANGSURAN'],
    isSensitive: true,
  },
  {
    code: 'SETTINGS_ACCESS',
    label: 'Akses Pengaturan dan Master Data',
    group: 'Administrasi',
    moduleCodes: GENERAL_MODULES,
    isSensitive: true,
  },
  {
    code: 'USER_MANAGE',
    label: 'Kelola User dan Role',
    group: 'Administrasi',
    moduleCodes: ['ROLE_PERMISSION'],
    isSensitive: true,
  },
  {
    code: 'ACTIVITY_LOG_VIEW',
    label: 'Lihat Activity Log',
    group: 'Administrasi',
    moduleCodes: GENERAL_MODULES,
    isSensitive: true,
  },
];

export const getPermissionCatalogItem = (permission: Permission) => (
  PERMISSION_CATALOG.find((item) => item.code === permission)
);

interface SetupPermissionOptions {
  bypassSetupModuleLock?: boolean;
}

export const isPermissionEnabledBySetup = (
  permission: Permission,
  options: SetupPermissionOptions = {},
) => {
  const catalogItem = getPermissionCatalogItem(permission);
  if (!catalogItem) return false;
  if (options.bypassSetupModuleLock) return true;

  const config = getSetupConfig();
  if (!config) return true;

  return catalogItem.moduleCodes.some((moduleCode) => config.enabledModules.includes(moduleCode));
};

export const getEnabledPermissionCatalog = (options: SetupPermissionOptions = {}) => (
  PERMISSION_CATALOG.filter((item) => isPermissionEnabledBySetup(item.code, options))
);
