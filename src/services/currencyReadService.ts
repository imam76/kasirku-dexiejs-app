import { db } from '@/lib/db';
import { getBaseCurrencyCode } from '@/services/baseCurrencyService';
import {
  currencyPostgresAdapter,
  currencyRatePostgresAdapter,
  isTauriRuntime,
  type RemoteCurrencyDto,
  type RemoteCurrencyRateDto,
} from '@/services/postgresAdapter';
import type { Currency, CurrencyRate, CurrencyRateSource } from '@/types';

export interface CurrencyReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

const EMPTY_READ_SYNC_RESULT: CurrencyReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
};

let isRefreshingCurrenciesFromPostgres = false;
let isRefreshingCurrencyRatesFromPostgres = false;

const mapRemoteCurrencyToLocal = (
  remoteCurrency: RemoteCurrencyDto,
  syncedAt: string,
): Currency => ({
  id: remoteCurrency.id,
  code: remoteCurrency.code,
  name: remoteCurrency.name,
  symbol: remoteCurrency.symbol ?? undefined,
  decimal_places: remoteCurrency.decimal_places,
  is_base: remoteCurrency.is_base,
  is_active: remoteCurrency.deleted_at ? false : remoteCurrency.is_active,
  created_at: remoteCurrency.created_at,
  updated_at: remoteCurrency.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteCurrency.updated_at,
});

const isCurrencyRateSource = (source: string): source is CurrencyRateSource => (
  source === 'BI_KURS_TRANSAKSI' || source === 'MANUAL' || source === 'SYSTEM'
);

const mapRemoteCurrencyRateToLocal = (
  remoteRate: RemoteCurrencyRateDto,
  syncedAt: string,
): CurrencyRate => ({
  id: remoteRate.id,
  currency_code: remoteRate.currency_code,
  base_currency_code: remoteRate.base_currency_code,
  rate_date: remoteRate.rate_date,
  source: isCurrencyRateSource(remoteRate.source) ? remoteRate.source : 'MANUAL',
  unit_amount: remoteRate.unit_amount,
  bi_buy_rate: remoteRate.bi_buy_rate ?? undefined,
  bi_sell_rate: remoteRate.bi_sell_rate ?? undefined,
  middle_rate: remoteRate.middle_rate,
  fetched_at: remoteRate.fetched_at ?? undefined,
  created_at: remoteRate.created_at,
  updated_at: remoteRate.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteRate.updated_at,
});

const hasLocalUnsyncedChanges = (record: { sync_status?: string }) => (
  record.sync_status === 'pending' || record.sync_status === 'failed'
);

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const shouldApplyRemote = (
  localRecord: { updated_at: string; remote_updated_at?: string; sync_status?: string } | undefined,
  remoteUpdatedAt: string,
) => {
  if (!localRecord) return true;
  if (hasLocalUnsyncedChanges(localRecord)) return false;

  const localRemoteUpdatedAt = localRecord.remote_updated_at ?? localRecord.updated_at;
  const remoteTimestamp = toTimestamp(remoteUpdatedAt);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteUpdatedAt >= localRemoteUpdatedAt;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

export const mergeRemoteCurrenciesIntoDexie = async (
  remoteCurrencies: RemoteCurrencyDto[],
  syncedAt = new Date().toISOString(),
): Promise<CurrencyReadSyncResult> => {
  const result: CurrencyReadSyncResult = {
    ...EMPTY_READ_SYNC_RESULT,
    fetched: remoteCurrencies.length,
  };
  if (remoteCurrencies.length === 0) return result;

  const currenciesToPut: Currency[] = [];

  await db.transaction('rw', db.currencies, async () => {
    for (const remoteCurrency of remoteCurrencies) {
      const localCurrency = await db.currencies.get(remoteCurrency.id);
      if (!shouldApplyRemote(localCurrency, remoteCurrency.updated_at)) {
        result.skipped += 1;
        continue;
      }

      currenciesToPut.push(mapRemoteCurrencyToLocal(remoteCurrency, syncedAt));
      if (localCurrency) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }

    if (currenciesToPut.length > 0) {
      await db.currencies.bulkPut(currenciesToPut);
    }
  });

  return result;
};

export const mergeRemoteCurrencyRatesIntoDexie = async (
  remoteRates: RemoteCurrencyRateDto[],
  syncedAt = new Date().toISOString(),
): Promise<CurrencyReadSyncResult> => {
  const result: CurrencyReadSyncResult = {
    ...EMPTY_READ_SYNC_RESULT,
    fetched: remoteRates.length,
  };
  if (remoteRates.length === 0) return result;

  const ratesToPut: CurrencyRate[] = [];

  await db.transaction('rw', db.currencyRates, async () => {
    for (const remoteRate of remoteRates) {
      const localRate = await db.currencyRates.get(remoteRate.id);
      if (!shouldApplyRemote(localRate, remoteRate.updated_at)) {
        result.skipped += 1;
        continue;
      }

      ratesToPut.push(mapRemoteCurrencyRateToLocal(remoteRate, syncedAt));
      if (localRate) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }

    if (ratesToPut.length > 0) {
      await db.currencyRates.bulkPut(ratesToPut);
    }
  });

  return result;
};

export const refreshCurrenciesFromPostgres = async (): Promise<CurrencyReadSyncResult> => {
  if (isRefreshingCurrenciesFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_READ_SYNC_RESULT };
  }

  isRefreshingCurrenciesFromPostgres = true;
  try {
    const remoteCurrencies = await currencyPostgresAdapter.list();
    return mergeRemoteCurrenciesIntoDexie(remoteCurrencies);
  } finally {
    isRefreshingCurrenciesFromPostgres = false;
  }
};

export const refreshCurrencyRatesFromPostgres = async (): Promise<CurrencyReadSyncResult> => {
  if (isRefreshingCurrencyRatesFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_READ_SYNC_RESULT };
  }

  isRefreshingCurrencyRatesFromPostgres = true;
  try {
    const remoteRates = await currencyRatePostgresAdapter.list({ baseCurrencyCode: await getBaseCurrencyCode() });
    return mergeRemoteCurrencyRatesIntoDexie(remoteRates);
  } finally {
    isRefreshingCurrencyRatesFromPostgres = false;
  }
};
