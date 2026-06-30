import { db } from '@/lib/db';
import {
  employeeCashAdvancePostgresAdapter,
  isTauriRuntime,
  payrollRunPostgresAdapter,
  type RemoteEmployeeCashAdvanceBundleDto,
  type RemoteEmployeeCashAdvanceDto,
  type RemoteEmployeeCashAdvanceRepaymentDto,
  type RemotePayrollRunBundleDto,
  type RemotePayrollRunDto,
  type RemotePayrollRunItemDto,
} from '@/services/postgresAdapter';
import type {
  EmployeeCashAdvance,
  EmployeeCashAdvanceRepayment,
  EmployeeCashAdvanceRepaymentStatus,
  EmployeeCashAdvanceStatus,
  PayrollRun,
  PayrollRunItem,
  PayrollRunStatus,
} from '@/types';

export interface PayrollReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

const EMPTY_PAYROLL_READ_SYNC_RESULT: PayrollReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
};

const VALID_PAYROLL_RUN_STATUSES: PayrollRunStatus[] = ['DRAFT', 'APPROVED', 'PAID', 'VOIDED'];
const VALID_CASH_ADVANCE_STATUSES: EmployeeCashAdvanceStatus[] = ['ACTIVE', 'PAID', 'VOIDED'];
const VALID_CASH_ADVANCE_REPAYMENT_STATUSES: EmployeeCashAdvanceRepaymentStatus[] = [
  'DRAFT',
  'RESERVED',
  'POSTED',
  'VOIDED',
];
const POSTGRES_PAYROLL_REFRESH_LIMIT = 200;

let isRefreshingPayrollRunsFromPostgres = false;
let isRefreshingEmployeeCashAdvancesFromPostgres = false;

const optionalString = (value: string | null | undefined) => value ?? undefined;
const optionalNumber = (value: number | null | undefined) => (
  typeof value === 'number' && Number.isFinite(value) ? value : 0
);

const isPayrollRunStatus = (status: string): status is PayrollRunStatus => (
  VALID_PAYROLL_RUN_STATUSES.includes(status as PayrollRunStatus)
);

const isCashAdvanceStatus = (status: string): status is EmployeeCashAdvanceStatus => (
  VALID_CASH_ADVANCE_STATUSES.includes(status as EmployeeCashAdvanceStatus)
);

const isCashAdvanceRepaymentStatus = (status: string): status is EmployeeCashAdvanceRepaymentStatus => (
  VALID_CASH_ADVANCE_REPAYMENT_STATUSES.includes(status as EmployeeCashAdvanceRepaymentStatus)
);

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const getLaterUpdatedAt = (current: string | undefined, candidate: string | undefined) => {
  if (!candidate) return current;
  if (!current) return candidate;

  const currentTimestamp = toTimestamp(current);
  const candidateTimestamp = toTimestamp(candidate);

  if (currentTimestamp !== null && candidateTimestamp !== null) {
    return candidateTimestamp > currentTimestamp ? candidate : current;
  }

  return candidate > current ? candidate : current;
};

const hasLocalUnsyncedChanges = (record: { sync_status?: string }) => (
  record.sync_status === 'pending' || record.sync_status === 'failed'
);

