import type {
  SalesReturnItem,
  SalesReturnItemCondition,
  SalesReturnSourceItem,
} from '@/types';

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const prorate = (value: number | undefined, ratio: number) => roundCurrency(Math.max(0, Number(value || 0)) * ratio);

interface MapSalesReturnSourceItemInput {
  sourceItem: SalesReturnSourceItem;
  returnId: string;
  quantity: number;
  condition: SalesReturnItemCondition;
  restockQuantity?: number;
  createdAt?: string;
  itemId?: string;
}

export const mapSalesReturnSourceItem = ({
  sourceItem,
  returnId,
  quantity,
  condition,
  restockQuantity,
  createdAt = new Date().toISOString(),
  itemId,
}: MapSalesReturnSourceItemInput): SalesReturnItem => {
  const normalizedQuantity = Math.max(0, Number(quantity || 0));
  const sourceQuantity = Math.max(0, Number(sourceItem.source_quantity || 0));
  const ratio = sourceQuantity > 0 ? normalizedQuantity / sourceQuantity : 0;
  const restock = condition === 'SELLABLE'
    ? Math.max(0, Number(restockQuantity ?? normalizedQuantity))
    : 0;

  return {
    id: itemId || crypto.randomUUID(),
    return_id: returnId,
    source_item_id: sourceItem.source_item_id,
    product_id: sourceItem.product_id,
    product_name: sourceItem.product_name,
    sku: sourceItem.sku,
    unit: sourceItem.unit,
    quantity: normalizedQuantity,
    source_quantity: sourceQuantity,
    price: roundCurrency(Math.max(0, Number(sourceItem.price || 0))),
    discount_amount: prorate(sourceItem.discount_amount, ratio),
    tax_amount: prorate(sourceItem.tax_amount, ratio),
    subtotal: prorate(sourceItem.subtotal, ratio),
    total_amount: prorate(sourceItem.total_amount, ratio),
    purchase_price: sourceItem.purchase_price,
    profit_reversal: prorate(sourceItem.profit, ratio),
    condition,
    restock_quantity: restock,
    created_at: createdAt,
  };
};
