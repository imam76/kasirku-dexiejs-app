import { db } from '@/lib/db';
import {
  employeeSalaryComponentPostgresAdapter,
  employmentContractPostgresAdapter,
  hrPositionPostgresAdapter,
  isTauriRuntime,
  salaryComponentPostgresAdapter,
  type PostgresListOptions,
  type RemoteEmployeeSalaryComponentDto,
  type RemoteEmploymentContractDto,
  type RemoteHrPositionDto,
  type RemoteSalaryComponentDto,
} from '@/services/postgresAdapter';
import { pullStoredUpdatedAtIdPages } from '@/services/shared/syncCursorStore';
import type {
  EmployeeSalaryComponent,
  EmploymentContract,
  HrPosition,
  SalaryComponent,
} from '@/types';
import { toCanonicalIsoTimestamp } from '@/utils/timestamps';

const HR_REFRESH_LIMIT = 500;

export interface HrReadResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

export interface HrReadSummary {
  positions: HrReadResult;
  contracts: HrReadResult;
  salaryComponents: HrReadResult;
  employeeSalaryComponents: HrReadResult;
}

const emptyResult = (): HrReadResult => ({ fetched: 0, inserted: 0, updated: 0, skipped: 0 });

const shouldApplyRemote = (
  local: { updated_at: string; remote_updated_at?: string; sync_status?: string } | undefined,
  remoteUpdatedAt: string,
) => {
  if (!local) return true;
  if (local.sync_status === 'pending' || local.sync_status === 'failed') return false;
  return remoteUpdatedAt >= (local.remote_updated_at ?? local.updated_at);
};

const withoutRemoteMetadata = <T extends { created_at: string; updated_at: string; deleted_at?: string | null }>(remote: T) => {
  const record = { ...remote };
  delete record.deleted_at;
  record.created_at = toCanonicalIsoTimestamp(record.created_at);
  record.updated_at = toCanonicalIsoTimestamp(record.updated_at);
  return record;
};

const mergeCollection = async <
  TLocal extends { id: string; created_at: string; updated_at: string; sync_status?: string; remote_updated_at?: string },
  TRemote extends TLocal & { deleted_at?: string | null },
>(
  remotes: TRemote[],
  getLocal: (id: string) => Promise<TLocal | undefined>,
  putLocal: (record: TLocal) => Promise<unknown>,
  syncedAt: string,
) => {
  const result = { ...emptyResult(), fetched: remotes.length };
  for (const remote of remotes) {
    const local = await getLocal(remote.id);
    if (!shouldApplyRemote(local, remote.updated_at)) {
      result.skipped += 1;
      continue;
    }
    await putLocal({
      ...withoutRemoteMetadata(remote),
      sync_status: 'synced',
      sync_error: undefined,
      last_synced_at: syncedAt,
      remote_updated_at: toCanonicalIsoTimestamp(remote.updated_at),
    } as unknown as TLocal);
    if (local) result.updated += 1;
    else result.inserted += 1;
  }
  return result;
};

export const mergeRemoteHrDataIntoDexie = async (input: {
  positions: RemoteHrPositionDto[];
  contracts: RemoteEmploymentContractDto[];
  salaryComponents: RemoteSalaryComponentDto[];
  employeeSalaryComponents: RemoteEmployeeSalaryComponentDto[];
}, syncedAt = new Date().toISOString()): Promise<HrReadSummary> => ({
  positions: await mergeCollection<HrPosition, RemoteHrPositionDto>(
    input.positions,
    (id) => db.hrPositions.get(id),
    (record) => db.hrPositions.put(record),
    syncedAt,
  ),
  contracts: await mergeCollection<EmploymentContract, RemoteEmploymentContractDto>(
    input.contracts,
    (id) => db.employmentContracts.get(id),
    (record) => db.employmentContracts.put(record),
    syncedAt,
  ),
  salaryComponents: await mergeCollection<SalaryComponent, RemoteSalaryComponentDto>(
    input.salaryComponents,
    (id) => db.salaryComponents.get(id),
    (record) => db.salaryComponents.put(record),
    syncedAt,
  ),
  employeeSalaryComponents: await mergeCollection<EmployeeSalaryComponent, RemoteEmployeeSalaryComponentDto>(
    input.employeeSalaryComponents,
    (id) => db.employeeSalaryComponents.get(id),
    (record) => db.employeeSalaryComponents.put(record),
    syncedAt,
  ),
});

const refreshRemoteCollection = async <TRemote extends { id: string; updated_at: string }>(
  entity: string,
  listRemote: (options: PostgresListOptions) => Promise<TRemote[]>,
  mergeRemote: (page: TRemote[], syncedAt: string) => Promise<HrReadResult>,
): Promise<HrReadResult> => {
  const aggregate = emptyResult();

  await pullStoredUpdatedAtIdPages({
    entity,
    pageSize: HR_REFRESH_LIMIT,
    loadPage: (cursor) => listRemote({
      updatedAfter: cursor?.updatedAt,
      cursorId: cursor?.id,
      limit: HR_REFRESH_LIMIT,
    }),
    mergePage: async (page) => {
      const result = await mergeRemote(page, new Date().toISOString());
      aggregate.fetched += result.fetched;
      aggregate.inserted += result.inserted;
      aggregate.updated += result.updated;
      aggregate.skipped += result.skipped;
    },
    getUpdatedAt: (item) => item.updated_at,
    getId: (item) => item.id,
  });

  return aggregate;
};

let isRefreshing = false;

export const refreshHrDataFromPostgres = async (): Promise<HrReadSummary> => {
  const emptySummary = {
    positions: emptyResult(),
    contracts: emptyResult(),
    salaryComponents: emptyResult(),
    employeeSalaryComponents: emptyResult(),
  };
  if (
    isRefreshing ||
    !isTauriRuntime() ||
    (typeof navigator !== 'undefined' && !navigator.onLine)
  ) return emptySummary;

  isRefreshing = true;
  try {
    const [positions, contracts, salaryComponents, employeeSalaryComponents] = await Promise.all([
      refreshRemoteCollection('hrPositions', hrPositionPostgresAdapter.list, (page, syncedAt) => (
        mergeCollection<HrPosition, RemoteHrPositionDto>(
          page,
          (id) => db.hrPositions.get(id),
          (record) => db.hrPositions.put(record),
          syncedAt,
        )
      )),
      refreshRemoteCollection('employmentContracts', employmentContractPostgresAdapter.list, (page, syncedAt) => (
        mergeCollection<EmploymentContract, RemoteEmploymentContractDto>(
          page,
          (id) => db.employmentContracts.get(id),
          (record) => db.employmentContracts.put(record),
          syncedAt,
        )
      )),
      refreshRemoteCollection('salaryComponents', salaryComponentPostgresAdapter.list, (page, syncedAt) => (
        mergeCollection<SalaryComponent, RemoteSalaryComponentDto>(
          page,
          (id) => db.salaryComponents.get(id),
          (record) => db.salaryComponents.put(record),
          syncedAt,
        )
      )),
      refreshRemoteCollection(
        'employeeSalaryComponents',
        employeeSalaryComponentPostgresAdapter.list,
        (page, syncedAt) => mergeCollection<EmployeeSalaryComponent, RemoteEmployeeSalaryComponentDto>(
          page,
          (id) => db.employeeSalaryComponents.get(id),
          (record) => db.employeeSalaryComponents.put(record),
          syncedAt,
        ),
      ),
    ]);
    return { positions, contracts, salaryComponents, employeeSalaryComponents };
  } finally {
    isRefreshing = false;
  }
};
