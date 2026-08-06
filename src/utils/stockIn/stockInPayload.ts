import type { PurchaseDocument, PurchaseDocumentItem } from '@/types';
import type { InventoryOpeningBalanceLineInput } from '@/services/openingInventoryBalanceService';
import type { StockInLine } from '@/utils/stockIn/stockInCsv';

export interface PurchasePayloadInput {
  lines: StockInLine[];
  documentDate: string;
  documentType: 'PURCHASE_INVOICE' | 'PURCHASE_RECEIPT';
  supplierName?: string;
  contactId?: string;
  notes?: string;
  /** Creation timestamp; the service overwrites ids but not this field. */
  createdAt?: string;
}

export interface PurchasePayload {
  document: Partial<PurchaseDocument>;
  items: PurchaseDocumentItem[];
}

/**
 * Opening balances are always expressed in the product stock unit, because the
 * journal value and the stock ledger must agree on one unit.
 */
export const buildOpeningBalanceLines = (
  lines: StockInLine[],
): InventoryOpeningBalanceLineInput[] => lines.map((line) => ({
  product_id: line.product.id,
  opening_quantity: line.baseQuantity,
  cost_per_unit: line.costPerBaseUnit ?? 0,
  notes: line.notes,
}));

/**
 * Purchase documents keep the unit the user actually typed, so a supplier
 * invoice reading "10 dus" stays readable as 10 dus. Conversion to stock units
 * happens downstream when the document is issued.
 */
export const buildPurchasePayload = ({
  lines,
  documentDate,
  documentType,
  supplierName,
  contactId,
  notes,
  createdAt = new Date().toISOString(),
}: PurchasePayloadInput): PurchasePayload => {
  const hasPendingPrice = lines.some((line) => line.costPerUnit === undefined);

  const document: Partial<PurchaseDocument> = {
    type: documentType,
    status: 'DRAFT',
    document_date: documentDate,
    supplier_name: supplierName ?? '',
    contact_id: contactId,
    notes,
    ...(documentType === 'PURCHASE_RECEIPT'
      ? { cost_status: hasPendingPrice ? ('PENDING' as const) : ('FINAL' as const) }
      : {}),
  };

  const items: PurchaseDocumentItem[] = lines.map((line) => ({
    // The service assigns the real ids once the document exists.
    id: '',
    document_id: '',
    product_id: line.product.id,
    product_name: line.product.name,
    sku: line.product.sku || undefined,
    unit: line.unit,
    quantity: line.quantity,
    received_quantity: line.quantity,
    price: line.costPerUnit,
    created_at: createdAt,
  }));

  return { document, items };
};

/**
 * New products arrive with `stock: 0` from the master-import builder, which is
 * exactly what both routes need: the quantity belongs to the document, never to
 * the product record.
 */
export const assertNewProductsCarryNoStock = (lines: StockInLine[]) => {
  const offender = lines.find((line) => line.isNewProduct && Number(line.product.stock) !== 0);
  if (offender) {
    throw new Error(
      `Produk baru ${offender.product.name} tidak boleh membawa stok awal dari file.`,
    );
  }
};
