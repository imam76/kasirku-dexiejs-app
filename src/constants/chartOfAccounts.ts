import { FINANCE_CATEGORIES } from '@/constants/finance';
import type {
  AccountType,
  AccountingProfileTemplateRecommendation,
  ChartOfAccount,
  ChartOfAccountTemplate,
  ChartOfAccountTemplateLine,
  FinanceAccountMapping,
} from '@/types';
import { getAccountNormalBalance } from '@/utils/chartOfAccounts/getAccountNormalBalance';

type DefaultAccountSeed = Omit<ChartOfAccount, 'created_at' | 'updated_at'>;
type DefaultMappingSeed = Omit<FinanceAccountMapping, 'id' | 'created_at' | 'updated_at'> & {
  account_id: string;
};

const createAccountSeed = (
  id: string,
  code: string,
  name: string,
  type: AccountType,
  options: Partial<Pick<ChartOfAccount, 'parent_id' | 'parent_code' | 'parent_name' | 'is_postable' | 'description'>> = {},
): DefaultAccountSeed => ({
  id,
  code,
  name,
  type,
  normal_balance: getAccountNormalBalance(type),
  is_postable: options.is_postable ?? true,
  is_system: true,
  is_active: true,
  ...options,
});

export const DEFAULT_CHART_OF_ACCOUNTS: DefaultAccountSeed[] = [
  createAccountSeed('cash-and-bank', '1000', 'Kas dan Bank', 'ASSET'),
  createAccountSeed('cash', '1010', 'Kas Tunai', 'ASSET', {
    parent_id: 'cash-and-bank',
    parent_code: '1000',
    parent_name: 'Kas dan Bank',
  }),
  createAccountSeed('bank', '1020', 'Bank / Non Tunai', 'ASSET', {
    parent_id: 'cash-and-bank',
    parent_code: '1000',
    parent_name: 'Kas dan Bank',
  }),
  createAccountSeed('accounts-receivable', '1100', 'Piutang Usaha', 'ASSET'),
  createAccountSeed('cooperative-loan-receivable', '1120', 'Piutang Pinjaman Anggota', 'ASSET'),
  createAccountSeed('employee-cash-advance-receivable', '1130', 'Piutang Kasbon Karyawan', 'ASSET'),
  createAccountSeed('inventory', '1200', 'Persediaan Barang', 'ASSET'),
  createAccountSeed('input-tax', '1305', 'PPN Masukan', 'ASSET'),
  createAccountSeed('advance-paid', '1310', 'Uang Muka Dibayar', 'ASSET'),
  createAccountSeed('accounts-payable', '2000', 'Hutang Usaha', 'LIABILITY'),
  createAccountSeed('output-tax', '2100', 'PPN Keluaran', 'LIABILITY'),
  createAccountSeed('luxury-sales-tax-payable', '2110', 'PPnBM Terutang', 'LIABILITY'),
  createAccountSeed('pph23-payable', '2120', 'PPh 23 Terutang', 'LIABILITY'),
  createAccountSeed('final-income-tax-payable', '2130', 'PPh Final Terutang', 'LIABILITY'),
  createAccountSeed('advance-received', '2210', 'Uang Muka Diterima', 'LIABILITY'),
  createAccountSeed('cooperative-member-savings', '2300', 'Simpanan Anggota', 'LIABILITY'),
  createAccountSeed('owner-capital', '3000', 'Modal Pemilik', 'EQUITY'),
  createAccountSeed('opening-balance-equity', '3050', 'Ekuitas Saldo Awal', 'EQUITY', {
    description: 'Akun ekuitas otomatis untuk menampung selisih saldo awal dan koreksi pembukaan.',
  }),
  createAccountSeed('sales-pos', '4000', 'Penjualan POS', 'REVENUE'),
  createAccountSeed('sales-invoice-revenue', '4010', 'Pendapatan Sales Invoice', 'REVENUE'),
  createAccountSeed('sales-return', '4020', 'Retur Penjualan', 'CONTRA_REVENUE'),
  createAccountSeed('sales-discount', '4030', 'Diskon Penjualan', 'CONTRA_REVENUE'),
  createAccountSeed('cooperative-loan-interest-income', '4040', 'Pendapatan Bunga Pinjaman Anggota', 'REVENUE'),
  createAccountSeed('cooperative-loan-penalty-income', '4050', 'Pendapatan Denda Pinjaman Anggota', 'REVENUE'),
  createAccountSeed('cooperative-loan-admin-income', '4060', 'Pendapatan Administrasi Pinjaman', 'REVENUE'),
  createAccountSeed('cogs', '5000', 'HPP', 'EXPENSE'),
  createAccountSeed('stock-purchase', '5100', 'Pembelian Stok', 'EXPENSE'),
  createAccountSeed('purchase-discount', '5110', 'Diskon Pembelian', 'EXPENSE'),
  createAccountSeed('operational-expense', '6100', 'Beban Operasional', 'EXPENSE'),
  createAccountSeed('salary-expense', '6110', 'Beban Gaji', 'EXPENSE', {
    parent_id: 'operational-expense',
    parent_code: '6100',
    parent_name: 'Beban Operasional',
  }),
  createAccountSeed('cooperative-saving-interest-expense', '6095', 'Beban Jasa Simpanan Anggota', 'EXPENSE'),
  createAccountSeed('other-expense', '6900', 'Beban Lainnya', 'EXPENSE'),
];

