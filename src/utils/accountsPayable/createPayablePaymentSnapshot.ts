import type { ChartOfAccount, PaymentMethod, PurchaseDocument, PurchaseInvoicePayment } from '@/types';
import { BASE_CURRENCY_CODE } from '@/constants/currencies';

export interface CreatePayablePaymentSnapshotInput {
  id: string;
  document: PurchaseDocument;
  amount: number;
  foreignAmount: number;
  paidAt: string;
  paymentMethod: PaymentMethod;
  paymentChannel?: string;
  cashAccount: ChartOfAccount;
  financeTransactionId?: string;
  notes?: string;
  createdBy?: string;
  createdByName?: string;
  now: string;
}

export const createPayablePaymentSnapshot = ({
  id,
  document,
  amount,
  foreignAmount,
  paidAt,
  paymentMethod,
  paymentChannel,
  cashAccount,
  financeTransactionId,
  notes,
  createdBy,
  createdByName,
  now,
}: CreatePayablePaymentSnapshotInput): PurchaseInvoicePayment => ({
  id,
  purchase_document_id: document.id,
  document_number: document.document_number,
  contact_id: document.contact_id,
  supplier_name: document.supplier_name || '',
  amount,
  foreign_amount: foreignAmount,
  currency_code: document.currency_code ?? BASE_CURRENCY_CODE,
  currency_name: document.currency_name ?? 'Rupiah Indonesia',
  currency_symbol: document.currency_symbol ?? 'Rp',
  base_currency_code: document.base_currency_code ?? BASE_CURRENCY_CODE,
  exchange_rate: document.exchange_rate ?? 1,
  exchange_rate_source: document.exchange_rate_source ?? 'SYSTEM',
  exchange_rate_basis: document.exchange_rate_basis ?? 'MID',
  exchange_rate_date: document.exchange_rate_date ?? document.document_date,
  paid_at: paidAt,
  payment_method: paymentMethod,
  payment_channel: paymentChannel?.trim() || undefined,
  cash_account_id: cashAccount.id,
  cash_account_code: cashAccount.code,
  cash_account_name: cashAccount.name,
  finance_transaction_id: financeTransactionId,
  notes: notes?.trim() || undefined,
  status: 'ACTIVE',
  created_by: createdBy,
  created_by_name: createdByName,
  created_at: now,
  updated_at: now,
});
