import {
  getCurrentSessionUser,
  getCurrentServerSessionToken,
  requireUserPermission,
  writeActivityLog,
} from '@/auth/authService';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import { postgresAdapter, workforcePostgresAdapter } from '@/services/postgresAdapter';
import type {
  CollectionCoverageException,
  CollectionCoverageResolution,
  CollectionWorklistRow,
  CooperativeMember,
  Employee,
  EmployeeArea,
  EmployeeCollectionSchedule,
} from '@/types';
import { getCooperativeLoanContractualInstallmentAmount } from '@/utils/koperasi/loanReport';

const DATE_FORMAT = 'YYYY-MM-DD';

const pending = <T extends object>(value: T) => ({
  ...value,
  sync_status: 'pending' as const,
  sync_error: undefined,
});

const isoWeekday = (date: string) => {
  const weekday = dayjs.tz(date).day();
  return (weekday === 0 ? 7 : weekday) as EmployeeCollectionSchedule['weekday'];
};

const isEffective = (
  row: Pick<EmployeeCollectionSchedule | EmployeeArea, 'effective_from' | 'effective_until'>,
  date: string,
) => (
  (!row.effective_from || row.effective_from.slice(0, 10) <= date) &&
  (!row.effective_until || row.effective_until.slice(0, 10) >= date)
);

export const isEmployeeAvailableForCollection = async (employeeId: string, date: string) => {
  const employee = await db.employees.get(employeeId);
  if (!employee?.is_active || employee.active_status === 'RESIGNED' || employee.active_status === 'TERMINATED') {
    return false;
  }
  const exception = await db.employeeAvailabilityExceptions
    .where('[employee_id+date]')
    .equals([employeeId, date])
    .first();
  return !exception;
};

const assertEmployeeAreaEffective = async (employeeId: string, areaId: string, date: string) => {
  const assignments = await db.employeeAreas
    .where('[employee_id+area_id]')
    .equals([employeeId, areaId])
    .toArray();
  const valid = assignments.some((assignment) => isEffective(assignment, date));
  if (!valid) throw new Error('Petugas tidak memiliki assignment area yang berlaku pada tanggal tersebut.');
};

export const listCollectionScheduleOptions = async (areaId: string, date: string) => {
  const dateKey = dayjs.tz(date).format(DATE_FORMAT);
  const schedules = await db.employeeCollectionSchedules
    .where('area_id')
    .equals(areaId)
    .and((row) => row.is_active && isEffective(row, dateKey))
    .toArray();
  const employees = await db.employees.bulkGet(schedules.map((row) => row.employee_id));
  const employeeById = new Map(
    employees.filter((row): row is Employee => Boolean(row)).map((row) => [row.id, row]),
  );
  return schedules
    .filter((schedule) => employeeById.get(schedule.employee_id)?.is_active)
    .sort((left, right) => (
      Number(Boolean(right.is_default_for_new_members)) - Number(Boolean(left.is_default_for_new_members)) ||
      left.weekday - right.weekday ||
      left.employee_name.localeCompare(right.employee_name)
    ));
};

export const resolveMemberCollectionDefault = async (areaId: string, date: string) => {
  const schedules = await listCollectionScheduleOptions(areaId, date);
  const defaults = schedules.filter((row) => row.is_default_for_new_members);
  if (defaults.length === 1) return defaults[0];
  if (defaults.length > 1) throw new Error('Area memiliki lebih dari satu jadwal default dan perlu ditinjau.');
  return schedules.length === 1 ? schedules[0] : undefined;
};

export interface EffectiveCollectorResolution {
  schedule: EmployeeCollectionSchedule;
  coverage?: CollectionCoverageException;
  operational_date: string;
  effective_employee_id?: string;
  effective_employee_name?: string;
  is_blocked: boolean;
}

