import type { ChartOfAccount, PaymentMethod, SalesDocument, SalesInvoicePayment } from '@/types';
import { snapshotFromDocumentInput } from '@/utils/documentCurrency';

export interface CreateInvoicePaymentSnapshotInput {
  id: string;
  document: SalesDocument;
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

export const createInvoicePaymentSnapshot = ({
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
}: CreateInvoicePaymentSnapshotInput): SalesInvoicePayment => {
  const currencySnapshot = snapshotFromDocumentInput(document, undefined, document.document_date);

  return {
    id,
    sales_document_id: document.id,
    document_number: document.document_number,
    contact_id: document.contact_id,
    customer_name: document.customer_name,
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
