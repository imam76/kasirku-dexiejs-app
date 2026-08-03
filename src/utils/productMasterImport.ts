import type { Product, ProductUnit } from '@/types';
import type { ProductCsvImportItem } from '@/utils/productsCsv';
import {
  buildSellableUnitsFromMappings,
  normalizeProductUnitMappings,
} from '@/utils/productUnits';

export interface ProductMasterImportPlanItem {
  product: Product;
  operation: 'create' | 'update';
}

export interface ProductMasterImportPlan {
  items: ProductMasterImportPlanItem[];
  createdCount: number;
  updatedCount: number;
  errors: string[];
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
  const unitMappings = normalizeProductUnitMappings({
    purchase_unit: purchaseUnit,
    selling_unit: sellingUnit,
    sellable_units: item.sellable_units ?? existing?.sellable_units ?? [],
    unit_mappings: item.unit_mappings ?? existing?.unit_mappings ?? [],
  });

  return {
    ...existing,
    id: existing?.id ?? productId,
    name: item.name,
    category: item.category || existing?.category || 'non_consumable',
    purchase_unit: purchaseUnit,
    selling_unit: sellingUnit,
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
    sellable_units: buildSellableUnitsFromMappings({
      purchase_unit: purchaseUnit,
      selling_unit: sellingUnit,
      sellable_units: item.sellable_units && item.sellable_units.length > 0
        ? item.sellable_units
        : existing?.sellable_units ?? [],
      unit_mappings: unitMappings,
    }),
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

  const errors: string[] = [];
  const plannedItems: ProductMasterImportPlanItem[] = [];
  const plannedProductIds = new Set<string>();

  items.forEach((item, index) => {
    const rowNumber = index + 2;
    const sku = item.sku?.trim();
    const skuMatches = sku ? existingBySku.get(sku) ?? [] : [];

    if (skuMatches.length > 1) {
      errors.push(`Baris ${rowNumber}: SKU ${sku} cocok dengan lebih dari satu produk.`);
      return;
    }

    const existingBySkuMatch = skuMatches[0];
    const existingByIdMatch = item.id ? existingById.get(item.id) : undefined;
    if (
      existingBySkuMatch &&
      existingByIdMatch &&
      existingBySkuMatch.id !== existingByIdMatch.id
    ) {
      errors.push(
        `Baris ${rowNumber}: id ${item.id} dan SKU ${sku} menunjuk produk yang berbeda.`,
      );
      return;
    }

    const existing = existingBySkuMatch ?? existingByIdMatch;
    const productId = existing?.id ?? item.id ?? createId();
    if (plannedProductIds.has(productId)) {
      errors.push(`Baris ${rowNumber}: produk ${productId} direncanakan lebih dari satu kali.`);
      return;
    }
    plannedProductIds.add(productId);

    plannedItems.push({
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
    items: errors.length > 0 ? [] : plannedItems,
    createdCount: plannedItems.filter((item) => item.operation === 'create').length,
    updatedCount: plannedItems.filter((item) => item.operation === 'update').length,
    errors,
  };
};
