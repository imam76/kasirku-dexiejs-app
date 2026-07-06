import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import { enqueueAccountingPeriodSync } from '@/services/syncQueueService';
import type { AccountingPeriod, AccountingPeriodType, AuthUser } from '@/types';

type AccountingPeriodActor = Pick<AuthUser, 'id' | 'name'> | null | undefined;

export interface CreateAccountingPeriodInput {
  name: string;
  period_type: AccountingPeriodType;
  start_date: string;
  end_date: string;
  notes?: string;
}

const toDateOnly = (value: string) => value.slice(0, 10);

const withPendingAccountingPeriodSync = (
  period: AccountingPeriod,
  actor?: AccountingPeriodActor,
  updatedAt = period.updated_at,
): AccountingPeriod => ({
  ...period,
  version: period.version ?? 1,
  created_by: period.created_by ?? actor?.id,
  created_by_name: period.created_by_name ?? actor?.name,
  updated_by: actor?.id ?? period.updated_by,
  updated_by_name: actor?.name ?? period.updated_by_name,
  updated_at: updatedAt,
  sync_status: 'pending',
  sync_error: undefined,
});

const withUpdatedAccountingPeriodSync = (
  period: AccountingPeriod,
  actor?: AccountingPeriodActor,
  updatedAt = new Date().toISOString(),
): AccountingPeriod => ({
  ...period,
  version: Math.max(1, Number(period.version || 1)) + 1,
  updated_by: actor?.id ?? period.updated_by,
  updated_by_name: actor?.name ?? period.updated_by_name,
  updated_at: updatedAt,
  sync_status: 'pending',
  sync_error: undefined,
});

const rangesOverlap = (
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
) => toDateOnly(aStart) <= toDateOnly(bEnd) && toDateOnly(bStart) <= toDateOnly(aEnd);

const assertValidRange = (startDate: string, endDate: string) => {
  const start = dayjs(toDateOnly(startDate));
  const end = dayjs(toDateOnly(endDate));
  if (!start.isValid() || !end.isValid()) {
    throw new Error('Tanggal periode tidak valid.');
  }
  if (end.isBefore(start)) {
    throw new Error('Tanggal akhir periode tidak boleh sebelum tanggal mulai.');
  }
};

const assertNoOverlap = async (
  startDate: string,
  endDate: string,
  excludePeriodId?: string,
) => {
  const periods = await db.accountingPeriods.toArray();
  const overlapping = periods.find((period) => (
    !period.deleted_at &&
    period.id !== excludePeriodId &&
    rangesOverlap(startDate, endDate, period.start_date, period.end_date)
  ));

  if (overlapping) {
    throw new Error(
      `Periode tumpang tindih dengan "${overlapping.name}" (${toDateOnly(overlapping.start_date)} s/d ${toDateOnly(overlapping.end_date)}).`,
    );
  }
};

export const listAccountingPeriods = async (): Promise<AccountingPeriod[]> => {
  const periods = await db.accountingPeriods.toArray();
  return periods
    .filter((period) => !period.deleted_at)
    .sort((a, b) => (a.start_date < b.start_date ? 1 : -1));
};

export const createAccountingPeriod = async (
  input: CreateAccountingPeriodInput,
): Promise<AccountingPeriod> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'ACCOUNTING_PERIOD_MANAGE');

  const name = input.name.trim();
  if (!name) {
    throw new Error('Nama periode wajib diisi.');
  }
  assertValidRange(input.start_date, input.end_date);

  const now = new Date().toISOString();
  const startDate = toDateOnly(input.start_date);
  const endDate = toDateOnly(input.end_date);

  const period = withPendingAccountingPeriodSync({
    id: crypto.randomUUID(),
    name,
    period_type: input.period_type,
    start_date: startDate,
    end_date: endDate,
    status: 'OPEN',
    notes: input.notes?.trim() || undefined,
    version: 1,
    created_at: now,
    updated_at: now,
  }, currentUser, now);

  await db.transaction('rw', [db.accountingPeriods, db.activityLogs], async () => {
    await assertNoOverlap(startDate, endDate);
    await db.accountingPeriods.add(period);
    await writeActivityLog({
      user: currentUser,
      action: 'ACCOUNTING_PERIOD_CREATED',
      entity: 'accountingPeriods',
      entity_id: period.id,
      description: `${currentUser?.name ?? 'User'} membuat periode akuntansi ${period.name} (${startDate} s/d ${endDate}).`,
    });
  });

  await enqueueAccountingPeriodSync(period, 'create');
  return period;
};

