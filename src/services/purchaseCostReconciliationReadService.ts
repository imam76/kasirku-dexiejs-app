import { db } from '@/lib/db';
import {
  isTauriRuntime,
  purchaseCostReconciliationPostgresAdapter,
  type RemotePurchaseCostReconciliationBundleDto,
  type RemotePurchaseCostReconciliationDto,
  type RemotePurchaseCostReconciliationItemDto,
} from '@/services/postgresAdapter';
import type { PurchaseCostReconciliation, PurchaseCostReconciliationItem } from '@/types';

export interface PurchaseCostReconciliationReadSyncResult {
  fetched: number;
  inserted: number;
}

const EMPTY_PURCHASE_COST_RECONCILIATION_READ_SYNC_RESULT: PurchaseCostReconciliationReadSyncResult = {
  fetched: 0,
  inserted: 0,
};

const PURCHASE_COST_RECONCILIATION_REFRESH_LIMIT = 500;

let isRefreshingPurchaseCostReconciliationsFromPostgres = false;

const optionalString = (value: string | null | undefined) => value ?? undefined;

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

const mapRemotePurchaseCostReconciliationToLocal = (
  remote: RemotePurchaseCostReconciliationDto,
): PurchaseCostReconciliation => ({
  id: remote.id,
  purchase_document_id: remote.purchase_document_id,
  purchase_document_number: remote.purchase_document_number,
  supplier_invoice_number: optionalString(remote.supplier_invoice_number),
  supplier_invoice_date: optionalString(remote.supplier_invoice_date),
  additional_cost_treatment: remote.additional_cost_treatment as PurchaseCostReconciliation['additional_cost_treatment'],
  additional_cost_amount: remote.additional_cost_amount,
  supplier_discount_amount: remote.supplier_discount_amount,
  supplier_tax_amount: remote.supplier_tax_amount,
  total_estimated_cost: remote.total_estimated_cost,
  total_final_cost: remote.total_final_cost,
  total_variance_amount: remote.total_variance_amount,
  sold_cost_variance_amount: remote.sold_cost_variance_amount,
  remaining_stock_variance_amount: remote.remaining_stock_variance_amount,
  notes: optionalString(remote.notes),
  created_by: optionalString(remote.created_by),
  created_by_name: optionalString(remote.created_by_name),
  created_at: remote.created_at,
});

const mapRemotePurchaseCostReconciliationItemToLocal = (
  remote: RemotePurchaseCostReconciliationItemDto,
): PurchaseCostReconciliationItem => ({
  id: remote.id,
  reconciliation_id: remote.reconciliation_id,
  purchase_document_item_id: remote.purchase_document_item_id,
  product_id: remote.product_id,
  product_name: remote.product_name,
  received_quantity: remote.received_quantity,
  invoiced_quantity: remote.invoiced_quantity,
  quantity_variance: remote.quantity_variance,
  sold_quantity_at_reconciliation: remote.sold_quantity_at_reconciliation,
  remaining_quantity_at_reconciliation: remote.remaining_quantity_at_reconciliation,
  estimated_price: remote.estimated_price,
  final_price: remote.final_price,
  additional_cost_allocation: remote.additional_cost_allocation,
  supplier_discount_allocation: remote.supplier_discount_allocation,
  supplier_tax_allocation: remote.supplier_tax_allocation,
  final_landed_cost_per_unit: remote.final_landed_cost_per_unit,
  variance_per_unit: remote.variance_per_unit,
  sold_cost_variance_amount: remote.sold_cost_variance_amount,
  remaining_stock_variance_amount: remote.remaining_stock_variance_amount,
  created_at: remote.created_at,
});

/**
 * Both tables are append-only and rows are immutable once created (see
 * purchase_cost_reconciliation_repository.rs), so merging never needs conflict checks against
 * local edits - a plain id-keyed bulkPut is safe and idempotent, same rationale as
 * stockMutationReadService.ts.
 */
