import {
  getCurrentSessionUser,
  requireUserPermission,
  writeActivityLog,
} from '@/auth/authService';
import { db } from '@/lib/db';
import {
  enqueueEmployeeAreaSync,
  enqueueEmployeeCollectionScheduleSync,
} from '@/services/syncQueueService';
import type {
  CooperativeCollectionWeekday,
  EmployeeArea,
  EmployeeCollectionSchedule,
} from '@/types';
import { toBusinessDateKey } from '@/utils/businessDate';

export const isEffectiveDateRangeOverlapping = (
  leftStart: string,
  leftEnd: string | undefined,
  rightStart: string,
  rightEnd: string | undefined,
) => leftStart <= (rightEnd ?? '9999-12-31') && rightStart <= (leftEnd ?? '9999-12-31');

const requireActor = async () => {
  const actor = await getCurrentSessionUser();
  await requireUserPermission(actor, 'cooperative.collection.assignment.manage');
  if (!actor) throw new Error('Sesi pengguna tidak ditemukan.');
  return actor;
};

export const assignEmployeeArea = async (input: {
  employee_id: string;
  area_id: string;
  effective_from: string;
  effective_until?: string;
  is_primary?: boolean;
}) => {
  const actor = await requireActor();
  const [employee, area, existing] = await Promise.all([
    db.employees.get(input.employee_id),
    db.cooperativeAreas.get(input.area_id),
    db.employeeAreas
      .where('[employee_id+area_id]')
      .equals([input.employee_id, input.area_id])
      .toArray(),
  ]);
  if (!employee?.is_active) throw new Error('Karyawan tidak ditemukan atau tidak aktif.');
  if (!area?.is_active) throw new Error('Area tidak ditemukan atau tidak aktif.');
  if (input.effective_until && input.effective_until < input.effective_from) {
    throw new Error('Tanggal akhir assignment tidak valid.');
  }
  if (existing.some((row) => isEffectiveDateRangeOverlapping(
    row.effective_from ?? toBusinessDateKey(row.created_at),
    row.effective_until,
    input.effective_from,
    input.effective_until,
  ))) {
    throw new Error('Assignment area pada periode tersebut sudah ada.');
  }
  const now = new Date().toISOString();
  const assignment: EmployeeArea = {
    id: crypto.randomUUID(),
    employee_id: employee.id,
    area_id: area.id,
    area_name: area.name,
    area_code: area.code,
    effective_from: input.effective_from,
    effective_until: input.effective_until,
    is_primary: input.is_primary ?? false,
    created_at: now,
    updated_at: now,
    sync_status: 'pending',
  };
  await db.transaction('rw', [db.employeeAreas, db.activityLogs], async () => {
    if (assignment.is_primary) {
      const activeAssignments = await db.employeeAreas.where('employee_id').equals(employee.id).toArray();
      for (const row of activeAssignments.filter((candidate) => candidate.is_primary)) {
        await db.employeeAreas.put({ ...row, is_primary: false, updated_at: now, sync_status: 'pending' });
      }
    }
    await db.employeeAreas.add(assignment);
    await writeActivityLog({
      user: actor,
      action: 'EMPLOYEE_AREA_ASSIGNED',
      entity: 'employeeAreas',
      entity_id: assignment.id,
      description: `${actor.name} menetapkan ${employee.name} ke area ${area.name}.`,
    });
  });
  await enqueueEmployeeAreaSync(assignment, 'create');
  return assignment;
};

export const closeEmployeeAreaAssignment = async (id: string, effectiveUntil: string) => {
  const actor = await requireActor();
  const assignment = await db.employeeAreas.get(id);
  if (!assignment) throw new Error('Assignment area tidak ditemukan.');
  const start = assignment.effective_from ?? toBusinessDateKey(assignment.created_at);
  if (effectiveUntil < start) throw new Error('Tanggal akhir assignment tidak valid.');
  const activeSchedules = await db.employeeCollectionSchedules
    .where('[employee_id+area_id]')
    .equals([assignment.employee_id, assignment.area_id])
    .and((row) => row.is_active && (!row.effective_until || row.effective_until.slice(0, 10) > effectiveUntil))
    .toArray();
  if (activeSchedules.length > 0) {
    throw new Error('Tutup atau alihkan jadwal penagihan aktif sebelum mengakhiri assignment area.');
  }
  const updated: EmployeeArea = {
    ...assignment,
    effective_until: effectiveUntil,
    updated_at: new Date().toISOString(),
    sync_status: 'pending',
    sync_error: undefined,
  };
  await db.employeeAreas.put(updated);
  await enqueueEmployeeAreaSync(updated, 'update');
  await writeActivityLog({
    user: actor,
    action: 'EMPLOYEE_AREA_CLOSED',
    entity: 'employeeAreas',
    entity_id: id,
    description: `${actor.name} mengakhiri assignment area ${assignment.area_name}.`,
  });
  return updated;
};