export const lockAccountingPeriod = async (periodId: string): Promise<AccountingPeriod> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'ACCOUNTING_PERIOD_MANAGE');

  const now = new Date().toISOString();
  let updated!: AccountingPeriod;

  await db.transaction('rw', [db.accountingPeriods, db.activityLogs], async () => {
    const period = await db.accountingPeriods.get(periodId);
    if (!period || period.deleted_at) {
      throw new Error('Periode tidak ditemukan.');
    }
    if (period.status === 'CLOSED') {
      throw new Error('Periode sudah ditutup dan tidak bisa dikunci ulang.');
    }
    if (period.status === 'LOCKED') {
      updated = period;
      return;
    }

    updated = withUpdatedAccountingPeriodSync({
      ...period,
      status: 'LOCKED',
      locked_at: now,
      locked_by: currentUser?.id,
      locked_by_name: currentUser?.name,
    }, currentUser, now);
    await db.accountingPeriods.put(updated);
    await writeActivityLog({
      user: currentUser,
      action: 'ACCOUNTING_PERIOD_LOCKED',
      entity: 'accountingPeriods',
      entity_id: period.id,
      description: `${currentUser?.name ?? 'User'} mengunci periode ${period.name}.`,
    });
  });

  if (updated.status === 'LOCKED') {
    await enqueueAccountingPeriodSync(updated, 'update');
  }
  return updated;
};

export const unlockAccountingPeriod = async (periodId: string): Promise<AccountingPeriod> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'ACCOUNTING_PERIOD_MANAGE');

  const now = new Date().toISOString();
  let updated!: AccountingPeriod;

  await db.transaction('rw', [db.accountingPeriods, db.activityLogs], async () => {
    const period = await db.accountingPeriods.get(periodId);
    if (!period || period.deleted_at) {
      throw new Error('Periode tidak ditemukan.');
    }
    if (period.status === 'CLOSED') {
      throw new Error('Periode sudah ditutup. Gunakan reopen untuk membuka kembali.');
    }
    if (period.status === 'OPEN') {
      updated = period;
      return;
    }

    updated = withUpdatedAccountingPeriodSync({
      ...period,
      status: 'OPEN',
      locked_at: undefined,
      locked_by: undefined,
      locked_by_name: undefined,
    }, currentUser, now);
    await db.accountingPeriods.put(updated);
    await writeActivityLog({
      user: currentUser,
      action: 'ACCOUNTING_PERIOD_UNLOCKED',
      entity: 'accountingPeriods',
      entity_id: period.id,
      description: `${currentUser?.name ?? 'User'} membuka kunci periode ${period.name}.`,
    });
  });

  if (updated.status === 'OPEN') {
    await enqueueAccountingPeriodSync(updated, 'update');
  }
  return updated;
};

export const deleteAccountingPeriod = async (periodId: string): Promise<void> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'ACCOUNTING_PERIOD_MANAGE');

  const now = new Date().toISOString();
  let deleted!: AccountingPeriod;

  await db.transaction('rw', [db.accountingPeriods, db.closingRuns, db.activityLogs], async () => {
    const period = await db.accountingPeriods.get(periodId);
    if (!period || period.deleted_at) {
      throw new Error('Periode tidak ditemukan.');
    }
    if (period.status !== 'OPEN') {
      throw new Error('Hanya periode berstatus OPEN yang bisa dihapus.');
    }
    const closingRun = (await db.closingRuns.where('period_id').equals(periodId).toArray())
      .find((run) => !run.deleted_at && run.status !== 'REVERSED');
    if (closingRun) {
      throw new Error('Periode memiliki closing run aktif dan tidak bisa dihapus.');
    }

    deleted = withUpdatedAccountingPeriodSync({
      ...period,
      deleted_at: now,
    }, currentUser, now);
    await db.accountingPeriods.put(deleted);
    await writeActivityLog({
      user: currentUser,
      action: 'ACCOUNTING_PERIOD_DELETED',
      entity: 'accountingPeriods',
      entity_id: period.id,
      description: `${currentUser?.name ?? 'User'} menghapus periode ${period.name}.`,
    });
  });

  await enqueueAccountingPeriodSync(deleted, 'update');
};
