import type { ReceivableAgingBucket, SalesInvoicePaymentStatus } from '@/types';

export interface CalculateReceivableBalanceInput {
  invoiceTotal: number;
  activePaymentAmount: number;
  dueDate?: string;
  asOfDate?: string;
  returnCreditAmount?: number;
}

export interface ReceivableBalanceCalculation {
  paid_amount: number;
  return_credit_amount: number;
  balance_due: number;
  payment_status: SalesInvoicePaymentStatus;
  aging_bucket: ReceivableAgingBucket;
  overdue_days: number;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const toDateOnly = (value?: string) => {
  if (!value) return undefined;
  const dateKey = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) return undefined;

  return new Date(`${dateKey}T00:00:00`);
};

export const getReceivableAgingBucket = (overdueDays: number): ReceivableAgingBucket => {
  if (overdueDays <= 0) return 'CURRENT';
  if (overdueDays <= 30) return 'OVERDUE_1_30';
  if (overdueDays <= 60) return 'OVERDUE_31_60';
  if (overdueDays <= 90) return 'OVERDUE_61_90';
  return 'OVERDUE_90_PLUS';
};

export const calculateReceivableBalance = ({
  invoiceTotal,
  activePaymentAmount,
  dueDate,
  asOfDate,
  returnCreditAmount = 0,
}: CalculateReceivableBalanceInput): ReceivableBalanceCalculation => {
  const total = roundCurrency(Math.max(0, Number(invoiceTotal || 0)));
  const paidAmount = roundCurrency(Math.max(0, Number(activePaymentAmount || 0)));
  const creditAmount = roundCurrency(Math.max(0, Number(returnCreditAmount || 0)));
  const balanceDue = roundCurrency(Math.max(0, total - paidAmount - creditAmount));
  const paymentStatus: SalesInvoicePaymentStatus = balanceDue <= 0
    ? 'PAID'
    : paidAmount > 0
      ? 'PARTIAL'
      : 'UNPAID';
  const due = toDateOnly(dueDate);
  const asOf = toDateOnly(asOfDate) ?? toDateOnly(new Date().toISOString());
  const overdueDays = due && asOf
    ? Math.max(0, Math.floor((asOf.getTime() - due.getTime()) / MS_PER_DAY))
    : 0;

  return {
    paid_amount: paidAmount,
    return_credit_amount: creditAmount,
    balance_due: balanceDue,
    payment_status: paymentStatus,
    aging_bucket: getReceivableAgingBucket(overdueDays),
    overdue_days: overdueDays,
  };
};