export const saveCollectionSchedule = async (input: {
  id?: string;
  employee_id: string;
  area_id: string;
  weekday: CooperativeCollectionWeekday;
  effective_from?: string;
  effective_until?: string;
  is_default_for_new_members?: boolean;
  is_active?: boolean;
}) => {
  const actor = await requireActor();
  const [employee, area, assignments, existingSchedules] = await Promise.all([
    db.employees.get(input.employee_id),
    db.cooperativeAreas.get(input.area_id),
    db.employeeAreas
      .where('[employee_id+area_id]')
      .equals([input.employee_id, input.area_id])
      .toArray(),
    db.employeeCollectionSchedules
      .where('[employee_id+area_id+weekday]')
      .equals([input.employee_id, input.area_id, input.weekday])
      .toArray(),
  ]);
  if (!employee?.is_active) throw new Error('Karyawan tidak ditemukan atau tidak aktif.');
  if (!area?.is_active) throw new Error('Area tidak ditemukan atau tidak aktif.');
  const start = input.effective_from ?? toBusinessDateKey(new Date());
  if (input.effective_until && input.effective_until < start) throw new Error('Periode jadwal tidak valid.');
  if (!assignments.some((row) => (
    (row.effective_from ?? toBusinessDateKey(row.created_at)) <= start &&
    (!row.effective_until || row.effective_until >= (input.effective_until ?? start))
  ))) {
    throw new Error('Periode jadwal harus berada dalam assignment area petugas.');
  }
  const overlap = existingSchedules.some((row) => (
    row.id !== input.id &&
    row.is_active &&
    isEffectiveDateRangeOverlapping(
      row.effective_from?.slice(0, 10) ?? toBusinessDateKey(row.created_at),
      row.effective_until?.slice(0, 10),
      start,
      input.effective_until,
    )
  ));
  if (overlap) throw new Error('Jadwal petugas-area-hari pada periode tersebut sudah ada.');

  const existing = input.id ? await db.employeeCollectionSchedules.get(input.id) : undefined;
  const now = new Date().toISOString();
  const schedule: EmployeeCollectionSchedule = {
    id: existing?.id ?? crypto.randomUUID(),
    employee_id: employee.id,
    employee_name: employee.name,
    employee_position: employee.job_position_name ?? employee.position,
    area_id: area.id,
    area_name: area.name,
    area_code: area.code,
    weekday: input.weekday,
    effective_from: start,
    effective_until: input.effective_until,
    is_default_for_new_members: input.is_default_for_new_members ?? false,
    is_active: input.is_active ?? true,
    created_at: existing?.created_at ?? now,
    updated_at: now,
    sync_status: 'pending',
  };
  const changedDefaults: EmployeeCollectionSchedule[] = [];
  await db.transaction('rw', [db.employeeCollectionSchedules, db.activityLogs], async () => {
    if (schedule.is_default_for_new_members) {
      const defaults = await db.employeeCollectionSchedules
        .where('area_id')
        .equals(area.id)
        .and((row) => row.id !== schedule.id && Boolean(row.is_default_for_new_members))
        .toArray();
      for (const row of defaults) {
        const updated = { ...row, is_default_for_new_members: false, updated_at: now, sync_status: 'pending' as const };
        changedDefaults.push(updated);
        await db.employeeCollectionSchedules.put(updated);
      }
    }
    await db.employeeCollectionSchedules.put(schedule);
    await writeActivityLog({
      user: actor,
      action: existing ? 'COLLECTION_SCHEDULE_UPDATED' : 'COLLECTION_SCHEDULE_CREATED',
      entity: 'employeeCollectionSchedules',
      entity_id: schedule.id,
      description: `${actor.name} menyimpan jadwal ${employee.name} untuk area ${area.name}.`,
    });
  });
  await enqueueEmployeeCollectionScheduleSync(schedule, existing ? 'update' : 'create');
  for (const row of changedDefaults) await enqueueEmployeeCollectionScheduleSync(row, 'update');
  return schedule;
};
