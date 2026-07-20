import type { SalesDocument } from '@/types';

export interface ValidateInvoicePaymentInput {
  document?: SalesDocument;
  amount: number;
  balanceDue?: number;
}

export const validateInvoicePayment = ({
  document,
  amount,
}: ValidateInvoicePaymentInput) => {
  if (!document) {
    throw new Error('Invoice tidak ditemukan.');
  }

  if (document.type !== 'SALES_INVOICE') {
    throw new Error('Hanya Sales Invoice yang bisa dibayar.');
  }

  if (document.status !== 'ISSUED') {
    throw new Error('Hanya Sales Invoice terbit yang bisa dibayar.');
  }

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error('Jumlah pembayaran harus lebih dari 0.');
  }
};
