import type { PaymentMethodCategory, PosTransactionPayment, Transaction } from '@/types';
import { getTransactionPaymentSnapshot } from '@/utils/posPaymentMethod';

export interface PosPaymentAllocationInput {
  key: string;
  paymentMethodId?: string;
  category?: PaymentMethodCategory;
  tenderedAmount: number;
}

export interface PosPaymentAllocationLine extends PosPaymentAllocationInput {
  tenderedAmount: number;
  appliedAmount: number;
  changeAmount: number;
  error?: string;
}

export interface PosPaymentAllocationResult {
  lines: PosPaymentAllocationLine[];
  remainingAmount: number;
  totalTendered: number;
  totalApplied: number;
  totalChange: number;
  errors: string[];
  isComplete: boolean;
  isValid: boolean;
}

export const roundPosMoney = (value: number) => (
  Math.round((Number(value) + Number.EPSILON) * 100) / 100
);

export const allocatePosPayments = (
  rawTotal: number,
  inputs: PosPaymentAllocationInput[],
  { allowIncomplete = false }: { allowIncomplete?: boolean } = {},
): PosPaymentAllocationResult => {
  const total = roundPosMoney(rawTotal);
  const errors: string[] = [];
  const usedMethodIds = new Set<string>();
  let remainingAmount = total;

  if (!Number.isFinite(total) || total <= 0) errors.push('Total transaksi tidak valid.');
  if (inputs.length === 0) errors.push('Minimal satu pembayaran wajib diisi.');

  const lines = inputs.map<PosPaymentAllocationLine>((input, index) => {
    const tenderedAmount = roundPosMoney(input.tenderedAmount);
    let error: string | undefined;

    if (!input.paymentMethodId) error = `Metode pembayaran ${index + 1} belum dipilih.`;
    else if (usedMethodIds.has(input.paymentMethodId)) error = 'Metode pembayaran tidak boleh digunakan lebih dari sekali.';
    else usedMethodIds.add(input.paymentMethodId);

    if (!error && (!Number.isFinite(tenderedAmount) || tenderedAmount <= 0)) {
      error = `Nominal pembayaran ${index + 1} harus lebih besar dari nol.`;
    }
    if (!error && !input.category) error = `Metode pembayaran ${index + 1} tidak valid.`;
    if (!error && remainingAmount <= 0) error = 'Tagihan sudah lunas; hapus pembayaran tambahan.';

    let appliedAmount = 0;
    let changeAmount = 0;
    if (!error) {
      if (input.category === 'CASH') {
        appliedAmount = Math.min(tenderedAmount, remainingAmount);
        changeAmount = roundPosMoney(tenderedAmount - appliedAmount);
      } else if (tenderedAmount > remainingAmount) {
        error = 'Pembayaran non-tunai tidak boleh melebihi sisa tagihan.';
      } else {
        appliedAmount = tenderedAmount;
      }
    }

    if (error) errors.push(error);
    else remainingAmount = roundPosMoney(remainingAmount - appliedAmount);

    return { ...input, tenderedAmount, appliedAmount, changeAmount, error };
  });

  const totalTendered = roundPosMoney(lines.reduce((sum, line) => sum + (line.error ? 0 : line.tenderedAmount), 0));
  const totalApplied = roundPosMoney(lines.reduce((sum, line) => sum + line.appliedAmount, 0));
  const totalChange = roundPosMoney(lines.reduce((sum, line) => sum + line.changeAmount, 0));
  const isComplete = remainingAmount === 0;

  if (!allowIncomplete && errors.length === 0 && !isComplete) {
    errors.push(`Pembayaran masih kurang ${remainingAmount}.`);
  }
  if (errors.length === 0 && isComplete && totalApplied !== total) {
    errors.push('Total alokasi pembayaran tidak sama dengan total transaksi.');
  }
  if (errors.length === 0 && isComplete && roundPosMoney(totalTendered - totalChange) !== total) {
    errors.push('Total pembayaran setelah kembalian tidak sama dengan total transaksi.');
  }

  return {
    lines,
    remainingAmount,
    totalTendered,
    totalApplied,
    totalChange,
    errors,
    isComplete,
    isValid: errors.length === 0 && (allowIncomplete || isComplete),
  };
};

export const groupPosPaymentsByTransaction = (payments: PosTransactionPayment[]) => {
  const grouped = new Map<string, PosTransactionPayment[]>();
  payments.forEach((payment) => {
    const values = grouped.get(payment.transaction_id) ?? [];
    values.push(payment);
    grouped.set(payment.transaction_id, values);
  });
  grouped.forEach((values) => values.sort((left, right) => left.sequence - right.sequence));
  return grouped;
};

export const buildLegacyPosTransactionPayment = (transaction: Transaction): PosTransactionPayment => {
  const snapshot = getTransactionPaymentSnapshot(transaction);
  const total = roundPosMoney(Number(transaction.total_amount || 0));
  const change = roundPosMoney(Number(transaction.change_amount || 0));
  const rawTendered = Number(transaction.payment_amount);
  const tendered = Number.isFinite(rawTendered) && rawTendered > 0
    ? roundPosMoney(rawTendered)
    : roundPosMoney(total + change);
  return {
    id: `legacy-pos-payment-${transaction.id}`,
    transaction_id: transaction.id,
    sequence: 0,
    tendered_amount: tendered,
    applied_amount: total,
    change_amount: change,
    payment_method: snapshot.isCash ? 'TUNAI' : 'NON_TUNAI',
    payment_method_id: snapshot.id,
    payment_method_code: snapshot.code,
    payment_method_name: snapshot.name,
    payment_method_category: snapshot.category,
    payment_reference: snapshot.reference,
    payment_posting_account_id: snapshot.postingAccountId,
    payment_posting_account_code: snapshot.postingAccountCode,
    payment_posting_account_name: snapshot.postingAccountName,
    created_at: transaction.created_at,
  };
};

export const getTransactionPaymentsOrLegacyFallback = (
  transaction: Transaction,
  payments?: PosTransactionPayment[],
) => payments && payments.length > 0
  ? [...payments].sort((left, right) => left.sequence - right.sequence)
  : [buildLegacyPosTransactionPayment(transaction)];

export const formatPosPaymentSummary = (payments: PosTransactionPayment[]) => (
  payments.map((payment) => `${payment.payment_method_name} ${payment.applied_amount.toLocaleString('id-ID')}`).join(' + ')
);
