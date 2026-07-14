import type { ChartOfAccount, PaymentMethod, PurchaseDocument, PurchaseInvoicePayment } from '@/types';
import { snapshotFromDocumentInput } from '@/utils/documentCurrency';

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
}: CreatePayablePaymentSnapshotInput): PurchaseInvoicePayment => {
  const currencySnapshot = snapshotFromDocumentInput(document, undefined, document.document_date);

  return {
    id,
    purchase_document_id: document.id,
    document_number: document.document_number,
    contact_id: document.contact_id,
    supplier_name: document.supplier_name || '',
    amount,
    foreign_amount: foreignAmount,
    ...currencySnapshot,
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
  };
};
