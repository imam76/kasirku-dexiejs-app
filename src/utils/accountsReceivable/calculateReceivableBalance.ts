import type { ReceivableAgingBucket, SalesInvoicePaymentStatus } from '@/types';
import {
  calculateInvoiceBalance,
  getInvoiceAgingBucket,
  type CalculateInvoiceBalanceInput,
} from '@/utils/invoiceBalance/calculateInvoiceBalance';

export type CalculateReceivableBalanceInput = CalculateInvoiceBalanceInput;

export interface ReceivableBalanceCalculation {
  paid_amount: number;
  return_credit_amount: number;
  balance_due: number;
  payment_status: SalesInvoicePaymentStatus;
  aging_bucket: ReceivableAgingBucket;
  overdue_days: number;
}

export const getReceivableAgingBucket = getInvoiceAgingBucket;

export const calculateReceivableBalance = (input: CalculateReceivableBalanceInput): ReceivableBalanceCalculation => {
  const calculation = calculateInvoiceBalance(input);

  return {
    ...calculation,
    payment_status: calculation.payment_status as SalesInvoicePaymentStatus,
  };
};
