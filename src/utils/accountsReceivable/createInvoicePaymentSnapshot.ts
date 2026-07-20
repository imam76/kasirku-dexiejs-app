import type { ChartOfAccount, PaymentMethod, SalesDocument, SalesInvoicePayment } from '@/types';
import { snapshotFromDocumentInput } from '@/utils/documentCurrency';

export interface CreateInvoicePaymentSnapshotInput {
  id: string;
  paymentNumber?: string;
  document: SalesDocument;
  amount: number;
  foreignAmount: number;
  allocatedAmount?: number;
  foreignAllocatedAmount?: number;
  overpaymentAmount?: number;
  foreignOverpaymentAmount?: number;
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
  paymentNumber,
  document,
  amount,
  foreignAmount,
  allocatedAmount,
  foreignAllocatedAmount,
  overpaymentAmount,
  foreignOverpaymentAmount,
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
    source_type: 'SALES_INVOICE',
    payment_number: paymentNumber,
    document_number: document.document_number,
    contact_id: document.contact_id,
    customer_name: document.customer_name,
    amount,
    foreign_amount: foreignAmount,
    allocated_amount: allocatedAmount ?? amount,
    foreign_allocated_amount: foreignAllocatedAmount ?? foreignAmount,
    overpayment_amount: overpaymentAmount ?? 0,
    foreign_overpayment_amount: foreignOverpaymentAmount ?? 0,
    overpayment_used_amount: 0,
    foreign_overpayment_used_amount: 0,
    overpayment_remaining_amount: overpaymentAmount ?? 0,
    foreign_overpayment_remaining_amount: foreignOverpaymentAmount ?? 0,
    overpayment_status: (overpaymentAmount ?? 0) > 0 ? 'OPEN' : undefined,
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
