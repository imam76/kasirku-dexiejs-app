import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import type { StockFormData } from '@/lib/validations/stock';
import { buildProductSyncQueueItem, enqueueProductSync, processPendingSyncQueue } from '@/services/syncQueueService';
import type { Product } from '@/types';
import { buildSellableUnitsFromMappings, normalizeProductUnitMappings } from '@/utils/productUnits';
import { normalizeMinStockInput } from '@/utils/stockStatus';

const withPendingSync = (product: Product): Product => ({
  ...product,
  sync_status: 'pending',
  sync_error: undefined,
});

/**
 * Memperbarui produk yang sudah ada di Dexie, dipakai oleh form Master Produk
 * maupun quick-edit di POS/Sales/Purchase supaya keduanya menempuh jalur
 * update yang persis sama (sync queue, log). Perubahan stok tidak lewat sini —
 * itu tugas dokumen transaksi (Purchase/POS receipt) masing-masing.
 */
export const updateProductRecord = async (productId: string, data: StockFormData): Promise<Product> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'PRODUCT_MANAGE');

  const now = new Date().toISOString();

  const sellableUnits = data.sellable_units && data.sellable_units.length > 0
    ? data.sellable_units
    : [data.selling_unit || 'pcs'];
  const defaultSellingUnit = data.selling_unit && sellableUnits.includes(data.selling_unit)
    ? data.selling_unit
    : sellableUnits[0] || 'pcs';

  const unitMappings = normalizeProductUnitMappings({
    purchase_unit: data.purchase_unit || 'pcs',
    selling_unit: defaultSellingUnit,
    sellable_units: sellableUnits,
    unit_mappings: data.unit_mappings || [],
  });

  const cleanData = {
    name: data.name,
    category: data.category || 'non_consumable',
    purchase_unit: data.purchase_unit || 'pcs',
    selling_unit: defaultSellingUnit,
    purchase_price: data.purchase_price ?? 0,
    selling_price: data.selling_price ?? 0,
    sku: data.sku || '',
    min_stock: normalizeMinStockInput(data.min_stock),
    product_type: data.product_type ?? 'FINISHED_GOOD',
    is_visible_in_pos: data.is_visible_in_pos ?? true,
    wholesale_prices: (data.wholesale_prices || []).map((price) => ({
      min_quantity: Number(price.min_quantity),
      unit: price.unit || defaultSellingUnit || data.purchase_unit || 'pcs',
      price: Number(price.price),
      price_type: price.price_type || 'unit',
    })),
    unit_mappings: unitMappings,
    sellable_units: buildSellableUnitsFromMappings({
      purchase_unit: data.purchase_unit || 'pcs',
      selling_unit: defaultSellingUnit,
      sellable_units: sellableUnits,
      unit_mappings: unitMappings,
    }),
  };

  let syncedProduct: Product | null = null;

  await db.transaction('rw', [db.products], async () => {
    const existingProduct = await db.products.get(productId);
    if (!existingProduct) {
      throw new Error('Produk tidak ditemukan.');
    }

    const updatedProduct: Product = withPendingSync({
      ...existingProduct,
      ...cleanData,
      stock: data.stock ?? existingProduct.stock,
      updated_at: now,
    });
    await db.products.put(updatedProduct);
    syncedProduct = updatedProduct;
  });

  if (syncedProduct) {
    await enqueueProductSync(syncedProduct, 'update');
  }

  await writeActivityLog({
    user: currentUser,
    action: 'PRODUCT_UPDATED',
    entity: 'products',
    entity_id: productId,
    description: `${currentUser?.name ?? 'User'} memperbarui produk ${cleanData.name}.`,
  });

  if (!syncedProduct) {
    throw new Error('Produk tidak ditemukan.');
  }

  return syncedProduct;
};

/**
 * Bulk-update harga jual, dipakai halaman "Update Harga Jual" di detail
 * purchase invoice supaya user tidak perlu buka form edit produk satu-satu.
 */
export const bulkUpdateProductSellingPrices = async (
  updates: Array<{ productId: string; sellingPrice: number }>,
  context: { sourceDocumentId?: string; sourceDocumentNumber?: string } = {},
): Promise<Product[]> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'PRODUCT_MANAGE');

  // Purchase invoices can carry the same product across multiple lines, so
  // keep only the last requested price per product before writing.
  const dedupedUpdates = [...new Map(updates.map((update) => [update.productId, update])).values()];

  if (dedupedUpdates.length === 0) {
    return [];
  }

  const now = new Date().toISOString();
  let updatedProducts: Product[] = [];

  await db.transaction('rw', [db.products, db.syncQueue], async () => {
    const existingProducts = await db.products.bulkGet(dedupedUpdates.map((update) => update.productId));

    updatedProducts = dedupedUpdates.flatMap((update, index) => {
      const existingProduct = existingProducts[index];
      if (!existingProduct) return [];

      return [withPendingSync({
        ...existingProduct,
        selling_price: update.sellingPrice,
        updated_at: now,
      })];
    });

    await db.products.bulkPut(updatedProducts);
    await db.syncQueue.bulkAdd(updatedProducts.map((product) => (
      buildProductSyncQueueItem(product, 'update', { createdAt: now })
    )));
  });

  void processPendingSyncQueue();

  await writeActivityLog({
    user: currentUser,
    action: 'PRODUCT_BULK_PRICE_UPDATED',
    entity: 'products',
    entity_id: context.sourceDocumentId,
    description: context.sourceDocumentNumber
      ? `${currentUser?.name ?? 'User'} memperbarui harga jual ${updatedProducts.length} produk dari invoice ${context.sourceDocumentNumber}.`
      : `${currentUser?.name ?? 'User'} memperbarui harga jual ${updatedProducts.length} produk.`,
  });

  return updatedProducts;
};
