import { db } from '@/lib/db';
import {
  isTauriRuntime,
  posStockDiscrepancyPostgresAdapter,
  type RemotePosStockDiscrepancyDto,
} from '@/services/postgresAdapter';
import { pullStoredUpdatedAtIdPages } from '@/services/shared/syncCursorStore';
import type { PosStockDiscrepancy } from '@/types';
import { toCanonicalIsoTimestamp, toCanonicalOptionalIsoTimestamp } from '@/utils/timestamps';

const toLocal = (
  remote: RemotePosStockDiscrepancyDto,
  syncedAt: string,
): PosStockDiscrepancy => ({
  ...remote,
  cashier_session_id: remote.cashier_session_id ?? undefined,
  restaurant_session_id: remote.restaurant_session_id ?? undefined,
  sku: remote.sku ?? undefined,
  cashier_note: remote.cashier_note ?? undefined,
  cashier_user_id: remote.cashier_user_id ?? undefined,
  cashier_user_name: remote.cashier_user_name ?? undefined,
  device_id: remote.device_id ?? undefined,
  device_name: remote.device_name ?? undefined,
  reviewed_by: remote.reviewed_by ?? undefined,
  reviewed_by_name: remote.reviewed_by_name ?? undefined,
  reviewed_at: toCanonicalOptionalIsoTimestamp(remote.reviewed_at),
  investigation_cause: remote.investigation_cause ?? undefined,
  investigation_note: remote.investigation_note ?? undefined,
  stock_opname_id: remote.stock_opname_id ?? undefined,
  created_at: toCanonicalIsoTimestamp(remote.created_at),
  updated_at: toCanonicalIsoTimestamp(remote.updated_at),
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: toCanonicalIsoTimestamp(remote.updated_at),
});

export const mergeRemotePosStockDiscrepanciesIntoDexie = async (
  remotes: RemotePosStockDiscrepancyDto[],
  syncedAt = new Date().toISOString(),
) => {
  let merged = 0;
  for (const remote of remotes) {
    const local = await db.posStockDiscrepancies.get(remote.id);
    const hasNewerPendingLocal = (local?.sync_status === 'pending' || local?.sync_status === 'failed')
      && local.updated_at > remote.updated_at;
    if (hasNewerPendingLocal) continue;
    await db.posStockDiscrepancies.put(toLocal(remote, syncedAt));
    merged += 1;
  }
  return merged;
};

export const refreshPosStockDiscrepanciesFromPostgres = async () => {
  if (!isTauriRuntime()) return 0;
  let merged = 0;
  await pullStoredUpdatedAtIdPages({
    entity: 'posStockDiscrepancies',
    pageSize: 1000,
    loadPage: (cursor) => posStockDiscrepancyPostgresAdapter.list({
      updatedAfter: cursor?.updatedAt,
      cursorId: cursor?.id,
      limit: 1000,
    }),
    mergePage: async (remoteRows) => {
      merged += await mergeRemotePosStockDiscrepanciesIntoDexie(remoteRows);
    },
    getUpdatedAt: (row) => row.updated_at,
    getId: (row) => row.id,
  });
  return merged;
};
