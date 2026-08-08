import { db } from '@/lib/db';
import {
  isPostgresUnavailableError,
  isTauriRuntime,
  productPostgresAdapter,
  type RemoteProductDto,
} from '@/services/postgresAdapter';
import {
  getLatestLocalRemoteUpdatedAt,
  getLatestRemoteUpdatedAt,
  toTimestamp,
} from '@/services/shared/remoteRefreshCursor';
import type { Product, ProductUnit, ProductUnitMapping, WholesalePrice } from '@/types';
import { getProductSellableUnits, normalizeProductUnitMappings } from '@/utils/productUnits';

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

const PRODUCT_REFRESH_LIMIT = 500;

let isRefreshingProductsFromPostgres = false;

const isWholesalePrice = (value: unknown): value is WholesalePrice => {
  if (!value || typeof value !== 'object') return false;

  const candidate = value as Partial<WholesalePrice>;
  return (
    typeof candidate.min_quantity === 'number' &&
    (candidate.unit === undefined || typeof candidate.unit === 'string') &&
    typeof candidate.price === 'number' &&
    (candidate.price_type === undefined || candidate.price_type === 'unit' || candidate.price_type === 'bundle')
  );
};

const mapWholesalePrices = (wholesalePrices: unknown): WholesalePrice[] | undefined => {
  if (!Array.isArray(wholesalePrices)) return undefined;
  return wholesalePrices.filter(isWholesalePrice);
};

const mapProductUnits = (
  sellableUnits: unknown,
  fallbackSellingUnit: ProductUnit,
  purchaseUnit: ProductUnit,
  unitMappings: unknown,
): ProductUnit[] => {
  const units = Array.isArray(sellableUnits)
    ? sellableUnits.filter((unit): unit is ProductUnit => typeof unit === 'string')
    : [];
  return getProductSellableUnits({
    purchase_unit: purchaseUnit,
    selling_unit: fallbackSellingUnit,
    sellable_units: units,
    unit_mappings: unitMappings,
  });
};

const mapUnitMappings = (
  unitMappings: unknown,
  purchaseUnit: ProductUnit,
  sellingUnit: ProductUnit,
  sellableUnits: ProductUnit[],
): ProductUnitMapping[] | undefined => {
  if (!Array.isArray(unitMappings)) return undefined;
  return normalizeProductUnitMappings({
    purchase_unit: purchaseUnit,
    selling_unit: sellingUnit,
    sellable_units: sellableUnits,
    unit_mappings: unitMappings,
  });
};

const mapRemoteProductToLocal = (
  remoteProduct: RemoteProductDto,
  syncedAt: string,
): Product => {
  const sellableUnits = mapProductUnits(
    remoteProduct.sellable_units,
    remoteProduct.selling_unit,
    remoteProduct.purchase_unit,
    remoteProduct.unit_mappings,
  );

  return {
    id: remoteProduct.id,
    name: remoteProduct.name,
    category: remoteProduct.category ?? undefined,
    purchase_unit: remoteProduct.purchase_unit,
    selling_unit: remoteProduct.selling_unit,
    purchase_price: remoteProduct.purchase_price,
    selling_price: remoteProduct.selling_price,
    stock: remoteProduct.stock,
    sku: remoteProduct.sku ?? undefined,
    product_type: remoteProduct.product_type ?? 'FINISHED_GOOD',
    is_visible_in_pos: remoteProduct.is_visible_in_pos ?? true,
    wholesale_prices: mapWholesalePrices(remoteProduct.wholesale_prices),
    sellable_units: sellableUnits,
    unit_mappings: mapUnitMappings(
      remoteProduct.unit_mappings,
      remoteProduct.purchase_unit,
      remoteProduct.selling_unit,
      sellableUnits,
    ),
    created_at: remoteProduct.created_at,
    updated_at: remoteProduct.updated_at,
    sync_status: 'synced',
    sync_error: undefined,
    last_synced_at: syncedAt,
    remote_updated_at: remoteProduct.updated_at,
  };
};

const hasLocalUnsyncedChanges = (product: Product) => (
  product.sync_status === 'pending' || product.sync_status === 'failed'
);

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
  options: { preserveLocalStock?: boolean } = {},
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

      const mappedProduct = mapRemoteProductToLocal(remoteProduct, syncedAt);
      productsToPut.push(
        options.preserveLocalStock && localProduct
          ? { ...mappedProduct, stock: localProduct.stock }
          : mappedProduct,
      );
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

const getLatestLocalProductUpdatedAt = async () => {
  const products = await db.products.toArray();
  return getLatestLocalRemoteUpdatedAt(
    products,
    (product) => product.remote_updated_at ?? (product.sync_status === 'synced' ? product.updated_at : undefined),
  );
};

const getLatestRemoteProductUpdatedAt = (remoteProducts: RemoteProductDto[]) => (
  getLatestRemoteUpdatedAt(remoteProducts, (product) => product.updated_at)
);

const addProductReadSyncResult = (
  aggregate: ProductReadSyncResult,
  next: ProductReadSyncResult,
) => {
  aggregate.fetched += next.fetched;
  aggregate.inserted += next.inserted;
  aggregate.updated += next.updated;
  aggregate.skipped += next.skipped;
};

export const refreshProductsFromPostgres = async (): Promise<ProductReadSyncResult> => {
  if (isRefreshingProductsFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_PRODUCT_READ_SYNC_RESULT };
  }

  isRefreshingProductsFromPostgres = true;
  try {
    const aggregate = { ...EMPTY_PRODUCT_READ_SYNC_RESULT };
    let updatedAfter = await getLatestLocalProductUpdatedAt();

    while (true) {
      const remoteProducts = await productPostgresAdapter.list({
        updatedAfter,
        limit: PRODUCT_REFRESH_LIMIT,
      });
      const result = await mergeRemoteProductsIntoDexie(remoteProducts);
      addProductReadSyncResult(aggregate, result);

      if (remoteProducts.length < PRODUCT_REFRESH_LIMIT) {
        break;
      }

      const nextUpdatedAfter = getLatestRemoteProductUpdatedAt(remoteProducts);
      if (!nextUpdatedAfter || nextUpdatedAfter === updatedAfter) {
        break;
      }

      updatedAfter = nextUpdatedAfter;
    }

    return aggregate;
  } catch (error) {
    if (isPostgresUnavailableError(error)) {
      return { ...EMPTY_PRODUCT_READ_SYNC_RESULT };
    }

    throw error;
  } finally {
    isRefreshingProductsFromPostgres = false;
  }
};
