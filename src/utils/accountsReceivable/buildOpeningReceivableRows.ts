import { getCurrencyPreset } from '@/constants/currencies';
import type {
  AccountsReceivableRow,
  OpeningBalanceLine,
  SalesInvoicePayment,
} from '@/types';
import {
  normalizeCurrencyCode,
  normalizeExchangeRate,
  toDocumentCurrencyAmount,
} from '@/utils/documentCurrency';
import { calculateReceivableBalance } from './calculateReceivableBalance';
import {
  getSalesInvoicePaymentAllocatedAmount,
  getSalesInvoicePaymentForeignAllocatedAmount,
} from './paymentAmounts';

export interface BuildOpeningReceivableRowsInput {
  lines: OpeningBalanceLine[];
  payments: SalesInvoicePayment[];
  asOfDate?: string;
}

const sumActivePaymentsByLineId = (
  payments: SalesInvoicePayment[],
  amountKey: 'amount' | 'foreign_amount',
) => payments.reduce<Record<string, number>>((acc, payment) => {
  if (payment.status !== 'ACTIVE') return acc;
  const lineId = payment.opening_balance_line_id ?? payment.sales_document_id;
  if (!lineId) return acc;
  if (amountKey === 'foreign_amount') {
    if (payment.foreign_amount === undefined && payment.foreign_allocated_amount === undefined) return acc;
    acc[lineId] = (acc[lineId] || 0) + getSalesInvoicePaymentForeignAllocatedAmount(payment);
    return acc;
  }

  acc[lineId] = (acc[lineId] || 0) + getSalesInvoicePaymentAllocatedAmount(payment);
  return acc;
}, {});

export const buildOpeningReceivableRows = ({
  lines,
  payments,
  asOfDate,
}: BuildOpeningReceivableRowsInput): AccountsReceivableRow[] => {
  const activePaymentsByLineId = sumActivePaymentsByLineId(payments, 'amount');
  const activeForeignPaymentsByLineId = sumActivePaymentsByLineId(payments, 'foreign_amount');

  return lines
    .filter((line) => line.module === 'RECEIVABLE' && Number(line.base_amount || 0) > 0)
    .map((line) => {
      const baseCurrencyCode = normalizeCurrencyCode(line.base_currency_code);
      const currencyCode = normalizeCurrencyCode(line.currency_code, baseCurrencyCode);
      const exchangeRate = normalizeExchangeRate(line.fx_rate);
      const currencyPreset = getCurrencyPreset(currencyCode);
      const currencySnapshot = {
        currency_code: currencyCode,
        currency_name: line.currency_name ?? currencyPreset.name,
        currency_symbol: line.currency_symbol ?? currencyPreset.symbol,
        base_currency_code: baseCurrencyCode,
        exchange_rate: exchangeRate,
        exchange_rate_source: exchangeRate === 1 ? 'SYSTEM' as const : 'MANUAL' as const,
        exchange_rate_basis: 'MID' as const,
        exchange_rate_date: line.document_date?.slice(0, 10),
      };
      const activePaymentAmount = activePaymentsByLineId[line.id] || 0;
      const calculation = calculateReceivableBalance({
        invoiceTotal: Number(line.base_amount || 0),
        activePaymentAmount,
        returnCreditAmount: 0,
        dueDate: line.due_date,
        asOfDate,
      });

      return {
        sales_document_id: line.id,
        source_type: 'OPENING_RECEIVABLE',
        opening_balance_line_id: line.id,
        opening_balance_batch_id: line.batch_id,
        is_opening_balance: true,
        document_number: line.document_number || `OBR-${line.line_number}`,
        contact_id: line.contact_id,
        customer_name: line.party_name || '-',
        document_date: line.document_date || line.created_at,
        due_date: line.due_date,
        ...currencySnapshot,
        total_amount: Number(line.base_amount || 0),
        foreign_total_amount: line.amount ?? toDocumentCurrencyAmount(line.base_amount, currencySnapshot),
        paid_amount: calculation.paid_amount,
        foreign_paid_amount: activeForeignPaymentsByLineId[line.id] ?? toDocumentCurrencyAmount(calculation.paid_amount, currencySnapshot),
        return_credit_amount: 0,
        foreign_return_credit_amount: 0,
        balance_due: calculation.balance_due,
        foreign_balance_due: toDocumentCurrencyAmount(calculation.balance_due, currencySnapshot),
        payment_status: calculation.payment_status,
        aging_bucket: calculation.aging_bucket,
        overdue_days: calculation.overdue_days,
      };
    });
};
