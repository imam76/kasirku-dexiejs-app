import type { Product, ProductUnit } from '@/types';
import type { ProductCsvImportItem, ProductCsvRowError } from '@/utils/productsCsv';
import {
  buildUnitMappingsFromLegacyUnits,
  getProductDefaultUnit,
  getProductUnits,
} from '@/utils/productUnits';
import { getConversionRatio, hasConversionRatio } from '@/utils/pricing';

export interface ProductMasterImportPlanItem {
  rowNumber: number;
  product: Product;
  operation: 'create' | 'update';
}

export interface ProductMasterImportPlan {
  items: ProductMasterImportPlanItem[];
  createdCount: number;
  updatedCount: number;
  errors: string[];
  /** Rows dropped by the plan, reported the same way parse errors are. */
  rowErrors: ProductCsvRowError[];
}

interface BuildProductMasterImportPlanInput {
  items: ProductCsvImportItem[];
  existingProducts: Product[];
  now: string;
  createId?: () => string;
}

const normalizeImportedWholesalePrices = (
  prices: Product['wholesale_prices'] | undefined,
) => (prices || []).map((price) => ({
  min_quantity: Number(price.min_quantity),
  price: Number(price.price),
  price_type: price.price_type || 'unit',
}));

const buildImportedProduct = ({
  item,
  existing,
  productId,
  now,
}: {
  item: ProductCsvImportItem;
  existing?: Product;
  productId: string;
  now: string;
}): Product => {
  const purchaseUnit = (item.purchase_unit || existing?.purchase_unit || 'pcs') as ProductUnit;
  const sellingUnit = (item.selling_unit || existing?.selling_unit || 'pcs') as ProductUnit;
  // Kolom lama `sellable_units` masih diterima, tapi hanya kalau rationya bisa
  // ditentukan dari konversi global. Satuan tanpa ratio dibuang, bukan
  // diam-diam dianggap 1:1.
  const { unitMappings } = buildUnitMappingsFromLegacyUnits(
    {
      purchase_unit: purchaseUnit,
      selling_unit: sellingUnit,
      sellable_units: item.sellable_units ?? existing?.sellable_units ?? [],
      unit_mappings: item.unit_mappings ?? existing?.unit_mappings ?? [],
    },
    (unit, baseUnit) => (hasConversionRatio(unit, baseUnit) ? getConversionRatio(unit, baseUnit) : undefined),
  );
  const productUnits = getProductUnits({ purchase_unit: purchaseUnit, unit_mappings: unitMappings });

  return {
    ...existing,
    id: existing?.id ?? productId,
    // A stock-in file may carry no name column at all, and a blank cell must
    // never erase the name a product already has.
    name: item.name || existing?.name || '',
    category: item.category || existing?.category || 'non_consumable',
    purchase_unit: purchaseUnit,
    selling_unit: getProductDefaultUnit({
      purchase_unit: purchaseUnit,
      selling_unit: sellingUnit,
      unit_mappings: unitMappings,
    }),
    purchase_price: item.purchase_price ?? existing?.purchase_price ?? 0,
    selling_price: item.selling_price ?? existing?.selling_price ?? 0,
    // Import master data must never create or overwrite an operational stock balance.
    stock: existing?.stock ?? 0,
    sku: item.sku || existing?.sku || '',
    product_type: item.product_type ?? existing?.product_type ?? 'FINISHED_GOOD',
    is_visible_in_pos: item.is_visible_in_pos ?? existing?.is_visible_in_pos ?? true,
    wholesale_prices: normalizeImportedWholesalePrices(
      item.wholesale_prices ?? existing?.wholesale_prices,
    ),
    unit_mappings: unitMappings,
    sellable_units: productUnits,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    sync_status: 'pending',
    sync_error: undefined,
  };
};

export const buildProductMasterImportPlan = ({
  items,
  existingProducts,
  now,
  createId = () => crypto.randomUUID(),
}: BuildProductMasterImportPlanInput): ProductMasterImportPlan => {
  const existingById = new Map(existingProducts.map((product) => [product.id, product]));
  const existingBySku = new Map<string, Product[]>();

  for (const product of existingProducts) {
    const sku = product.sku?.trim();
    if (!sku) continue;
    const matches = existingBySku.get(sku) ?? [];
    matches.push(product);
    existingBySku.set(sku, matches);
  }

  const rowErrors: ProductCsvRowError[] = [];
  const plannedItems: ProductMasterImportPlanItem[] = [];
  const plannedProductIds = new Set<string>();

  // A row rejected here is dropped on its own. The remaining rows still import
  // because master data carries no stock or cash, so a partial file is safe.
  const rejectRow = (item: ProductCsvImportItem, message: string) => {
    rowErrors.push({
      rowNumber: item.rowNumber,
      rawRow: item.rawRow ?? [],
      messages: [`Baris ${item.rowNumber}: ${message}`],
    });
  };

  items.forEach((item) => {
    const sku = item.sku?.trim();
    const skuMatches = sku ? existingBySku.get(sku) ?? [] : [];

    if (skuMatches.length > 1) {
      rejectRow(item, `SKU ${sku} cocok dengan lebih dari satu produk.`);
      return;
    }

    const existingBySkuMatch = skuMatches[0];
    const existingByIdMatch = item.id ? existingById.get(item.id) : undefined;
    if (
      existingBySkuMatch &&
      existingByIdMatch &&
      existingBySkuMatch.id !== existingByIdMatch.id
    ) {
      rejectRow(item, `id ${item.id} dan SKU ${sku} menunjuk produk yang berbeda.`);
      return;
    }

    const existing = existingBySkuMatch ?? existingByIdMatch;
    const productId = existing?.id ?? item.id ?? createId();
    if (plannedProductIds.has(productId)) {
      rejectRow(item, `produk ${productId} direncanakan lebih dari satu kali.`);
      return;
    }
    plannedProductIds.add(productId);

    plannedItems.push({
      rowNumber: item.rowNumber,
      product: buildImportedProduct({
        item,
        existing,
        productId,
        now,
      }),
      operation: existing ? 'update' : 'create',
    });
  });

  return {
    items: plannedItems,
    createdCount: plannedItems.filter((item) => item.operation === 'create').length,
    updatedCount: plannedItems.filter((item) => item.operation === 'update').length,
    errors: rowErrors.flatMap((rowError) => rowError.messages),
    rowErrors,
  };
};
