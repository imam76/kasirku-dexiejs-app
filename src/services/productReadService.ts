import { db } from '@/lib/db';
import { isTauriRuntime, productPostgresAdapter, type RemoteProductDto } from '@/services/postgresAdapter';
import type { Product, ProductUnit, ProductUnitMapping, WholesalePrice } from '@/types';

export interface ProductReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

const EMPTY_PRODUCT_READ_SYNC_RESULT: ProductReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
};

let isRefreshingProductsFromPostgres = false;

const isWholesalePrice = (value: unknown): value is WholesalePrice => {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<WholesalePrice>;
  return (
    typeof candidate.min_quantity === 'number' &&
    typeof candidate.price === 'number' &&
    (candidate.price_type === undefined || candidate.price_type === 'unit' || candidate.price_type === 'bundle')
  );
};

const isProductUnitMapping = (value: unknown): value is ProductUnitMapping => {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<ProductUnitMapping>;
  return (
    typeof candidate.unit === 'string' &&
    typeof candidate.base_unit === 'string' &&
    typeof candidate.ratio === 'number'
  );
};

const mapWholesalePrices = (wholesalePrices: unknown): WholesalePrice[] | undefined => {
  if (!Array.isArray(wholesalePrices)) return undefined;
  return wholesalePrices.filter(isWholesalePrice);
};

const mapProductUnits = (
  sellableUnits: unknown,
  fallbackSellingUnit: ProductUnit,
): ProductUnit[] => {
  if (!Array.isArray(sellableUnits)) return [fallbackSellingUnit];

  const units = sellableUnits.filter((unit): unit is ProductUnit => typeof unit === 'string');
  return units.length > 0 ? units : [fallbackSellingUnit];
};

const mapUnitMappings = (unitMappings: unknown): ProductUnitMapping[] | undefined => {
  if (!Array.isArray(unitMappings)) return undefined;
  return unitMappings.filter(isProductUnitMapping);
};

const mapRemoteProductToLocal = (
  remoteProduct: RemoteProductDto,
  syncedAt: string,
): Product => ({
  id: remoteProduct.id,
  name: remoteProduct.name,
  category: remoteProduct.category ?? undefined,
  purchase_unit: remoteProduct.purchase_unit,
  selling_unit: remoteProduct.selling_unit,
  purchase_price: remoteProduct.purchase_price,
  selling_price: remoteProduct.selling_price,
  stock: remoteProduct.stock,
  sku: remoteProduct.sku ?? undefined,
  wholesale_prices: mapWholesalePrices(remoteProduct.wholesale_prices),
  sellable_units: mapProductUnits(remoteProduct.sellable_units, remoteProduct.selling_unit),
  unit_mappings: mapUnitMappings(remoteProduct.unit_mappings),
  created_at: remoteProduct.created_at,
  updated_at: remoteProduct.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteProduct.updated_at,
});

const hasLocalUnsyncedChanges = (product: Product) => (
  product.sync_status === 'pending' || product.sync_status === 'failed'
);

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const shouldApplyRemoteProduct = (
  localProduct: Product | undefined,
  remoteProduct: RemoteProductDto,
) => {
  if (!localProduct) return true;
  if (hasLocalUnsyncedChanges(localProduct)) return false;

  const localRemoteUpdatedAt = localProduct.remote_updated_at ?? localProduct.updated_at;
  const remoteTimestamp = toTimestamp(remoteProduct.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteProduct.updated_at >= localRemoteUpdatedAt;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

export const mergeRemoteProductsIntoDexie = async (
  remoteProducts: RemoteProductDto[],
  syncedAt = new Date().toISOString(),
): Promise<ProductReadSyncResult> => {
  const result: ProductReadSyncResult = {
    ...EMPTY_PRODUCT_READ_SYNC_RESULT,
    fetched: remoteProducts.length,
  };
  if (remoteProducts.length === 0) return result;

  const productsToPut: Product[] = [];

  await db.transaction('rw', db.products, async () => {
    for (const remoteProduct of remoteProducts) {
      const localProduct = await db.products.get(remoteProduct.id);
      if (!shouldApplyRemoteProduct(localProduct, remoteProduct)) {
        result.skipped += 1;
        continue;
      }

      if (remoteProduct.deleted_at) {
        if (localProduct) {
          await db.products.delete(remoteProduct.id);
          result.updated += 1;
        } else {
          result.skipped += 1;
        }
        continue;
      }

      productsToPut.push(mapRemoteProductToLocal(remoteProduct, syncedAt));
      if (localProduct) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }

    if (productsToPut.length > 0) {
      await db.products.bulkPut(productsToPut);
    }
  });

  return result;
};

export const refreshProductsFromPostgres = async (): Promise<ProductReadSyncResult> => {
  if (isRefreshingProductsFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_PRODUCT_READ_SYNC_RESULT };
  }

  isRefreshingProductsFromPostgres = true;
  try {
    const remoteProducts = await productPostgresAdapter.list();
    return mergeRemoteProductsIntoDexie(remoteProducts);
  } finally {
    isRefreshingProductsFromPostgres = false;
  }
};
