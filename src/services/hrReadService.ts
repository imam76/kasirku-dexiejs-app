import { db } from '@/lib/db';
import {
  employeeSalaryComponentPostgresAdapter,
  employmentContractPostgresAdapter,
  hrPositionPostgresAdapter,
  isTauriRuntime,
  salaryComponentPostgresAdapter,
  type RemoteEmployeeSalaryComponentDto,
  type RemoteEmploymentContractDto,
  type RemoteHrPositionDto,
  type RemoteSalaryComponentDto,
} from '@/services/postgresAdapter';
import type {
  EmployeeSalaryComponent,
  EmploymentContract,
  HrPosition,
  SalaryComponent,
} from '@/types';

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

const withoutRemoteMetadata = <T extends { deleted_at?: string | null }>(remote: T) => {
  const record = { ...remote };
  delete record.deleted_at;
  return record;
};

const mergeCollection = async <
  TLocal extends { id: string; updated_at: string; sync_status?: string; remote_updated_at?: string },
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
      remote_updated_at: remote.updated_at,
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
      hrPositionPostgresAdapter.list(),
      employmentContractPostgresAdapter.list(),
      salaryComponentPostgresAdapter.list(),
      employeeSalaryComponentPostgresAdapter.list(),
    ]);
    return mergeRemoteHrDataIntoDexie({
      positions,
      contracts,
      salaryComponents,
      employeeSalaryComponents,
    });
  } finally {
    isRefreshing = false;
  }
};