export const DEFAULT_FINANCE_ACCOUNT_MAPPINGS: DefaultMappingSeed[] = [
  {
    key: FINANCE_CATEGORIES.SALES,
    category: FINANCE_CATEGORIES.SALES,
    account_id: 'sales-pos',
    account_code: '4000',
    account_name: 'Penjualan POS',
    account_type: 'REVENUE',
    is_system: true,
  },
  {
    key: FINANCE_CATEGORIES.SALES_INVOICE_PAYMENT,
    category: FINANCE_CATEGORIES.SALES_INVOICE_PAYMENT,
    account_id: 'cash',
    account_code: '1010',
    account_name: 'Kas Tunai',
    account_type: 'ASSET',
    is_system: true,
  },
  {
    key: FINANCE_CATEGORIES.SALES_REFUND,
    category: FINANCE_CATEGORIES.SALES_REFUND,
    account_id: 'sales-return',
    account_code: '4020',
    account_name: 'Retur Penjualan',
    account_type: 'CONTRA_REVENUE',
    is_system: true,
  },
  {
    key: FINANCE_CATEGORIES.STOCK_PURCHASE,
    category: FINANCE_CATEGORIES.STOCK_PURCHASE,
    account_id: 'stock-purchase',
    account_code: '5100',
    account_name: 'Pembelian Stok',
    account_type: 'EXPENSE',
    is_system: true,
  },
  {
    key: FINANCE_CATEGORIES.AUTO_COGS,
    category: FINANCE_CATEGORIES.AUTO_COGS,
    account_id: 'cogs',
    account_code: '5000',
    account_name: 'HPP',
    account_type: 'EXPENSE',
    is_system: true,
  },
  {
    key: FINANCE_CATEGORIES.OPERATIONAL,
    category: FINANCE_CATEGORIES.OPERATIONAL,
    account_id: 'operational-expense',
    account_code: '6100',
    account_name: 'Beban Operasional',
    account_type: 'EXPENSE',
    is_system: true,
  },
  {
    key: FINANCE_CATEGORIES.PAYROLL,
    category: FINANCE_CATEGORIES.PAYROLL,
    account_id: 'salary-expense',
    account_code: '6110',
    account_name: 'Beban Gaji',
    account_type: 'EXPENSE',
    is_system: true,
  },
  {
    key: FINANCE_CATEGORIES.EMPLOYEE_CASH_ADVANCE,
    category: FINANCE_CATEGORIES.EMPLOYEE_CASH_ADVANCE,
    account_id: 'employee-cash-advance-receivable',
    account_code: '1130',
    account_name: 'Piutang Kasbon Karyawan',
    account_type: 'ASSET',
    is_system: true,
  },
  {
    key: FINANCE_CATEGORIES.OTHER,
    category: FINANCE_CATEGORIES.OTHER,
    account_id: 'other-expense',
    account_code: '6900',
    account_name: 'Beban Lainnya',
    account_type: 'EXPENSE',
    is_system: true,
  },
  {
    key: FINANCE_CATEGORIES.OPENING_BALANCE,
    category: FINANCE_CATEGORIES.OPENING_BALANCE,
    account_id: 'cash-and-bank',
    account_code: '1000',
    account_name: 'Kas dan Bank',
    account_type: 'ASSET',
    is_system: true,
  },
  {
    key: FINANCE_CATEGORIES.DEPOSIT,
    category: FINANCE_CATEGORIES.DEPOSIT,
    account_id: 'cash-and-bank',
    account_code: '1000',
    account_name: 'Kas dan Bank',
    account_type: 'ASSET',
    is_system: true,
  },
  {
    key: FINANCE_CATEGORIES.CAPITAL_ADDITION,
    category: FINANCE_CATEGORIES.CAPITAL_ADDITION,
    account_id: 'owner-capital',
    account_code: '3000',
    account_name: 'Modal Pemilik',
    account_type: 'EQUITY',
    is_system: true,
  },
  {
    key: FINANCE_CATEGORIES.LOAN,
    category: FINANCE_CATEGORIES.LOAN,
    account_id: 'accounts-payable',
    account_code: '2000',
    account_name: 'Hutang Usaha',
    account_type: 'LIABILITY',
    is_system: true,
  },
  {
    key: FINANCE_CATEGORIES.KSP_SAVING_DEPOSIT,
    category: FINANCE_CATEGORIES.KSP_SAVING_DEPOSIT,
    account_id: 'cooperative-member-savings',
    account_code: '2300',
    account_name: 'Simpanan Anggota',
    account_type: 'LIABILITY',
    is_system: true,
  },
  {
    key: FINANCE_CATEGORIES.KSP_SAVING_WITHDRAWAL,
    category: FINANCE_CATEGORIES.KSP_SAVING_WITHDRAWAL,
    account_id: 'cooperative-member-savings',
    account_code: '2300',
    account_name: 'Simpanan Anggota',
    account_type: 'LIABILITY',
    is_system: true,
  },
  {
    key: FINANCE_CATEGORIES.KSP_SAVING_INTEREST_PAYOUT,
    category: FINANCE_CATEGORIES.KSP_SAVING_INTEREST_PAYOUT,
    account_id: 'cooperative-saving-interest-expense',
    account_code: '6095',
    account_name: 'Beban Jasa Simpanan Anggota',
    account_type: 'EXPENSE',
    is_system: true,
  },
  {
    key: FINANCE_CATEGORIES.KSP_LOAN_DISBURSEMENT,
    category: FINANCE_CATEGORIES.KSP_LOAN_DISBURSEMENT,
    account_id: 'cooperative-loan-receivable',
    account_code: '1120',
    account_name: 'Piutang Pinjaman Anggota',
    account_type: 'ASSET',
    is_system: true,
  },
  {
    key: FINANCE_CATEGORIES.KSP_LOAN_ADMIN_FEE,
    category: FINANCE_CATEGORIES.KSP_LOAN_ADMIN_FEE,
    account_id: 'cooperative-loan-admin-income',
    account_code: '4060',
    account_name: 'Pendapatan Administrasi Pinjaman',
    account_type: 'REVENUE',
    is_system: true,
  },
  {
    key: FINANCE_CATEGORIES.KSP_LOAN_PAYMENT,
    category: FINANCE_CATEGORIES.KSP_LOAN_PAYMENT,
    account_id: 'cash-and-bank',
    account_code: '1000',
    account_name: 'Kas dan Bank',
    account_type: 'ASSET',
    is_system: true,
  },
  {
    key: FINANCE_CATEGORIES.KSP_IPTW,
    category: FINANCE_CATEGORIES.KSP_IPTW,
    account_id: 'other-expense',
    account_code: '6900',
    account_name: 'Beban Lainnya',
    account_type: 'EXPENSE',
    is_system: true,
  },
  {
    key: FINANCE_CATEGORIES.WITHDRAWAL,
    category: FINANCE_CATEGORIES.WITHDRAWAL,
    account_id: 'cash-and-bank',
    account_code: '1000',
    account_name: 'Kas dan Bank',
    account_type: 'ASSET',
    is_system: true,
  },
];

export const SAK_EMKM_RETAIL_TEMPLATE: ChartOfAccountTemplate = {
  id: 'default-sak-emkm-retail',
  code: 'SAK_EMKM_RETAIL',
  name: 'SAK EMKM Retail',
  accounting_profile: 'SAK_EMKM',
  industry_extension: 'RETAIL',
  description: 'Template akun ringan untuk toko retail dengan POS, stok, piutang, hutang, dan beban sederhana.',
  account_count_hint: 31,
  is_system: true,
  is_active: true,
  created_at: '',
  updated_at: '',
};

