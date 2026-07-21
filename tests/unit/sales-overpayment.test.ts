import { describe, expect, test } from 'bun:test';
import {
  calculateSalesInvoicePaymentAllocation,
  getSalesInvoicePaymentAllocatedAmount,
  getSalesInvoicePaymentOverpaymentAmount,
  getSalesInvoicePaymentRemainingOverpaymentAmount,
} from '@/utils/accountsReceivable/paymentAmounts';
import type { SalesInvoicePayment } from '@/types';

const buildPayment = (partial: Partial<SalesInvoicePayment>): SalesInvoicePayment => ({
  id: 'payment-1',
  sales_document_id: 'invoice-1',
  document_number: 'SI-001',
  customer_name: 'Customer A',
  amount: 0,
  paid_at: '2026-07-20T00:00:00.000Z',
  status: 'ACTIVE',
  created_at: '2026-07-20T00:00:00.000Z',
  updated_at: '2026-07-20T00:00:00.000Z',
  ...partial,
});

describe('sales overpayment helpers', () => {
  test('allocates exact payment with no overpayment', () => {
    const result = calculateSalesInvoicePaymentAllocation({
      paymentAmount: 500_000,
      foreignPaymentAmount: 500_000,
      balanceDue: 500_000,
      foreignBalanceDue: 500_000,
    });

    expect(result.allocated_amount).toBe(500_000);
    expect(result.overpayment_amount).toBe(0);
    expect(result.foreign_allocated_amount).toBe(500_000);
    expect(result.foreign_overpayment_amount).toBe(0);
  });

  test('splits overpayment into invoice allocation and customer credit', () => {
    const result = calculateSalesInvoicePaymentAllocation({
      paymentAmount: 1_000_000,
      foreignPaymentAmount: 1_000_000,
      balanceDue: 500_000,
      foreignBalanceDue: 500_000,
    });

    expect(result.allocated_amount).toBe(500_000);
    expect(result.overpayment_amount).toBe(500_000);
    expect(result.foreign_allocated_amount).toBe(500_000);
    expect(result.foreign_overpayment_amount).toBe(500_000);
  });

  test('calculates partially used remaining overpayment', () => {
    const payment = buildPayment({
      amount: 1_000_000,
      allocated_amount: 500_000,
      overpayment_amount: 500_000,
      overpayment_used_amount: 125_000,
    });

    expect(getSalesInvoicePaymentAllocatedAmount(payment)).toBe(500_000);
    expect(getSalesInvoicePaymentOverpaymentAmount(payment)).toBe(500_000);
    expect(getSalesInvoicePaymentRemainingOverpaymentAmount(payment)).toBe(375_000);
  });

  test('voided overpayment has no usable remaining balance', () => {
    const payment = buildPayment({
      status: 'VOIDED',
      amount: 1_000_000,
      allocated_amount: 500_000,
      overpayment_amount: 500_000,
      overpayment_used_amount: 0,
    });

    expect(getSalesInvoicePaymentRemainingOverpaymentAmount(payment)).toBe(0);
  });
});