export const buildEffectiveCollectorResolution = (input: {
  schedule: EmployeeCollectionSchedule;
  date: string;
  directCoverage?: CollectionCoverageException;
  rescheduledCoverage?: CollectionCoverageException;
  originalEmployeeAvailable: boolean;
}): EffectiveCollectorResolution => {
  const {
    schedule,
    date,
    directCoverage,
    rescheduledCoverage,
    originalEmployeeAvailable,
  } = input;
  if (rescheduledCoverage) {
    return {
      schedule,
      coverage: rescheduledCoverage,
      operational_date: date,
      effective_employee_id: schedule.employee_id,
      effective_employee_name: schedule.employee_name,
      is_blocked: false,
    };
  }
  if (directCoverage?.status === 'OPEN') {
    return { schedule, coverage: directCoverage, operational_date: date, is_blocked: true };
  }
  if (directCoverage?.status === 'RESOLVED' && directCoverage.resolution_type === 'SUBSTITUTE') {
    return {
      schedule,
      coverage: directCoverage,
      operational_date: date,
      effective_employee_id: directCoverage.replacement_employee_id,
      effective_employee_name: directCoverage.replacement_employee_name,
      is_blocked: !directCoverage.replacement_employee_id,
    };
  }
  if (directCoverage?.status === 'RESOLVED' && directCoverage.resolution_type === 'RESCHEDULE') {
    return {
      schedule,
      coverage: directCoverage,
      operational_date: directCoverage.rescheduled_date ?? date,
      effective_employee_id: schedule.employee_id,
      effective_employee_name: schedule.employee_name,
      is_blocked: !directCoverage.rescheduled_date,
    };
  }
  return {
    schedule,
    operational_date: date,
    effective_employee_id: originalEmployeeAvailable ? schedule.employee_id : undefined,
    effective_employee_name: originalEmployeeAvailable ? schedule.employee_name : undefined,
    is_blocked: !originalEmployeeAvailable,
  };
};

export const resolveEffectiveCollector = async (
  collectionScheduleId: string,
  collectionDate: string,
): Promise<EffectiveCollectorResolution> => {
  const schedule = await db.employeeCollectionSchedules.get(collectionScheduleId);
  if (!schedule?.is_active) throw new Error('Jadwal penagihan tidak ditemukan atau tidak aktif.');
  const date = dayjs.tz(collectionDate).format(DATE_FORMAT);
  const directCoverage = await db.collectionCoverageExceptions
    .where('[collection_schedule_id+collection_date]')
    .equals([collectionScheduleId, date])
    .and((row) => row.status !== 'CANCELLED')
    .first();
  const rescheduledCoverage = directCoverage
    ? undefined
    : await db.collectionCoverageExceptions
      .where('rescheduled_date')
      .equals(date)
      .and((row) => (
        row.collection_schedule_id === collectionScheduleId &&
        row.status === 'RESOLVED' &&
        row.resolution_type === 'RESCHEDULE'
      ))
      .first();
  const available = await isEmployeeAvailableForCollection(schedule.employee_id, date);
  return buildEffectiveCollectorResolution({
    schedule,
    date,
    directCoverage,
    rescheduledCoverage,
    originalEmployeeAvailable: available,
  });
};