export const ACCOUNTING_PROFILE_TEMPLATE_RECOMMENDATIONS: AccountingProfileTemplateRecommendation[] = [
  {
    id: 'SAK_EMKM-RETAIL-default-sak-emkm-retail',
    accounting_profile: 'SAK_EMKM',
    industry_extension: 'RETAIL',
    template_id: SAK_EMKM_RETAIL_TEMPLATE.id,
    is_default: true,
    sort_order: 10,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'SAK_ETAP-COOPERATIVE-default-sak-etap-koperasi',
    accounting_profile: 'SAK_ETAP',
    industry_extension: 'COOPERATIVE',
    template_id: 'default-sak-etap-koperasi',
    is_default: true,
    sort_order: 20,
    created_at: '',
    updated_at: '',
  },
  {
    id: 'SAK_EMKM-NONE-default-sak-emkm-general-service',
    accounting_profile: 'SAK_EMKM',
    industry_extension: 'NONE',
    template_id: 'default-sak-emkm-general-service',
    is_default: true,
    sort_order: 30,
    created_at: '',
    updated_at: '',
  },
];

export const SAK_ETAP_KOPERASI_TEMPLATE: ChartOfAccountTemplate = {
  id: 'default-sak-etap-koperasi',
  code: 'SAK_ETAP_KOPERASI',
  name: 'SAK ETAP Koperasi',
  accounting_profile: 'SAK_ETAP',
  industry_extension: 'COOPERATIVE',
  description: 'Template akun koperasi simpan pinjam mengikuti SAK ETAP. Simpanan dipecah per jenis, tersedia cadangan kerugian piutang, dan dana-dana koperasi.',
  account_count_hint: 45,
  is_system: true,
  is_active: true,
  created_at: '',
  updated_at: '',
};

const createEtapTemplateLine = (
  templateAccountId: string,
  code: string,
  name: string,
  type: AccountType,
  options: Partial<Pick<ChartOfAccountTemplateLine, 'parent_template_account_id' | 'is_postable' | 'description' | 'mapping_keys'>> = {},
): ChartOfAccountTemplateLine => ({
  id: `${SAK_ETAP_KOPERASI_TEMPLATE.id}-${templateAccountId}`,
  template_id: SAK_ETAP_KOPERASI_TEMPLATE.id,
  template_account_id: templateAccountId,
  code,
  name,
  type,
  normal_balance: getAccountNormalBalance(type),
  is_postable: options.is_postable ?? true,
  created_at: '',
  ...options,
});

