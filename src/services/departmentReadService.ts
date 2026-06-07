import { db } from '@/lib/db';
import { departmentPostgresAdapter, isTauriRuntime, type RemoteDepartmentDto } from '@/services/postgresAdapter';
import type { Department } from '@/types';

export interface DepartmentReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

const EMPTY_DEPARTMENT_READ_SYNC_RESULT: DepartmentReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
};

let isRefreshingDepartmentsFromPostgres = false;

const mapRemoteDepartmentToLocal = (
  remoteDepartment: RemoteDepartmentDto,
  syncedAt: string,
): Department => ({
  id: remoteDepartment.id,
  name: remoteDepartment.name,
  code: remoteDepartment.code ?? undefined,
  description: remoteDepartment.description ?? undefined,
  is_active: remoteDepartment.deleted_at ? false : remoteDepartment.is_active,
  created_at: remoteDepartment.created_at,
  updated_at: remoteDepartment.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteDepartment.updated_at,
});

const hasLocalUnsyncedChanges = (department: Department) => (
  department.sync_status === 'pending' || department.sync_status === 'failed'
);

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const shouldApplyRemoteDepartment = (
  localDepartment: Department | undefined,
  remoteDepartment: RemoteDepartmentDto,
) => {
  if (!localDepartment) return true;
  if (hasLocalUnsyncedChanges(localDepartment)) return false;

  const localRemoteUpdatedAt = localDepartment.remote_updated_at ?? localDepartment.updated_at;
  const remoteTimestamp = toTimestamp(remoteDepartment.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteDepartment.updated_at >= localRemoteUpdatedAt;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

export const mergeRemoteDepartmentsIntoDexie = async (
  remoteDepartments: RemoteDepartmentDto[],
  syncedAt = new Date().toISOString(),
): Promise<DepartmentReadSyncResult> => {
  const result: DepartmentReadSyncResult = {
    ...EMPTY_DEPARTMENT_READ_SYNC_RESULT,
    fetched: remoteDepartments.length,
  };
  if (remoteDepartments.length === 0) return result;

  const departmentsToPut: Department[] = [];

  await db.transaction('rw', db.departments, async () => {
    for (const remoteDepartment of remoteDepartments) {
      const localDepartment = await db.departments.get(remoteDepartment.id);
      if (!shouldApplyRemoteDepartment(localDepartment, remoteDepartment)) {
        result.skipped += 1;
        continue;
      }

      departmentsToPut.push(mapRemoteDepartmentToLocal(remoteDepartment, syncedAt));
      if (localDepartment) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }

    if (departmentsToPut.length > 0) {
      await db.departments.bulkPut(departmentsToPut);
    }
  });

  return result;
};

export const refreshDepartmentsFromPostgres = async (): Promise<DepartmentReadSyncResult> => {
  if (isRefreshingDepartmentsFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_DEPARTMENT_READ_SYNC_RESULT };
  }

  isRefreshingDepartmentsFromPostgres = true;
  try {
    const remoteDepartments = await departmentPostgresAdapter.list();
    return mergeRemoteDepartmentsIntoDexie(remoteDepartments);
  } finally {
    isRefreshingDepartmentsFromPostgres = false;
  }
};
