import type { SalesDocumentItem, SalesDocumentMarginBasis } from '@/types';

export interface SalesDocumentMarginItemResult {
  item_id: string;
  revenue_before_tax: number;
  revenue_after_tax: number;
  cost_amount: number;
  gross_profit: number;
  margin_percent: number;
}

export interface SalesDocumentMarginSummary {
  total_revenue_before_tax: number;
  total_revenue_after_tax: number;
  total_cost: number;
  gross_profit: number;
  margin_percent: number;
  items: SalesDocumentMarginItemResult[];
}

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const roundPercent = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const toNumber = (value: number | undefined) => Number(value ?? 0);

const calculateMarginPercent = (
  grossProfit: number,
  revenueBeforeTax: number,
  revenueAfterTax: number,
  basis: SalesDocumentMarginBasis,
) => {
  const marginBase = basis === 'AFTER_TAX' ? revenueAfterTax : revenueBeforeTax;
  return marginBase > 0 ? roundPercent((grossProfit / marginBase) * 100) : 0;
};

export const calculateSalesDocumentMargin = (
  items: SalesDocumentItem[],
  basis: SalesDocumentMarginBasis,
): SalesDocumentMarginSummary => {
  const marginItems = items.map<SalesDocumentMarginItemResult>((item) => {
    const taxBaseAmount = toNumber(item.tax_base_amount ?? item.subtotal);
    const taxAmount = toNumber(item.tax_amount);
    const revenueBeforeTax = item.tax_calculation_mode === 'INCLUSIVE'
      ? Math.max(0, taxBaseAmount - taxAmount)
      : taxBaseAmount;
    const revenueAfterTax = toNumber(item.total_amount ?? item.tax_base_amount ?? item.subtotal);
    const costAmount = toNumber(item.purchase_price) * toNumber(item.quantity);
    const grossProfit = revenueBeforeTax - costAmount;

    return {
      item_id: item.id,
      revenue_before_tax: roundCurrency(revenueBeforeTax),
      revenue_after_tax: roundCurrency(revenueAfterTax),
      cost_amount: roundCurrency(costAmount),
      gross_profit: roundCurrency(grossProfit),
      margin_percent: calculateMarginPercent(grossProfit, revenueBeforeTax, revenueAfterTax, basis),
    };
  });

  const totalRevenueBeforeTax = marginItems.reduce((sum, item) => sum + item.revenue_before_tax, 0);
  const totalRevenueAfterTax = marginItems.reduce((sum, item) => sum + item.revenue_after_tax, 0);
  const totalCost = marginItems.reduce((sum, item) => sum + item.cost_amount, 0);
  const grossProfit = totalRevenueBeforeTax - totalCost;

  return {
    total_revenue_before_tax: roundCurrency(totalRevenueBeforeTax),
    total_revenue_after_tax: roundCurrency(totalRevenueAfterTax),
    total_cost: roundCurrency(totalCost),
    gross_profit: roundCurrency(grossProfit),
    margin_percent: calculateMarginPercent(grossProfit, totalRevenueBeforeTax, totalRevenueAfterTax, basis),
    items: marginItems,
  };
};
