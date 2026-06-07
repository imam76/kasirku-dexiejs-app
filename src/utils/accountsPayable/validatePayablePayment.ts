import type { PurchaseDocument } from '@/types';

export interface ValidatePayablePaymentInput {
  document?: PurchaseDocument;
  amount: number;
  balanceDue: number;
}

export const validatePayablePayment = ({
  document,
  amount,
  balanceDue,
}: ValidatePayablePaymentInput) => {
  if (!document) {
    throw new Error('Purchase Invoice tidak ditemukan.');
  }

  if (document.type !== 'PURCHASE_INVOICE') {
    throw new Error('Hanya Purchase Invoice yang bisa dibayar.');
  }

  if (document.status !== 'ISSUED') {
    throw new Error('Hanya Purchase Invoice terbit yang bisa dibayar.');
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Jumlah pembayaran harus lebih dari 0.');
  }

  if (amount > balanceDue + 0.01) {
    throw new Error(`Pembayaran melebihi sisa hutang. Maksimal pembayaran Rp ${balanceDue}.`);
  }
};
