import { getCurrentSessionUser, requireUserPermission } from '@/auth/authService';
import { db } from '@/lib/db';
import { createPurchaseDocument, issuePurchaseDocument } from '@/services/purchaseDocumentService';
import { enqueueProductSync } from '@/services/syncQueueService';
import type {
  Product,
  ProductCategory,
  ProductType,
  ProductUnit,
  ProductUnitMapping,
  PurchaseDocumentItem,
  WholesalePrice,
} from '@/types';
import { isProductVisibleInPos } from '@/utils/productAvailability';
import { buildSellableUnitsFromMappings, normalizeProductUnitMappings } from '@/utils/productUnits';
import { matchesProductSearch, normalizeProductSearchTerm } from '@/utils/productSearch';
import { toBusinessDateKey } from '@/utils/businessDate';

export const QUICK_ITEM_SUPPLIER_NAME = 'Belum diketahui';

/**
 * Penerimaan barang berstatus ESTIMATED wajib punya harga beli lebih dari 0,
 * jadi saat kasir tidak tahu harga belinya dipakai tebakan dari harga jual.
 * Angka final tetap ditentukan supervisor lewat rekonsiliasi biaya pembelian.
 */
const DEFAULT_ESTIMATED_COST_RATIO = 0.7;

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const isProductUnverified = (
  product: Pick<Product, 'verification_status'>,
) => product.verification_status === 'UNVERIFIED';

export interface PosQuickItemCandidate {
  product: Product;
  isHiddenFromPos: boolean;
  hasBarcode: boolean;
}

/**
 * Cari produk yang mungkin sama dengan barang yang sedang diketik kasir, termasuk
 * produk yang disembunyikan dari katalog POS. Tujuannya mencegah produk duplikat
 * dibuat hanya karena barcode belum terpasang atau produk sedang disembunyikan.
 */
export const findPosQuickItemCandidates = async (
  term: string,
  limit = 5,
): Promise<PosQuickItemCandidate[]> => {
  const normalizedTerm = normalizeProductSearchTerm(term);
  if (normalizedTerm.length < 2) return [];

  const products = await db.products
    .filter((product) => matchesProductSearch(product, normalizedTerm))
    .limit(limit)
    .toArray();

  return products.map((product) => ({
    product,
    isHiddenFromPos: !isProductVisibleInPos(product),
    hasBarcode: Boolean(product.sku),
  }));
};

/**
 * Pasang barcode hasil scan ke produk yang sudah ada supaya pemindaian berikutnya
 * langsung ketemu. Produk yang sudah punya barcode lain dibiarkan apa adanya.
 */
export const linkBarcodeToExistingProduct = async (
  productId: string,
  barcode: string,
): Promise<Product> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'POS_QUICK_ITEM_ENTRY');

  const product = await db.products.get(productId);
  if (!product) throw new Error('Produk tidak ditemukan.');

  const normalizedBarcode = barcode.trim();
  if (!normalizedBarcode || product.sku) return product;

  const owner = await db.products.where('sku').equals(normalizedBarcode).first();
  if (owner && owner.id !== product.id) {
    throw new Error(`Barcode ${normalizedBarcode} sudah dipakai produk "${owner.name}".`);
  }

  const updatedProduct: Product = {
    ...product,
    sku: normalizedBarcode,
    updated_at: new Date().toISOString(),
    sync_status: 'pending',
    sync_error: undefined,
  };

  await db.products.put(updatedProduct);
  await enqueueProductSync(updatedProduct, 'update');

  return updatedProduct;
};

export interface CreatePosQuickItemInput {
  name: string;
  barcode?: string;
  sellingPrice: number;
  quantity: number;
  /** @deprecated pakai purchaseUnit/sellingUnit; dipertahankan untuk kompatibilitas caller lama. */
  unit?: ProductUnit;
  purchaseUnit?: ProductUnit;
  sellingUnit?: ProductUnit;
  sellableUnits?: ProductUnit[];
  unitMappings?: ProductUnitMapping[];
  wholesalePrices?: WholesalePrice[];
  category?: ProductCategory;
  productType?: ProductType;
  estimatedPurchasePrice?: number;
}

