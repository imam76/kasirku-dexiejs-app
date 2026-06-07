import type { SalesReturnItem } from '@/types';

export interface SalesReturnTotalResult {
  items: SalesReturnItem[];
  subtotal_amount: number;
  discount_amount: number;
  tax_amount: number;
  total_amount: number;
  refund_amount: number;
  credit_amount: number;
  restock_quantity: number;
  profit_reversal: number;
}

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const normalizeMoney = (value: unknown) => roundCurrency(Math.max(0, Number(value || 0)));

export const calculateSalesReturnTotal = (
  items: SalesReturnItem[],
): SalesReturnTotalResult => {
  const normalizedItems = items.map((item) => ({
    ...item,
    quantity: Math.max(0, Number(item.quantity || 0)),
    source_quantity: Math.max(0, Number(item.source_quantity || 0)),
    price: normalizeMoney(item.price),
    discount_amount: normalizeMoney(item.discount_amount),
    tax_amount: normalizeMoney(item.tax_amount),
    subtotal: normalizeMoney(item.subtotal),
    total_amount: normalizeMoney(item.total_amount),
    purchase_price: item.purchase_price === undefined ? undefined : normalizeMoney(item.purchase_price),
    profit_reversal: item.profit_reversal === undefined ? undefined : normalizeMoney(item.profit_reversal),
    restock_quantity: item.condition === 'SELLABLE' ? Math.max(0, Number(item.restock_quantity ?? item.quantity ?? 0)) : 0,
  }));

  return {
    items: normalizedItems,
    subtotal_amount: roundCurrency(normalizedItems.reduce((sum, item) => sum + item.subtotal, 0)),
    discount_amount: roundCurrency(normalizedItems.reduce((sum, item) => sum + (item.discount_amount || 0), 0)),
    tax_amount: roundCurrency(normalizedItems.reduce((sum, item) => sum + (item.tax_amount || 0), 0)),
    total_amount: roundCurrency(normalizedItems.reduce((sum, item) => sum + item.total_amount, 0)),
    refund_amount: 0,
    credit_amount: 0,
    restock_quantity: roundCurrency(normalizedItems.reduce((sum, item) => sum + (item.restock_quantity || 0), 0)),
    profit_reversal: roundCurrency(normalizedItems.reduce((sum, item) => sum + (item.profit_reversal || 0), 0)),
  };
};