export const SAK_ETAP_KOPERASI_TEMPLATE_LINES: ChartOfAccountTemplateLine[] = [
  // === ASET ===
  createEtapTemplateLine('asset-current', '1000', 'Aset Lancar', 'ASSET', { is_postable: false }),
  createEtapTemplateLine('cash', '1010', 'Kas Tunai', 'ASSET', {
    parent_template_account_id: 'asset-current',
    mapping_keys: [
      FINANCE_CATEGORIES.OPENING_BALANCE,
      FINANCE_CATEGORIES.CASH_BANK_TRANSFER,
      FINANCE_CATEGORIES.KSP_LOAN_PAYMENT,
      FINANCE_CATEGORIES.WITHDRAWAL,
      FINANCE_CATEGORIES.DEPOSIT,
    ],
  }),
  createEtapTemplateLine('bank', '1020', 'Bank / Non Tunai', 'ASSET', {
    parent_template_account_id: 'asset-current',
    mapping_keys: [
      FINANCE_CATEGORIES.SALES_INVOICE_PAYMENT,
      FINANCE_CATEGORIES.PURCHASE_INVOICE_PAYMENT,
    ],
  }),
  createEtapTemplateLine('accounts-receivable', '1100', 'Piutang Usaha', 'ASSET', { parent_template_account_id: 'asset-current' }),
  createEtapTemplateLine('cooperative-loan-receivable', '1120', 'Piutang Pinjaman Anggota', 'ASSET', {
    parent_template_account_id: 'asset-current',
    mapping_keys: [FINANCE_CATEGORIES.KSP_LOAN_DISBURSEMENT],
  }),
  createEtapTemplateLine('allowance-doubtful-accounts', '1121', 'Cadangan Kerugian Piutang', 'ASSET', {
    parent_template_account_id: 'asset-current',
    description: 'Penyisihan piutang pinjaman tak tertagih (kontra aset)',
  }),
  createEtapTemplateLine('inventory', '1200', 'Persediaan Barang', 'ASSET', { parent_template_account_id: 'asset-current' }),
  createEtapTemplateLine('prepaid-expense', '1300', 'Biaya Dibayar Dimuka', 'ASSET', { parent_template_account_id: 'asset-current' }),
  createEtapTemplateLine('input-tax', '1305', 'PPN Masukan', 'ASSET', { parent_template_account_id: 'asset-current' }),
  createEtapTemplateLine('advance-paid', '1310', 'Uang Muka Dibayar', 'ASSET', { parent_template_account_id: 'asset-current' }),
  createEtapTemplateLine('fixed-asset', '1500', 'Aset Tetap', 'ASSET', { is_postable: false }),
  createEtapTemplateLine('equipment', '1510', 'Peralatan', 'ASSET', { parent_template_account_id: 'fixed-asset' }),
  createEtapTemplateLine('accumulated-depreciation', '1590', 'Akumulasi Penyusutan', 'ASSET', { parent_template_account_id: 'fixed-asset' }),

  // === KEWAJIBAN ===
  createEtapTemplateLine('liability', '2000', 'Kewajiban', 'LIABILITY', { is_postable: false }),
  createEtapTemplateLine('accounts-payable', '2010', 'Hutang Usaha', 'LIABILITY', {
    parent_template_account_id: 'liability',
    mapping_keys: [FINANCE_CATEGORIES.LOAN],
  }),
  createEtapTemplateLine('tax-payable', '2100', 'PPN Keluaran', 'LIABILITY', { parent_template_account_id: 'liability' }),
  createEtapTemplateLine('luxury-sales-tax-payable', '2110', 'PPnBM Terutang', 'LIABILITY', { parent_template_account_id: 'liability' }),
  createEtapTemplateLine('pph23-payable', '2120', 'PPh 23 Terutang', 'LIABILITY', { parent_template_account_id: 'liability' }),
  createEtapTemplateLine('final-income-tax-payable', '2130', 'PPh Final Terutang', 'LIABILITY', { parent_template_account_id: 'liability' }),
  createEtapTemplateLine('deposit-payable', '2200', 'Dana Titipan', 'LIABILITY', { parent_template_account_id: 'liability' }),
  createEtapTemplateLine('advance-received', '2210', 'Uang Muka Diterima', 'LIABILITY', { parent_template_account_id: 'liability' }),
  createEtapTemplateLine('member-savings', '2300', 'Simpanan Anggota', 'LIABILITY', {
    parent_template_account_id: 'liability',
    is_postable: false,
  }),
  createEtapTemplateLine('member-savings-pokok', '2310', 'Simpanan Pokok', 'LIABILITY', {
    parent_template_account_id: 'member-savings',
    description: 'Simpanan pokok anggota koperasi, disetor satu kali saat menjadi anggota',
  }),
  createEtapTemplateLine('member-savings-wajib', '2320', 'Simpanan Wajib', 'LIABILITY', {
    parent_template_account_id: 'member-savings',
    description: 'Simpanan wajib anggota koperasi, disetor berkala setiap bulan',
  }),
  createEtapTemplateLine('member-savings-sukarela', '2330', 'Simpanan Sukarela', 'LIABILITY', {
    parent_template_account_id: 'member-savings',
    mapping_keys: [
      FINANCE_CATEGORIES.KSP_SAVING_DEPOSIT,
      FINANCE_CATEGORIES.KSP_SAVING_WITHDRAWAL,
    ],
    description: 'Simpanan sukarela anggota koperasi, dapat disetor dan ditarik kapan saja',
  }),

  // === EKUITAS ===
  createEtapTemplateLine('equity', '3000', 'Ekuitas', 'EQUITY', { is_postable: false }),
  createEtapTemplateLine('simpanan-pokok-modal', '3010', 'Simpanan Pokok Modal', 'EQUITY', {
    parent_template_account_id: 'equity',
    mapping_keys: [FINANCE_CATEGORIES.CAPITAL_ADDITION],
    description: 'Modal dasar koperasi dari simpanan pokok anggota yang tidak dapat ditarik',
  }),
  createEtapTemplateLine('dana-cadangan', '3020', 'Dana Cadangan', 'EQUITY', {
    parent_template_account_id: 'equity',
    description: 'Cadangan dari alokasi SHU untuk memperkuat modal koperasi',
  }),
  createEtapTemplateLine('dana-pendidikan', '3030', 'Dana Pendidikan', 'EQUITY', {
    parent_template_account_id: 'equity',
    description: 'Dana pendidikan perkoperasian dari alokasi SHU',
  }),
  createEtapTemplateLine('dana-sosial', '3040', 'Dana Sosial', 'EQUITY', {
    parent_template_account_id: 'equity',
    description: 'Dana sosial dari alokasi SHU untuk kegiatan sosial koperasi',
  }),
  createEtapTemplateLine('opening-balance-equity', '3050', 'Ekuitas Saldo Awal', 'EQUITY', {
    parent_template_account_id: 'equity',
    description: 'Akun penyeimbang otomatis untuk posting saldo awal akun.',
  }),
  createEtapTemplateLine('shu-belum-dibagikan', '3100', 'SHU Belum Dibagikan', 'EQUITY', {
    parent_template_account_id: 'equity',
    description: 'Sisa Hasil Usaha tahun berjalan yang belum dialokasikan',
  }),

  // === PENDAPATAN ===
  createEtapTemplateLine('revenue', '4000', 'Pendapatan', 'REVENUE', { is_postable: false }),
  createEtapTemplateLine('sales-pos', '4010', 'Penjualan POS', 'REVENUE', {
    parent_template_account_id: 'revenue',
    mapping_keys: [FINANCE_CATEGORIES.SALES],
  }),
  createEtapTemplateLine('sales-invoice-revenue', '4020', 'Pendapatan Sales Invoice', 'REVENUE', { parent_template_account_id: 'revenue' }),
  createEtapTemplateLine('loan-interest-income', '4030', 'Pendapatan Bunga Pinjaman', 'REVENUE', {
    parent_template_account_id: 'revenue',
    description: 'Pendapatan bunga dari pinjaman anggota koperasi',
  }),
  createEtapTemplateLine('loan-penalty-income', '4040', 'Pendapatan Denda Pinjaman', 'REVENUE', {
    parent_template_account_id: 'revenue',
    description: 'Pendapatan denda keterlambatan angsuran pinjaman',
  }),
  createEtapTemplateLine('loan-admin-income', '4050', 'Pendapatan Administrasi Pinjaman', 'REVENUE', {
    parent_template_account_id: 'revenue',
    mapping_keys: [FINANCE_CATEGORIES.KSP_LOAN_ADMIN_FEE],
  }),
  createEtapTemplateLine('other-service-income', '4060', 'Pendapatan Jasa Lainnya', 'REVENUE', {
    parent_template_account_id: 'revenue',
    mapping_keys: [FINANCE_CATEGORIES.SERVICE, FINANCE_CATEGORIES.BONUS_GRANT],
  }),
  createEtapTemplateLine('sales-return', '4100', 'Retur Penjualan', 'CONTRA_REVENUE', {
    mapping_keys: [FINANCE_CATEGORIES.SALES_REFUND],
  }),
  createEtapTemplateLine('sales-discount', '4110', 'Diskon Penjualan', 'CONTRA_REVENUE'),

  // === BEBAN ===
  createEtapTemplateLine('cogs-group', '5000', 'Beban Pokok', 'EXPENSE', { is_postable: false }),
  createEtapTemplateLine('cogs', '5010', 'HPP', 'EXPENSE', {
    parent_template_account_id: 'cogs-group',
    mapping_keys: [FINANCE_CATEGORIES.AUTO_COGS],
  }),
  createEtapTemplateLine('stock-purchase', '5100', 'Pembelian Stok', 'EXPENSE', {
    parent_template_account_id: 'cogs-group',
    mapping_keys: [FINANCE_CATEGORIES.STOCK_PURCHASE],
  }),
  createEtapTemplateLine('purchase-discount', '5110', 'Diskon Pembelian', 'EXPENSE', { parent_template_account_id: 'cogs-group' }),
  createEtapTemplateLine('bad-debt-expense', '5020', 'Beban Penyisihan Piutang', 'EXPENSE', {
    parent_template_account_id: 'cogs-group',
    description: 'Beban penyisihan piutang pinjaman tak tertagih',
  }),
  createEtapTemplateLine('operational-expense', '6000', 'Beban Operasional', 'EXPENSE', { is_postable: false }),
  createEtapTemplateLine('salary-expense', '6010', 'Beban Gaji', 'EXPENSE', {
    parent_template_account_id: 'operational-expense',
    mapping_keys: [FINANCE_CATEGORIES.PAYROLL],
  }),
  createEtapTemplateLine('rent-expense', '6020', 'Beban Sewa', 'EXPENSE', { parent_template_account_id: 'operational-expense' }),
  createEtapTemplateLine('rat-expense', '6030', 'Beban RAT', 'EXPENSE', {
    parent_template_account_id: 'operational-expense',
    description: 'Beban penyelenggaraan Rapat Anggota Tahunan',
  }),
  createEtapTemplateLine('education-expense', '6040', 'Beban Pendidikan Koperasi', 'EXPENSE', {
    parent_template_account_id: 'operational-expense',
    description: 'Beban pendidikan dan pelatihan perkoperasian',
  }),
  createEtapTemplateLine('electricity-expense', '6050', 'Beban Listrik', 'EXPENSE', { parent_template_account_id: 'operational-expense' }),
  createEtapTemplateLine('transport-expense', '6060', 'Beban Transport', 'EXPENSE', { parent_template_account_id: 'operational-expense' }),
  createEtapTemplateLine('supplies-expense', '6070', 'Beban Perlengkapan', 'EXPENSE', { parent_template_account_id: 'operational-expense' }),
  createEtapTemplateLine('depreciation-expense', '6080', 'Beban Penyusutan', 'EXPENSE', { parent_template_account_id: 'operational-expense' }),
  createEtapTemplateLine('cooperative-iptw-expense', '6090', 'Beban Insentif Pembayaran Tepat Waktu (IPTW)', 'EXPENSE', {
    parent_template_account_id: 'operational-expense',
    mapping_keys: [FINANCE_CATEGORIES.KSP_IPTW],
    description: 'Insentif 5% dari pokok pinjaman bagi anggota yang melunasi seluruh angsuran tepat waktu',
  }),
  createEtapTemplateLine('cooperative-saving-interest-expense', '6095', 'Beban Jasa Simpanan Anggota', 'EXPENSE', {
    parent_template_account_id: 'operational-expense',
    mapping_keys: [FINANCE_CATEGORIES.KSP_SAVING_INTEREST_PAYOUT],
    description: 'Jasa simpanan pokok dan sukarela sebesar 0,2% per bulan penuh',
  }),
  createEtapTemplateLine('other-expense', '6900', 'Beban Lainnya', 'EXPENSE', {
    mapping_keys: [FINANCE_CATEGORIES.OTHER, FINANCE_CATEGORIES.OPERATIONAL],
  }),
];

