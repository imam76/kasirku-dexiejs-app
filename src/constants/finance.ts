import type { FinanceTransactionType } from '@/types';

export const FINANCE_CATEGORIES = {
  SALES: 'PENJUALAN',
  AUTO_COGS: 'HPP_OTOMATIS',
  STOCK_PURCHASE: 'PEMBELIAN_STOK',
  SALES_INVOICE_PAYMENT: 'PEMBAYARAN_INVOICE_PENJUALAN',
  SALES_REFUND: 'REFUND_PENJUALAN',
  WITHDRAWAL: 'PENARIKAN_SALDO',
  OPENING_BALANCE: 'SALDO_AWAL',
  OTHER: 'LAINNYA',
  DEPOSIT: 'DEPOSIT',
  CAPITAL_ADDITION: 'TAMBAHAN_MODAL',
  LOAN: 'PINJAMAN',
  SERVICE: 'LAYANAN',
  BONUS_GRANT: 'BONUS',
  OPERATIONAL: 'OPERASIONAL',
} as const;

export const FINANCE_FUNDING_CATEGORIES = [
  FINANCE_CATEGORIES.OPENING_BALANCE,
  FINANCE_CATEGORIES.DEPOSIT,
  FINANCE_CATEGORIES.CAPITAL_ADDITION,
  FINANCE_CATEGORIES.LOAN,
] as const;

export const NON_PROFIT_FINANCE_CATEGORIES = [
  FINANCE_CATEGORIES.SALES,
  FINANCE_CATEGORIES.AUTO_COGS,
  FINANCE_CATEGORIES.STOCK_PURCHASE,
  FINANCE_CATEGORIES.SALES_INVOICE_PAYMENT,
  FINANCE_CATEGORIES.SALES_REFUND,
  FINANCE_CATEGORIES.WITHDRAWAL,
  ...FINANCE_FUNDING_CATEGORIES,
] as const;

export const isFundingFinanceCategory = (category: string) => {
  return FINANCE_FUNDING_CATEGORIES.includes(category as typeof FINANCE_FUNDING_CATEGORIES[number]);
};

export const normalizeFinanceTransactionType = (
  type: FinanceTransactionType,
  category: string,
): FinanceTransactionType => {
  if (type === 'OPENING_BALANCE' || isFundingFinanceCategory(category)) {
    return 'OPENING_BALANCE';
  }

  return type;
};

export const getFinanceTransactionBusinessType = (
  transaction: { type: FinanceTransactionType; category: string },
): FinanceTransactionType => {
  return normalizeFinanceTransactionType(transaction.type, transaction.category);
};

export const isProfitAffectingFinanceTransaction = (type: string, category: string) => {
  return (
    type !== 'OPENING_BALANCE' &&
    !NON_PROFIT_FINANCE_CATEGORIES.includes(category as typeof NON_PROFIT_FINANCE_CATEGORIES[number])
  );
};
