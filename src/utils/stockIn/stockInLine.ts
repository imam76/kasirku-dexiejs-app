import type { Product } from '@/types';
import type { StockInLine } from '@/utils/stockIn/stockInCsv';
import { convertProductQuantity, getProductUnitRatio, getProductDocumentUnits } from '@/utils/productUnits';

export interface ManualStockInLineInput {
  rowNumber: number;
  product: Product;
  quantity: number;
  unit?: string;
  costPerUnit?: number;
  notes?: string;
  isNewProduct?: boolean;
}

export type ManualStockInLineResult =
  | { ok: true; line: StockInLine }
  | { ok: false; error: string };

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Builds one stock-in line from grid input, applying the same unit conversion
 * and validation the file parser applies. Both entry paths must agree, or a row
 * typed by hand would post differently from the same row uploaded.
 */
export const buildManualStockInLine = ({
  rowNumber,
  product,
  quantity,
  unit,
  costPerUnit,
  notes,
  isNewProduct = false,
}: ManualStockInLineInput): ManualStockInLineResult => {
  if (!Number.isFinite(quantity) || quantity <= 0) {
    return { ok: false, error: 'Jumlah harus lebih dari 0.' };
  }

  const resolvedUnit = (unit || '').trim() || product.purchase_unit;
  const ratio = getProductUnitRatio(product, resolvedUnit, product.purchase_unit);
  if (ratio === undefined) {
    return {
      ok: false,
      error: `Satuan ${resolvedUnit} tidak dikenal untuk ${product.name}. Satuan yang tersedia: ${getProductDocumentUnits(product).join(', ')}.`,
    };
  }

  if (costPerUnit !== undefined && (!Number.isFinite(costPerUnit) || costPerUnit < 0)) {
    return { ok: false, error: 'Harga harus berupa angka 0 atau lebih.' };
  }

  return {
    ok: true,
    line: {
      rowNumber,
      rawRow: [],
      product,
      isNewProduct,
      quantity,
      unit: resolvedUnit,
      baseQuantity: convertProductQuantity(product, quantity, resolvedUnit, product.purchase_unit) ?? quantity * ratio,
      costPerUnit,
      costPerBaseUnit: costPerUnit === undefined ? undefined : costPerUnit / ratio,
      totalValue: costPerUnit === undefined ? undefined : roundCurrency(quantity * costPerUnit),
      notes: notes?.trim() || undefined,
    },
  };
};
