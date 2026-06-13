import { db } from '@/lib/db';
import {
  isTauriRuntime,
  stockOpnamePostgresAdapter,
  type RemoteStockOpnameBundleDto,
  type RemoteStockOpnameDto,
  type RemoteStockOpnameItemDto,
} from '@/services/postgresAdapter';
import type { Product, StockOpname, StockOpnameItem, StockOpnameStatus } from '@/types';
import { calculateStockOpnameSummary } from '@/utils/stockOpname/calculateStockOpnameVariance';

export interface StockOpnameReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

const EMPTY_STOCK_OPNAME_READ_SYNC_RESULT: StockOpnameReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
};

const VALID_STOCK_OPNAME_STATUSES: StockOpnameStatus[] = ['DRAFT', 'REVIEWED', 'POSTED', 'CANCELLED'];
const POSTGRES_STOCK_OPNAME_REFRESH_LIMIT = 200;

let isRefreshingStockOpnamesFromPostgres = false;

export interface StockOpnameListFilters {
  status?: StockOpnameStatus | 'ALL';
  searchText?: string;
  startDate?: string;
  endDate?: string;
}

export interface StockOpnameCandidateFilters {
  searchText?: string;
  category?: string;
  productIds?: string[];
}

export interface StockOpnameDetailReadResult {
  opname: StockOpname;
  items: StockOpnameItem[];
}

const optionalString = (value: string | null | undefined) => value ?? undefined;
const optionalNumber = (value: number | null | undefined) => (
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
);

const isStockOpnameStatus = (status: string): status is StockOpnameStatus => (
  VALID_STOCK_OPNAME_STATUSES.includes(status as StockOpnameStatus)
);

const matchesDateRange = (value: string, startDate?: string, endDate?: string) => {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;

  if (startDate && time < new Date(startDate).getTime()) return false;
  if (endDate && time > new Date(endDate).getTime()) return false;
  return true;
};

const mapRemoteStockOpnameToLocal = (
  remoteOpname: RemoteStockOpnameDto,
  syncedAt: string,
): StockOpname => ({
  id: remoteOpname.id,
  opname_number: remoteOpname.opname_number,
  status: isStockOpnameStatus(remoteOpname.status) ? remoteOpname.status : 'DRAFT',
  counted_at: remoteOpname.counted_at,
  reviewed_at: optionalString(remoteOpname.reviewed_at),
  posted_at: optionalString(remoteOpname.posted_at),
  cancelled_at: optionalString(remoteOpname.cancelled_at),
  warehouse_id: optionalString(remoteOpname.warehouse_id),
  warehouse_code: optionalString(remoteOpname.warehouse_code),
  warehouse_name: optionalString(remoteOpname.warehouse_name),
  notes: optionalString(remoteOpname.notes),
  created_by: optionalString(remoteOpname.created_by),
  created_by_name: optionalString(remoteOpname.created_by_name),
  reviewed_by: optionalString(remoteOpname.reviewed_by),
  reviewed_by_name: optionalString(remoteOpname.reviewed_by_name),
  posted_by: optionalString(remoteOpname.posted_by),
  posted_by_name: optionalString(remoteOpname.posted_by_name),
  cancelled_by: optionalString(remoteOpname.cancelled_by),
  cancelled_by_name: optionalString(remoteOpname.cancelled_by_name),
  cancel_reason: optionalString(remoteOpname.cancel_reason),
  total_items: remoteOpname.total_items,
  total_adjustment_in: remoteOpname.total_adjustment_in,
  total_adjustment_out: remoteOpname.total_adjustment_out,
  total_variance_value: remoteOpname.total_variance_value,
  created_at: remoteOpname.created_at,
  updated_at: remoteOpname.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteOpname.updated_at,
});

const mapRemoteStockOpnameItemToLocal = (
  remoteItem: RemoteStockOpnameItemDto,
): StockOpnameItem => ({
  id: remoteItem.id,
  opname_id: remoteItem.opname_id,
  product_id: remoteItem.product_id,
  product_name: remoteItem.product_name,
  sku: optionalString(remoteItem.sku),
  category: optionalString(remoteItem.category),
  system_quantity: remoteItem.system_quantity,
  counted_quantity: optionalNumber(remoteItem.counted_quantity),
  quantity_delta: remoteItem.quantity_delta,
  unit: remoteItem.unit,
  cost_per_unit: remoteItem.cost_per_unit,
  variance_value: remoteItem.variance_value,
  notes: optionalString(remoteItem.notes),
  created_at: remoteItem.created_at,
  updated_at: remoteItem.updated_at,
});

const hasLocalUnsyncedChanges = (opname: StockOpname) => (
  opname.sync_status === 'pending' || opname.sync_status === 'failed'
);

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const getLaterUpdatedAt = (current: string | undefined, candidate: string | undefined) => {
  if (!candidate) return current;
  if (!current) return candidate;

  const currentTimestamp = toTimestamp(current);
  const candidateTimestamp = toTimestamp(candidate);

  if (currentTimestamp !== null && candidateTimestamp !== null) {
    return candidateTimestamp > currentTimestamp ? candidate : current;
  }

  return candidate > current ? candidate : current;
};

const getLatestLocalRemoteUpdatedAt = async () => {
  const opnames = await db.stockOpnames.toArray();

  return opnames.reduce<string | undefined>((latest, opname) => {
    const remoteUpdatedAt = opname.remote_updated_at
      ?? (opname.sync_status === 'synced' ? opname.updated_at : undefined);
    return getLaterUpdatedAt(latest, remoteUpdatedAt);
  }, undefined);
};

const getLatestRemoteBundleUpdatedAt = (remoteBundles: RemoteStockOpnameBundleDto[]) => (
  remoteBundles.reduce<string | undefined>(
    (latest, bundle) => getLaterUpdatedAt(latest, bundle.opname.updated_at),
    undefined,
  )
);

