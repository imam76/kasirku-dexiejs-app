import { FINANCE_CATEGORIES } from '@/constants/finance';
import type { TranslationKey } from '@/i18n/messages';

type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string;

const CATEGORY_LABEL_KEYS: Record<string, TranslationKey> = {
  [FINANCE_CATEGORIES.SALES]: 'finance.category.PENJUALAN',
  [FINANCE_CATEGORIES.AUTO_COGS]: 'finance.category.HPP_OTOMATIS',
  [FINANCE_CATEGORIES.STOCK_PURCHASE]: 'finance.category.PEMBELIAN_STOK',
  [FINANCE_CATEGORIES.SALES_INVOICE_PAYMENT]: 'finance.category.PEMBAYARAN_INVOICE_PENJUALAN',
  [FINANCE_CATEGORIES.PURCHASE_INVOICE_PAYMENT]: 'finance.category.PEMBAYARAN_INVOICE_PEMBELIAN',
  [FINANCE_CATEGORIES.SALES_REFUND]: 'finance.category.REFUND_PENJUALAN',
  [FINANCE_CATEGORIES.WITHDRAWAL]: 'finance.category.PENARIKAN_SALDO',
  [FINANCE_CATEGORIES.OPENING_BALANCE]: 'finance.category.SALDO_AWAL',
  [FINANCE_CATEGORIES.OTHER]: 'finance.category.LAINNYA',
  [FINANCE_CATEGORIES.DEPOSIT]: 'finance.category.DEPOSIT',
  [FINANCE_CATEGORIES.CAPITAL_ADDITION]: 'finance.category.TAMBAHAN_MODAL',
  [FINANCE_CATEGORIES.LOAN]: 'finance.category.PINJAMAN',
  [FINANCE_CATEGORIES.SERVICE]: 'finance.category.LAYANAN',
  [FINANCE_CATEGORIES.BONUS_GRANT]: 'finance.category.BONUS',
  [FINANCE_CATEGORIES.OPERATIONAL]: 'finance.category.OPERASIONAL',
  GAJI: 'finance.category.GAJI',
  PERLENGKAPAN: 'finance.category.PERLENGKAPAN',
  MAKAN: 'finance.category.MAKAN',
  TRANSPORT: 'finance.category.TRANSPORT',
};

export const getFinanceCategoryLabel = (category: string, t: Translate) => {
  const key = CATEGORY_LABEL_KEYS[category];
  return key ? t(key) : category;
};
