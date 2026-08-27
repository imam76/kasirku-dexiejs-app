import { db } from '@/lib/db';
import {
  isPostgresUnavailableError,
  isTauriRuntime,
  lotteryPostgresAdapter,
  type RemoteLotteryDto,
} from '@/services/postgresAdapter';
import { toTimestamp } from '@/services/shared/remoteRefreshCursor';
import { pullStoredUpdatedAtIdPages } from '@/services/shared/syncCursorStore';
import type { Lottery } from '@/types';
import { toCanonicalIsoTimestamp, toCanonicalOptionalIsoTimestamp } from '@/utils/timestamps';

export interface LotteryReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

const EMPTY_LOTTERY_READ_SYNC_RESULT: LotteryReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
};

const LOTTERY_REFRESH_LIMIT = 500;

let isRefreshingLotteriesFromPostgres = false;

const mapRemoteLotteryToLocal = (
  remoteLottery: RemoteLotteryDto,
  syncedAt: string,
): Lottery => ({
  id: remoteLottery.id,
  name: remoteLottery.name,
  min_total: remoteLottery.min_total,
  max_total: remoteLottery.max_total ?? undefined,
  start_at: toCanonicalOptionalIsoTimestamp(remoteLottery.start_at),
  end_at: toCanonicalOptionalIsoTimestamp(remoteLottery.end_at),
  active: remoteLottery.active,
  created_by: remoteLottery.created_by ?? undefined,
  created_at: toCanonicalIsoTimestamp(remoteLottery.created_at),
  updated_at: toCanonicalIsoTimestamp(remoteLottery.updated_at),
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: toCanonicalIsoTimestamp(remoteLottery.updated_at),
});

const hasLocalUnsyncedChanges = (lottery: Lottery) => (
  lottery.sync_status === 'pending' || lottery.sync_status === 'failed'
);

const shouldApplyRemoteLottery = (
  localLottery: Lottery | undefined,
  remoteLottery: RemoteLotteryDto,
) => {
  if (!localLottery) return true;
  if (hasLocalUnsyncedChanges(localLottery)) return false;

  const localRemoteUpdatedAt = localLottery.remote_updated_at ?? localLottery.updated_at;
  const remoteTimestamp = toTimestamp(remoteLottery.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteLottery.updated_at >= localRemoteUpdatedAt;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

export const mergeRemoteLotteriesIntoDexie = async (
  remoteLotteries: RemoteLotteryDto[],
  syncedAt = new Date().toISOString(),
): Promise<LotteryReadSyncResult> => {
  const result: LotteryReadSyncResult = {
    ...EMPTY_LOTTERY_READ_SYNC_RESULT,
    fetched: remoteLotteries.length,
  };
  if (remoteLotteries.length === 0) return result;

  const lotteriesToPut: Lottery[] = [];

  await db.transaction('rw', db.lotteries, async () => {
    for (const remoteLottery of remoteLotteries) {
      const localLottery = await db.lotteries.get(remoteLottery.id);
      if (!shouldApplyRemoteLottery(localLottery, remoteLottery)) {
        result.skipped += 1;
        continue;
      }

      lotteriesToPut.push(mapRemoteLotteryToLocal(remoteLottery, syncedAt));
      if (localLottery) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }

    if (lotteriesToPut.length > 0) {
      await db.lotteries.bulkPut(lotteriesToPut);
    }
  });

  return result;
};

const addLotteryReadSyncResult = (
  aggregate: LotteryReadSyncResult,
  next: LotteryReadSyncResult,
) => {
  aggregate.fetched += next.fetched;
  aggregate.inserted += next.inserted;
  aggregate.updated += next.updated;
  aggregate.skipped += next.skipped;
};

export const refreshLotteriesFromPostgres = async (): Promise<LotteryReadSyncResult> => {
  if (isRefreshingLotteriesFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_LOTTERY_READ_SYNC_RESULT };
  }

  isRefreshingLotteriesFromPostgres = true;
  try {
    const aggregate = { ...EMPTY_LOTTERY_READ_SYNC_RESULT };
    await pullStoredUpdatedAtIdPages({
      entity: 'lotteries',
      pageSize: LOTTERY_REFRESH_LIMIT,
      loadPage: (cursor) => lotteryPostgresAdapter.list({
        updatedAfter: cursor?.updatedAt,
        cursorId: cursor?.id,
        limit: LOTTERY_REFRESH_LIMIT,
      }),
      mergePage: async (remoteLotteries) => {
        addLotteryReadSyncResult(aggregate, await mergeRemoteLotteriesIntoDexie(remoteLotteries));
      },
      getUpdatedAt: (lottery) => lottery.updated_at,
      getId: (lottery) => lottery.id,
    });

    return aggregate;
  } catch (error) {
    if (isPostgresUnavailableError(error)) {
      return { ...EMPTY_LOTTERY_READ_SYNC_RESULT };
    }

    throw error;
  } finally {
    isRefreshingLotteriesFromPostgres = false;
  }
};
