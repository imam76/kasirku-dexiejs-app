import { db } from '@/lib/db';
import { isTauriRuntime, taxPostgresAdapter, type RemoteTaxDto } from '@/services/postgresAdapter';
import type { Tax, TaxCalculationMode, TaxRateType } from '@/types';

export interface TaxReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

const EMPTY_TAX_READ_SYNC_RESULT: TaxReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
};

let isRefreshingTaxesFromPostgres = false;

const isTaxRateType = (rateType: string): rateType is TaxRateType => (
  rateType === 'PERCENTAGE'
);

const isTaxCalculationMode = (calculationMode: string): calculationMode is TaxCalculationMode => (
  calculationMode === 'EXCLUSIVE' || calculationMode === 'INCLUSIVE'
);

const mapRemoteTaxToLocal = (
  remoteTax: RemoteTaxDto,
  syncedAt: string,
): Tax => ({
  id: remoteTax.id,
  name: remoteTax.name,
  code: remoteTax.code ?? undefined,
  rate: remoteTax.rate,
  rate_type: isTaxRateType(remoteTax.rate_type) ? remoteTax.rate_type : 'PERCENTAGE',
  calculation_mode: isTaxCalculationMode(remoteTax.calculation_mode) ? remoteTax.calculation_mode : 'EXCLUSIVE',
  description: remoteTax.description ?? undefined,
  effective_from: remoteTax.effective_from ?? undefined,
  effective_to: remoteTax.effective_to ?? undefined,
  is_default: remoteTax.deleted_at ? false : remoteTax.is_default,
  is_active: remoteTax.deleted_at ? false : remoteTax.is_active,
  created_at: remoteTax.created_at,
  updated_at: remoteTax.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteTax.updated_at,
});

const hasLocalUnsyncedChanges = (tax: Tax) => (
  tax.sync_status === 'pending' || tax.sync_status === 'failed'
);

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const shouldApplyRemoteTax = (
  localTax: Tax | undefined,
  remoteTax: RemoteTaxDto,
) => {
  if (!localTax) return true;
  if (hasLocalUnsyncedChanges(localTax)) return false;

  const localRemoteUpdatedAt = localTax.remote_updated_at ?? localTax.updated_at;
  const remoteTimestamp = toTimestamp(remoteTax.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteTax.updated_at >= localRemoteUpdatedAt;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

export const mergeRemoteTaxesIntoDexie = async (
  remoteTaxes: RemoteTaxDto[],
  syncedAt = new Date().toISOString(),
): Promise<TaxReadSyncResult> => {
  const result: TaxReadSyncResult = {
    ...EMPTY_TAX_READ_SYNC_RESULT,
    fetched: remoteTaxes.length,
  };
  if (remoteTaxes.length === 0) return result;

  const taxesToPut: Tax[] = [];

  await db.transaction('rw', db.taxes, async () => {
    for (const remoteTax of remoteTaxes) {
      const localTax = await db.taxes.get(remoteTax.id);
      if (!shouldApplyRemoteTax(localTax, remoteTax)) {
        result.skipped += 1;
        continue;
      }

      taxesToPut.push(mapRemoteTaxToLocal(remoteTax, syncedAt));
      if (localTax) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }

    if (taxesToPut.length > 0) {
      await db.taxes.bulkPut(taxesToPut);
    }
  });

  return result;
};

export const refreshTaxesFromPostgres = async (): Promise<TaxReadSyncResult> => {
  if (isRefreshingTaxesFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_TAX_READ_SYNC_RESULT };
  }

  isRefreshingTaxesFromPostgres = true;
  try {
    const remoteTaxes = await taxPostgresAdapter.list();
    return mergeRemoteTaxesIntoDexie(remoteTaxes);
  } finally {
    isRefreshingTaxesFromPostgres = false;
  }
};
