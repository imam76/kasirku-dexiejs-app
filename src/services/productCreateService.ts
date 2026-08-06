import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { defaultLocale, translate } from '@/i18n/messages';
import { db } from '@/lib/db';
import type { StockFormData } from '@/lib/validations/stock';
import { enqueueFinanceTransactionsSync } from '@/services/financeTransactionSyncService';
import { recordStockPurchase } from '@/services/stockPurchaseService';
import { enqueueProductSync } from '@/services/syncQueueService';
import type { FinanceTransaction, Product } from '@/types';
import { buildSellableUnitsFromMappings, normalizeProductUnitMappings } from '@/utils/productUnits';

/**
 * Membuat produk baru langsung ke Dexie, dipakai oleh form Master Produk maupun
 * quick-create di POS/Sales/Purchase supaya keduanya menghasilkan produk dengan
 * kelengkapan data yang sama persis (satuan, konversi, harga grosir, dst).
 */
export const createProductRecord = async (data: StockFormData): Promise<Product> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'PRODUCT_MANAGE');

  const purchaseQuantity = data.purchase_quantity || 0;
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

  const financeTransactionsToSync: FinanceTransaction[] = [];

  await db.transaction('rw', [db.products, db.stockPurchases, db.financeBalance, db.financeTransactions, db.chartOfAccounts, db.financeAccountMappings, db.enabledModules, db.generalLedgerSetting, db.journalEntries, db.journalEntryLines], async () => {
    await db.products.add(newProduct);

    if (purchaseQuantity > 0) {
      const totalCost = newProduct.purchase_price * purchaseQuantity;
      const purchaseResult = await recordStockPurchase({
        productId: id,
        productName: newProduct.name,
        sku: newProduct.sku,
        quantity: purchaseQuantity,
        costPerUnit: newProduct.purchase_price,
        totalCost,
        description: translate(defaultLocale, 'stock.initialPurchaseDescription', {
          name: newProduct.name,
          quantity: purchaseQuantity,
        }),
        createdAt: now,
        actor: currentUser,
      });
      financeTransactionsToSync.push(purchaseResult.financeTransaction);
    }
  });

  await enqueueProductSync(newProduct, 'create');
  if (financeTransactionsToSync.length > 0) {
    await enqueueFinanceTransactionsSync(financeTransactionsToSync, 'create');
  }

  await writeActivityLog({
    user: currentUser,
    action: 'PRODUCT_CREATED',
    entity: 'products',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} menambahkan produk ${newProduct.name}.`,
  });

  return newProduct;
};