export interface CreatePosQuickItemResult {
  product: Product;
  documentNumber: string;
  estimatedPurchasePrice: number;
  isEstimateGuessed: boolean;
}

export const resolveQuickItemEstimatedCost = (
  sellingPrice: number,
  manualEstimate?: number,
) => {
  const manual = Number(manualEstimate || 0);
  if (Number.isFinite(manual) && manual > 0) {
    return { price: roundCurrency(manual), isGuessed: false };
  }

  return {
    price: roundCurrency(Number(sellingPrice || 0) * DEFAULT_ESTIMATED_COST_RATIO),
    isGuessed: true,
  };
};

/**
 * Masukkan stok fisik lewat Purchase Receipt berstatus ESTIMATED. Dokumen inilah
 * yang membuat barangnya otomatis masuk antrean rekonsiliasi biaya pembelian,
 * sehingga HPP-nya wajib dilengkapi supervisor sebelum periode ditutup.
 */
const issueQuickItemReceipt = async (
  product: Product,
  quantity: number,
  estimatedPurchasePrice: number,
  actorName: string,
) => {
  const now = new Date().toISOString();
  const item: PurchaseDocumentItem = {
    id: crypto.randomUUID(),
    document_id: '',
    product_id: product.id,
    product_name: product.name,
    sku: product.sku,
    unit: product.purchase_unit,
    quantity,
    received_quantity: quantity,
    price: estimatedPurchasePrice,
    created_at: now,
  };
  const { document } = await createPurchaseDocument({
    document: {
      type: 'PURCHASE_RECEIPT',
      document_date: toBusinessDateKey(now),
      supplier_name: QUICK_ITEM_SUPPLIER_NAME,
      cost_status: 'ESTIMATED',
      notes: `Entri barang cepat dari POS oleh ${actorName}. Harga beli masih sementara.`,
    },
    items: [item],
  });

  await issuePurchaseDocument(document.id);

  return document;
};

/**
 * Terima stok fisik untuk produk yang sudah terdaftar tapi stok sistemnya habis.
 * Dipakai saat kasir mengenali barangnya sebagai produk lama lewat deteksi duplikat.
 */
export const receiveQuickStockForProduct = async (input: {
  productId: string;
  quantity: number;
  estimatedPurchasePrice?: number;
}): Promise<CreatePosQuickItemResult> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'POS_QUICK_ITEM_ENTRY');

  const product = await db.products.get(input.productId);
  if (!product) throw new Error('Produk tidak ditemukan.');

  const quantity = Number(input.quantity || 0);
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('Jumlah barang harus lebih dari 0.');
  }

  const estimate = resolveQuickItemEstimatedCost(
    product.purchase_price > 0 ? product.purchase_price : product.selling_price,
    input.estimatedPurchasePrice,
  );
  if (estimate.price <= 0) {
    throw new Error('Perkiraan harga beli harus lebih dari 0.');
  }

  const document = await issueQuickItemReceipt(
    product,
    quantity,
    estimate.price,
    currentUser?.name ?? 'kasir',
  );

  return {
    product: await db.products.get(product.id) ?? product,
    documentNumber: document.document_number,
    estimatedPurchasePrice: estimate.price,
    isEstimateGuessed: estimate.isGuessed,
  };
};

/**
 * Daftarkan barang yang belum ada di sistem saat transaksi berlangsung.
 *
 * Produk dibuat dalam status karantina (UNVERIFIED, tidak tampil di katalog POS)
 * lalu stoknya dimasukkan lewat penerimaan barang berstatus ESTIMATED.
 */
