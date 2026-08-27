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
import { toTimestamp } from '@/services/shared/remoteRefreshCursor';
import { pullStoredUpdatedAtIdPages } from '@/services/shared/syncCursorStore';
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

const EMPLOYEE_REFRESH_LIMIT = 500;

let isRefreshingEmployeesFromPostgres = false;

const optionalString = (value: string | null | undefined) => value ?? undefined;

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
  employee_number: optionalString(remoteEmployee.employee_number),
  name: remoteEmployee.name,
  preferred_name: optionalString(remoteEmployee.preferred_name),
  photo_data_url: optionalString(remoteEmployee.photo_data_url),
  gender: remoteEmployee.gender ?? undefined,
  birth_place: optionalString(remoteEmployee.birth_place),
  birth_date: optionalString(remoteEmployee.birth_date),
  marital_status: remoteEmployee.marital_status ?? undefined,
  nationality: optionalString(remoteEmployee.nationality),
  phone: optionalString(remoteEmployee.phone),
  email: optionalString(remoteEmployee.email),
  personal_email: optionalString(remoteEmployee.personal_email),
  address: optionalString(remoteEmployee.address),
  identity_address: optionalString(remoteEmployee.identity_address),
  domicile_address: optionalString(remoteEmployee.domicile_address),
  emergency_contact_name: optionalString(remoteEmployee.emergency_contact_name),
  emergency_contact_relationship: optionalString(remoteEmployee.emergency_contact_relationship),
  emergency_contact_phone: optionalString(remoteEmployee.emergency_contact_phone),
  nik: optionalString(remoteEmployee.nik),
  family_card_number: optionalString(remoteEmployee.family_card_number),
  tax_number: optionalString(remoteEmployee.tax_number),
  health_bpjs_number: optionalString(remoteEmployee.health_bpjs_number),
  employment_bpjs_number: optionalString(remoteEmployee.employment_bpjs_number),
  company_unit: optionalString(remoteEmployee.company_unit),
  department_id: optionalString(remoteEmployee.department_id),
  department_code: optionalString(remoteEmployee.department_code),
  department_name: optionalString(remoteEmployee.department_name),
  job_position_id: optionalString(remoteEmployee.job_position_id),
  job_position_code: optionalString(remoteEmployee.job_position_code),
  job_position_name: optionalString(remoteEmployee.job_position_name),
  position: optionalString(remoteEmployee.position),
  supervisor_id: optionalString(remoteEmployee.supervisor_id),
  supervisor_name: optionalString(remoteEmployee.supervisor_name),
  work_location: optionalString(remoteEmployee.work_location),
  join_date: optionalString(remoteEmployee.join_date),
  employment_status: remoteEmployee.employment_status ?? undefined,
  active_status: remoteEmployee.active_status ?? (remoteEmployee.is_active ? 'ACTIVE' : 'INACTIVE'),
  work_schedule_type: remoteEmployee.work_schedule_type ?? undefined,
  contract_start_date: optionalString(remoteEmployee.contract_start_date),
  contract_end_date: optionalString(remoteEmployee.contract_end_date),
  permanent_date: optionalString(remoteEmployee.permanent_date),
  exit_date: optionalString(remoteEmployee.exit_date),
  exit_reason: optionalString(remoteEmployee.exit_reason),
  salary_payment_method: remoteEmployee.salary_payment_method ?? undefined,
  bank_name: optionalString(remoteEmployee.bank_name),
  bank_account_number: optionalString(remoteEmployee.bank_account_number),
  bank_account_holder: optionalString(remoteEmployee.bank_account_holder),
  base_salary: remoteEmployee.base_salary ?? undefined,
  salary_currency: optionalString(remoteEmployee.salary_currency),
  payroll_period: remoteEmployee.payroll_period ?? undefined,
  is_taxable: remoteEmployee.is_taxable ?? undefined,
  ptkp_status: optionalString(remoteEmployee.ptkp_status),
  is_bpjs_participant: remoteEmployee.is_bpjs_participant ?? undefined,
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
  effective_from: optionalString(remoteArea.effective_from),
  effective_until: optionalString(remoteArea.effective_until),
  is_primary: remoteArea.is_primary ?? false,
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
  is_default_for_new_members: remoteSchedule.is_default_for_new_members ?? false,
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

const addReadSyncResult = (aggregate: EmployeeReadSyncResult, next: EmployeeReadSyncResult) => {
  aggregate.fetched += next.fetched;
  aggregate.inserted += next.inserted;
  aggregate.updated += next.updated;
  aggregate.skipped += next.skipped;
};

/**
 * Delta fetch loop shared by the 3 employee-bundle tables, each with a durable composite
 * checkpoint independent from the rows being merged.
 */
const refreshEmployeeTableFromPostgres = async <TRemote extends { id: string; updated_at: string }>(
  entity: string,
  list: (options: { updatedAfter?: string; cursorId?: string; limit?: number }) => Promise<TRemote[]>,
  merge: (remoteRows: TRemote[]) => Promise<EmployeeReadSyncResult>,
): Promise<EmployeeReadSyncResult> => {
  const aggregate = { ...EMPTY_READ_SYNC_RESULT };

  await pullStoredUpdatedAtIdPages({
    entity,
    pageSize: EMPLOYEE_REFRESH_LIMIT,
    loadPage: (cursor) => list({
      updatedAfter: cursor?.updatedAt,
      cursorId: cursor?.id,
      limit: EMPLOYEE_REFRESH_LIMIT,
    }),
    mergePage: async (remoteRows) => {
      addReadSyncResult(aggregate, await merge(remoteRows));
    },
    getUpdatedAt: (row) => row.updated_at,
    getId: (row) => row.id,
  });

  return aggregate;
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
      employees: await refreshEmployeeTableFromPostgres(
        'employees',
        (options) => employeePostgresAdapter.list(options),
        mergeRemoteEmployeesIntoDexie,
      ),
      employeeAreas: await refreshEmployeeTableFromPostgres(
        'employeeAreas',
        (options) => employeeAreaPostgresAdapter.list(options),
        mergeRemoteEmployeeAreasIntoDexie,
      ),
      collectionSchedules: await refreshEmployeeTableFromPostgres(
        'employeeCollectionSchedules',
        (options) => employeeCollectionSchedulePostgresAdapter.list(options),
        mergeRemoteEmployeeCollectionSchedulesIntoDexie,
      ),
    };
  } finally {
    isRefreshingEmployeesFromPostgres = false;
  }
};
