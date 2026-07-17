import { db } from '@/lib/db';
import type { PosTransactionPayment, Transaction } from '@/types';
import { resolvePosPaymentMethod, type ResolvedPosPaymentMethod } from '@/services/posPaymentMethodService';
import {
  allocatePosPayments,
  buildLegacyPosTransactionPayment,
  groupPosPaymentsByTransaction,
} from '@/utils/posSplitPayment';

export interface CheckoutPaymentInput {
  paymentMethodId: string;
  tenderedAmount: number;
  paymentReference?: string;
}

export interface ResolvedCheckoutPayment {
  sequence: number;
  tenderedAmount: number;
  appliedAmount: number;
  changeAmount: number;
  resolved: ResolvedPosPaymentMethod;
}

export const resolveCheckoutPayments = async (
  inputs: CheckoutPaymentInput[],
  total: number,
): Promise<ResolvedCheckoutPayment[]> => {
  const resolved = await Promise.all(inputs.map((input) => resolvePosPaymentMethod({
    paymentMethodId: input.paymentMethodId,
    paymentReference: input.paymentReference,
  })));
  const allocation = allocatePosPayments(total, inputs.map((input, index) => ({
    key: String(index),
    paymentMethodId: input.paymentMethodId,
    category: resolved[index]?.master.category,
    tenderedAmount: input.tenderedAmount,
  })));
  if (!allocation.isValid) throw new Error(allocation.errors[0] ?? 'Pembayaran tidak valid.');

  return allocation.lines.map((line, index) => ({
    sequence: index,
    tenderedAmount: line.tenderedAmount,
    appliedAmount: line.appliedAmount,
    changeAmount: line.changeAmount,
    resolved: resolved[index]!,
  }));
};

export const buildPosTransactionPaymentRecords = (
  transactionId: string,
  createdAt: string,
  payments: ResolvedCheckoutPayment[],
): PosTransactionPayment[] => payments.map((payment) => ({
  id: crypto.randomUUID(),
  transaction_id: transactionId,
  sequence: payment.sequence,
  tendered_amount: payment.tenderedAmount,
  applied_amount: payment.appliedAmount,
  change_amount: payment.changeAmount,
  payment_method: payment.resolved.legacyPaymentMethod,
  payment_method_id: payment.resolved.master.id,
  payment_method_code: payment.resolved.master.code,
  payment_method_name: payment.resolved.master.name,
  payment_method_category: payment.resolved.master.category,
  payment_reference: payment.resolved.normalizedReference,
  payment_posting_account_id: payment.resolved.postingAccount.id,
  payment_posting_account_code: payment.resolved.postingAccount.code,
  payment_posting_account_name: payment.resolved.postingAccount.name,
  created_at: createdAt,
}));

export const backfillMissingPosTransactionPayments = async (): Promise<number> => {
  const [transactions, existingPayments] = await Promise.all([
    db.transactions.toArray(),
    db.posTransactionPayments.toArray(),
  ]);
  const grouped = groupPosPaymentsByTransaction(existingPayments);
  const missing = transactions.filter((transaction) => !grouped.has(transaction.id));
  if (missing.length === 0) return 0;

  await db.transaction('rw', [db.transactions, db.posTransactionPayments], async () => {
    await db.posTransactionPayments.bulkPut(missing.map(buildLegacyPosTransactionPayment));
    await db.transactions.bulkPut(missing.map((transaction): Transaction => ({
      ...transaction,
      payment_mode: 'SINGLE',
    })));
  });
  return missing.length;
};