export const mergeRemotePurchaseCostReconciliationBundlesIntoDexie = async (
  remoteBundles: RemotePurchaseCostReconciliationBundleDto[],
): Promise<PurchaseCostReconciliationReadSyncResult> => {
  const result = {
    ...EMPTY_PURCHASE_COST_RECONCILIATION_READ_SYNC_RESULT,
    fetched: remoteBundles.length,
  };
  if (remoteBundles.length === 0) return result;

  const existingIds = new Set(
    await db.purchaseCostReconciliations
      .where('id')
      .anyOf(remoteBundles.map((bundle) => bundle.reconciliation.id))
      .primaryKeys(),
  );
  const reconciliationsToPut = remoteBundles.map((bundle) => mapRemotePurchaseCostReconciliationToLocal(bundle.reconciliation));
  const itemsToPut = remoteBundles.flatMap((bundle) => bundle.items.map(mapRemotePurchaseCostReconciliationItemToLocal));
  result.inserted = reconciliationsToPut.filter((reconciliation) => !existingIds.has(reconciliation.id)).length;

  await db.transaction('rw', db.purchaseCostReconciliations, db.purchaseCostReconciliationItems, async () => {
    await db.purchaseCostReconciliations.bulkPut(reconciliationsToPut);
    if (itemsToPut.length > 0) {
      await db.purchaseCostReconciliationItems.bulkPut(itemsToPut);
    }
  });

  return result;
};

const PURCHASE_COST_RECONCILIATION_CURSOR_ENTITY = 'purchaseCostReconciliations';

interface PurchaseCostReconciliationCursor {
  serverCreatedAt: string;
  id: string;
}

/**
 * The pull cursor is stored separately from the entity's own rows (db.syncCursors), not derived
 * from MAX(created_at) of local data. created_at is client-supplied business time and can be
 * pushed to the server long after it was set on an offline device - deriving the cursor from it
 * lets a delayed push get silently skipped once other devices' cursors have advanced past that
 * earlier timestamp. The cursor instead tracks server_created_at (server-assigned arrival order,
 * see migration 0081) paired with id to break ties when rows share the same timestamp.
 */
const getStoredPurchaseCostReconciliationCursor = async (): Promise<PurchaseCostReconciliationCursor | undefined> => {
  const stored = await db.syncCursors.get(PURCHASE_COST_RECONCILIATION_CURSOR_ENTITY);
  if (!stored) return undefined;
  return { serverCreatedAt: stored.cursor_value, id: stored.cursor_id };
};

const setStoredPurchaseCostReconciliationCursor = async (cursor: PurchaseCostReconciliationCursor) => {
  await db.syncCursors.put({
    entity: PURCHASE_COST_RECONCILIATION_CURSOR_ENTITY,
    cursor_value: cursor.serverCreatedAt,
    cursor_id: cursor.id,
  });
};

export const refreshPurchaseCostReconciliationsFromPostgres = async (): Promise<PurchaseCostReconciliationReadSyncResult> => {
  if (isRefreshingPurchaseCostReconciliationsFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_PURCHASE_COST_RECONCILIATION_READ_SYNC_RESULT };
  }

  isRefreshingPurchaseCostReconciliationsFromPostgres = true;
  try {
    const aggregate = { ...EMPTY_PURCHASE_COST_RECONCILIATION_READ_SYNC_RESULT };
    let cursor = await getStoredPurchaseCostReconciliationCursor();

    while (true) {
      const remoteBundles = await purchaseCostReconciliationPostgresAdapter.list({
        cursor,
        limit: PURCHASE_COST_RECONCILIATION_REFRESH_LIMIT,
      });
      if (remoteBundles.length === 0) break;

      const result = await mergeRemotePurchaseCostReconciliationBundlesIntoDexie(remoteBundles);
      aggregate.fetched += result.fetched;
      aggregate.inserted += result.inserted;

      // Bundles come back ordered by (server_created_at, id) ascending, so the last one carries
      // the furthest cursor position reached in this page.
      const lastReconciliation = remoteBundles[remoteBundles.length - 1].reconciliation;
      if (!lastReconciliation.server_created_at) break;
      cursor = { serverCreatedAt: lastReconciliation.server_created_at, id: lastReconciliation.id };
      await setStoredPurchaseCostReconciliationCursor(cursor);

      if (remoteBundles.length < PURCHASE_COST_RECONCILIATION_REFRESH_LIMIT) break;
    }

    return aggregate;
  } finally {
    isRefreshingPurchaseCostReconciliationsFromPostgres = false;
  }
};