const createTemplateLine = (
  templateAccountId: string,
  code: string,
  name: string,
  type: AccountType,
  options: Partial<Pick<ChartOfAccountTemplateLine, 'parent_template_account_id' | 'is_postable' | 'description' | 'mapping_keys'>> = {},
): ChartOfAccountTemplateLine => ({
  id: `${SAK_EMKM_RETAIL_TEMPLATE.id}-${templateAccountId}`,
  template_id: SAK_EMKM_RETAIL_TEMPLATE.id,
  template_account_id: templateAccountId,
  code,
  name,
  type,
  normal_balance: getAccountNormalBalance(type),
  is_postable: options.is_postable ?? true,
  created_at: '',
  ...options,
});

export const SAK_EMKM_RETAIL_TEMPLATE_LINES: ChartOfAccountTemplateLine[] = [
  createTemplateLine('asset-current', '1000', 'Aset Lancar', 'ASSET', { is_postable: false }),
  createTemplateLine('cash', '1010', 'Kas Tunai', 'ASSET', {
    parent_template_account_id: 'asset-current',
    mapping_keys: [
      FINANCE_CATEGORIES.OPENING_BALANCE,
      FINANCE_CATEGORIES.CASH_BANK_TRANSFER,
      FINANCE_CATEGORIES.WITHDRAWAL,
      FINANCE_CATEGORIES.DEPOSIT,
    ],
  }),
  createTemplateLine('bank', '1020', 'Bank / Non Tunai', 'ASSET', {
    parent_template_account_id: 'asset-current',
    mapping_keys: [
      FINANCE_CATEGORIES.SALES_INVOICE_PAYMENT,
      FINANCE_CATEGORIES.PURCHASE_INVOICE_PAYMENT,
    ],
  }),
  createTemplateLine('accounts-receivable', '1100', 'Piutang Usaha', 'ASSET', { parent_template_account_id: 'asset-current' }),
  createTemplateLine('other-receivable', '1110', 'Piutang Lain-lain', 'ASSET', {
    parent_template_account_id: 'asset-current',
  }),
  createTemplateLine('inventory', '1200', 'Persediaan Barang', 'ASSET', { parent_template_account_id: 'asset-current' }),
  createTemplateLine('prepaid-expense', '1300', 'Biaya Dibayar Dimuka', 'ASSET', { parent_template_account_id: 'asset-current' }),
  createTemplateLine('input-tax', '1305', 'PPN Masukan', 'ASSET', { parent_template_account_id: 'asset-current' }),
  createTemplateLine('advance-paid', '1310', 'Uang Muka Dibayar', 'ASSET', { parent_template_account_id: 'asset-current' }),
  createTemplateLine('fixed-asset', '1500', 'Aset Tetap', 'ASSET', { is_postable: false }),
  createTemplateLine('equipment', '1510', 'Peralatan Toko', 'ASSET', { parent_template_account_id: 'fixed-asset' }),
  createTemplateLine('accumulated-depreciation', '1590', 'Akumulasi Penyusutan', 'ASSET', { parent_template_account_id: 'fixed-asset' }),
  createTemplateLine('liability', '2000', 'Liabilitas', 'LIABILITY', { is_postable: false }),
  createTemplateLine('accounts-payable', '2010', 'Hutang Usaha', 'LIABILITY', {
    parent_template_account_id: 'liability',
  }),
  createTemplateLine('tax-payable', '2100', 'PPN Keluaran', 'LIABILITY', { parent_template_account_id: 'liability' }),
  createTemplateLine('luxury-sales-tax-payable', '2110', 'PPnBM Terutang', 'LIABILITY', { parent_template_account_id: 'liability' }),
  createTemplateLine('pph23-payable', '2120', 'PPh 23 Terutang', 'LIABILITY', { parent_template_account_id: 'liability' }),
  createTemplateLine('final-income-tax-payable', '2130', 'PPh Final Terutang', 'LIABILITY', { parent_template_account_id: 'liability' }),
  createTemplateLine('loan-payable', '2200', 'Pinjaman', 'LIABILITY', {
    parent_template_account_id: 'liability',
    mapping_keys: [FINANCE_CATEGORIES.LOAN],
  }),
  createTemplateLine('advance-received', '2210', 'Uang Muka Diterima', 'LIABILITY', {
    parent_template_account_id: 'liability',
  }),
  createTemplateLine('equity', '3000', 'Ekuitas', 'EQUITY', { is_postable: false }),
  createTemplateLine('owner-capital', '3010', 'Modal Pemilik', 'EQUITY', {
    parent_template_account_id: 'equity',
    mapping_keys: [FINANCE_CATEGORIES.CAPITAL_ADDITION],
  }),
  createTemplateLine('owner-draw', '3020', 'Prive Pemilik', 'EQUITY', { parent_template_account_id: 'equity' }),
  createTemplateLine('opening-balance-equity', '3050', 'Ekuitas Saldo Awal', 'EQUITY', {
    parent_template_account_id: 'equity',
    description: 'Akun penyeimbang otomatis untuk posting saldo awal akun.',
  }),
  createTemplateLine('retained-earning', '3100', 'Saldo Laba', 'EQUITY', { parent_template_account_id: 'equity' }),
  createTemplateLine('revenue', '4000', 'Pendapatan', 'REVENUE', { is_postable: false }),
  createTemplateLine('sales-pos', '4010', 'Penjualan POS', 'REVENUE', {
    parent_template_account_id: 'revenue',
    mapping_keys: [FINANCE_CATEGORIES.SALES],
  }),
  createTemplateLine('sales-invoice-revenue', '4020', 'Pendapatan Sales Invoice', 'REVENUE', { parent_template_account_id: 'revenue' }),
  createTemplateLine('sales-return', '4100', 'Retur Penjualan', 'CONTRA_REVENUE', {
    mapping_keys: [FINANCE_CATEGORIES.SALES_REFUND],
  }),
  createTemplateLine('sales-discount', '4110', 'Diskon Penjualan', 'CONTRA_REVENUE'),
  createTemplateLine('cogs-group', '5000', 'Beban Pokok', 'EXPENSE', { is_postable: false }),
  createTemplateLine('cogs', '5010', 'HPP', 'EXPENSE', {
    parent_template_account_id: 'cogs-group',
    mapping_keys: [FINANCE_CATEGORIES.AUTO_COGS],
  }),
  createTemplateLine('stock-purchase', '5100', 'Pembelian Stok', 'EXPENSE', {
    parent_template_account_id: 'cogs-group',
    mapping_keys: [FINANCE_CATEGORIES.STOCK_PURCHASE],
  }),
  createTemplateLine('purchase-discount', '5110', 'Diskon Pembelian', 'EXPENSE', { parent_template_account_id: 'cogs-group' }),
  createTemplateLine('operational-expense', '6000', 'Beban Operasional', 'EXPENSE', { is_postable: false }),
  createTemplateLine('salary-expense', '6010', 'Beban Gaji', 'EXPENSE', {
    parent_template_account_id: 'operational-expense',
    mapping_keys: [FINANCE_CATEGORIES.PAYROLL],
  }),
  createTemplateLine('rent-expense', '6020', 'Beban Sewa', 'EXPENSE', { parent_template_account_id: 'operational-expense' }),
  createTemplateLine('electricity-expense', '6030', 'Beban Listrik', 'EXPENSE', { parent_template_account_id: 'operational-expense' }),
  createTemplateLine('transport-expense', '6040', 'Beban Transport', 'EXPENSE', { parent_template_account_id: 'operational-expense' }),
  createTemplateLine('supplies-expense', '6050', 'Beban Perlengkapan', 'EXPENSE', { parent_template_account_id: 'operational-expense' }),

  createTemplateLine('other-expense', '6900', 'Beban Lainnya', 'EXPENSE', {
    mapping_keys: [FINANCE_CATEGORIES.OTHER, FINANCE_CATEGORIES.OPERATIONAL],
  }),
];

