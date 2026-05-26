import type {
  IssuedSalesReturnSummary,
  SalesReturnLimitSnapshot,
  SalesReturnSourceItem,
} from '@/types';
import type { SalesReturnStockPolicy } from './getSalesReturnStockPolicy';

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const money = (value: unknown) => roundCurrency(Math.max(0, Number(value || 0)));

interface SalesReturnLimitInvoiceSnapshot {
  total_amount?: number;
  paid_amount?: number;
}

interface CalculateSalesReturnLimitsInput {
  sourceItems: SalesReturnSourceItem[];
  issuedSummary?: IssuedSalesReturnSummary;
  invoice?: SalesReturnLimitInvoiceSnapshot;
  stockPolicy: SalesReturnStockPolicy;
}

export const calculateSalesReturnLimits = ({
  sourceItems,
  issuedSummary,
  invoice,
  stockPolicy,
}: CalculateSalesReturnLimitsInput): SalesReturnLimitSnapshot => {
  const returnableQuantityBySourceItemId = sourceItems.reduce((acc, item) => {
    acc[item.source_item_id] = Math.max(0, Number(item.remaining_quantity || 0));
    return acc;
  }, {} as Record<string, number>);

  const invoiceTotal = money(invoice?.total_amount);
  const paidAmount = money(invoice?.paid_amount);
  const existingCredit = money(issuedSummary?.credit_amount);
  const existingRefund = money(issuedSummary?.refund_amount);
  const balanceBeforeReturn = invoice
    ? money(invoiceTotal - paidAmount - existingCredit)
    : 0;
  const refundableCash = invoice
    ? money(paidAmount - existingRefund)
    : 0;

  return {
    returnable_quantity_by_source_item_id: returnableQuantityBySourceItemId,
    credit_note_limit: balanceBeforeReturn,
    refund_limit: refundableCash,
    balance_before_return: balanceBeforeReturn,
    refundable_cash: refundableCash,
    invoice_total: invoiceTotal,
    paid_amount: paidAmount,
    existing_credit: existingCredit,
    existing_refund: existingRefund,
    can_restock: stockPolicy.can_restock,
  };
};
