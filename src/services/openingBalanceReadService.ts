import { db } from '@/lib/db';
import {
  isPostgresUnavailableError,
  isTauriRuntime,
  openingBalancePostgresAdapter,
  type RemoteOpeningBalanceBatchDto,
  type RemoteOpeningBalanceBundleDto,
  type RemoteOpeningBalanceLineDto,
} from '@/services/postgresAdapter';
import { toTimestamp } from '@/services/shared/remoteRefreshCursor';
import { pullStoredUpdatedAtIdPages } from '@/services/shared/syncCursorStore';
import type {
  InventoryLot,
  OpeningBalanceBatch,
  OpeningBalanceBatchStatus,
  OpeningBalanceLine,
  OpeningBalanceLineSettlementStatus,
  OpeningBalanceModule,
} from '@/types';

export interface OpeningBalanceReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  deleted: number;
  skipped: number;
}

const EMPTY_OPENING_BALANCE_READ_SYNC_RESULT: OpeningBalanceReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  deleted: 0,
  skipped: 0,
};

const VALID_OPENING_BALANCE_MODULES: OpeningBalanceModule[] = [
  'ACCOUNT',
  'RECEIVABLE',
  'PAYABLE',
  'ADVANCE_RECEIVED',
  'ADVANCE_PAID',
  'INVENTORY',
];
const VALID_OPENING_BALANCE_BATCH_STATUSES: OpeningBalanceBatchStatus[] = [
  'DRAFT',
  'VALIDATED',
  'POSTED',
  'LOCKED',
  'REVERSED',
  'SKIPPED',
  'VOIDED',
];
const VALID_OPENING_BALANCE_LINE_SETTLEMENT_STATUSES: OpeningBalanceLineSettlementStatus[] = [
  'OPEN',
  'PARTIAL',
  'PAID',
  'VOIDED',
];
const POSTGRES_OPENING_BALANCE_REFRESH_LIMIT = 200;

let isRefreshingOpeningBalancesFromPostgres = false;

const optionalString = (value: string | null | undefined) => value ?? undefined;
const optionalNumber = (value: number | null | undefined) => (
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
);
const numberOrZero = (value: number | null | undefined) => (
  typeof value === 'number' && Number.isFinite(value) ? value : 0
);
const toPositiveVersion = (version: number | null | undefined) => (
  typeof version === 'number' && Number.isFinite(version) && version > 0 ? version : 1
);
const isOpeningBalanceModule = (module: string): module is OpeningBalanceModule => (
  VALID_OPENING_BALANCE_MODULES.includes(module as OpeningBalanceModule)
);
const isOpeningBalanceBatchStatus = (status: string): status is OpeningBalanceBatchStatus => (
  VALID_OPENING_BALANCE_BATCH_STATUSES.includes(status as OpeningBalanceBatchStatus)
);
const isOpeningBalanceLineSettlementStatus = (
  status: string | null | undefined,
): status is OpeningBalanceLineSettlementStatus => (
  Boolean(status && VALID_OPENING_BALANCE_LINE_SETTLEMENT_STATUSES.includes(status as OpeningBalanceLineSettlementStatus))
);

