import type { SalesDocument, SalesDocumentItem, TaxCalculationMode } from '@/types';
import type { SalesDocumentConfig } from '@/configs/sales-document';

export interface DocumentTotalInput {
  items: SalesDocumentItem[];
  discountAmount?: number;
  taxRate?: number;
  taxCalculationMode?: TaxCalculationMode;
  config: SalesDocumentConfig;
}

export interface DocumentTotalResult {
  items: SalesDocumentItem[];
  subtotal_amount?: number;
  discount_amount?: number;
  tax_amount?: number;
  total_amount?: number;
}

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const calculateDocumentTotal = ({
  items,
  discountAmount = 0,
  taxRate = 0,
  taxCalculationMode = 'EXCLUSIVE',
  config,
}: DocumentTotalInput): DocumentTotalResult => {
  if (!config.behavior.hasPricing) {
    return {
      items: items.map((item) => ({
        ...item,
        quantity: item.delivered_quantity ?? item.quantity,
      })),
    };
  }

  const lineItems = items.map((item) => {
    const quantity = Number(item.quantity || 0);
    const price = Number(item.price || 0);
    const lineDiscount = Number(item.discount_amount || 0);
    const subtotal = Math.max(0, quantity * price - lineDiscount);

    return {
      ...item,
      quantity,
      price,
      discount_amount: lineDiscount,
      subtotal: roundCurrency(subtotal),
    };
  });
  const subtotal = lineItems.reduce((sum, item) => sum + (item.subtotal || 0), 0);
  const normalizedDiscount = Math.max(0, Number(discountAmount || 0));
  const taxableAmount = Math.max(0, subtotal - normalizedDiscount);
  const rate = Math.max(0, Number(taxRate || 0)) / 100;
  const taxAmount = !config.behavior.hasTax || rate === 0
    ? 0
    : taxCalculationMode === 'INCLUSIVE'
      ? taxableAmount - taxableAmount / (1 + rate)
      : taxableAmount * rate;
  const total = taxCalculationMode === 'INCLUSIVE'
    ? taxableAmount
    : taxableAmount + taxAmount;

  return {
    items: lineItems,
    subtotal_amount: roundCurrency(subtotal),
    discount_amount: roundCurrency(normalizedDiscount),
    tax_amount: roundCurrency(taxAmount),
    total_amount: roundCurrency(total),
  };
};

export const pickDocumentTotalFields = (
  document: Partial<SalesDocument>,
): Pick<SalesDocument, 'subtotal_amount' | 'discount_amount' | 'tax_amount' | 'total_amount'> => ({
  subtotal_amount: document.subtotal_amount,
  discount_amount: document.discount_amount,
  tax_amount: document.tax_amount,
  total_amount: document.total_amount,
});
