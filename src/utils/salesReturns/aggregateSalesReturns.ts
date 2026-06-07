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

  const salesReturnById = new Map(issuedReturns.map((salesReturn) => [salesReturn.id, salesReturn]));

  for (const item of salesReturnItems) {
    if (!issuedReturnIds.has(item.return_id)) continue;

    const salesReturn = salesReturnById.get(item.return_id);
    const itemSummary = summary.items[item.source_item_id] ?? createEmptySummaryItem(item.source_item_id);
    itemSummary.quantity += Number(item.quantity || 0);
    itemSummary.total_amount += Number(item.total_amount || 0);
    if (salesReturn?.resolution === 'REFUND') {
      itemSummary.refund_amount += Number(item.total_amount || 0);
    }
    if (salesReturn?.resolution === 'CREDIT_NOTE') {
      itemSummary.credit_amount += Number(item.total_amount || 0);
    }
    itemSummary.restock_quantity += Number(item.restock_quantity || 0);
    itemSummary.profit_reversal += Number(item.profit_reversal || 0);
    summary.restock_quantity += Number(item.restock_quantity || 0);
    summary.profit_reversal += Number(item.profit_reversal || 0);
    summary.items[item.source_item_id] = itemSummary;
  }

  return summary;
};

export const aggregateIssuedSalesReturnsForSourceChain = (
  sourceType: SalesReturnSourceType,
  sourceId: string,
  salesReturns: SalesReturn[],
  salesReturnItems: SalesReturnItem[],
  resolveCurrentSourceItemId: (item: SalesReturnItem, salesReturn: SalesReturn) => string | undefined,
): IssuedSalesReturnSummary => {
  const issuedReturns = salesReturns.filter((salesReturn) => salesReturn.status === 'ISSUED');
  const salesReturnById = new Map(issuedReturns.map((salesReturn) => [salesReturn.id, salesReturn]));
  const issuedReturnIds = new Set(issuedReturns.map((salesReturn) => salesReturn.id));
  const includedReturnIds = new Set<string>();
  const summary = createEmptyIssuedSalesReturnSummary(sourceType, sourceId);

  for (const item of salesReturnItems) {
    if (!issuedReturnIds.has(item.return_id)) continue;

    const salesReturn = salesReturnById.get(item.return_id);
    if (!salesReturn) continue;

    const currentSourceItemId = resolveCurrentSourceItemId(item, salesReturn);
    if (!currentSourceItemId) continue;

    includedReturnIds.add(salesReturn.id);
    const itemSummary = summary.items[currentSourceItemId] ?? createEmptySummaryItem(currentSourceItemId);
    itemSummary.quantity += Number(item.quantity || 0);
    itemSummary.total_amount += Number(item.total_amount || 0);
    if (salesReturn.resolution === 'REFUND') {
      itemSummary.refund_amount += Number(item.total_amount || 0);
    }
    if (salesReturn.resolution === 'CREDIT_NOTE') {
      itemSummary.credit_amount += Number(item.total_amount || 0);
    }
    itemSummary.restock_quantity += Number(item.restock_quantity || 0);
    itemSummary.profit_reversal += Number(item.profit_reversal || 0);
    summary.restock_quantity += Number(item.restock_quantity || 0);
    summary.profit_reversal += Number(item.profit_reversal || 0);
    summary.items[currentSourceItemId] = itemSummary;
  }

  for (const salesReturn of issuedReturns) {
    if (!includedReturnIds.has(salesReturn.id)) continue;

    summary.return_count += 1;
    summary.subtotal_amount += Number(salesReturn.subtotal_amount || 0);
    summary.discount_amount += Number(salesReturn.discount_amount || 0);
    summary.tax_amount += Number(salesReturn.tax_amount || 0);
    summary.total_amount += Number(salesReturn.total_amount || 0);
    summary.refund_amount += Number(salesReturn.refund_amount || 0);
    summary.credit_amount += Number(salesReturn.credit_amount || 0);
  }

  return summary;
};