const mapRemoteOpeningBalanceBatchToLocal = (
  remoteBatch: RemoteOpeningBalanceBatchDto,
  syncedAt: string,
): OpeningBalanceBatch => ({
  id: remoteBatch.id,
  batch_number: optionalString(remoteBatch.batch_number),
  company_id: optionalString(remoteBatch.company_id),
  company_name: optionalString(remoteBatch.company_name),
  module: isOpeningBalanceModule(remoteBatch.module) ? remoteBatch.module : 'ACCOUNT',
  cutoff_date: remoteBatch.cutoff_date,
  accounting_start_date: optionalString(remoteBatch.accounting_start_date),
  status: isOpeningBalanceBatchStatus(remoteBatch.status) ? remoteBatch.status : 'DRAFT',
  revision_number: toPositiveVersion(remoteBatch.revision_number),
  previous_batch_id: optionalString(remoteBatch.previous_batch_id),
  total_debit: numberOrZero(remoteBatch.total_debit),
  total_credit: numberOrZero(remoteBatch.total_credit),
  journal_entry_id: optionalString(remoteBatch.journal_entry_id),
  posting_idempotency_key: optionalString(remoteBatch.posting_idempotency_key),
  posted_at: optionalString(remoteBatch.posted_at),
  posted_by: optionalString(remoteBatch.posted_by),
  posted_by_name: optionalString(remoteBatch.posted_by_name),
  locked_at: optionalString(remoteBatch.locked_at),
  reversed_at: optionalString(remoteBatch.reversed_at),
  reversed_by: optionalString(remoteBatch.reversed_by),
  reversed_by_name: optionalString(remoteBatch.reversed_by_name),
  reversal_journal_entry_id: optionalString(remoteBatch.reversal_journal_entry_id),
  skipped_at: optionalString(remoteBatch.skipped_at),
  validated_at: optionalString(remoteBatch.validated_at),
  validated_by: optionalString(remoteBatch.validated_by),
  validated_by_name: optionalString(remoteBatch.validated_by_name),
  notes: optionalString(remoteBatch.notes),
  version: toPositiveVersion(remoteBatch.version),
  created_by: optionalString(remoteBatch.created_by),
  created_by_name: optionalString(remoteBatch.created_by_name),
  updated_by: optionalString(remoteBatch.updated_by),
  updated_by_name: optionalString(remoteBatch.updated_by_name),
  created_at: remoteBatch.created_at,
  updated_at: remoteBatch.updated_at,
  deleted_at: optionalString(remoteBatch.deleted_at),
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteBatch.updated_at,
});

const mapRemoteOpeningBalanceLineToLocal = (
  remoteLine: RemoteOpeningBalanceLineDto,
  syncedAt: string,
): OpeningBalanceLine => ({
  id: remoteLine.id,
  batch_id: remoteLine.batch_id,
  module: isOpeningBalanceModule(remoteLine.module) ? remoteLine.module : 'ACCOUNT',
  line_number: Math.trunc(numberOrZero(remoteLine.line_number)),
  product_id: optionalString(remoteLine.product_id),
  product_sku: optionalString(remoteLine.product_sku),
  product_name: optionalString(remoteLine.product_name),
  quantity: optionalNumber(remoteLine.quantity),
  unit: optionalString(remoteLine.unit),
  unit_cost: optionalNumber(remoteLine.unit_cost),
  inventory_lot_id: optionalString(remoteLine.inventory_lot_id),
  contact_id: optionalString(remoteLine.contact_id),
  party_name: optionalString(remoteLine.party_name),
  document_number: optionalString(remoteLine.document_number),
  document_date: optionalString(remoteLine.document_date),
  due_date: optionalString(remoteLine.due_date),
  currency_code: optionalString(remoteLine.currency_code),
  currency_name: optionalString(remoteLine.currency_name),
  currency_symbol: optionalString(remoteLine.currency_symbol),
  base_currency_code: optionalString(remoteLine.base_currency_code),
  fx_rate: optionalNumber(remoteLine.fx_rate),
  amount: optionalNumber(remoteLine.amount),
  base_amount: numberOrZero(remoteLine.base_amount),
  paid_amount: optionalNumber(remoteLine.paid_amount),
  remaining_amount: optionalNumber(remoteLine.remaining_amount),
  settlement_status: isOpeningBalanceLineSettlementStatus(remoteLine.settlement_status)
    ? remoteLine.settlement_status
    : undefined,
  last_paid_at: optionalString(remoteLine.last_paid_at),
  account_id: optionalString(remoteLine.account_id),
  account_code: optionalString(remoteLine.account_code),
  account_name: optionalString(remoteLine.account_name),
  counter_account_id: optionalString(remoteLine.counter_account_id),
  counter_account_code: optionalString(remoteLine.counter_account_code),
  counter_account_name: optionalString(remoteLine.counter_account_name),
  debit: numberOrZero(remoteLine.debit),
  credit: numberOrZero(remoteLine.credit),
  notes: optionalString(remoteLine.notes),
  created_at: remoteLine.created_at,
  updated_at: remoteLine.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteLine.updated_at,
});