const shouldApplyRemotePayrollRun = (
  localRun: PayrollRun | undefined,
  remoteRun: RemotePayrollRunDto,
) => {
  if (!localRun) return true;
  if (hasLocalUnsyncedChanges(localRun)) return false;

  const localRemoteUpdatedAt = localRun.remote_updated_at ?? localRun.updated_at;
  const remoteTimestamp = toTimestamp(remoteRun.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteRun.updated_at >= localRemoteUpdatedAt;
};

const shouldApplyRemoteCashAdvance = (
  localCashAdvance: EmployeeCashAdvance | undefined,
  remoteCashAdvance: RemoteEmployeeCashAdvanceDto,
) => {
  if (!localCashAdvance) return true;
  if (hasLocalUnsyncedChanges(localCashAdvance)) return false;

  const localRemoteUpdatedAt = localCashAdvance.remote_updated_at ?? localCashAdvance.updated_at;
  const remoteTimestamp = toTimestamp(remoteCashAdvance.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteCashAdvance.updated_at >= localRemoteUpdatedAt;
};

const mapRemotePayrollRunToLocal = (
  remoteRun: RemotePayrollRunDto,
  syncedAt: string,
): PayrollRun => ({
  id: remoteRun.id,
  payroll_number: remoteRun.payroll_number,
  period_start: remoteRun.period_start,
  period_end: remoteRun.period_end,
  status: isPayrollRunStatus(remoteRun.status) ? remoteRun.status : 'DRAFT',
  employee_count: optionalNumber(remoteRun.employee_count),
  gross_amount: optionalNumber(remoteRun.gross_amount),
  allowance_amount: optionalNumber(remoteRun.allowance_amount),
  bonus_amount: optionalNumber(remoteRun.bonus_amount),
  other_deduction_amount: optionalNumber(remoteRun.other_deduction_amount),
  cash_advance_deduction_amount: optionalNumber(remoteRun.cash_advance_deduction_amount),
  deduction_amount: optionalNumber(remoteRun.deduction_amount),
  net_amount: optionalNumber(remoteRun.net_amount),
  payment_method: remoteRun.payment_method ?? undefined,
  payment_channel: optionalString(remoteRun.payment_channel),
  cash_account_id: optionalString(remoteRun.cash_account_id),
  cash_account_code: optionalString(remoteRun.cash_account_code),
  cash_account_name: optionalString(remoteRun.cash_account_name),
  finance_transaction_id: optionalString(remoteRun.finance_transaction_id),
  notes: optionalString(remoteRun.notes),
  approved_at: optionalString(remoteRun.approved_at),
  paid_at: optionalString(remoteRun.paid_at),
  voided_at: optionalString(remoteRun.voided_at),
  created_by: optionalString(remoteRun.created_by),
  created_by_name: optionalString(remoteRun.created_by_name),
  updated_by: optionalString(remoteRun.updated_by),
  updated_by_name: optionalString(remoteRun.updated_by_name),
  created_at: remoteRun.created_at,
  updated_at: remoteRun.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteRun.updated_at,
});

const mapRemotePayrollRunItemToLocal = (
  remoteItem: RemotePayrollRunItemDto,
): PayrollRunItem => ({
  id: remoteItem.id,
  payroll_run_id: remoteItem.payroll_run_id,
  employee_id: remoteItem.employee_id,
  employee_name: remoteItem.employee_name,
  employee_position: optionalString(remoteItem.employee_position),
  base_salary: optionalNumber(remoteItem.base_salary),
  allowance_amount: optionalNumber(remoteItem.allowance_amount),
  bonus_amount: optionalNumber(remoteItem.bonus_amount),
  other_deduction_amount: optionalNumber(remoteItem.other_deduction_amount),
  cash_advance_deduction_amount: optionalNumber(remoteItem.cash_advance_deduction_amount),
  deduction_amount: optionalNumber(remoteItem.deduction_amount),
  gross_amount: optionalNumber(remoteItem.gross_amount),
  net_amount: optionalNumber(remoteItem.net_amount),
  notes: optionalString(remoteItem.notes),
  created_at: remoteItem.created_at,
  updated_at: remoteItem.updated_at,
});

const mapRemoteCashAdvanceToLocal = (
  remoteCashAdvance: RemoteEmployeeCashAdvanceDto,
  syncedAt: string,
): EmployeeCashAdvance => ({
  id: remoteCashAdvance.id,
  advance_number: remoteCashAdvance.advance_number,
  employee_id: remoteCashAdvance.employee_id,
  employee_name: remoteCashAdvance.employee_name,
  employee_position: optionalString(remoteCashAdvance.employee_position),
  amount: optionalNumber(remoteCashAdvance.amount),
  outstanding_amount: optionalNumber(remoteCashAdvance.outstanding_amount),
  status: isCashAdvanceStatus(remoteCashAdvance.status) ? remoteCashAdvance.status : 'ACTIVE',
  disbursed_at: remoteCashAdvance.disbursed_at,
  payment_method: remoteCashAdvance.payment_method ?? undefined,
  payment_channel: optionalString(remoteCashAdvance.payment_channel),
  cash_account_id: optionalString(remoteCashAdvance.cash_account_id),
  cash_account_code: optionalString(remoteCashAdvance.cash_account_code),
  cash_account_name: optionalString(remoteCashAdvance.cash_account_name),
  finance_transaction_id: optionalString(remoteCashAdvance.finance_transaction_id),
  notes: optionalString(remoteCashAdvance.notes),
  voided_at: optionalString(remoteCashAdvance.voided_at),
  void_reason: optionalString(remoteCashAdvance.void_reason),
  created_by: optionalString(remoteCashAdvance.created_by),
  created_by_name: optionalString(remoteCashAdvance.created_by_name),
  updated_by: optionalString(remoteCashAdvance.updated_by),
  updated_by_name: optionalString(remoteCashAdvance.updated_by_name),
  created_at: remoteCashAdvance.created_at,
  updated_at: remoteCashAdvance.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteCashAdvance.updated_at,
});

const mapRemoteCashAdvanceRepaymentToLocal = (
  remoteRepayment: RemoteEmployeeCashAdvanceRepaymentDto,
): EmployeeCashAdvanceRepayment => ({
  id: remoteRepayment.id,
  cash_advance_id: remoteRepayment.cash_advance_id,
  cash_advance_number: remoteRepayment.cash_advance_number,
  payroll_run_id: remoteRepayment.payroll_run_id,
  payroll_run_item_id: remoteRepayment.payroll_run_item_id,
  payroll_number: optionalString(remoteRepayment.payroll_number),
  employee_id: remoteRepayment.employee_id,
  employee_name: remoteRepayment.employee_name,
  amount: optionalNumber(remoteRepayment.amount),
  status: isCashAdvanceRepaymentStatus(remoteRepayment.status) ? remoteRepayment.status : 'DRAFT',
  allocated_at: remoteRepayment.allocated_at,
  posted_at: optionalString(remoteRepayment.posted_at),
  voided_at: optionalString(remoteRepayment.voided_at),
  created_at: remoteRepayment.created_at,
  updated_at: remoteRepayment.updated_at,
});

const getLatestPayrollRunRemoteUpdatedAt = async () => {
  const runs = await db.payrollRuns.toArray();

  return runs.reduce<string | undefined>((latest, run) => {
    const remoteUpdatedAt = run.remote_updated_at
      ?? (run.sync_status === 'synced' ? run.updated_at : undefined);
    return getLaterUpdatedAt(latest, remoteUpdatedAt);
  }, undefined);
};

const getLatestCashAdvanceRemoteUpdatedAt = async () => {
  const cashAdvances = await db.employeeCashAdvances.toArray();

  return cashAdvances.reduce<string | undefined>((latest, cashAdvance) => {
    const remoteUpdatedAt = cashAdvance.remote_updated_at
      ?? (cashAdvance.sync_status === 'synced' ? cashAdvance.updated_at : undefined);
    return getLaterUpdatedAt(latest, remoteUpdatedAt);
  }, undefined);
};

const getLatestRemotePayrollBundleUpdatedAt = (remoteBundles: RemotePayrollRunBundleDto[]) => (
  remoteBundles.reduce<string | undefined>(
    (latest, bundle) => getLaterUpdatedAt(latest, bundle.run.updated_at),
    undefined,
  )
);

const getLatestRemoteCashAdvanceBundleUpdatedAt = (remoteBundles: RemoteEmployeeCashAdvanceBundleDto[]) => (
  remoteBundles.reduce<string | undefined>(
    (latest, bundle) => getLaterUpdatedAt(latest, bundle.cash_advance.updated_at),
    undefined,
  )
);

const addPayrollReadSyncResult = (
  aggregate: PayrollReadSyncResult,
  next: PayrollReadSyncResult,
) => {
  aggregate.fetched += next.fetched;
  aggregate.inserted += next.inserted;
  aggregate.updated += next.updated;
  aggregate.skipped += next.skipped;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

export const mergeRemotePayrollRunBundlesIntoDexie = async (
  remoteBundles: RemotePayrollRunBundleDto[],
  syncedAt = new Date().toISOString(),
): Promise<PayrollReadSyncResult> => {
  const result: PayrollReadSyncResult = {
    ...EMPTY_PAYROLL_READ_SYNC_RESULT,
    fetched: remoteBundles.length,
  };
  if (remoteBundles.length === 0) return result;

  await db.transaction('rw', db.payrollRuns, db.payrollRunItems, db.employeeCashAdvanceRepayments, async () => {
    for (const remoteBundle of remoteBundles) {
      const localRun = await db.payrollRuns.get(remoteBundle.run.id);
      if (!shouldApplyRemotePayrollRun(localRun, remoteBundle.run)) {
        result.skipped += 1;
        continue;
      }

      await db.payrollRuns.put(mapRemotePayrollRunToLocal(remoteBundle.run, syncedAt));
      await db.payrollRunItems.where('payroll_run_id').equals(remoteBundle.run.id).delete();
      await db.employeeCashAdvanceRepayments.where('payroll_run_id').equals(remoteBundle.run.id).delete();

      const localItems = remoteBundle.items.map(mapRemotePayrollRunItemToLocal);
      const localRepayments = remoteBundle.cash_advance_repayments.map(mapRemoteCashAdvanceRepaymentToLocal);
      if (localItems.length > 0) {
        await db.payrollRunItems.bulkPut(localItems);
      }
      if (localRepayments.length > 0) {
        await db.employeeCashAdvanceRepayments.bulkPut(localRepayments);
      }

      if (localRun) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }
  });

  return result;
};

export const mergeRemoteEmployeeCashAdvanceBundlesIntoDexie = async (
  remoteBundles: RemoteEmployeeCashAdvanceBundleDto[],
  syncedAt = new Date().toISOString(),
): Promise<PayrollReadSyncResult> => {
  const result: PayrollReadSyncResult = {
    ...EMPTY_PAYROLL_READ_SYNC_RESULT,
    fetched: remoteBundles.length,
  };
  if (remoteBundles.length === 0) return result;

  await db.transaction('rw', db.employeeCashAdvances, db.employeeCashAdvanceRepayments, db.payrollRuns, async () => {
    for (const remoteBundle of remoteBundles) {
      const localCashAdvance = await db.employeeCashAdvances.get(remoteBundle.cash_advance.id);
      if (!shouldApplyRemoteCashAdvance(localCashAdvance, remoteBundle.cash_advance)) {
        result.skipped += 1;
        continue;
      }

      await db.employeeCashAdvances.put(mapRemoteCashAdvanceToLocal(remoteBundle.cash_advance, syncedAt));

      const remoteRepaymentIds = new Set(remoteBundle.repayments.map((repayment) => repayment.id));
      const localRepayments = await db.employeeCashAdvanceRepayments
        .where('cash_advance_id')
        .equals(remoteBundle.cash_advance.id)
        .toArray();

      for (const localRepayment of localRepayments) {
        if (remoteRepaymentIds.has(localRepayment.id)) continue;

        const localRun = await db.payrollRuns.get(localRepayment.payroll_run_id);
        if (localRun && hasLocalUnsyncedChanges(localRun)) continue;

        await db.employeeCashAdvanceRepayments.delete(localRepayment.id);
      }

      for (const remoteRepayment of remoteBundle.repayments) {
        const localRun = await db.payrollRuns.get(remoteRepayment.payroll_run_id);
        if (localRun && hasLocalUnsyncedChanges(localRun)) continue;

        await db.employeeCashAdvanceRepayments.put(mapRemoteCashAdvanceRepaymentToLocal(remoteRepayment));
      }

      if (localCashAdvance) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }
  });

  return result;
};

export const refreshPayrollRunsFromPostgres = async (): Promise<PayrollReadSyncResult> => {
  if (isRefreshingPayrollRunsFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_PAYROLL_READ_SYNC_RESULT };
  }

  isRefreshingPayrollRunsFromPostgres = true;
  try {
    const aggregate = { ...EMPTY_PAYROLL_READ_SYNC_RESULT };
    let updatedAfter = await getLatestPayrollRunRemoteUpdatedAt();

    while (true) {
      const remoteBundles = await payrollRunPostgresAdapter.list({
        updatedAfter,
        limit: POSTGRES_PAYROLL_REFRESH_LIMIT,
      });
      const result = await mergeRemotePayrollRunBundlesIntoDexie(remoteBundles);
      addPayrollReadSyncResult(aggregate, result);

      if (remoteBundles.length < POSTGRES_PAYROLL_REFRESH_LIMIT) {
        break;
      }

      const nextUpdatedAfter = getLatestRemotePayrollBundleUpdatedAt(remoteBundles);
      if (!nextUpdatedAfter || nextUpdatedAfter === updatedAfter) {
        break;
      }

      updatedAfter = nextUpdatedAfter;
    }

    return aggregate;
  } finally {
    isRefreshingPayrollRunsFromPostgres = false;
  }
};

export const refreshEmployeeCashAdvancesFromPostgres = async (): Promise<PayrollReadSyncResult> => {
  if (isRefreshingEmployeeCashAdvancesFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_PAYROLL_READ_SYNC_RESULT };
  }

  isRefreshingEmployeeCashAdvancesFromPostgres = true;
  try {
    const aggregate = { ...EMPTY_PAYROLL_READ_SYNC_RESULT };
    let updatedAfter = await getLatestCashAdvanceRemoteUpdatedAt();

    while (true) {
      const remoteBundles = await employeeCashAdvancePostgresAdapter.list({
        updatedAfter,
        limit: POSTGRES_PAYROLL_REFRESH_LIMIT,
      });
      const result = await mergeRemoteEmployeeCashAdvanceBundlesIntoDexie(remoteBundles);
      addPayrollReadSyncResult(aggregate, result);

      if (remoteBundles.length < POSTGRES_PAYROLL_REFRESH_LIMIT) {
        break;
      }

      const nextUpdatedAfter = getLatestRemoteCashAdvanceBundleUpdatedAt(remoteBundles);
      if (!nextUpdatedAfter || nextUpdatedAfter === updatedAfter) {
        break;
      }

      updatedAfter = nextUpdatedAfter;
    }

    return aggregate;
  } finally {
    isRefreshingEmployeeCashAdvancesFromPostgres = false;
  }
};
