import { getCurrencyPreset } from '@/constants/currencies';
import type {
  AccountsPayableRow,
  OpeningBalanceLine,
  PurchaseInvoicePayment,
  PurchaseInvoicePaymentStatus,
} from '@/types';
import {
  normalizeCurrencyCode,
  normalizeExchangeRate,
  toDocumentCurrencyAmount,
} from '@/utils/documentCurrency';
import { calculateInvoiceBalance } from '@/utils/invoiceBalance/calculateInvoiceBalance';

export interface BuildOpeningPayableRowsInput {
  lines: OpeningBalanceLine[];
  payments: PurchaseInvoicePayment[];
  asOfDate?: string;
}

const sumActivePaymentsByLineId = (
  payments: PurchaseInvoicePayment[],
  amountKey: 'amount' | 'foreign_amount',
) => payments.reduce<Record<string, number>>((acc, payment) => {
  if (payment.status !== 'ACTIVE') return acc;
  const lineId = payment.opening_balance_line_id ?? payment.purchase_document_id;
  if (!lineId) return acc;
  if (amountKey === 'foreign_amount' && payment.foreign_amount === undefined) return acc;
  acc[lineId] = (acc[lineId] || 0) + Number(payment[amountKey] || 0);
  return acc;
}, {});

export const buildOpeningPayableRows = ({
  lines,
  payments,
  asOfDate,
}: BuildOpeningPayableRowsInput): AccountsPayableRow[] => {
  const activePaymentsByLineId = sumActivePaymentsByLineId(payments, 'amount');
  const activeForeignPaymentsByLineId = sumActivePaymentsByLineId(payments, 'foreign_amount');

  return lines
    .filter((line) => line.module === 'PAYABLE' && Number(line.base_amount || 0) > 0)
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
      const calculation = calculateInvoiceBalance({
        invoiceTotal: Number(line.base_amount || 0),
        activePaymentAmount,
        returnCreditAmount: 0,
        dueDate: line.due_date,
        asOfDate,
      });

      return {
        purchase_document_id: line.id,
        source_type: 'OPENING_PAYABLE',
        opening_balance_line_id: line.id,
        opening_balance_batch_id: line.batch_id,
        is_opening_balance: true,
        document_number: line.document_number || `OBP-${line.line_number}`,
        contact_id: line.contact_id,
        supplier_name: line.party_name || '-',
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
        payment_status: calculation.payment_status as PurchaseInvoicePaymentStatus,
        aging_bucket: calculation.aging_bucket,
        overdue_days: calculation.overdue_days,
      };
    });
};