const hasLocalUnsyncedBatchChanges = (batch: OpeningBalanceBatch | undefined) => (
  batch?.sync_status === 'pending' || batch?.sync_status === 'failed'
);

const addOpeningBalanceReadSyncResult = (
  aggregate: OpeningBalanceReadSyncResult,
  next: OpeningBalanceReadSyncResult,
) => {
  aggregate.fetched += next.fetched;
  aggregate.inserted += next.inserted;
  aggregate.updated += next.updated;
  aggregate.deleted += next.deleted;
  aggregate.skipped += next.skipped;
};

const shouldApplyRemoteOpeningBalanceBatch = (
  localBatch: OpeningBalanceBatch | undefined,
  remoteBatch: RemoteOpeningBalanceBatchDto,
) => {
  if (!localBatch) return true;
  if (hasLocalUnsyncedBatchChanges(localBatch)) return false;

  const localVersion = toPositiveVersion(localBatch.version);
  const remoteVersion = toPositiveVersion(remoteBatch.version);
  if (remoteVersion !== localVersion) {
    return remoteVersion > localVersion;
  }

  const localRemoteUpdatedAt = localBatch.remote_updated_at ?? localBatch.updated_at;
  const remoteTimestamp = toTimestamp(remoteBatch.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteBatch.updated_at >= localRemoteUpdatedAt;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

const restoreInventoryOpeningLots = async (
  batch: OpeningBalanceBatch,
  lines: OpeningBalanceLine[],
  syncedAt: string,
) => {
  if (
    batch.module !== 'INVENTORY'
    || (batch.status !== 'POSTED' && batch.status !== 'LOCKED')
  ) {
    return;
  }

  const [existingLots, consumptions] = await Promise.all([
    db.inventoryLots.toArray(),
    db.inventoryLotConsumptions.toArray(),
  ]);
  const existingLotIds = new Set(existingLots.map((lot) => lot.id));
  const lotsByProductId = new Map<string, InventoryLot[]>();
  const consumedProductIds = new Set(
    consumptions.map((consumption) => consumption.product_id),
  );
  for (const lot of existingLots) {
    const productLots = lotsByProductId.get(lot.product_id) ?? [];
    productLots.push(lot);
    lotsByProductId.set(lot.product_id, productLots);
  }

  const lotsToPut = new Map<string, InventoryLot>();
  for (const line of lines) {
    const productId = line.product_id;
    const quantity = numberOrZero(line.quantity);
    const unitCost = numberOrZero(line.unit_cost);
    if (!productId || !line.product_name || quantity <= 0 || unitCost < 0) continue;

    const lotId = line.inventory_lot_id ?? `${batch.id}:lot:${productId}`;
    if (existingLotIds.has(lotId) || lotsToPut.has(lotId)) continue;
    const productLots = lotsByProductId.get(productId) ?? [];

    // A fresh device has no lots yet. A migrated device can have legacy OPENING
    // lots; replace those only while they have never been consumed. Operational
    // lots are deliberately left untouched to avoid rewriting FIFO history.
    if (
      consumedProductIds.has(productId)
      || productLots.some((lot) => lot.source_type !== 'OPENING')
    ) {
      continue;
    }
    for (const lot of productLots) {
      lotsToPut.set(lot.id, {
        ...lot,
        quantity_remaining: 0,
        updated_at: syncedAt,
      });
    }

    const receivedAt = batch.cutoff_date.includes('T')
      ? batch.cutoff_date
      : `${batch.cutoff_date.slice(0, 10)}T23:59:59.999`;
    const lot: InventoryLot = {
      id: lotId,
      product_id: productId,
      product_name: line.product_name,
      sku: line.product_sku,
      source_type: 'OPENING',
      source_id: batch.id,
      source_line_id: line.id,
      quantity_received: quantity,
      quantity_remaining: quantity,
      cost_per_unit: unitCost,
      cost_status: 'FINAL',
      final_cost_per_unit: unitCost,
      cost_finalized_at: batch.posted_at ?? syncedAt,
      received_at: receivedAt,
      created_at: line.created_at || syncedAt,
      updated_at: syncedAt,
    };
    lotsToPut.set(lot.id, lot);
  }

  if (lotsToPut.size > 0) {
    await db.inventoryLots.bulkPut([...lotsToPut.values()]);
  }
};

export const mergeRemoteOpeningBalanceBundlesIntoDexie = async (
  remoteBundles: RemoteOpeningBalanceBundleDto[],
  syncedAt = new Date().toISOString(),
): Promise<OpeningBalanceReadSyncResult> => {
  const result: OpeningBalanceReadSyncResult = {
    ...EMPTY_OPENING_BALANCE_READ_SYNC_RESULT,
    fetched: remoteBundles.length,
  };
  if (remoteBundles.length === 0) return result;

  await db.transaction(
    'rw',
    [
      db.openingBalanceBatches,
      db.openingBalanceLines,
      db.inventoryLots,
      db.inventoryLotConsumptions,
    ],
    async () => {
      for (const remoteBundle of remoteBundles) {
        const localBatch = await db.openingBalanceBatches.get(remoteBundle.batch.id);
        if (!shouldApplyRemoteOpeningBalanceBatch(localBatch, remoteBundle.batch)) {
          result.skipped += 1;
          continue;
        }

        if (remoteBundle.batch.deleted_at) {
          if (localBatch) {
            await db.openingBalanceBatches.delete(remoteBundle.batch.id);
            await db.openingBalanceLines.where('batch_id').equals(remoteBundle.batch.id).delete();
            result.deleted += 1;
          } else {
            result.skipped += 1;
          }
          continue;
        }

        const localMappedBatch = mapRemoteOpeningBalanceBatchToLocal(remoteBundle.batch, syncedAt);
        await db.openingBalanceBatches.put(localMappedBatch);
        await db.openingBalanceLines.where('batch_id').equals(remoteBundle.batch.id).delete();
        const localLines = remoteBundle.lines.map((line) => mapRemoteOpeningBalanceLineToLocal(line, syncedAt));
        if (localLines.length > 0) {
          await db.openingBalanceLines.bulkPut(localLines);
        }
        await restoreInventoryOpeningLots(localMappedBatch, localLines, syncedAt);

        if (localBatch) {
          result.updated += 1;
        } else {
          result.inserted += 1;
        }
      }
    },
  );

  return result;
};

export const refreshOpeningBalancesFromPostgres = async (): Promise<OpeningBalanceReadSyncResult> => {
  if (isRefreshingOpeningBalancesFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_OPENING_BALANCE_READ_SYNC_RESULT };
  }

  isRefreshingOpeningBalancesFromPostgres = true;
  try {
    const aggregate = { ...EMPTY_OPENING_BALANCE_READ_SYNC_RESULT };

    await pullStoredUpdatedAtIdPages({
      entity: 'openingBalanceBatches',
      pageSize: POSTGRES_OPENING_BALANCE_REFRESH_LIMIT,
      loadPage: (cursor) => openingBalancePostgresAdapter.list({
        updatedAfter: cursor?.updatedAt,
        cursorId: cursor?.id,
        limit: POSTGRES_OPENING_BALANCE_REFRESH_LIMIT,
      }),
      mergePage: async (remoteBundles) => {
        addOpeningBalanceReadSyncResult(
          aggregate,
          await mergeRemoteOpeningBalanceBundlesIntoDexie(remoteBundles),
        );
      },
      getUpdatedAt: (bundle) => bundle.batch.updated_at,
      getId: (bundle) => bundle.batch.id,
    });

    return aggregate;
  } catch (error) {
    if (isPostgresUnavailableError(error)) {
      return { ...EMPTY_OPENING_BALANCE_READ_SYNC_RESULT };
    }

    throw error;
  } finally {
    isRefreshingOpeningBalancesFromPostgres = false;
  }
};