export const resolveCoverageConflict = async (input: {
  conflict_id: string;
  resolution_type: CollectionCoverageResolution;
  replacement_employee_id?: string;
  rescheduled_date?: string;
  reason: string;
}) => {
  const actor = await getCurrentSessionUser();
  await requireUserPermission(actor, 'cooperative.collection.coverage.manage');
  if (!actor) throw new Error('Sesi pengguna tidak ditemukan.');
  const health = await postgresAdapter.healthCheck();
  if (!health.available) throw new Error('Penyelesaian coverage wajib dilakukan saat PostgreSQL terhubung.');
  const sessionToken = await getCurrentServerSessionToken();
  if (!sessionToken) throw new Error('Sesi server tidak tersedia. Silakan login ulang.');
  const conflict = await db.collectionCoverageExceptions.get(input.conflict_id);
  if (!conflict || conflict.status !== 'OPEN') throw new Error('Konflik coverage tidak ditemukan atau sudah diselesaikan.');

  let replacement: Employee | undefined;
  let rescheduledDate: string | undefined;
  if (input.resolution_type === 'SUBSTITUTE') {
    if (!input.replacement_employee_id) throw new Error('Petugas pengganti wajib dipilih.');
    if (input.replacement_employee_id === conflict.original_employee_id) {
      throw new Error('Petugas pengganti harus berbeda dari petugas asal.');
    }
    replacement = await db.employees.get(input.replacement_employee_id);
    if (!replacement || !await isEmployeeAvailableForCollection(replacement.id, conflict.collection_date)) {
      throw new Error('Petugas pengganti tidak aktif atau tidak tersedia.');
    }
    await assertEmployeeAreaEffective(replacement.id, conflict.area_id, conflict.collection_date);
  } else {
    if (!input.rescheduled_date) throw new Error('Tanggal pengganti wajib dipilih.');
    rescheduledDate = dayjs.tz(input.rescheduled_date).format(DATE_FORMAT);
    if (rescheduledDate <= conflict.collection_date) {
      throw new Error('Tanggal pengganti harus setelah tanggal penagihan semula.');
    }
    if (!await isEmployeeAvailableForCollection(conflict.original_employee_id, rescheduledDate)) {
      throw new Error('Petugas asal tidak tersedia pada tanggal pengganti.');
    }
    await assertEmployeeAreaEffective(conflict.original_employee_id, conflict.area_id, rescheduledDate);
  }

  const now = new Date().toISOString();
  const resolved: CollectionCoverageException = pending({
    ...conflict,
    status: 'RESOLVED',
    resolution_type: input.resolution_type,
    replacement_employee_id: replacement?.id,
    replacement_employee_name: replacement?.name,
    rescheduled_date: rescheduledDate,
    reason: input.reason.trim(),
    resolved_at: now,
    resolved_by: actor.id,
    resolved_by_name: actor.name,
    updated_at: now,
  });
  await workforcePostgresAdapter.resolveCollectionCoverage(sessionToken, resolved);
  const syncedResolution: CollectionCoverageException = {
    ...resolved,
    sync_status: 'synced',
    sync_error: undefined,
    last_synced_at: now,
    remote_updated_at: now,
  };
  await db.transaction('rw', [db.collectionCoverageExceptions, db.activityLogs], async () => {
    await db.collectionCoverageExceptions.put(syncedResolution);
    await writeActivityLog({
      user: actor,
      action: 'COLLECTION_COVERAGE_RESOLVED',
      entity: 'collectionCoverageExceptions',
      entity_id: conflict.id,
      description: `${actor.name} menyelesaikan konflik ${conflict.area_name} dengan ${input.resolution_type}.`,
    });
  });
  return syncedResolution;
};

const buildWorklistRow = async (
  member: CooperativeMember,
  schedule: EmployeeCollectionSchedule,
  baseDate: string,
): Promise<CollectionWorklistRow | undefined> => {
  const resolution = await resolveEffectiveCollector(schedule.id, baseDate);
  return {
    member_id: member.id,
    member_number: member.member_number,
    member_name: member.name,
    area_id: schedule.area_id,
    area_name: schedule.area_name,
    collection_schedule_id: schedule.id,
    scheduled_date: baseDate,
    operational_date: resolution.operational_date,
    original_employee_id: schedule.employee_id,
    effective_employee_id: resolution.effective_employee_id,
    effective_employee_name: resolution.effective_employee_name,
    coverage_status: resolution.coverage?.status,
    coverage_resolution: resolution.coverage?.resolution_type,
    is_blocked: resolution.is_blocked,
  };
};

