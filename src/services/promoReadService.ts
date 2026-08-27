import { db } from '@/lib/db';
import {
  isPostgresUnavailableError,
  isTauriRuntime,
  promoPostgresAdapter,
  type RemotePromoDto,
} from '@/services/postgresAdapter';
import { toTimestamp } from '@/services/shared/remoteRefreshCursor';
import { pullStoredUpdatedAtIdPages } from '@/services/shared/syncCursorStore';
import type { Promo, PromoAppliesTo, PromoType, ProductCategory } from '@/types';
import { toCanonicalIsoTimestamp, toCanonicalOptionalIsoTimestamp } from '@/utils/timestamps';

export interface PromoReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

const EMPTY_PROMO_READ_SYNC_RESULT: PromoReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
};

const PROMO_REFRESH_LIMIT = 500;

let isRefreshingPromosFromPostgres = false;

const VALID_PROMO_TYPES: PromoType[] = ['percent', 'fixed'];
const VALID_PROMO_APPLIES_TO: PromoAppliesTo[] = ['all', 'product', 'category'];

const isPromoType = (type: string): type is PromoType => (
  VALID_PROMO_TYPES.includes(type as PromoType)
);

const isPromoAppliesTo = (appliesTo: string): appliesTo is PromoAppliesTo => (
  VALID_PROMO_APPLIES_TO.includes(appliesTo as PromoAppliesTo)
);

const mapRemotePromoToLocal = (
  remotePromo: RemotePromoDto,
  syncedAt: string,
): Promo => ({
  id: remotePromo.id,
  name: remotePromo.name,
  type: isPromoType(remotePromo.type) ? remotePromo.type : 'fixed',
  value: remotePromo.value,
  applies_to: isPromoAppliesTo(remotePromo.applies_to) ? remotePromo.applies_to : 'all',
  product_ids: remotePromo.product_ids ?? undefined,
  categories: (remotePromo.categories as ProductCategory[] | null) ?? undefined,
  start_at: toCanonicalOptionalIsoTimestamp(remotePromo.start_at),
  end_at: toCanonicalOptionalIsoTimestamp(remotePromo.end_at),
  min_qty: remotePromo.min_qty ?? undefined,
  min_total: remotePromo.min_total ?? undefined,
  voucher_code: remotePromo.voucher_code ?? undefined,
  active: remotePromo.active,
  priority: remotePromo.priority,
  created_by: remotePromo.created_by ?? undefined,
  created_at: toCanonicalIsoTimestamp(remotePromo.created_at),
  updated_at: toCanonicalIsoTimestamp(remotePromo.updated_at),
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: toCanonicalIsoTimestamp(remotePromo.updated_at),
});

const hasLocalUnsyncedChanges = (promo: Promo) => (
  promo.sync_status === 'pending' || promo.sync_status === 'failed'
);

const shouldApplyRemotePromo = (
  localPromo: Promo | undefined,
  remotePromo: RemotePromoDto,
) => {
  if (!localPromo) return true;
  if (hasLocalUnsyncedChanges(localPromo)) return false;

  const localRemoteUpdatedAt = localPromo.remote_updated_at ?? localPromo.updated_at;
  const remoteTimestamp = toTimestamp(remotePromo.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remotePromo.updated_at >= localRemoteUpdatedAt;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

export const mergeRemotePromosIntoDexie = async (
  remotePromos: RemotePromoDto[],
  syncedAt = new Date().toISOString(),
): Promise<PromoReadSyncResult> => {
  const result: PromoReadSyncResult = {
    ...EMPTY_PROMO_READ_SYNC_RESULT,
    fetched: remotePromos.length,
  };
  if (remotePromos.length === 0) return result;

  const promosToPut: Promo[] = [];

  await db.transaction('rw', db.promos, async () => {
    for (const remotePromo of remotePromos) {
      const localPromo = await db.promos.get(remotePromo.id);
      if (!shouldApplyRemotePromo(localPromo, remotePromo)) {
        result.skipped += 1;
        continue;
      }

      promosToPut.push(mapRemotePromoToLocal(remotePromo, syncedAt));
      if (localPromo) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }

    if (promosToPut.length > 0) {
      await db.promos.bulkPut(promosToPut);
    }
  });

  return result;
};

const addPromoReadSyncResult = (
  aggregate: PromoReadSyncResult,
  next: PromoReadSyncResult,
) => {
  aggregate.fetched += next.fetched;
  aggregate.inserted += next.inserted;
  aggregate.updated += next.updated;
  aggregate.skipped += next.skipped;
};

export const refreshPromosFromPostgres = async (): Promise<PromoReadSyncResult> => {
  if (isRefreshingPromosFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_PROMO_READ_SYNC_RESULT };
  }

  isRefreshingPromosFromPostgres = true;
  try {
    const aggregate = { ...EMPTY_PROMO_READ_SYNC_RESULT };
    await pullStoredUpdatedAtIdPages({
      entity: 'promos',
      pageSize: PROMO_REFRESH_LIMIT,
      loadPage: (cursor) => promoPostgresAdapter.list({
        updatedAfter: cursor?.updatedAt,
        cursorId: cursor?.id,
        limit: PROMO_REFRESH_LIMIT,
      }),
      mergePage: async (remotePromos) => {
        addPromoReadSyncResult(aggregate, await mergeRemotePromosIntoDexie(remotePromos));
      },
      getUpdatedAt: (promo) => promo.updated_at,
      getId: (promo) => promo.id,
    });

    return aggregate;
  } catch (error) {
    if (isPostgresUnavailableError(error)) {
      return { ...EMPTY_PROMO_READ_SYNC_RESULT };
    }

    throw error;
  } finally {
    isRefreshingPromosFromPostgres = false;
  }
};
