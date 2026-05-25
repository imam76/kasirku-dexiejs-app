import type {
  IssuedSalesReturnSummary,
  IssuedSalesReturnSummaryItem,
  SalesReturn,
  SalesReturnItem,
  SalesReturnSourceType,
} from '@/types';

const createEmptySummaryItem = (sourceItemId: string): IssuedSalesReturnSummaryItem => ({
  source_item_id: sourceItemId,
  quantity: 0,
  total_amount: 0,
  refund_amount: 0,
  credit_amount: 0,
  restock_quantity: 0,
  profit_reversal: 0,
});

export const createEmptyIssuedSalesReturnSummary = (
  sourceType: SalesReturnSourceType,
  sourceId: string,
): IssuedSalesReturnSummary => ({
  source_type: sourceType,
  source_id: sourceId,
  return_count: 0,
  subtotal_amount: 0,
  discount_amount: 0,
  tax_amount: 0,
  total_amount: 0,
  refund_amount: 0,
  credit_amount: 0,
  restock_quantity: 0,
  profit_reversal: 0,
  items: {},
});

export const aggregateIssuedSalesReturns = (
  sourceType: SalesReturnSourceType,
  sourceId: string,
  salesReturns: SalesReturn[],
  salesReturnItems: SalesReturnItem[],
): IssuedSalesReturnSummary => {
  const issuedReturns = salesReturns.filter((salesReturn) => (
    salesReturn.status === 'ISSUED' &&
    salesReturn.source_type === sourceType &&
    salesReturn.source_id === sourceId
  ));
  const issuedReturnIds = new Set(issuedReturns.map((salesReturn) => salesReturn.id));
  const summary = createEmptyIssuedSalesReturnSummary(sourceType, sourceId);

  summary.return_count = issuedReturns.length;
  for (const salesReturn of issuedReturns) {
    summary.subtotal_amount += Number(salesReturn.subtotal_amount || 0);
    summary.discount_amount += Number(salesReturn.discount_amount || 0);
    summary.tax_amount += Number(salesReturn.tax_amount || 0);
    summary.total_amount += Number(salesReturn.total_amount || 0);
    summary.refund_amount += Number(salesReturn.refund_amount || 0);
    summary.credit_amount += Number(salesReturn.credit_amount || 0);
  }

  for (const item of salesReturnItems) {
    if (!issuedReturnIds.has(item.return_id)) continue;

    const itemSummary = summary.items[item.source_item_id] ?? createEmptySummaryItem(item.source_item_id);
    itemSummary.quantity += Number(item.quantity || 0);
    itemSummary.total_amount += Number(item.total_amount || 0);
    itemSummary.refund_amount += Number(item.total_amount || 0);
    itemSummary.credit_amount += Number(item.total_amount || 0);
    itemSummary.restock_quantity += Number(item.restock_quantity || 0);
    itemSummary.profit_reversal += Number(item.profit_reversal || 0);
    summary.restock_quantity += Number(item.restock_quantity || 0);
    summary.profit_reversal += Number(item.profit_reversal || 0);
    summary.items[item.source_item_id] = itemSummary;
  }

  return summary;
};
