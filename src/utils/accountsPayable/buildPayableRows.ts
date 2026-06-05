import type {
  AccountsPayableRow,
  PurchaseDocument,
  PurchaseInvoicePayment,
  PurchaseInvoicePaymentStatus,
} from '@/types';
import { calculateInvoiceBalance } from '@/utils/invoiceBalance/calculateInvoiceBalance';
import {
  snapshotFromDocumentInput,
  toDocumentCurrencyAmount,
} from '@/utils/documentCurrency';

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
  const activeForeignPaymentsByInvoiceId = payments.reduce<Record<string, number>>((acc, payment) => {
    if (payment.status !== 'ACTIVE') return acc;
    if (payment.foreign_amount === undefined) return acc;
    acc[payment.purchase_document_id] = (acc[payment.purchase_document_id] || 0) + Number(payment.foreign_amount || 0);
    return acc;
  }, {});

  return documents
    .filter((document) => document.type === 'PURCHASE_INVOICE' && document.status === 'ISSUED')
    .map((document) => {
      const documentCurrencySnapshot = snapshotFromDocumentInput(document, undefined, document.document_date);
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
        payment_status: calculation.payment_status as PurchaseInvoicePaymentStatus,
        aging_bucket: calculation.aging_bucket,
        overdue_days: calculation.overdue_days,
      };
    });
};