export const SAK_EMKM_GENERAL_SERVICE_TEMPLATE: ChartOfAccountTemplate = {
  id: 'default-sak-emkm-general-service',
  code: 'SAK_EMKM_GENERAL_SERVICE',
  name: 'SAK EMKM Jasa Umum',
  accounting_profile: 'SAK_EMKM',
  industry_extension: 'NONE',
  description: 'Template akun ringan untuk bisnis jasa tanpa akun dan mapping inventory-heavy.',
  account_count_hint: 23,
  is_system: true,
  is_active: true,
  created_at: '',
  updated_at: '',
};

const createServiceTemplateLine = (
  templateAccountId: string,
  code: string,
  name: string,
  type: AccountType,
  options: Partial<Pick<ChartOfAccountTemplateLine, 'parent_template_account_id' | 'is_postable' | 'description' | 'mapping_keys'>> = {},
): ChartOfAccountTemplateLine => ({
  id: `${SAK_EMKM_GENERAL_SERVICE_TEMPLATE.id}-${templateAccountId}`,
  template_id: SAK_EMKM_GENERAL_SERVICE_TEMPLATE.id,
  template_account_id: templateAccountId,
  code,
  name,
  type,
  normal_balance: getAccountNormalBalance(type),
  is_postable: options.is_postable ?? true,
  created_at: '',
  ...options,
});