export const createPosQuickItem = async (
  input: CreatePosQuickItemInput,
): Promise<CreatePosQuickItemResult> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'POS_QUICK_ITEM_ENTRY');

  const name = input.name.trim();
  const barcode = input.barcode?.trim() || undefined;
  const purchaseUnit = (input.purchaseUnit || input.unit || 'pcs').trim() || 'pcs';
  const sellingUnit = (input.sellingUnit || input.unit || purchaseUnit).trim() || purchaseUnit;
  const sellingPrice = Number(input.sellingPrice || 0);
  const quantity = Number(input.quantity || 0);

  if (!name) throw new Error('Nama barang wajib diisi.');
  if (!Number.isFinite(sellingPrice) || sellingPrice <= 0) {
    throw new Error('Harga jual harus lebih dari 0.');
  }
  if (!Number.isFinite(quantity) || quantity <= 0) {
    throw new Error('Jumlah barang harus lebih dari 0.');
  }

  if (barcode) {
    const owner = await db.products.where('sku').equals(barcode).first();
    if (owner) {
      throw new Error(`Barcode ${barcode} sudah dipakai produk "${owner.name}".`);
    }
  }

  const estimate = resolveQuickItemEstimatedCost(sellingPrice, input.estimatedPurchasePrice);
  const now = new Date().toISOString();
  const unitMappings = normalizeProductUnitMappings({
    purchase_unit: purchaseUnit,
    selling_unit: sellingUnit,
    sellable_units: input.sellableUnits || [],
    unit_mappings: input.unitMappings || [],
  });
  const product: Product = {
    id: crypto.randomUUID(),
    name,
    sku: barcode,
    category: input.category,
    purchase_unit: purchaseUnit,
    selling_unit: sellingUnit,
    purchase_price: estimate.price,
    selling_price: sellingPrice,
    stock: 0,
    product_type: input.productType ?? 'FINISHED_GOOD',
    // Wajib true: is_visible_in_pos adalah saklar "boleh dijual di POS", bukan
    // sekadar penyembunyi katalog. Keranjang, pemindaian barcode, dan POS
    // restoran semuanya menolak produk yang saklarnya mati.
    is_visible_in_pos: true,
    wholesale_prices: (input.wholesalePrices || []).map((price) => ({
      min_quantity: Number(price.min_quantity),
      unit: price.unit || sellingUnit,
      price: Number(price.price),
      price_type: price.price_type || 'unit',
    })),
    unit_mappings: unitMappings,
    sellable_units: buildSellableUnitsFromMappings({
      purchase_unit: purchaseUnit,
      selling_unit: sellingUnit,
      sellable_units: input.sellableUnits || [],
      unit_mappings: unitMappings,
    }),
    verification_status: 'UNVERIFIED',
    created_at: now,
    updated_at: now,
    sync_status: 'pending',
  };

  await db.products.add(product);

  try {
    // Disinkronkan selagi stoknya masih nol supaya stok tetap datang dari mutasi
    // penerimaan barang, sama seperti alur pembelian biasa.
    await enqueueProductSync(product, 'create');
    const document = await issueQuickItemReceipt(
      product,
      quantity,
      estimate.price,
      currentUser?.name ?? 'kasir',
    );

    return {
      product: await db.products.get(product.id) ?? product,
      documentNumber: document.document_number,
      estimatedPurchasePrice: estimate.price,
      isEstimateGuessed: estimate.isGuessed,
    };
  } catch (error) {
    await db.products.delete(product.id);
    throw error;
  }
};

/**
 * Tandai produk hasil entri cepat sudah diperiksa supervisor. Sengaja tidak
 * menyentuh is_visible_in_pos supaya keputusan menampilkan/menyembunyikan produk
 * tetap milik supervisor.
 */
export const markProductVerified = async (productId: string): Promise<Product> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'PRODUCT_MANAGE');

  const product = await db.products.get(productId);
  if (!product) throw new Error('Produk tidak ditemukan.');

  const updatedProduct: Product = {
    ...product,
    verification_status: 'VERIFIED',
    updated_at: new Date().toISOString(),
    sync_status: 'pending',
    sync_error: undefined,
  };

  await db.products.put(updatedProduct);
  await enqueueProductSync(updatedProduct, 'update');

  return updatedProduct;
};
