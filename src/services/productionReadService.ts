import { db } from '@/lib/db';
import {
  isTauriRuntime,
  productionOrderPostgresAdapter,
  type RemoteProductionOrderBundleDto,
  type RemoteProductionOrderCostDto,
  type RemoteProductionOrderDto,
  type RemoteProductionOrderItemDto,
} from '@/services/postgresAdapter';
import type {
  ProductionOrder,
  ProductionOrderCost,
  ProductionOrderItem,
  ProductionOrderStatus,
} from '@/types';

export interface ProductionOrderReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

const EMPTY_PRODUCTION_ORDER_READ_SYNC_RESULT: ProductionOrderReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
};

const VALID_PRODUCTION_ORDER_STATUSES: ProductionOrderStatus[] = ['DRAFT', 'POSTED', 'VOIDED'];
const POSTGRES_PRODUCTION_ORDER_REFRESH_LIMIT = 200;

let isRefreshingProductionOrdersFromPostgres = false;

export interface ProductionOrderListFilters {
  status?: ProductionOrderStatus | 'ALL';
  searchText?: string;
  startDate?: string;
  endDate?: string;
}

export interface ProductionOrderDetailReadResult {
  order: ProductionOrder;
  items: ProductionOrderItem[];
  costs: ProductionOrderCost[];
}

const optionalString = (value: string | null | undefined) => value ?? undefined;

const isProductionOrderStatus = (status: string): status is ProductionOrderStatus => (
  VALID_PRODUCTION_ORDER_STATUSES.includes(status as ProductionOrderStatus)
);

const matchesDateRange = (value: string, startDate?: string, endDate?: string) => {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;

  if (startDate && time < new Date(startDate).getTime()) return false;
  if (endDate && time > new Date(endDate).getTime()) return false;
  return true;
};

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

const hasLocalUnsyncedChanges = (order: ProductionOrder) => (
  order.sync_status === 'pending' || order.sync_status === 'failed'
);

