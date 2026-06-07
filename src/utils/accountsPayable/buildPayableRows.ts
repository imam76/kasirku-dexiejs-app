import type {
  AccountsPayableRow,
  PurchaseDocument,
  PurchaseInvoicePayment,
  PurchaseInvoicePaymentStatus,
} from '@/types';
import { calculateInvoiceBalance } from '@/utils/invoiceBalance/calculateInvoiceBalance';

export interface BuildPayableRowsInput {
  documents: PurchaseDocument[];
  payments: PurchaseInvoicePayment[];
  returnCreditByInvoiceId?: Record<string, number>;
  asOfDate?: string;
}

export const buildPayableRows = ({
  documents,
  payments,
  returnCreditByInvoiceId = {},
  asOfDate,
}: BuildPayableRowsInput): AccountsPayableRow[] => {
  const activePaymentsByInvoiceId = payments.reduce<Record<string, number>>((acc, payment) => {
    if (payment.status !== 'ACTIVE') return acc;
    acc[payment.purchase_document_id] = (acc[payment.purchase_document_id] || 0) + Number(payment.amount || 0);
    return acc;
  }, {});

  return documents
    .filter((document) => document.type === 'PURCHASE_INVOICE' && document.status === 'ISSUED')
    .map((document) => {
      const calculation = calculateInvoiceBalance({
        invoiceTotal: Number(document.total_amount || 0),
        activePaymentAmount: activePaymentsByInvoiceId[document.id] || 0,
        returnCreditAmount: returnCreditByInvoiceId[document.id] || 0,
        dueDate: document.due_date,
        asOfDate,
      });

      return {
        purchase_document_id: document.id,
        document_number: document.document_number,
        contact_id: document.contact_id,
        supplier_name: document.supplier_name || '',
        document_date: document.document_date,
        due_date: document.due_date,
        total_amount: Number(document.total_amount || 0),
        paid_amount: calculation.paid_amount,
        return_credit_amount: calculation.return_credit_amount,
        balance_due: calculation.balance_due,
        payment_status: calculation.payment_status as PurchaseInvoicePaymentStatus,
        aging_bucket: calculation.aging_bucket,
        overdue_days: calculation.overdue_days,
      };
    });
};