export const getCollectionWorklist = async (
  operationalDate: string,
  actorEmployeeId?: string,
): Promise<CollectionWorklistRow[]> => {
  const date = dayjs.tz(operationalDate).format(DATE_FORMAT);
  const [schedules, members, rescheduledCoverage] = await Promise.all([
    db.employeeCollectionSchedules
      .where('weekday')
      .equals(isoWeekday(date))
      .and((row) => row.is_active && isEffective(row, date))
      .toArray(),
    db.cooperativeMembers.where('status').equals('ACTIVE').toArray(),
    db.collectionCoverageExceptions
      .where('rescheduled_date')
      .equals(date)
      .and((row) => row.status === 'RESOLVED' && row.resolution_type === 'RESCHEDULE')
      .toArray(),
  ]);
  const scheduleIds = new Set([
    ...schedules.map((row) => row.id),
    ...rescheduledCoverage.map((row) => row.collection_schedule_id),
  ]);
  const scheduleRows = await db.employeeCollectionSchedules.bulkGet(Array.from(scheduleIds));
  const rows = (await Promise.all(scheduleRows.flatMap((schedule) => {
    if (!schedule) return [];
    const matchingMembers = members.filter((member) => member.collection_schedule_id === schedule.id);
    const baseDate = rescheduledCoverage.find((row) => row.collection_schedule_id === schedule.id)?.collection_date ?? date;
    return matchingMembers.map((member) => buildWorklistRow(member, schedule, baseDate));
  }))).filter((row): row is CollectionWorklistRow => Boolean(row))
    .filter((row) => row.operational_date === date);
  const loans = await db.cooperativeLoans
    .where('status')
    .equals('DISBURSED')
    .and((loan) => rows.some((row) => row.member_id === loan.member_id))
    .toArray();
  const installments = loans.length > 0
    ? await db.cooperativeLoanInstallments
      .where('loan_id')
      .anyOf(loans.map((loan) => loan.id))
      .toArray()
    : [];
  const installmentsByLoanId = new Map<string, typeof installments>();
  installments.forEach((installment) => {
    const current = installmentsByLoanId.get(installment.loan_id) ?? [];
    current.push(installment);
    installmentsByLoanId.set(installment.loan_id, current);
  });
  const targetByMemberId = new Map<string, number>();
  loans.forEach((loan) => {
    const current = targetByMemberId.get(loan.member_id) ?? 0;
    targetByMemberId.set(
      loan.member_id,
      current + getCooperativeLoanContractualInstallmentAmount(
        loan,
        installmentsByLoanId.get(loan.id) ?? [],
      ),
    );
  });
  const rowsWithTargets = rows.map((row) => ({
    ...row,
    target_amount: targetByMemberId.get(row.member_id) ?? 0,
  }));
  return actorEmployeeId
    ? rowsWithTargets.filter((row) => row.effective_employee_id === actorEmployeeId)
    : rowsWithTargets;
};

export const assertCollectorCanCollect = async (
  memberId: string,
  collectionDate: string,
  actorEmployeeId: string,
) => {
  const member = await db.cooperativeMembers.get(memberId);
  if (!member?.collection_schedule_id) throw new Error('Anggota belum memiliki jadwal penagihan yang valid.');
  return assertCollectorCanCollectSchedule(
    member.collection_schedule_id,
    collectionDate,
    actorEmployeeId,
  );
};

export const assertCollectorCanCollectSchedule = async (
  collectionScheduleId: string,
  collectionDate: string,
  actorEmployeeId: string,
) => {
  const resolution = await resolveEffectiveCollector(collectionScheduleId, collectionDate);
  if (resolution.is_blocked) throw new Error('Penagihan belum memiliki coverage yang terselesaikan.');
  if (resolution.operational_date !== dayjs.tz(collectionDate).format(DATE_FORMAT)) {
    throw new Error(`Penagihan dijadwalkan ulang ke ${resolution.operational_date}.`);
  }
  if (resolution.effective_employee_id !== actorEmployeeId) {
    throw new Error('Petugas tidak berwenang menagih anggota pada tanggal ini.');
  }
  return resolution;
};
