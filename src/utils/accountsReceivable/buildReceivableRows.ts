import type {
  AccountsReceivableRow,
  IssuedSalesReturnSummary,
  SalesDocument,
  SalesInvoicePayment,
} from '@/types';
import { calculateReceivableBalance } from './calculateReceivableBalance';
import {
  snapshotFromDocumentInput,
  toDocumentCurrencyAmount,
} from '@/utils/documentCurrency';
import {
  getSalesInvoicePaymentAllocatedAmount,
  getSalesInvoicePaymentForeignAllocatedAmount,
} from './paymentAmounts';

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
    acc[payment.sales_document_id] = (acc[payment.sales_document_id] || 0) + getSalesInvoicePaymentAllocatedAmount(payment);
    return acc;
  }, {});
  const activeForeignPaymentsByInvoiceId = payments.reduce<Record<string, number>>((acc, payment) => {
    if (payment.status !== 'ACTIVE') return acc;
    if (payment.foreign_amount === undefined && payment.foreign_allocated_amount === undefined) return acc;
    acc[payment.sales_document_id] = (acc[payment.sales_document_id] || 0) + getSalesInvoicePaymentForeignAllocatedAmount(payment);
    return acc;
  }, {});

  return documents
    .filter((document) => document.type === 'SALES_INVOICE' && document.status === 'ISSUED')
    .map((document) => {
      const documentCurrencySnapshot = snapshotFromDocumentInput(document, undefined, document.document_date);
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
        source_type: 'SALES_INVOICE',
        is_opening_balance: false,
        document_number: document.document_number,
        contact_id: document.contact_id,
        customer_name: document.customer_name,
        document_date: document.document_date,
        due_date: document.due_date,
        currency_code: documentCurrencySnapshot.currency_code,
        currency_name: documentCurrencySnapshot.currency_name,
        currency_symbol: documentCurrencySnapshot.currency_symbol,
        base_currency_code: documentCurrencySnapshot.base_currency_code,
        exchange_rate: documentCurrencySnapshot.exchange_rate,
        exchange_rate_source: documentCurrencySnapshot.exchange_rate_source,
        exchange_rate_basis: documentCurrencySnapshot.exchange_rate_basis,
        exchange_rate_date: documentCurrencySnapshot.exchange_rate_date,
        total_amount: Number(document.total_amount || 0),
        foreign_total_amount: document.foreign_total_amount ?? toDocumentCurrencyAmount(document.total_amount, documentCurrencySnapshot),
        paid_amount: calculation.paid_amount,
        foreign_paid_amount: activeForeignPaymentsByInvoiceId[document.id] ?? toDocumentCurrencyAmount(calculation.paid_amount, documentCurrencySnapshot),
        return_credit_amount: calculation.return_credit_amount,
        foreign_return_credit_amount: toDocumentCurrencyAmount(calculation.return_credit_amount, documentCurrencySnapshot),
        balance_due: calculation.balance_due,
        foreign_balance_due: toDocumentCurrencyAmount(calculation.balance_due, documentCurrencySnapshot),
        payment_status: calculation.payment_status,
        aging_bucket: calculation.aging_bucket,
        overdue_days: calculation.overdue_days,
      };
    });
};
