import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import type { StockFormData } from '@/lib/validations/stock';
import { enqueueProductSync } from '@/services/syncQueueService';
import type { Product } from '@/types';
import { buildSellableUnitsFromMappings, normalizeProductUnitMappings } from '@/utils/productUnits';
import { normalizeMinStockInput } from '@/utils/stockStatus';

/**
 * Membuat produk baru langsung ke Dexie, dipakai oleh form Master Produk maupun
 * quick-create di Sales/Purchase supaya keduanya menghasilkan produk dengan
 * kelengkapan data yang sama persis (satuan, konversi, harga grosir, dst).
 * Stok awal sengaja tidak dicatat di sini — itu tugas dokumen transaksi
 * (Purchase/POS receipt) masing-masing, bukan langkah pembuatan produk.
 */
export const createProductRecord = async (data: StockFormData): Promise<Product> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'PRODUCT_MANAGE');

  const now = new Date().toISOString();
  const id = crypto.randomUUID();

  const unitMappings = normalizeProductUnitMappings({
    purchase_unit: data.purchase_unit || 'pcs',
    selling_unit: data.selling_unit || 'pcs',
    sellable_units: data.sellable_units || [],
    unit_mappings: data.unit_mappings || [],
  });

  const newProduct: Product = {
    id,
    name: data.name,
    category: data.category || 'non_consumable',
    purchase_unit: data.purchase_unit || 'pcs',
    selling_unit: data.selling_unit || 'pcs',
    purchase_price: data.purchase_price ?? 0,
    selling_price: data.selling_price ?? 0,
    stock: 0,
    min_stock: normalizeMinStockInput(data.min_stock),
    sku: data.sku || undefined,
    product_type: data.product_type ?? 'FINISHED_GOOD',
    is_visible_in_pos: data.is_visible_in_pos ?? true,
    wholesale_prices: (data.wholesale_prices || []).map((price) => ({
      min_quantity: Number(price.min_quantity),
      unit: price.unit || data.selling_unit || data.purchase_unit || 'pcs',
      price: Number(price.price),
      price_type: price.price_type || 'unit',
    })),
    unit_mappings: unitMappings,
    sellable_units: buildSellableUnitsFromMappings({
      purchase_unit: data.purchase_unit || 'pcs',
      selling_unit: data.selling_unit || 'pcs',
      sellable_units: data.sellable_units || [],
      unit_mappings: unitMappings,
    }),
    created_at: now,
    updated_at: now,
    sync_status: 'pending',
  };

  await db.products.add(newProduct);
  await enqueueProductSync(newProduct, 'create');

  await writeActivityLog({
    user: currentUser,
    action: 'PRODUCT_CREATED',
    entity: 'products',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} menambahkan produk ${newProduct.name}.`,
  });

  return newProduct;
};
