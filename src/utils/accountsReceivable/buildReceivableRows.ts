import type {
  AccountsReceivableRow,
  IssuedSalesReturnSummary,
  SalesDocument,
  SalesInvoicePayment,
} from '@/types';
import { calculateReceivableBalance } from './calculateReceivableBalance';

export interface BuildReceivableRowsInput {
  documents: SalesDocument[];
  payments: SalesInvoicePayment[];
  returnSummariesByInvoiceId?: Record<string, Pick<IssuedSalesReturnSummary, 'credit_amount'> | undefined>;
  asOfDate?: string;
}

export const buildReceivableRows = ({
  documents,
  payments,
  returnSummariesByInvoiceId = {},
  asOfDate,
}: BuildReceivableRowsInput): AccountsReceivableRow[] => {
  const activePaymentsByInvoiceId = payments.reduce<Record<string, number>>((acc, payment) => {
    if (payment.status !== 'ACTIVE') return acc;
    acc[payment.sales_document_id] = (acc[payment.sales_document_id] || 0) + Number(payment.amount || 0);
    return acc;
  }, {});

  return documents
    .filter((document) => document.type === 'SALES_INVOICE' && document.status === 'ISSUED')
    .map((document) => {
      const returnCreditAmount = Number(returnSummariesByInvoiceId[document.id]?.credit_amount || 0);
      const calculation = calculateReceivableBalance({
        invoiceTotal: Number(document.total_amount || 0),
        activePaymentAmount: activePaymentsByInvoiceId[document.id] || 0,
        returnCreditAmount,
        dueDate: document.due_date,
        asOfDate,
      });

      return {
        sales_document_id: document.id,
        document_number: document.document_number,
        contact_id: document.contact_id,
        customer_name: document.customer_name,
        document_date: document.document_date,
        due_date: document.due_date,
        total_amount: Number(document.total_amount || 0),
        paid_amount: calculation.paid_amount,
        return_credit_amount: calculation.return_credit_amount,
        balance_due: calculation.balance_due,
        payment_status: calculation.payment_status,
        aging_bucket: calculation.aging_bucket,
        overdue_days: calculation.overdue_days,
      };
    });
};
