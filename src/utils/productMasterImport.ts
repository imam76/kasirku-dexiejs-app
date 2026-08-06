import type { Product, ProductUnit, UnitConversion } from '@/types';
import type { ProductCsvImportItem, ProductCsvRowError } from '@/utils/productsCsv';
import { DEFAULT_CONVERSIONS, normalizeUnitKey } from '@/constants/units';
import {
  buildSellableUnitsFromMappings,
  getProductSellableUnits,
  normalizeProductUnitMappings,
  resolveProductUnitRatio,
} from '@/utils/productUnits';

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
  /**
   * Rows that imported fine but carried file content the plan could not use.
   * Kept apart from errors so they never block an import, and shaped the same
   * way so they can be downloaded and fixed through the same flow.
   */
  rowWarnings: ProductCsvRowError[];
  warnings: string[];
}

interface BuildProductMasterImportPlanInput {
  items: ProductCsvImportItem[];
  existingProducts: Product[];
  now: string;
  createId?: () => string;
  globalConversions?: ReadonlyArray<Pick<UnitConversion, 'fromUnit' | 'toUnit' | 'ratio'>>;
}

const normalizeImportedWholesalePrices = (
  prices: Product['wholesale_prices'] | undefined,
) => (prices || []).map((price) => ({
  min_quantity: Number(price.min_quantity),
  unit: price.unit,
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
}): { product: Product; warnings: string[] } => {
  const warnings: string[] = [];
  const purchaseUnit = (item.purchase_unit || existing?.purchase_unit || 'pcs') as ProductUnit;
  const sellingUnit = (item.selling_unit || existing?.selling_unit || 'pcs') as ProductUnit;
  const existingSellableUnits = existing ? getProductSellableUnits(existing) : [];

  // Menghapus itu tindakan merusak, jadi harus terbaca di layar konfirmasi
  // sebelum dijalankan — bukan baru ketahuan setelah datanya hilang.
  if (
    item.unit_mappings !== undefined
    && item.unit_mappings.length === 0
    && (existing?.unit_mappings?.length ?? 0) > 0
  ) {
    warnings.push('konversi satuan produk ini dihapus karena kolom satuannya ada di file tapi dikosongkan.');
  }
  if (
    item.wholesale_prices !== undefined
    && item.wholesale_prices.length === 0
    && (existing?.wholesale_prices?.length ?? 0) > 0
  ) {
    warnings.push('harga grosir produk ini dihapus karena kolom grosirnya ada di file tapi dikosongkan.');
  }

  // Kolom satuan eksplisit menang atas kolom legacy. Kalau keduanya diisi dan
  // yang eksplisit tidak menyebut satuannya, `sellable_units` tidak boleh
  // diam-diam jadi penentu — pengguna harus tahu isian itu tidak terpakai.
  if (item.ignored_sellable_units && item.ignored_sellable_units.length > 0) {
    warnings.push(
      `kolom sellable_units (${item.ignored_sellable_units.join(', ')}) diabaikan karena kolom satuan di file yang menentukan daftarnya.`,
    );
  }

  const unitMappings = normalizeProductUnitMappings({
    purchase_unit: purchaseUnit,
    selling_unit: sellingUnit,
    sellable_units: item.sellable_units ?? existingSellableUnits,
    unit_mappings: item.unit_mappings ?? existing?.unit_mappings ?? [],
  });

  const product: Product = {
    ...existing,
    id: existing?.id ?? productId,
    // File stock-in boleh datang tanpa kolom nama sama sekali; produknya sudah
    // dikenali lewat sku, jadi namanya tidak boleh ikut terhapus.
    name: item.name || existing?.name || '',
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
        : existingSellableUnits,
      unit_mappings: unitMappings,
    }),
    created_at: existing?.created_at ?? now,
    updated_at: now,
    sync_status: 'pending',
    sync_error: undefined,
  };

  return { product, warnings };
};

export const buildProductMasterImportPlan = ({
  items,
  existingProducts,
  now,
  createId = () => crypto.randomUUID(),
  globalConversions = DEFAULT_CONVERSIONS,
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
  const rowWarnings: ProductCsvRowError[] = [];
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

    const { product, warnings } = buildImportedProduct({
      item,
      existing,
      productId,
      now,
    });

    // Satuan jual yang tidak nyambung ke satuan utama menghasilkan produk yang
    // muncul di kasir tapi stoknya tidak bisa dihitung, jadi barisnya digugurkan
    // — bukan diam-diam dianggap 1:1 seperti dulu.
    const invalidUnit = getProductSellableUnits(product).find((unit) => {
      if (normalizeUnitKey(unit) === normalizeUnitKey(product.purchase_unit)) return false;
      return resolveProductUnitRatio(product, unit, product.purchase_unit, {
        globalConversions,
      }).status !== 'resolved';
    });
    if (invalidUnit) {
      rejectRow(
        item,
        `konversi satuan ${invalidUnit} ke ${product.purchase_unit} tidak ada atau saling bertentangan.`,
      );
      return;
    }

    // Peringatan tidak menggugurkan barisnya: produknya tetap benar, hanya ada
    // isi file yang tidak terpakai. Bentuknya sama dengan baris gagal supaya
    // bisa ikut diunduh dan diperbaiki dengan cara yang sama.
    if (warnings.length > 0) {
      rowWarnings.push({
        rowNumber: item.rowNumber,
        rawRow: item.rawRow ?? [],
        messages: warnings.map((warning) => `Baris ${item.rowNumber}: ${warning}`),
      });
    }

    plannedItems.push({
      rowNumber: item.rowNumber,
      product,
      operation: existing ? 'update' : 'create',
    });
  });

  return {
    items: plannedItems,
    createdCount: plannedItems.filter((item) => item.operation === 'create').length,
    updatedCount: plannedItems.filter((item) => item.operation === 'update').length,
    errors: rowErrors.flatMap((rowError) => rowError.messages),
    rowErrors,
    rowWarnings,
    warnings: rowWarnings.flatMap((rowWarning) => rowWarning.messages),
  };
};
