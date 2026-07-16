import { db } from '@/lib/db';
import {
  isTauriRuntime,
  paymentMethodPostgresAdapter,
  type RemotePaymentMethodDto,
} from '@/services/postgresAdapter';
import type { PaymentMethodMaster } from '@/types';

export interface PaymentMethodReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

const EMPTY_RESULT: PaymentMethodReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
};

let isRefreshingPaymentMethodsFromPostgres = false;

const mapRemotePaymentMethodToLocal = (
  remote: RemotePaymentMethodDto,
  syncedAt: string,
): PaymentMethodMaster => ({
  id: remote.id,
  code: remote.code,
  name: remote.name,
  category: remote.category,
  posting_account_id: remote.posting_account_id ?? undefined,
  posting_account_code: remote.posting_account_code ?? undefined,
  posting_account_name: remote.posting_account_name ?? undefined,
  requires_reference: remote.requires_reference,
  is_system: remote.is_system,
  is_active: remote.deleted_at ? false : remote.is_active,
  sort_order: remote.sort_order,
  created_at: remote.created_at,
  updated_at: remote.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remote.updated_at,
});

const hasLocalUnsyncedChanges = (method: PaymentMethodMaster) => (
  method.sync_status === 'pending' || method.sync_status === 'failed'
);

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const shouldApplyRemote = (
  local: PaymentMethodMaster | undefined,
  remote: RemotePaymentMethodDto,
) => {
  if (!local) return true;
  if (hasLocalUnsyncedChanges(local)) return false;
  const localUpdatedAt = local.remote_updated_at ?? local.updated_at;
  const remoteTimestamp = toTimestamp(remote.updated_at);
  const localTimestamp = toTimestamp(localUpdatedAt);
  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }
  return remote.updated_at >= localUpdatedAt;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

export const mergeRemotePaymentMethodsIntoDexie = async (
  remoteMethods: RemotePaymentMethodDto[],
  syncedAt = new Date().toISOString(),
): Promise<PaymentMethodReadSyncResult> => {
  const result: PaymentMethodReadSyncResult = {
    ...EMPTY_RESULT,
    fetched: remoteMethods.length,
  };
  if (remoteMethods.length === 0) return result;

  const methodsToPut: PaymentMethodMaster[] = [];
  await db.transaction('rw', db.paymentMethods, async () => {
    for (const remote of remoteMethods) {
      const local = await db.paymentMethods.get(remote.id);
      if (!shouldApplyRemote(local, remote)) {
        result.skipped += 1;
        continue;
      }
      methodsToPut.push(mapRemotePaymentMethodToLocal(remote, syncedAt));
      if (local) result.updated += 1;
      else result.inserted += 1;
    }
    if (methodsToPut.length > 0) {
      await db.paymentMethods.bulkPut(methodsToPut);
    }
  });
  return result;
};

export const refreshPaymentMethodsFromPostgres = async (): Promise<PaymentMethodReadSyncResult> => {
  if (isRefreshingPaymentMethodsFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_RESULT };
  }
  isRefreshingPaymentMethodsFromPostgres = true;
  try {
    const remoteMethods = await paymentMethodPostgresAdapter.list();
    return mergeRemotePaymentMethodsIntoDexie(remoteMethods);
  } finally {
    isRefreshingPaymentMethodsFromPostgres = false;
  }
};
