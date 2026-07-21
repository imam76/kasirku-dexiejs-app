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
    moduleCodes: ['PRODUCT', 'WAREHOUSE', 'UNIT', 'REPORT_STOCK_CARD'],
  },
  {
    code: 'PRODUCT_MANAGE',
    label: 'Kelola Produk',
    group: 'Data Master',
    moduleCodes: ['PRODUCT'],
  },
  {
    code: 'UNIT_MANAGE',
    label: 'Kelola Satuan dan Konversi',
    group: 'Data Master',
    moduleCodes: ['UNIT'],
  },
  {
    code: 'PRODUCTION_MANAGE',
    label: 'Kelola Produksi',
    group: 'Data Master',
    moduleCodes: ['PRODUCTION'],
    isSensitive: true,
  },
  {
    code: 'STOCK_OPNAME_MANAGE',
    label: 'Kelola Stock Opname',
    group: 'Data Master',
    moduleCodes: ['STOCK_OPNAME'],
    isSensitive: true,
  },
  {
    code: 'PROMO_MANAGE',
    label: 'Kelola Diskon dan Promo',
    group: 'Data Master',
    moduleCodes: ['PROMO'],
    isSensitive: true,
  },
  {
    code: 'CONTACT_MANAGE',
    label: 'Kelola Contact',
    group: 'Data Master',
    moduleCodes: ['CONTACT'],
  },
  {
    code: 'WAREHOUSE_MANAGE',
    label: 'Kelola Gudang',
    group: 'Data Master',
    moduleCodes: ['WAREHOUSE'],
  },
  {
    code: 'PAYMENT_METHOD_MANAGE',
    label: 'Kelola Metode Pembayaran',
    group: 'Data Master',
    moduleCodes: ['PAYMENT_METHOD'],
  },
  {
    code: 'CURRENCY_MANAGE',
    label: 'Kelola Mata Uang',
    group: 'Data Master',
    moduleCodes: ['CURRENCY'],
  },
  {
    code: 'AREA_MANAGE',
    label: 'Kelola Area',
    group: 'Data Master',
    moduleCodes: ['AREA'],
  },
  {
    code: 'EMPLOYEE_MANAGE',
    label: 'Kelola Karyawan',
    group: 'Data Master',
    moduleCodes: ['EMPLOYEE'],
    isSensitive: true,
  },
  {
    code: 'DEPARTMENT_MANAGE',
    label: 'Kelola Department',
    group: 'Data Master',
    moduleCodes: ['DEPARTMENT'],
  },
  {
    code: 'PROJECT_MANAGE',
    label: 'Kelola Project',
    group: 'Data Master',
    moduleCodes: ['PROJECT'],
  },
  {
    code: 'TAX_MANAGE',
    label: 'Kelola Tax',
    group: 'Data Master',
    moduleCodes: ['TAX'],
    isSensitive: true,
  },
  {
    code: 'STOCK_PURCHASE_ACCESS',
    label: 'Akses Pembelian Stok',
    group: 'Stok',
    moduleCodes: ['PURCHASE_ORDER', 'PURCHASE_RECEIPT', 'PURCHASE_INVOICE'],
  },
  {
    code: 'SALES_QUOTATION_MANAGE',
    label: 'Kelola Sales Quotation',
    group: 'Sales',
    moduleCodes: ['SALES_QUOTATION'],
  },
  {
    code: 'SALES_ORDER_MANAGE',
    label: 'Kelola Sales Order',
    group: 'Sales',
    moduleCodes: ['SALES_ORDER'],
  },
  {
    code: 'SALES_DELIVERY_MANAGE',
    label: 'Kelola Sales Delivery',
    group: 'Sales',
    moduleCodes: ['SALES_DELIVERY'],
  },
  {
    code: 'SALES_INVOICE_MANAGE',
    label: 'Kelola Sales Invoice',
    group: 'Sales',
    moduleCodes: ['SALES_INVOICE'],
    isSensitive: true,
  },
  {
    code: 'PURCHASE_REQUEST_MANAGE',
    label: 'Kelola Purchase Request',
    group: 'Purchase',
    moduleCodes: ['PURCHASE_REQUEST'],
  },
  {
    code: 'PURCHASE_RFQ_MANAGE',
    label: 'Kelola Request for Quotation',
    group: 'Purchase',
    moduleCodes: ['PURCHASE_RFQ'],
  },
  {
    code: 'PURCHASE_ORDER_MANAGE',
    label: 'Kelola Purchase Order',
    group: 'Purchase',
    moduleCodes: ['PURCHASE_ORDER'],
  },
  {
    code: 'PURCHASE_RECEIPT_MANAGE',
    label: 'Kelola Purchase Receipt',
    group: 'Purchase',
    moduleCodes: ['PURCHASE_RECEIPT'],
    isSensitive: true,
  },
  {
    code: 'PURCHASE_INVOICE_MANAGE',
    label: 'Kelola Purchase Invoice',
    group: 'Purchase',
    moduleCodes: ['PURCHASE_INVOICE'],
    isSensitive: true,
  },
  {
    code: 'PURCHASE_RETURN_MANAGE',
    label: 'Kelola Purchase Return',
    group: 'Purchase',
    moduleCodes: ['PURCHASE_RETURN'],
    isSensitive: true,
  },
  {
    code: 'PROFIT_VIEW',
    label: 'Lihat Profit',
    group: 'Laporan',
    moduleCodes: ['REPORT_PROFIT'],
    isSensitive: true,
  },
  {
    code: 'REPORT_POS_SALES_VIEW',
    label: 'Lihat Laporan Penjualan POS',
    group: 'Laporan',
    moduleCodes: ['REPORT_POS_SALES'],
  },
  {
    code: 'REPORT_DEPOSIT_VIEW',
    label: 'Lihat Laporan Setoran Kasir',
    group: 'Laporan',
    moduleCodes: ['REPORT_DEPOSIT'],
    isSensitive: true,
  },
  {
    code: 'REPORT_TRANSACTION_DETAIL_VIEW',
    label: 'Lihat Laporan Detail Transaksi',
    group: 'Laporan',
    moduleCodes: ['REPORT_TRANSACTION_DETAIL'],
  },
  {
    code: 'REPORT_PURCHASE_VIEW',
    label: 'Lihat Laporan Pembelian',
    group: 'Laporan',
    moduleCodes: ['REPORT_PURCHASE'],
  },
  {
    code: 'REPORT_INCOME_VIEW',
    label: 'Lihat Laporan Pemasukan',
    group: 'Laporan',
    moduleCodes: ['REPORT_INCOME'],
    isSensitive: true,
  },
  {
    code: 'REPORT_EXPENSE_VIEW',
    label: 'Lihat Laporan Pengeluaran',
    group: 'Laporan',
    moduleCodes: ['REPORT_EXPENSE'],
    isSensitive: true,
  },
  {
    code: 'REPORT_CASH_FLOW_VIEW',
    label: 'Lihat Laporan Arus Kas',
    group: 'Laporan',
    moduleCodes: ['REPORT_CASH_FLOW'],
    isSensitive: true,
  },
  {
    code: 'REPORT_PAYROLL_VIEW',
    label: 'Lihat Laporan Penggajian',
    group: 'Laporan',
    moduleCodes: ['REPORT_PAYROLL'],
    isSensitive: true,
  },
  {
    code: 'REPORT_PROFIT_LOSS_VIEW',
    label: 'Lihat Laporan Laba Rugi',
    group: 'Laporan',
    moduleCodes: ['REPORT_PROFIT'],
    isSensitive: true,
  },
  {
    code: 'REPORT_BALANCE_SHEET_VIEW',
    label: 'Lihat Laporan Neraca',
    group: 'Laporan',
    moduleCodes: ['REPORT_BALANCE_SHEET'],
    isSensitive: true,
  },
  {
    code: 'REPORT_LEDGER_VIEW',
    label: 'Lihat Buku Besar',
    group: 'Laporan',
    moduleCodes: ['GENERAL_LEDGER'],
    isSensitive: true,
  },
  {
    code: 'REPORT_AGING_VIEW',
    label: 'Lihat Laporan Aging',
    group: 'Laporan',
    moduleCodes: ['REPORT_AGING'],
    isSensitive: true,
  },
  {
    code: 'REPORT_STOCK_CARD_VIEW',
    label: 'Lihat Kartu Stok',
    group: 'Laporan',
    moduleCodes: ['REPORT_STOCK_CARD'],
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
    code: 'ACCOUNTING_PERIOD_MANAGE',
    label: 'Kelola Periode Akuntansi',
    group: 'Keuangan',
    moduleCodes: ['GENERAL_LEDGER'],
    isSensitive: true,
  },
  {
    code: 'PERIOD_CLOSE',
    label: 'Tutup Buku Periode',
    group: 'Keuangan',
    moduleCodes: ['GENERAL_LEDGER'],
    isSensitive: true,
  },
  {
    code: 'PERIOD_REOPEN',
    label: 'Buka Ulang Periode',
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
    code: 'COOPERATIVE_LOAN_DISBURSE',
    label: 'Cairkan Pinjaman Koperasi',
    description: 'Mencairkan pinjaman approved dan mencatat dropping kas ke PDL bila diperlukan.',
    group: 'Koperasi',
    moduleCodes: ['KOPERASI_PINJAMAN', 'CASH_FLOW'],
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
    code: 'COOPERATIVE_PAYMENT_APPROVE',
    label: 'Approve Backdate/Reversal Pembayaran',
    description: 'Menyetujui atau menolak request backdate dan reversal pembayaran koperasi.',
    group: 'Koperasi',
    moduleCodes: ['KOPERASI_ANGSURAN'],
    isSensitive: true,
  },
  {
    code: 'COOPERATIVE_BILLING_ACCESS',
    label: 'Akses Penagihan Koperasi',
    group: 'Koperasi',
    moduleCodes: ['KOPERASI_PENAGIHAN'],
  },
  {
    code: 'COOPERATIVE_FIELD_CASH_VIEW',
    label: 'Lihat Kas Petugas',
    group: 'Koperasi',
    moduleCodes: ['KOPERASI_KAS_PETUGAS'],
  },
  {
    code: 'COOPERATIVE_FIELD_CASH_MANAGE',
    label: 'Kelola Kas Petugas',
    group: 'Koperasi',
    moduleCodes: ['KOPERASI_KAS_PETUGAS'],
    isSensitive: true,
  },
  {
    code: 'COOPERATIVE_OVERVIEW_REPORT_VIEW',
    label: 'Lihat Overview Laporan Koperasi',
    group: 'Laporan Koperasi',
    moduleCodes: ['KOPERASI_SHU'],
  },
  {
    code: 'COOPERATIVE_CASH_REPORT_VIEW',
    label: 'Lihat Laporan Tunai Koperasi',
    group: 'Laporan Koperasi',
    moduleCodes: ['KOPERASI_REPORT_CASH'],
  },
  {
    code: 'COOPERATIVE_DAILY_TARGET_REPORT_VIEW',
    label: 'Lihat Laporan Target Harian',
    group: 'Laporan Koperasi',
    moduleCodes: ['KOPERASI_REPORT_DAILY_TARGET'],
  },
  {
    code: 'COOPERATIVE_DAILY_STORTING_REPORT_VIEW',
    label: 'Lihat Laporan Storting Harian',
    group: 'Laporan Koperasi',
    moduleCodes: ['KOPERASI_REPORT_DAILY_STORTING'],
  },
  {
    code: 'COOPERATIVE_DAILY_DROP_REPORT_VIEW',
    label: 'Lihat Laporan Drop Harian',
    group: 'Laporan Koperasi',
    moduleCodes: ['KOPERASI_REPORT_DAILY_DROP'],
  },
  {
    code: 'COOPERATIVE_WEEKLY_DROP_REPORT_VIEW',
    label: 'Lihat Laporan Drop Mingguan',
    group: 'Laporan Koperasi',
    moduleCodes: ['KOPERASI_REPORT_WEEKLY_DROP'],
  },
  {
    code: 'COOPERATIVE_RESORT_DEVELOPMENT_REPORT_VIEW',
    label: 'Lihat Laporan Perkembangan Resort/Karyawan',
    group: 'Laporan Koperasi',
    moduleCodes: ['KOPERASI_REPORT_RESORT_DEVELOPMENT'],
  },
  {
    code: 'COOPERATIVE_IPTW_REPORT_VIEW',
    label: 'Lihat Laporan IPTW',
    group: 'Laporan Koperasi',
    moduleCodes: ['KOPERASI_REPORT_IPTW'],
  },
  {
    code: 'COOPERATIVE_MEMBER_REGISTER_REPORT_VIEW',
    label: 'Lihat Laporan Induk Anggota',
    group: 'Laporan Koperasi',
    moduleCodes: ['KOPERASI_REPORT_MEMBER_REGISTER'],
  },
  {
    code: 'COOPERATIVE_INSTALLMENT_BOOK_REPORT_VIEW',
    label: 'Lihat Buku Angsuran',
    group: 'Laporan Koperasi',
    moduleCodes: ['KOPERASI_REPORT_INSTALLMENT_BOOK'],
  },
  {
    code: 'COOPERATIVE_CASH_FLOW_REPORT_VIEW',
    label: 'Lihat Laporan Arus Kas Koperasi',
    group: 'Laporan Koperasi',
    moduleCodes: ['KOPERASI_REPORT_CASH_FLOW'],
  },
  {
    code: 'COOPERATIVE_AREA_ALL',
    label: 'Lihat Semua Area Koperasi',
    group: 'Koperasi',
    moduleCodes: ['KOPERASI_ANGGOTA', 'KOPERASI_ANGSURAN'],
    isSensitive: true,
  },
  {
    code: 'MARKETPLACE_VIEW',
    label: 'Lihat Marketplace',
    description: 'Melihat koneksi toko dan pesanan Marketplace.',
    group: 'Marketplace',
    moduleCodes: ['MARKETPLACE'],
  },
  {
    code: 'MARKETPLACE_MANAGE',
    label: 'Kelola Marketplace',
    description: 'Menghubungkan toko dan menjalankan sinkronisasi pesanan.',
    group: 'Marketplace',
    moduleCodes: ['MARKETPLACE'],
    isSensitive: true,
  },
  {
    code: 'SETTINGS_ACCESS',
    label: 'Akses Pengaturan',
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
