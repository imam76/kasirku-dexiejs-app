import type { SetupModuleGroup } from '@/types/setup';

/**
 * All available module groups for the developer setup panel.
 * Each group contains modules that can be toggled on/off during initial installation.
 */
export const SETUP_MODULE_GROUPS: SetupModuleGroup[] = [
  {
    key: 'master-data',
    label: 'Data Master',
    iconName: 'Database',
    modules: [
      { code: 'PRODUCT', label: 'Product', description: 'Manajemen produk, stok, & harga' },
      { code: 'CONTACT', label: 'Contact', description: 'Pelanggan & supplier' },
      { code: 'WAREHOUSE', label: 'Warehouse', description: 'Gudang & lokasi stok' },
      { code: 'DEPARTMENT', label: 'Department', description: 'Departemen organisasi' },
      { code: 'PROJECT', label: 'Project', description: 'Proyek & cost center' },
      { code: 'TAX', label: 'Tax', description: 'Pajak & tarif perpajakan' },
      { code: 'PROMO', label: 'Promo', description: 'Diskon & promosi' },
      { code: 'UNIT', label: 'Unit', description: 'Satuan & konversi unit' },
      { code: 'CURRENCY', label: 'Currency', description: 'Mata uang & kurs' },
      { code: 'ROLE_PERMISSION', label: 'Role & Permission', description: 'Manajemen role dan hak akses user' },
    ],
  },
  {
    key: 'pos',
    label: 'POS / Kasir',
    iconName: 'ShoppingCart',
    modules: [
      { code: 'POS_TRANSACTION', label: 'Transaction (POS)', description: 'Penjualan langsung di kasir' },
    ],
  },
  {
    key: 'sales',
    label: 'Sales',
    iconName: 'FileText',
    modules: [
      { code: 'SALES_QUOTATION', label: 'Sales Quotation (SQ)', description: 'Penawaran harga ke pelanggan' },
      { code: 'SALES_ORDER', label: 'Sales Order (SO)', description: 'Pesanan penjualan' },
      { code: 'SALES_DELIVERY', label: 'Sales Delivery (SD)', description: 'Pengiriman barang ke pelanggan' },
      { code: 'SALES_INVOICE', label: 'Sales Invoice (SI)', description: 'Faktur penjualan' },
      { code: 'SALES_RETURN', label: 'Sales Return', description: 'Retur penjualan' },
    ],
  },
  {
    key: 'purchases',
    label: 'Purchases',
    iconName: 'ShoppingBag',
    modules: [
      { code: 'PURCHASE_ORDER', label: 'Purchase Order (PO)', description: 'Pesanan pembelian ke supplier' },
      { code: 'PURCHASE_RECEIPT', label: 'Purchase Receipt (PR)', description: 'Penerimaan barang dari supplier' },
      { code: 'PURCHASE_INVOICE', label: 'Purchase Invoice (PI)', description: 'Faktur pembelian' },
      { code: 'PURCHASE_RETURN', label: 'Purchase Return', description: 'Retur pembelian' },
    ],
  },
  {
    key: 'finance',
    label: 'Finance',
    iconName: 'Banknote',
    modules: [
      { code: 'CASH_FLOW', label: 'Cash Flow', description: 'Arus kas masuk & keluar' },
      { code: 'RECEIVABLES', label: 'Receivables (Piutang)', description: 'Piutang usaha' },
      { code: 'PAYABLES', label: 'Payables (Hutang)', description: 'Hutang usaha' },
      { code: 'CHART_OF_ACCOUNTS', label: 'Chart of Accounts', description: 'Daftar akun keuangan' },
      { code: 'GENERAL_LEDGER', label: 'General Ledger', description: 'Buku besar & jurnal' },
    ],
  },
  {
    key: 'reports',
    label: 'Reports',
    iconName: 'BarChart3',
    modules: [
      { code: 'REPORT_POS_SALES', label: 'POS Sales Report', description: 'Laporan penjualan POS' },
      { code: 'REPORT_TRANSACTION_DETAIL', label: 'Transaction Detail', description: 'Laporan detail transaksi' },
      { code: 'REPORT_PURCHASE', label: 'Purchase Report', description: 'Laporan pembelian' },
      { code: 'REPORT_EXPENSE', label: 'Expense Report', description: 'Laporan pengeluaran' },
      { code: 'REPORT_AGING', label: 'Aging Report', description: 'Laporan umur piutang/hutang' },
      { code: 'REPORT_STOCK_CARD', label: 'Stock Card', description: 'Kartu stok per produk' },
      { code: 'REPORT_PROFIT', label: 'Profit Report', description: 'Laporan laba rugi' },
    ],
  },
  {
    key: 'koperasi',
    label: 'Koperasi',
    iconName: 'Landmark',
    modules: [
      { code: 'KOPERASI_ANGGOTA', label: 'Anggota', description: 'Data anggota koperasi' },
      { code: 'KOPERASI_SIMPANAN_POKOK', label: 'Simpanan Pokok', description: 'Simpanan wajib saat pendaftaran' },
      { code: 'KOPERASI_SIMPANAN_WAJIB', label: 'Simpanan Wajib', description: 'Simpanan rutin bulanan anggota' },
      { code: 'KOPERASI_SIMPANAN_SUKARELA', label: 'Simpanan Sukarela', description: 'Tabungan sukarela anggota' },
      { code: 'KOPERASI_PINJAMAN', label: 'Pinjaman', description: 'Pengajuan & pencairan pinjaman' },
      { code: 'KOPERASI_ANGSURAN', label: 'Angsuran', description: 'Cicilan & pembayaran pinjaman' },
      { code: 'KOPERASI_PENAGIHAN', label: 'Penagihan', description: 'Daftar tagihan jatuh tempo & tunggakan anggota' },
      { code: 'KOPERASI_KAS_PETUGAS', label: 'Kas Petugas', description: 'Sesi, dropping, storting, dan setor kas petugas lapangan' },
      { code: 'KOPERASI_SHU', label: 'SHU', description: 'Sisa Hasil Usaha & pembagian' },
    ],
  },
];

/**
 * Default modules that are pre-selected for a new installation.
 */
export const DEFAULT_SELECTED_MODULES: string[] = [
  // Data Master essentials
  'PRODUCT',
  'CONTACT',
  'ROLE_PERMISSION',
  // POS
  'POS_TRANSACTION',
  // Sales core flow
  'SALES_QUOTATION',
  'SALES_ORDER',
  'SALES_INVOICE',
  // Purchases core flow
  'PURCHASE_ORDER',
  'PURCHASE_INVOICE',
  // Finance essentials
  'CASH_FLOW',
  'CHART_OF_ACCOUNTS',
  // Reports
  'REPORT_POS_SALES',
  'REPORT_PROFIT',
];

/** localStorage key for the setup configuration */
export const SETUP_CONFIG_STORAGE_KEY = 'kasirku-setup-config';
