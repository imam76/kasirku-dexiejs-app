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
  createAccountSeed('inventory', '1200', 'Persediaan Barang', 'ASSET'),
  createAccountSeed('accounts-payable', '2000', 'Hutang Usaha', 'LIABILITY'),
  createAccountSeed('owner-capital', '3000', 'Modal Pemilik', 'EQUITY'),
  createAccountSeed('sales-pos', '4000', 'Penjualan POS', 'REVENUE'),
  createAccountSeed('sales-invoice-revenue', '4010', 'Pendapatan Sales Invoice', 'REVENUE'),
  createAccountSeed('sales-return', '4020', 'Retur Penjualan', 'CONTRA_REVENUE'),
  createAccountSeed('cogs', '5000', 'HPP', 'EXPENSE'),
  createAccountSeed('stock-purchase', '5100', 'Pembelian Stok', 'EXPENSE'),
  createAccountSeed('operational-expense', '6100', 'Beban Operasional', 'EXPENSE'),
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
  account_count_hint: 29,
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
];

const createTemplateLine = (
  templateAccountId: string,
  code: string,
  name: string,
  type: AccountType,
  options: Partial<Pick<ChartOfAccountTemplateLine, 'parent_template_account_id' | 'is_postable' | 'description' | 'mapping_key'>> = {},
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
    mapping_key: FINANCE_CATEGORIES.OPENING_BALANCE,
  }),
  createTemplateLine('bank', '1020', 'Bank / Non Tunai', 'ASSET', {
    parent_template_account_id: 'asset-current',
    mapping_key: FINANCE_CATEGORIES.SALES_INVOICE_PAYMENT,
  }),
  createTemplateLine('accounts-receivable', '1100', 'Piutang Usaha', 'ASSET', { parent_template_account_id: 'asset-current' }),
  createTemplateLine('other-receivable', '1110', 'Piutang Lain-lain', 'ASSET', { parent_template_account_id: 'asset-current' }),
  createTemplateLine('inventory', '1200', 'Persediaan Barang', 'ASSET', { parent_template_account_id: 'asset-current' }),
  createTemplateLine('prepaid-expense', '1300', 'Biaya Dibayar Dimuka', 'ASSET', { parent_template_account_id: 'asset-current' }),
  createTemplateLine('fixed-asset', '1500', 'Aset Tetap', 'ASSET', { is_postable: false }),
  createTemplateLine('equipment', '1510', 'Peralatan Toko', 'ASSET', { parent_template_account_id: 'fixed-asset' }),
  createTemplateLine('accumulated-depreciation', '1590', 'Akumulasi Penyusutan', 'ASSET', { parent_template_account_id: 'fixed-asset' }),
  createTemplateLine('liability', '2000', 'Liabilitas', 'LIABILITY', { is_postable: false }),
  createTemplateLine('accounts-payable', '2010', 'Hutang Usaha', 'LIABILITY', { parent_template_account_id: 'liability' }),
  createTemplateLine('tax-payable', '2100', 'Hutang Pajak', 'LIABILITY', { parent_template_account_id: 'liability' }),
  createTemplateLine('loan-payable', '2200', 'Pinjaman', 'LIABILITY', { parent_template_account_id: 'liability' }),
  createTemplateLine('equity', '3000', 'Ekuitas', 'EQUITY', { is_postable: false }),
  createTemplateLine('owner-capital', '3010', 'Modal Pemilik', 'EQUITY', {
    parent_template_account_id: 'equity',
    mapping_key: FINANCE_CATEGORIES.CAPITAL_ADDITION,
  }),
  createTemplateLine('owner-draw', '3020', 'Prive Pemilik', 'EQUITY', { parent_template_account_id: 'equity' }),
  createTemplateLine('retained-earning', '3100', 'Saldo Laba', 'EQUITY', { parent_template_account_id: 'equity' }),
  createTemplateLine('revenue', '4000', 'Pendapatan', 'REVENUE', { is_postable: false }),
  createTemplateLine('sales-pos', '4010', 'Penjualan POS', 'REVENUE', {
    parent_template_account_id: 'revenue',
    mapping_key: FINANCE_CATEGORIES.SALES,
  }),
  createTemplateLine('sales-invoice-revenue', '4020', 'Pendapatan Sales Invoice', 'REVENUE', { parent_template_account_id: 'revenue' }),
  createTemplateLine('sales-return', '4100', 'Retur Penjualan', 'CONTRA_REVENUE', {
    mapping_key: FINANCE_CATEGORIES.SALES_REFUND,
  }),
  createTemplateLine('sales-discount', '4110', 'Diskon Penjualan', 'CONTRA_REVENUE'),
  createTemplateLine('cogs-group', '5000', 'Beban Pokok', 'EXPENSE', { is_postable: false }),
  createTemplateLine('cogs', '5010', 'HPP', 'EXPENSE', {
    parent_template_account_id: 'cogs-group',
    mapping_key: FINANCE_CATEGORIES.AUTO_COGS,
  }),
  createTemplateLine('stock-purchase', '5100', 'Pembelian Stok', 'EXPENSE', {
    parent_template_account_id: 'cogs-group',
    mapping_key: FINANCE_CATEGORIES.STOCK_PURCHASE,
  }),
  createTemplateLine('operational-expense', '6000', 'Beban Operasional', 'EXPENSE', { is_postable: false }),
  createTemplateLine('salary-expense', '6010', 'Beban Gaji', 'EXPENSE', { parent_template_account_id: 'operational-expense' }),
  createTemplateLine('rent-expense', '6020', 'Beban Sewa', 'EXPENSE', { parent_template_account_id: 'operational-expense' }),
  createTemplateLine('electricity-expense', '6030', 'Beban Listrik', 'EXPENSE', { parent_template_account_id: 'operational-expense' }),
  createTemplateLine('transport-expense', '6040', 'Beban Transport', 'EXPENSE', { parent_template_account_id: 'operational-expense' }),
  createTemplateLine('supplies-expense', '6050', 'Beban Perlengkapan', 'EXPENSE', { parent_template_account_id: 'operational-expense' }),
  createTemplateLine('other-expense', '6900', 'Beban Lainnya', 'EXPENSE', {
    mapping_key: FINANCE_CATEGORIES.OTHER,
  }),
];

