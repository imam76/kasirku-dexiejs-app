import type { SalesDocument, SalesDocumentItem, Tax, TaxCalculationMode } from '@/types';
import type { SalesDocumentConfig } from '@/configs/sales-document';
import { calculateDocumentTotal as calculateGenericDocumentTotal } from '@/utils/documentTotals';

export interface DocumentTotalInput {
  items: SalesDocumentItem[];
  discountAmount?: number;
  taxRate?: number;
  taxCalculationMode?: TaxCalculationMode;
  taxId?: string;
  taxName?: string;
  taxCode?: string;
  taxes?: Tax[];
  config: SalesDocumentConfig;
}

export interface DocumentTotalResult {
  items: SalesDocumentItem[];
  subtotal_amount?: number;
  discount_amount?: number;
  tax_amount?: number;
  total_amount?: number;
}

export const calculateDocumentTotal = (input: DocumentTotalInput): DocumentTotalResult => {
  const result = calculateGenericDocumentTotal<SalesDocumentItem>(input);

  if (!input.config.behavior.hasPricing) {
    return {
      items: result.items.map((item) => ({
        ...item,
        quantity: item.delivered_quantity ?? item.quantity,
      })),
    };
  }

  return result;
};

export const pickDocumentTotalFields = (
  document: Partial<SalesDocument>,
): Pick<SalesDocument, 'subtotal_amount' | 'discount_amount' | 'tax_amount' | 'total_amount'> => ({
  subtotal_amount: document.subtotal_amount,
  discount_amount: document.discount_amount,
  tax_amount: document.tax_amount,
  total_amount: document.total_amount,
});