export const SAK_EMKM_GENERAL_SERVICE_TEMPLATE_LINES: ChartOfAccountTemplateLine[] = [
  createServiceTemplateLine('asset-current', '1000', 'Aset Lancar', 'ASSET', { is_postable: false }),
  createServiceTemplateLine('cash', '1010', 'Kas Tunai', 'ASSET', {
    parent_template_account_id: 'asset-current',
    mapping_keys: [
      FINANCE_CATEGORIES.OPENING_BALANCE,
      FINANCE_CATEGORIES.CASH_BANK_TRANSFER,
      FINANCE_CATEGORIES.WITHDRAWAL,
      FINANCE_CATEGORIES.DEPOSIT,
    ],
  }),
  createServiceTemplateLine('bank', '1020', 'Bank / Non Tunai', 'ASSET', {
    parent_template_account_id: 'asset-current',
    mapping_keys: [
      FINANCE_CATEGORIES.SALES_INVOICE_PAYMENT,
      FINANCE_CATEGORIES.PURCHASE_INVOICE_PAYMENT,
    ],
  }),
  createServiceTemplateLine('accounts-receivable', '1100', 'Piutang Usaha', 'ASSET', {
    parent_template_account_id: 'asset-current',
  }),
  createServiceTemplateLine('other-receivable', '1110', 'Piutang Lain-lain', 'ASSET', {
    parent_template_account_id: 'asset-current',
  }),
  createServiceTemplateLine('prepaid-expense', '1300', 'Biaya Dibayar Dimuka', 'ASSET', {
    parent_template_account_id: 'asset-current',
  }),
  createServiceTemplateLine('advance-paid', '1310', 'Uang Muka Dibayar', 'ASSET', {
    parent_template_account_id: 'asset-current',
  }),
  createServiceTemplateLine('fixed-asset', '1500', 'Aset Tetap', 'ASSET', { is_postable: false }),
  createServiceTemplateLine('equipment', '1510', 'Peralatan', 'ASSET', {
    parent_template_account_id: 'fixed-asset',
  }),
  createServiceTemplateLine('accumulated-depreciation', '1590', 'Akumulasi Penyusutan', 'ASSET', {
    parent_template_account_id: 'fixed-asset',
  }),
  createServiceTemplateLine('liability', '2000', 'Liabilitas', 'LIABILITY', { is_postable: false }),
  createServiceTemplateLine('accounts-payable', '2010', 'Hutang Usaha', 'LIABILITY', {
    parent_template_account_id: 'liability',
    mapping_keys: [FINANCE_CATEGORIES.LOAN],
  }),
  createServiceTemplateLine('tax-payable', '2100', 'Pajak Terutang', 'LIABILITY', {
    parent_template_account_id: 'liability',
  }),
  createServiceTemplateLine('advance-received', '2210', 'Uang Muka Diterima', 'LIABILITY', {
    parent_template_account_id: 'liability',
  }),
  createServiceTemplateLine('equity', '3000', 'Ekuitas', 'EQUITY', { is_postable: false }),
  createServiceTemplateLine('owner-capital', '3010', 'Modal Pemilik', 'EQUITY', {
    parent_template_account_id: 'equity',
    mapping_keys: [FINANCE_CATEGORIES.CAPITAL_ADDITION],
  }),
  createServiceTemplateLine('owner-draw', '3020', 'Prive Pemilik', 'EQUITY', {
    parent_template_account_id: 'equity',
  }),
  createServiceTemplateLine('opening-balance-equity', '3050', 'Ekuitas Saldo Awal', 'EQUITY', {
    parent_template_account_id: 'equity',
    description: 'Akun penyeimbang otomatis untuk posting saldo awal akun.',
  }),
  createServiceTemplateLine('retained-earning', '3100', 'Saldo Laba', 'EQUITY', {
    parent_template_account_id: 'equity',
  }),
  createServiceTemplateLine('revenue', '4000', 'Pendapatan', 'REVENUE', { is_postable: false }),
  createServiceTemplateLine('service-revenue', '4010', 'Pendapatan Jasa', 'REVENUE', {
    parent_template_account_id: 'revenue',
    mapping_keys: [FINANCE_CATEGORIES.SALES, FINANCE_CATEGORIES.SERVICE],
  }),
  createServiceTemplateLine('other-income', '4090', 'Pendapatan Lainnya', 'REVENUE', {
    parent_template_account_id: 'revenue',
    mapping_keys: [FINANCE_CATEGORIES.BONUS_GRANT],
  }),
  createServiceTemplateLine('sales-return', '4100', 'Retur Pendapatan', 'CONTRA_REVENUE', {
    mapping_keys: [FINANCE_CATEGORIES.SALES_REFUND],
  }),
  createServiceTemplateLine('sales-discount', '4110', 'Diskon Pendapatan', 'CONTRA_REVENUE'),
  createServiceTemplateLine('operational-expense', '6000', 'Beban Operasional', 'EXPENSE', { is_postable: false }),
  createServiceTemplateLine('salary-expense', '6010', 'Beban Gaji', 'EXPENSE', {
    parent_template_account_id: 'operational-expense',
    mapping_keys: [FINANCE_CATEGORIES.PAYROLL],
  }),
  createServiceTemplateLine('rent-expense', '6020', 'Beban Sewa', 'EXPENSE', {
    parent_template_account_id: 'operational-expense',
  }),
  createServiceTemplateLine('utility-expense', '6030', 'Beban Utilitas', 'EXPENSE', {
    parent_template_account_id: 'operational-expense',
  }),
  createServiceTemplateLine('supplies-expense', '6040', 'Beban Perlengkapan', 'EXPENSE', {
    parent_template_account_id: 'operational-expense',
  }),
  createServiceTemplateLine('other-expense', '6900', 'Beban Lainnya', 'EXPENSE', {
    mapping_keys: [FINANCE_CATEGORIES.OTHER, FINANCE_CATEGORIES.OPERATIONAL],
  }),
];

export const MANUFACTURING_EXTENSION_TEMPLATE_PREVIEW: ChartOfAccountTemplate = {
  id: 'preview-manufacturing-extension',
  code: 'INDUSTRY_MANUFACTURING_PREVIEW',
  name: 'Preview Akun Manufaktur',
  accounting_profile: 'SAK_EP',
  industry_extension: 'MANUFACTURING',
  description: 'Preview akun manufaktur. Tidak boleh diterapkan sebelum BOM, production order, costing, dan WIP movement tersedia.',
  account_count_hint: 8,
  is_system: true,
  is_active: true,
  created_at: '',
  updated_at: '',
};

export const CONSTRUCTION_EXTENSION_TEMPLATE_PREVIEW: ChartOfAccountTemplate = {
  id: 'preview-construction-extension',
  code: 'INDUSTRY_CONSTRUCTION_PREVIEW',
  name: 'Preview Akun Konstruksi',
  accounting_profile: 'SAK_EP',
  industry_extension: 'CONSTRUCTION',
  description: 'Preview akun konstruksi. Tidak boleh diterapkan sebelum contract, progress billing, retention, dan revenue recognition tersedia.',
  account_count_hint: 10,
  is_system: true,
  is_active: true,
  created_at: '',
  updated_at: '',
};

