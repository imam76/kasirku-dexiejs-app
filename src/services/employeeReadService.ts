import { db } from '@/lib/db';
import {
  employeeAreaPostgresAdapter,
  employeeCollectionSchedulePostgresAdapter,
  employeePostgresAdapter,
  isTauriRuntime,
  type RemoteEmployeeAreaDto,
  type RemoteEmployeeCollectionScheduleDto,
  type RemoteEmployeeDto,
} from '@/services/postgresAdapter';
import type { ChartOfAccount, Employee, EmployeeArea, EmployeeCollectionSchedule } from '@/types';

export interface EmployeeReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

export interface EmployeeReadSyncSummary {
  employees: EmployeeReadSyncResult;
  employeeAreas: EmployeeReadSyncResult;
  collectionSchedules: EmployeeReadSyncResult;
}

const EMPTY_READ_SYNC_RESULT: EmployeeReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
};

let isRefreshingEmployeesFromPostgres = false;

const optionalString = (value: string | null | undefined) => value ?? undefined;

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const hasLocalUnsyncedChanges = (item: { sync_status?: string }) => (
  item.sync_status === 'pending' || item.sync_status === 'failed'
);

const shouldApplyRemoteUpdatedAt = (
  localItem: { sync_status?: string; updated_at: string; remote_updated_at?: string } | undefined,
  remoteUpdatedAt: string,
) => {
  if (!localItem) return true;
  if (hasLocalUnsyncedChanges(localItem)) return false;

  const localRemoteUpdatedAt = localItem.remote_updated_at ?? localItem.updated_at;
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

const mapRemoteEmployeeToLocal = (remoteEmployee: RemoteEmployeeDto, syncedAt: string): Employee => ({
  id: remoteEmployee.id,
  name: remoteEmployee.name,
  phone: optionalString(remoteEmployee.phone),
  email: optionalString(remoteEmployee.email),
  address: optionalString(remoteEmployee.address),
  position: optionalString(remoteEmployee.position),
  user_id: optionalString(remoteEmployee.user_id),
  user_name: optionalString(remoteEmployee.user_name),
  login_role_id: optionalString(remoteEmployee.login_role_id),
  field_cash_account_id: optionalString(remoteEmployee.field_cash_account_id),
  field_cash_account_code: optionalString(remoteEmployee.field_cash_account_code),
  field_cash_account_name: optionalString(remoteEmployee.field_cash_account_name),
  pin_hash: optionalString(remoteEmployee.pin_hash),
  pin_salt: optionalString(remoteEmployee.pin_salt),
  notes: optionalString(remoteEmployee.notes),
  is_active: remoteEmployee.deleted_at ? false : remoteEmployee.is_active,
  created_at: remoteEmployee.created_at,
  updated_at: remoteEmployee.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteEmployee.updated_at,
});

const mapRemoteEmployeeAreaToLocal = (remoteArea: RemoteEmployeeAreaDto, syncedAt: string): EmployeeArea => ({
  id: remoteArea.id,
  employee_id: remoteArea.employee_id,
  area_id: remoteArea.area_id,
  area_name: remoteArea.area_name,
  area_code: optionalString(remoteArea.area_code),
  created_at: remoteArea.created_at,
  updated_at: remoteArea.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteArea.updated_at,
});

const mapRemoteCollectionScheduleToLocal = (
  remoteSchedule: RemoteEmployeeCollectionScheduleDto,
  syncedAt: string,
): EmployeeCollectionSchedule => ({
  id: remoteSchedule.id,
  employee_id: remoteSchedule.employee_id,
  employee_name: remoteSchedule.employee_name,
  employee_position: optionalString(remoteSchedule.employee_position),
  area_id: remoteSchedule.area_id,
  area_name: remoteSchedule.area_name,
  area_code: optionalString(remoteSchedule.area_code),
  weekday: remoteSchedule.weekday,
  effective_from: optionalString(remoteSchedule.effective_from),
  effective_until: optionalString(remoteSchedule.effective_until),
  is_active: remoteSchedule.deleted_at ? false : remoteSchedule.is_active,
  created_at: remoteSchedule.created_at,
  updated_at: remoteSchedule.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteSchedule.updated_at,
});

const getFieldCashParentAccount = async () => (
  await db.chartOfAccounts.get('cash-and-bank')
    ?? await db.chartOfAccounts.where('code').equals('1000').first()
);

const buildFieldCashAccountFromEmployeeSnapshot = async (
  remoteEmployee: RemoteEmployeeDto,
): Promise<ChartOfAccount | undefined> => {
  const accountId = optionalString(remoteEmployee.field_cash_account_id);
  const accountCode = optionalString(remoteEmployee.field_cash_account_code);
  const accountName = optionalString(remoteEmployee.field_cash_account_name);
  if (!accountId || !accountCode || !accountName) return undefined;

  const existingAccount = await db.chartOfAccounts.get(accountId);
  if (existingAccount) return undefined;

  const conflictingCodeAccount = await db.chartOfAccounts.where('code').equals(accountCode).first();
  if (conflictingCodeAccount) return undefined;

  const parent = await getFieldCashParentAccount();
  return {
    id: accountId,
    code: accountCode,
    name: accountName,
    type: 'ASSET',
    normal_balance: 'DEBIT',
    parent_id: parent?.id,
    parent_code: parent?.code,
    parent_name: parent?.name,
    is_postable: true,
    is_system: false,
    is_active: true,
    description: `Akun kas petugas dari snapshot karyawan ${remoteEmployee.name}.`,
    created_at: remoteEmployee.created_at,
    updated_at: remoteEmployee.updated_at,
  };
};

export const mergeRemoteEmployeesIntoDexie = async (
  remoteEmployees: RemoteEmployeeDto[],
  syncedAt = new Date().toISOString(),
): Promise<EmployeeReadSyncResult> => {
  const result = { ...EMPTY_READ_SYNC_RESULT, fetched: remoteEmployees.length };
  if (remoteEmployees.length === 0) return result;

  await db.transaction('rw', [db.employees, db.chartOfAccounts], async () => {
    const employeesToPut: Employee[] = [];
    const accountsToPut: ChartOfAccount[] = [];
    const accountIdsToPut = new Set<string>();
    const accountCodesToPut = new Set<string>();

    for (const remoteEmployee of remoteEmployees) {
      const localEmployee = await db.employees.get(remoteEmployee.id);
      if (!shouldApplyRemoteUpdatedAt(localEmployee, remoteEmployee.updated_at)) {
        result.skipped += 1;
        continue;
      }

      employeesToPut.push(mapRemoteEmployeeToLocal(remoteEmployee, syncedAt));
      const fieldCashAccount = await buildFieldCashAccountFromEmployeeSnapshot(remoteEmployee);
      if (
        fieldCashAccount &&
        !accountIdsToPut.has(fieldCashAccount.id) &&
        !accountCodesToPut.has(fieldCashAccount.code)
      ) {
        accountsToPut.push(fieldCashAccount);
        accountIdsToPut.add(fieldCashAccount.id);
        accountCodesToPut.add(fieldCashAccount.code);
      }
      if (localEmployee) result.updated += 1;
      else result.inserted += 1;
    }

    if (employeesToPut.length > 0) {
      await db.employees.bulkPut(employeesToPut);
    }
    if (accountsToPut.length > 0) {
      await db.chartOfAccounts.bulkPut(accountsToPut);
    }
  });

  return result;
};

export const mergeRemoteEmployeeAreasIntoDexie = async (
  remoteAreas: RemoteEmployeeAreaDto[],
  syncedAt = new Date().toISOString(),
): Promise<EmployeeReadSyncResult> => {
  const result = { ...EMPTY_READ_SYNC_RESULT, fetched: remoteAreas.length };
  if (remoteAreas.length === 0) return result;

  await db.transaction('rw', db.employeeAreas, async () => {
    const areasToPut: EmployeeArea[] = [];

    for (const remoteArea of remoteAreas) {
      const localArea = await db.employeeAreas.get(remoteArea.id);
      if (!shouldApplyRemoteUpdatedAt(localArea, remoteArea.updated_at)) {
        result.skipped += 1;
        continue;
      }

      if (remoteArea.deleted_at) {
        if (localArea) {
          await db.employeeAreas.delete(remoteArea.id);
          result.updated += 1;
        } else {
          result.skipped += 1;
        }
        continue;
      }

      areasToPut.push(mapRemoteEmployeeAreaToLocal(remoteArea, syncedAt));
      if (localArea) result.updated += 1;
      else result.inserted += 1;
    }

    if (areasToPut.length > 0) {
      await db.employeeAreas.bulkPut(areasToPut);
    }
  });

  return result;
};

export const mergeRemoteEmployeeCollectionSchedulesIntoDexie = async (
  remoteSchedules: RemoteEmployeeCollectionScheduleDto[],
  syncedAt = new Date().toISOString(),
): Promise<EmployeeReadSyncResult> => {
  const result = { ...EMPTY_READ_SYNC_RESULT, fetched: remoteSchedules.length };
  if (remoteSchedules.length === 0) return result;

  await db.transaction('rw', db.employeeCollectionSchedules, async () => {
    const schedulesToPut: EmployeeCollectionSchedule[] = [];

    for (const remoteSchedule of remoteSchedules) {
      const localSchedule = await db.employeeCollectionSchedules.get(remoteSchedule.id);
      if (!shouldApplyRemoteUpdatedAt(localSchedule, remoteSchedule.updated_at)) {
        result.skipped += 1;
        continue;
      }

      if (remoteSchedule.deleted_at) {
        if (localSchedule) {
          await db.employeeCollectionSchedules.delete(remoteSchedule.id);
          result.updated += 1;
        } else {
          result.skipped += 1;
        }
        continue;
      }

      schedulesToPut.push(mapRemoteCollectionScheduleToLocal(remoteSchedule, syncedAt));
      if (localSchedule) result.updated += 1;
      else result.inserted += 1;
    }

    if (schedulesToPut.length > 0) {
      await db.employeeCollectionSchedules.bulkPut(schedulesToPut);
    }
  });

  return result;
};

export const refreshEmployeesFromPostgres = async (): Promise<EmployeeReadSyncSummary> => {
  const emptySummary: EmployeeReadSyncSummary = {
    employees: { ...EMPTY_READ_SYNC_RESULT },
    employeeAreas: { ...EMPTY_READ_SYNC_RESULT },
    collectionSchedules: { ...EMPTY_READ_SYNC_RESULT },
  };

  if (isRefreshingEmployeesFromPostgres || !canReadFromPostgres()) {
    return emptySummary;
  }

  isRefreshingEmployeesFromPostgres = true;
  try {
    return {
      employees: await mergeRemoteEmployeesIntoDexie(await employeePostgresAdapter.list()),
      employeeAreas: await mergeRemoteEmployeeAreasIntoDexie(await employeeAreaPostgresAdapter.list()),
      collectionSchedules: await mergeRemoteEmployeeCollectionSchedulesIntoDexie(
        await employeeCollectionSchedulePostgresAdapter.list(),
      ),
    };
  } finally {
    isRefreshingEmployeesFromPostgres = false;
  }
};
