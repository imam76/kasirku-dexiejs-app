import type { SalesInvoicePaymentStatus } from '@/types';

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const money = (value: unknown) => roundCurrency(Math.max(0, Number(value || 0)));

export interface InvoicePaymentStatusResult {
  netInvoiceAmount: number;
  balanceDue: number;
  paymentStatus: SalesInvoicePaymentStatus;
}

interface CalculateInvoicePaymentStatusInput {
  invoiceTotal: number;
  paidAmount: number;
  issuedCreditAmount: number;
}

export const calculateInvoicePaymentStatus = ({
  invoiceTotal,
  paidAmount,
  issuedCreditAmount,
}: CalculateInvoicePaymentStatusInput): InvoicePaymentStatusResult => {
  const netInvoiceAmount = money(invoiceTotal - issuedCreditAmount);
  const normalizedPaidAmount = money(paidAmount);
  const balanceDue = money(netInvoiceAmount - normalizedPaidAmount);
  const paymentStatus: SalesInvoicePaymentStatus = balanceDue <= 0
    ? 'PAID'
    : normalizedPaidAmount > 0
      ? 'PARTIAL'
      : 'UNPAID';

  return {
    netInvoiceAmount,
    balanceDue,
    paymentStatus,
  };
};
