import { normalizeUnitKey } from '@/constants/units';
import type { Product, ProductUnit } from '@/types';
import type { ProductCsvImportItem, ProductCsvRowError } from '@/utils/productsCsv';
import {
  buildUnitMappingsFromLegacyUnits,
  getProductDefaultUnit,
  getProductUnitRatio,
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
  /**
   * Baris yang tetap diimpor tapi ada isinya yang tidak terpakai — satuan tanpa
   * konversi, atau satuan default yang tidak ada di daftar. Dulu hal-hal ini
   * dibuang tanpa jejak, sehingga pengguna mengira filenya masuk utuh.
   */
  rowWarnings: ProductCsvRowError[];
  warnings: string[];
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
}): { product: Product; warnings: string[] } => {
  const warnings: string[] = [];
  const purchaseUnit = (item.purchase_unit || existing?.purchase_unit || 'pcs') as ProductUnit;
  const sellingUnit = (item.selling_unit || existing?.selling_unit || 'pcs') as ProductUnit;

  // Daftar satuan yang sengaja dikosongkan di file harus benar-benar kosong.
  // Kolom lama `selling_unit` dan `sellable_units` masih berisi satuan yang
  // baru saja dihapus, jadi jalur legacy dilewati seluruhnya — kalau tidak,
  // satuan yang dihapus akan hidup lagi lewat konversi global.
  const clearsUnits = item.unit_mappings !== undefined && item.unit_mappings.length === 0;

  // Menghapus itu tindakan merusak, jadi harus terbaca di layar konfirmasi
  // sebelum dijalankan — bukan baru ketahuan setelah datanya hilang.
  if (clearsUnits && (existing?.unit_mappings?.length ?? 0) > 0) {
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
  // yang eksplisit dikosongkan, `sellable_units` tidak boleh diam-diam jadi
  // penentu — pengguna harus tahu isian itu tidak terpakai.
  const ignoredLegacyUnits = clearsUnits
    ? (item.sellable_units ?? []).filter(
      (unit) => normalizeUnitKey(unit) !== normalizeUnitKey(purchaseUnit),
    )
    : [];

  if (ignoredLegacyUnits.length > 0) {
    warnings.push(
      `kolom sellable_units (${ignoredLegacyUnits.join(', ')}) diabaikan karena kolom satuan di file yang menentukan daftarnya.`,
    );
  }

  // Kolom lama `sellable_units` masih diterima, tapi hanya kalau rationya bisa
  // ditentukan dari konversi global. Satuan tanpa ratio dibuang, bukan
  // diam-diam dianggap 1:1.
  const { unitMappings: resolvedMappings, droppedUnits } = clearsUnits
    ? { unitMappings: [], droppedUnits: [] }
    : buildUnitMappingsFromLegacyUnits(
      {
        purchase_unit: purchaseUnit,
        selling_unit: sellingUnit,
        sellable_units: item.sellable_units ?? existing?.sellable_units ?? [],
        unit_mappings: item.unit_mappings ?? existing?.unit_mappings ?? [],
      },
      (unit, baseUnit) => (hasConversionRatio(unit, baseUnit) ? getConversionRatio(unit, baseUnit) : undefined),
    );

  if (droppedUnits.length > 0) {
    warnings.push(
      `satuan ${droppedUnits.join(', ')} dilewati karena tidak punya konversi ke ${purchaseUnit}.`,
    );
  }

  // Baris konversi yang tidak nyambung ke satuan utama — mis. kolom JSON yang
  // menulis `base_unit` sembarang — menghasilkan satuan yang muncul di kasir
  // tapi stoknya tidak bisa dihitung. Form tidak pernah bisa membuat data
  // seperti itu, jadi import pun tidak boleh membiarkannya lewat.
  const candidate = { purchase_unit: purchaseUnit, unit_mappings: resolvedMappings };
  const unitMappings = resolvedMappings.filter(
    (mapping) => getProductUnitRatio(candidate, mapping.unit, purchaseUnit) !== undefined,
  );
  const unresolvedUnits = resolvedMappings
    .filter((mapping) => !unitMappings.includes(mapping))
    .map((mapping) => mapping.unit);

  if (unresolvedUnits.length > 0) {
    warnings.push(
      `konversi satuan ${unresolvedUnits.join(', ')} dibuang karena tidak nyambung ke satuan utama ${purchaseUnit}.`,
    );
  }

  const productUnits = getProductUnits({ purchase_unit: purchaseUnit, unit_mappings: unitMappings });
  const defaultUnit = getProductDefaultUnit({
    purchase_unit: purchaseUnit,
    selling_unit: sellingUnit,
    unit_mappings: unitMappings,
  });

  // Form memblokir satuan default yang tidak ada di daftar; import dulu
  // diam-diam menggantinya. Sekarang penggantiannya tetap terjadi supaya baris
  // lain tidak ikut gagal, tapi tidak lagi tanpa kabar.
  if (item.selling_unit && normalizeUnitKey(item.selling_unit) !== normalizeUnitKey(defaultUnit)) {
    warnings.push(
      `selling_unit ${item.selling_unit} tidak ada di daftar satuan produk, jadi yang dipakai ${defaultUnit}.`,
    );
  }

  const product: Product = {
    ...existing,
    id: existing?.id ?? productId,
    // A stock-in file may carry no name column at all, and a blank cell must
    // never erase the name a product already has.
    name: item.name || existing?.name || '',
    category: item.category || existing?.category || 'non_consumable',
    purchase_unit: purchaseUnit,
    selling_unit: defaultUnit,
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

  return { product, warnings };
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
