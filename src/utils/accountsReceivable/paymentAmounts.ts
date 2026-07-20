import type { SalesInvoicePayment } from '@/types';
import { toDocumentCurrencyAmount } from '@/utils/documentCurrency';

export const roundCurrency = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export interface SalesInvoicePaymentAllocationInput {
  paymentAmount: number;
  foreignPaymentAmount?: number;
  balanceDue: number;
  foreignBalanceDue?: number;
}

export const getSalesInvoicePaymentAllocatedAmount = (
  payment: Pick<SalesInvoicePayment, 'amount' | 'allocated_amount'>,
) => roundCurrency(payment.allocated_amount ?? payment.amount ?? 0);

export const getSalesInvoicePaymentForeignAllocatedAmount = (
  payment: Pick<SalesInvoicePayment, 'foreign_amount' | 'foreign_allocated_amount' | 'amount' | 'allocated_amount'>,
) => {
  if (payment.foreign_allocated_amount !== undefined) {
    return roundCurrency(payment.foreign_allocated_amount);
  }

  if (payment.foreign_amount !== undefined) {
    return roundCurrency(payment.foreign_amount);
  }

  return getSalesInvoicePaymentAllocatedAmount(payment);
};

export const getSalesInvoicePaymentOverpaymentAmount = (
  payment: Pick<SalesInvoicePayment, 'amount' | 'allocated_amount' | 'overpayment_amount'>,
) => {
  if (payment.overpayment_amount !== undefined) {
    return roundCurrency(payment.overpayment_amount);
  }

  return roundCurrency(Math.max(0, Number(payment.amount || 0) - getSalesInvoicePaymentAllocatedAmount(payment)));
};

export const getSalesInvoicePaymentRemainingOverpaymentAmount = (
  payment: Pick<SalesInvoicePayment, 'amount' | 'allocated_amount' | 'overpayment_amount' | 'overpayment_used_amount' | 'overpayment_remaining_amount' | 'status'>,
) => {
  if (payment.status === 'VOIDED') return 0;
  if (payment.overpayment_remaining_amount !== undefined) {
    return roundCurrency(Math.max(0, payment.overpayment_remaining_amount));
  }

  return roundCurrency(Math.max(
    0,
    getSalesInvoicePaymentOverpaymentAmount(payment) - Number(payment.overpayment_used_amount || 0),
  ));
};

export const calculateSalesInvoicePaymentAllocation = ({
  paymentAmount,
  foreignPaymentAmount,
  balanceDue,
  foreignBalanceDue,
}: SalesInvoicePaymentAllocationInput) => {
  const normalizedPaymentAmount = roundCurrency(Math.max(0, Number(paymentAmount || 0)));
  const normalizedForeignPaymentAmount = foreignPaymentAmount === undefined
    ? undefined
    : roundCurrency(Math.max(0, Number(foreignPaymentAmount || 0)));
  const normalizedBalanceDue = roundCurrency(Math.max(0, Number(balanceDue || 0)));
  const allocatedAmount = roundCurrency(Math.min(normalizedPaymentAmount, normalizedBalanceDue));
  const overpaymentAmount = roundCurrency(Math.max(0, normalizedPaymentAmount - allocatedAmount));
  const normalizedForeignBalanceDue = foreignBalanceDue === undefined
    ? undefined
    : roundCurrency(Math.max(0, Number(foreignBalanceDue || 0)));
  const foreignAllocatedAmount = normalizedForeignPaymentAmount === undefined
    ? undefined
    : roundCurrency(Math.min(
      normalizedForeignPaymentAmount,
      normalizedForeignBalanceDue ?? normalizedForeignPaymentAmount,
    ));
  const foreignOverpaymentAmount = normalizedForeignPaymentAmount === undefined || foreignAllocatedAmount === undefined
    ? undefined
    : roundCurrency(Math.max(0, normalizedForeignPaymentAmount - foreignAllocatedAmount));

  return {
    amount: normalizedPaymentAmount,
    allocated_amount: allocatedAmount,
    overpayment_amount: overpaymentAmount,
    foreign_amount: normalizedForeignPaymentAmount,
    foreign_allocated_amount: foreignAllocatedAmount,
    foreign_overpayment_amount: foreignOverpaymentAmount,
  };
};

export const toForeignBalanceDue = (
  balanceDue: number,
  documentSnapshot: Parameters<typeof toDocumentCurrencyAmount>[1],
) => toDocumentCurrencyAmount(balanceDue, documentSnapshot);
