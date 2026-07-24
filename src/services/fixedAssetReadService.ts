import { db } from '@/lib/db';
import {
  fixedAssetDepreciationRunPostgresAdapter,
  fixedAssetPostgresAdapter,
  isTauriRuntime,
  type RemoteFixedAssetDepreciationRunBundleDto,
  type RemoteFixedAssetDto,
} from '@/services/postgresAdapter';
import type { FixedAsset, FixedAssetDepreciationRun } from '@/types';

export interface FixedAssetReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

const emptyResult = (): FixedAssetReadSyncResult => ({ fetched: 0, inserted: 0, updated: 0, skipped: 0 });
const hasPending = (record: { sync_status?: string }) => record.sync_status === 'pending' || record.sync_status === 'failed';
const shouldApply = (
  local: { version: number; updated_at: string; remote_updated_at?: string; sync_status?: string } | undefined,
  remote: { version: number; updated_at: string },
) => {
  if (!local) return true;
  if (hasPending(local)) return false;
  if (remote.version !== local.version) return remote.version > local.version;
  return remote.updated_at >= (local.remote_updated_at ?? local.updated_at);
};

const withAssetSync = (remote: RemoteFixedAssetDto, syncedAt: string): FixedAsset => ({
  ...remote,
  location: remote.location ?? undefined,
  description: remote.description ?? undefined,
  opening_balance_date: remote.opening_balance_date ?? undefined,
  opening_remaining_useful_life_months: remote.opening_remaining_useful_life_months ?? undefined,
  department_id: remote.department_id ?? undefined,
  department_code: remote.department_code ?? undefined,
  department_name: remote.department_name ?? undefined,
  project_id: remote.project_id ?? undefined,
  project_code: remote.project_code ?? undefined,
  project_name: remote.project_name ?? undefined,
  created_by: remote.created_by ?? undefined,
  created_by_name: remote.created_by_name ?? undefined,
  updated_by: remote.updated_by ?? undefined,
  updated_by_name: remote.updated_by_name ?? undefined,
  deleted_at: remote.deleted_at ?? undefined,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remote.updated_at,
});

const withRunSync = (
  remote: RemoteFixedAssetDepreciationRunBundleDto['run'],
  syncedAt: string,
): FixedAssetDepreciationRun => ({
  ...remote,
  journal_entry_id: remote.journal_entry_id ?? undefined,
  reversal_journal_entry_id: remote.reversal_journal_entry_id ?? undefined,
  reversal_reason: remote.reversal_reason ?? undefined,
  notes: remote.notes ?? undefined,
  created_by: remote.created_by ?? undefined,
  created_by_name: remote.created_by_name ?? undefined,
  posted_by: remote.posted_by ?? undefined,
  posted_by_name: remote.posted_by_name ?? undefined,
  posted_at: remote.posted_at ?? undefined,
  reversed_by: remote.reversed_by ?? undefined,
  reversed_by_name: remote.reversed_by_name ?? undefined,
  reversed_at: remote.reversed_at ?? undefined,
  deleted_at: remote.deleted_at ?? undefined,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remote.updated_at,
});

export const mergeRemoteFixedAssetsIntoDexie = async (
  remoteAssets: RemoteFixedAssetDto[],
  syncedAt = new Date().toISOString(),
) => {
  const result = { ...emptyResult(), fetched: remoteAssets.length };
  await db.transaction('rw', db.fixedAssets, async () => {
    for (const remote of remoteAssets) {
      const local = await db.fixedAssets.get(remote.id);
      if (!shouldApply(local, remote)) {
        result.skipped += 1;
        continue;
      }
      await db.fixedAssets.put(withAssetSync(remote, syncedAt));
      if (local) result.updated += 1;
      else result.inserted += 1;
    }
  });
  return result;
};

export const mergeRemoteFixedAssetRunBundlesIntoDexie = async (
  bundles: RemoteFixedAssetDepreciationRunBundleDto[],
  syncedAt = new Date().toISOString(),
) => {
  const result = { ...emptyResult(), fetched: bundles.length };
  await db.transaction('rw', [db.fixedAssetDepreciationRuns, db.fixedAssetDepreciationRunLines], async () => {
    for (const bundle of bundles) {
      const local = await db.fixedAssetDepreciationRuns.get(bundle.run.id);
      if (!shouldApply(local, bundle.run)) {
        result.skipped += 1;
        continue;
      }
      await db.fixedAssetDepreciationRuns.put(withRunSync(bundle.run, syncedAt));
      await db.fixedAssetDepreciationRunLines.where('run_id').equals(bundle.run.id).delete();
      if (bundle.lines.length > 0) await db.fixedAssetDepreciationRunLines.bulkPut(bundle.lines);
      if (local) result.updated += 1;
      else result.inserted += 1;
    }
  });
  return result;
};

const canRefresh = () => isTauriRuntime() && (typeof navigator === 'undefined' || navigator.onLine);

export const refreshFixedAssetsFromPostgres = async () => {
  if (!canRefresh()) return emptyResult();
  return mergeRemoteFixedAssetsIntoDexie(await fixedAssetPostgresAdapter.list());
};

export const refreshFixedAssetRunsFromPostgres = async () => {
  if (!canRefresh()) return emptyResult();
  return mergeRemoteFixedAssetRunBundlesIntoDexie(await fixedAssetDepreciationRunPostgresAdapter.list());
};