export const PSAP_TEMPLATE_PREVIEW: ChartOfAccountTemplate = {
  id: 'preview-psap-profile',
  code: 'PSAP_PREVIEW',
  name: 'Preview Profile PSAP',
  accounting_profile: 'PSAP',
  industry_extension: 'NONE',
  description: 'Preview struktur akun pemerintahan. PSAP membutuhkan mode/report khusus dan tidak memakai label laba rugi retail.',
  account_count_hint: 8,
  is_system: true,
  is_active: true,
  created_at: '',
  updated_at: '',
};

const createPreviewTemplateLine = (
  template: ChartOfAccountTemplate,
  templateAccountId: string,
  code: string,
  name: string,
  type: AccountType,
  options: Partial<Pick<ChartOfAccountTemplateLine, 'parent_template_account_id' | 'is_postable' | 'description'>> = {},
): ChartOfAccountTemplateLine => ({
  id: `${template.id}-${templateAccountId}`,
  template_id: template.id,
  template_account_id: templateAccountId,
  code,
  name,
  type,
  normal_balance: getAccountNormalBalance(type),
  is_postable: options.is_postable ?? true,
  created_at: '',
  ...options,
});

export const MANUFACTURING_EXTENSION_TEMPLATE_LINES: ChartOfAccountTemplateLine[] = [
  createPreviewTemplateLine(MANUFACTURING_EXTENSION_TEMPLATE_PREVIEW, 'raw-material-inventory', '1210', 'Persediaan Bahan Baku', 'ASSET'),
  createPreviewTemplateLine(MANUFACTURING_EXTENSION_TEMPLATE_PREVIEW, 'wip-inventory', '1220', 'Persediaan Barang Dalam Proses / WIP', 'ASSET'),
  createPreviewTemplateLine(MANUFACTURING_EXTENSION_TEMPLATE_PREVIEW, 'finished-goods-inventory', '1230', 'Persediaan Barang Jadi', 'ASSET'),
  createPreviewTemplateLine(MANUFACTURING_EXTENSION_TEMPLATE_PREVIEW, 'factory-overhead', '5300', 'Overhead Pabrik', 'EXPENSE'),
  createPreviewTemplateLine(MANUFACTURING_EXTENSION_TEMPLATE_PREVIEW, 'direct-labor', '5310', 'Tenaga Kerja Langsung', 'EXPENSE'),
  createPreviewTemplateLine(MANUFACTURING_EXTENSION_TEMPLATE_PREVIEW, 'indirect-production-expense', '5320', 'Beban Produksi Tidak Langsung', 'EXPENSE'),
  createPreviewTemplateLine(MANUFACTURING_EXTENSION_TEMPLATE_PREVIEW, 'production-variance', '5330', 'Selisih Biaya Produksi', 'EXPENSE'),
  createPreviewTemplateLine(MANUFACTURING_EXTENSION_TEMPLATE_PREVIEW, 'finished-goods-cogs', '5400', 'HPP Produk Jadi', 'EXPENSE'),
];

export const CONSTRUCTION_EXTENSION_TEMPLATE_LINES: ChartOfAccountTemplateLine[] = [
  createPreviewTemplateLine(CONSTRUCTION_EXTENSION_TEMPLATE_PREVIEW, 'contract-asset', '1300', 'Aset Kontrak', 'ASSET'),
  createPreviewTemplateLine(CONSTRUCTION_EXTENSION_TEMPLATE_PREVIEW, 'retention-receivable', '1310', 'Piutang Retensi', 'ASSET'),
  createPreviewTemplateLine(CONSTRUCTION_EXTENSION_TEMPLATE_PREVIEW, 'project-advance', '1320', 'Uang Muka Proyek', 'ASSET'),
  createPreviewTemplateLine(CONSTRUCTION_EXTENSION_TEMPLATE_PREVIEW, 'contract-liability', '2300', 'Liabilitas Kontrak', 'LIABILITY'),
  createPreviewTemplateLine(CONSTRUCTION_EXTENSION_TEMPLATE_PREVIEW, 'retention-payable', '2310', 'Hutang Retensi', 'LIABILITY'),
  createPreviewTemplateLine(CONSTRUCTION_EXTENSION_TEMPLATE_PREVIEW, 'contract-revenue', '4200', 'Pendapatan Kontrak', 'REVENUE'),
  createPreviewTemplateLine(CONSTRUCTION_EXTENSION_TEMPLATE_PREVIEW, 'project-material-expense', '6200', 'Beban Material Proyek', 'EXPENSE'),
  createPreviewTemplateLine(CONSTRUCTION_EXTENSION_TEMPLATE_PREVIEW, 'project-labor-expense', '6210', 'Beban Tenaga Kerja Proyek', 'EXPENSE'),
  createPreviewTemplateLine(CONSTRUCTION_EXTENSION_TEMPLATE_PREVIEW, 'subcontractor-expense', '6220', 'Beban Subkontraktor', 'EXPENSE'),
  createPreviewTemplateLine(CONSTRUCTION_EXTENSION_TEMPLATE_PREVIEW, 'project-overhead-expense', '6230', 'Beban Overhead Proyek', 'EXPENSE'),
];

export const PSAP_TEMPLATE_LINES: ChartOfAccountTemplateLine[] = [
  createPreviewTemplateLine(PSAP_TEMPLATE_PREVIEW, 'psap-asset', '1000', 'Aset', 'ASSET', { is_postable: false }),
  createPreviewTemplateLine(PSAP_TEMPLATE_PREVIEW, 'psap-liability', '2000', 'Kewajiban', 'LIABILITY', { is_postable: false }),
  createPreviewTemplateLine(PSAP_TEMPLATE_PREVIEW, 'psap-equity-fund', '3000', 'Ekuitas Dana', 'EQUITY'),
  createPreviewTemplateLine(PSAP_TEMPLATE_PREVIEW, 'psap-revenue-lo', '4100', 'Pendapatan-LO', 'REVENUE'),
  createPreviewTemplateLine(PSAP_TEMPLATE_PREVIEW, 'psap-revenue-lra', '4200', 'Pendapatan-LRA', 'REVENUE'),
  createPreviewTemplateLine(PSAP_TEMPLATE_PREVIEW, 'psap-expense', '5100', 'Beban', 'EXPENSE'),
  createPreviewTemplateLine(PSAP_TEMPLATE_PREVIEW, 'psap-spending', '5200', 'Belanja', 'EXPENSE'),
  createPreviewTemplateLine(PSAP_TEMPLATE_PREVIEW, 'psap-financing', '7000', 'Pembiayaan', 'EQUITY'),
];