const shouldApplyRemoteProductionOrder = (
  localOrder: ProductionOrder | undefined,
  remoteOrder: RemoteProductionOrderDto,
) => {
  if (!localOrder) return true;
  if (hasLocalUnsyncedChanges(localOrder)) return false;

  const localRemoteUpdatedAt = localOrder.remote_updated_at ?? localOrder.updated_at;
  const remoteTimestamp = toTimestamp(remoteOrder.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteOrder.updated_at >= localRemoteUpdatedAt;
};

const mapRemoteProductionOrderToLocal = (
  remoteOrder: RemoteProductionOrderDto,
  syncedAt: string,
): ProductionOrder => ({
  id: remoteOrder.id,
  production_number: remoteOrder.production_number,
  status: isProductionOrderStatus(remoteOrder.status) ? remoteOrder.status : 'DRAFT',
  finished_product_id: remoteOrder.finished_product_id,
  finished_product_name: remoteOrder.finished_product_name,
  quantity_produced: remoteOrder.quantity_produced,
  unit: remoteOrder.unit,
  material_cost: remoteOrder.material_cost,
  additional_cost: remoteOrder.additional_cost,
  total_cost: remoteOrder.total_cost,
  unit_cost: remoteOrder.unit_cost,
  produced_at: remoteOrder.produced_at,
  posted_at: optionalString(remoteOrder.posted_at),
  voided_at: optionalString(remoteOrder.voided_at),
  void_reason: optionalString(remoteOrder.void_reason),
  notes: optionalString(remoteOrder.notes),
  created_by: optionalString(remoteOrder.created_by),
  created_by_name: optionalString(remoteOrder.created_by_name),
  created_at: remoteOrder.created_at,
  updated_at: remoteOrder.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteOrder.updated_at,
});

const mapRemoteProductionOrderItemToLocal = (
  remoteItem: RemoteProductionOrderItemDto,
): ProductionOrderItem => ({
  id: remoteItem.id,
  production_order_id: remoteItem.production_order_id,
  material_product_id: remoteItem.material_product_id,
  material_product_name: remoteItem.material_product_name,
  sku: optionalString(remoteItem.sku),
  quantity_used: remoteItem.quantity_used,
  unit: remoteItem.unit,
  stock_quantity_used: remoteItem.stock_quantity_used,
  stock_unit: remoteItem.stock_unit,
  cost_per_unit: remoteItem.cost_per_unit,
  total_cost: remoteItem.total_cost,
  created_at: remoteItem.created_at,
  updated_at: remoteItem.updated_at,
});

const mapRemoteProductionOrderCostToLocal = (
  remoteCost: RemoteProductionOrderCostDto,
): ProductionOrderCost => ({
  id: remoteCost.id,
  production_order_id: remoteCost.production_order_id,
  name: remoteCost.name,
  amount: remoteCost.amount,
  account_id: optionalString(remoteCost.account_id),
  account_code: optionalString(remoteCost.account_code),
  account_name: optionalString(remoteCost.account_name),
  created_at: remoteCost.created_at,
  updated_at: remoteCost.updated_at,
});

const getLatestLocalRemoteUpdatedAt = async () => {
  const orders = await db.productionOrders.toArray();

  return orders.reduce<string | undefined>((latest, order) => {
    const remoteUpdatedAt = order.remote_updated_at
      ?? (order.sync_status === 'synced' ? order.updated_at : undefined);
    return getLaterUpdatedAt(latest, remoteUpdatedAt);
  }, undefined);
};

const getLatestRemoteBundleUpdatedAt = (remoteBundles: RemoteProductionOrderBundleDto[]) => (
  remoteBundles.reduce<string | undefined>(
    (latest, bundle) => getLaterUpdatedAt(latest, bundle.order.updated_at),
    undefined,
  )
);

const addProductionOrderReadSyncResult = (
  aggregate: ProductionOrderReadSyncResult,
  next: ProductionOrderReadSyncResult,
) => {
  aggregate.fetched += next.fetched;
  aggregate.inserted += next.inserted;
  aggregate.updated += next.updated;
  aggregate.skipped += next.skipped;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

export const listProductionOrders = async (
  filters: ProductionOrderListFilters = {},
): Promise<ProductionOrder[]> => {
  const query = filters.searchText?.trim().toLowerCase();
  const orders = await db.productionOrders.toArray();

  return orders
    .filter((order) => {
      const matchesStatus = !filters.status || filters.status === 'ALL' || order.status === filters.status;
      const matchesSearch = !query || [
        order.production_number,
        order.finished_product_name,
        order.notes,
        order.created_by_name,
      ].some((value) => value?.toLowerCase().includes(query));
      const matchesDate = matchesDateRange(order.produced_at, filters.startDate, filters.endDate);

      return matchesStatus && matchesSearch && matchesDate;
    })
    .sort((left, right) => right.produced_at.localeCompare(left.produced_at));
};

export const getProductionOrderDetail = async (
  id: string,
): Promise<ProductionOrderDetailReadResult | null> => {
  const order = await db.productionOrders.get(id);
  if (!order) return null;

  const [items, costs] = await Promise.all([
    db.productionOrderItems.where('production_order_id').equals(id).toArray(),
    db.productionOrderCosts.where('production_order_id').equals(id).toArray(),
  ]);

  items.sort((left, right) => left.material_product_name.localeCompare(right.material_product_name));
  costs.sort((left, right) => left.name.localeCompare(right.name));

  return {
    order,
    items,
    costs,
  };
};

export const mergeRemoteProductionOrderBundlesIntoDexie = async (
  remoteBundles: RemoteProductionOrderBundleDto[],
  syncedAt = new Date().toISOString(),
): Promise<ProductionOrderReadSyncResult> => {
  const result: ProductionOrderReadSyncResult = {
    ...EMPTY_PRODUCTION_ORDER_READ_SYNC_RESULT,
    fetched: remoteBundles.length,
  };
  if (remoteBundles.length === 0) return result;

  await db.transaction('rw', db.productionOrders, db.productionOrderItems, db.productionOrderCosts, async () => {
    for (const remoteBundle of remoteBundles) {
      const localOrder = await db.productionOrders.get(remoteBundle.order.id);
      if (!shouldApplyRemoteProductionOrder(localOrder, remoteBundle.order)) {
        result.skipped += 1;
        continue;
      }

      await db.productionOrders.put(mapRemoteProductionOrderToLocal(remoteBundle.order, syncedAt));
      await db.productionOrderItems.where('production_order_id').equals(remoteBundle.order.id).delete();
      await db.productionOrderCosts.where('production_order_id').equals(remoteBundle.order.id).delete();

      const localItems = remoteBundle.items.map(mapRemoteProductionOrderItemToLocal);
      const localCosts = remoteBundle.costs.map(mapRemoteProductionOrderCostToLocal);
      if (localItems.length > 0) {
        await db.productionOrderItems.bulkPut(localItems);
      }
      if (localCosts.length > 0) {
        await db.productionOrderCosts.bulkPut(localCosts);
      }

      if (localOrder) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }
  });

  return result;
};

export const refreshProductionOrdersFromPostgres = async (): Promise<ProductionOrderReadSyncResult> => {
  if (isRefreshingProductionOrdersFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_PRODUCTION_ORDER_READ_SYNC_RESULT };
  }

  isRefreshingProductionOrdersFromPostgres = true;
  try {
    const aggregate = { ...EMPTY_PRODUCTION_ORDER_READ_SYNC_RESULT };
    let updatedAfter = await getLatestLocalRemoteUpdatedAt();

    while (true) {
      const remoteBundles = await productionOrderPostgresAdapter.list({
        updatedAfter,
        limit: POSTGRES_PRODUCTION_ORDER_REFRESH_LIMIT,
      });
      const result = await mergeRemoteProductionOrderBundlesIntoDexie(remoteBundles);
      addProductionOrderReadSyncResult(aggregate, result);

      if (remoteBundles.length < POSTGRES_PRODUCTION_ORDER_REFRESH_LIMIT) {
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
    isRefreshingProductionOrdersFromPostgres = false;
  }
};