const addStockOpnameReadSyncResult = (
  aggregate: StockOpnameReadSyncResult,
  next: StockOpnameReadSyncResult,
) => {
  aggregate.fetched += next.fetched;
  aggregate.inserted += next.inserted;
  aggregate.updated += next.updated;
  aggregate.skipped += next.skipped;
};

const shouldApplyRemoteStockOpname = (
  localOpname: StockOpname | undefined,
  remoteOpname: RemoteStockOpnameDto,
) => {
  if (!localOpname) return true;
  if (hasLocalUnsyncedChanges(localOpname)) return false;

  const localRemoteUpdatedAt = localOpname.remote_updated_at ?? localOpname.updated_at;
  const remoteTimestamp = toTimestamp(remoteOpname.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteOpname.updated_at >= localRemoteUpdatedAt;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

export const listStockOpnames = async (
  filters: StockOpnameListFilters = {},
): Promise<StockOpname[]> => {
  const query = filters.searchText?.trim().toLowerCase();
  const opnames = await db.stockOpnames.toArray();

  return opnames
    .filter((opname) => {
      const matchesStatus = !filters.status || filters.status === 'ALL' || opname.status === filters.status;
      const matchesSearch = !query || [
        opname.opname_number,
        opname.notes,
        opname.warehouse_code,
        opname.warehouse_name,
        opname.created_by_name,
      ].some((value) => value?.toLowerCase().includes(query));
      const matchesDate = matchesDateRange(opname.counted_at, filters.startDate, filters.endDate);

      return matchesStatus && matchesSearch && matchesDate;
    })
    .sort((left, right) => right.counted_at.localeCompare(left.counted_at));
};

export const getStockOpnameDetail = async (
  id: string,
): Promise<StockOpnameDetailReadResult | null> => {
  const opname = await db.stockOpnames.get(id);
  if (!opname) return null;

  const items = await db.stockOpnameItems
    .where('opname_id')
    .equals(id)
    .toArray();

  items.sort((left, right) => left.product_name.localeCompare(right.product_name));

  return {
    opname,
    items,
  };
};

export const getStockOpnameCandidates = async (
  filters: StockOpnameCandidateFilters = {},
): Promise<Product[]> => {
  const query = filters.searchText?.trim().toLowerCase();
  const category = filters.category?.trim();
  const selectedProductIds = filters.productIds?.length ? new Set(filters.productIds) : null;
  const products = await db.products.orderBy('name').toArray();

  return products.filter((product) => {
    const matchesProductIds = !selectedProductIds || selectedProductIds.has(product.id);
    const matchesCategory = !category || product.category === category;
    const matchesSearch = !query || [
      product.name,
      product.sku,
      product.category,
    ].some((value) => value?.toLowerCase().includes(query));

    return matchesProductIds && matchesCategory && matchesSearch;
  });
};

export const getStockOpnameSummary = async (id: string) => {
  const items = await db.stockOpnameItems.where('opname_id').equals(id).toArray();
  return calculateStockOpnameSummary(items);
};

export const mergeRemoteStockOpnameBundlesIntoDexie = async (
  remoteBundles: RemoteStockOpnameBundleDto[],
  syncedAt = new Date().toISOString(),
): Promise<StockOpnameReadSyncResult> => {
  const result: StockOpnameReadSyncResult = {
    ...EMPTY_STOCK_OPNAME_READ_SYNC_RESULT,
    fetched: remoteBundles.length,
  };
  if (remoteBundles.length === 0) return result;

  await db.transaction('rw', db.stockOpnames, db.stockOpnameItems, async () => {
    for (const remoteBundle of remoteBundles) {
      const localOpname = await db.stockOpnames.get(remoteBundle.opname.id);
      if (!shouldApplyRemoteStockOpname(localOpname, remoteBundle.opname)) {
        result.skipped += 1;
        continue;
      }

      await db.stockOpnames.put(mapRemoteStockOpnameToLocal(remoteBundle.opname, syncedAt));
      await db.stockOpnameItems.where('opname_id').equals(remoteBundle.opname.id).delete();
      const localItems = remoteBundle.items.map(mapRemoteStockOpnameItemToLocal);
      if (localItems.length > 0) {
        await db.stockOpnameItems.bulkPut(localItems);
      }

      if (localOpname) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }
  });

  return result;
};

export const refreshStockOpnamesFromPostgres = async (): Promise<StockOpnameReadSyncResult> => {
  if (isRefreshingStockOpnamesFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_STOCK_OPNAME_READ_SYNC_RESULT };
  }

  isRefreshingStockOpnamesFromPostgres = true;
  try {
    const aggregate = { ...EMPTY_STOCK_OPNAME_READ_SYNC_RESULT };
    let updatedAfter = await getLatestLocalRemoteUpdatedAt();

    while (true) {
      const remoteBundles = await stockOpnamePostgresAdapter.list({
        updatedAfter,
        limit: POSTGRES_STOCK_OPNAME_REFRESH_LIMIT,
      });
      const result = await mergeRemoteStockOpnameBundlesIntoDexie(remoteBundles);
      addStockOpnameReadSyncResult(aggregate, result);

      if (remoteBundles.length < POSTGRES_STOCK_OPNAME_REFRESH_LIMIT) {
        break;
      }

      const nextUpdatedAfter = getLatestRemoteBundleUpdatedAt(remoteBundles);
      if (!nextUpdatedAfter || nextUpdatedAfter === updatedAfter) {
        break;
      }

      updatedAfter = nextUpdatedAfter;
    }

    return aggregate;
  } finally {
    isRefreshingStockOpnamesFromPostgres = false;
  }
};
