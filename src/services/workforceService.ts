import {
  getCurrentSessionUser,
  getCurrentServerSessionToken,
  hasUserPermission,
  requireUserPermission,
  writeActivityLog,
} from '@/auth/authService';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import { postgresAdapter, workforcePostgresAdapter } from '@/services/postgresAdapter';
import { enqueueLeaveWorkflowSync } from '@/services/syncQueueService';
import type {
  CompanyCalendarDay,
  EmployeeAvailabilityException,
  EmployeeWorkScheduleAssignment,
  LeaveBalanceLedgerEntry,
  LeaveRequest,
  LeaveRequestAction,
  LeaveRequestActionType,
  LeaveType,
  Permission,
  WorkScheduleDay,
  WorkScheduleTemplate,
} from '@/types';

const DATE_FORMAT = 'YYYY-MM-DD';

const pending = <T extends object>(record: T) => ({
  ...record,
  sync_status: 'pending' as const,
  sync_error: undefined,
});

const requireActor = async (permission: Permission) => {
  const actor = await getCurrentSessionUser();
  await requireUserPermission(actor, permission);
  if (!actor) throw new Error('Sesi pengguna tidak ditemukan.');
  return actor;
};

const getProtectedMutationSession = async () => {
  const health = await postgresAdapter.healthCheck();
  if (!health.available) {
    if (health.status === 'unconfigured') return undefined;
    throw new Error('PostgreSQL sedang tidak dapat dijangkau. Perubahan master diblokir agar tidak terjadi konflik antar-client.');
  }
  const sessionToken = await getCurrentServerSessionToken();
  if (!sessionToken) throw new Error('Sesi server tidak tersedia. Silakan login ulang.');
  return sessionToken;
};

const addAction = async (
  requestId: string,
  action: LeaveRequestActionType,
  actor: Awaited<ReturnType<typeof getCurrentSessionUser>>,
  notes?: string,
) => {
  const row: LeaveRequestAction = pending({
    id: crypto.randomUUID(),
    leave_request_id: requestId,
    action,
    actor_user_id: actor?.id,
    actor_name: actor?.name,
    notes: notes?.trim() || undefined,
    created_at: new Date().toISOString(),
  });
  await db.leaveRequestActions.add(row);
  return row;
};

const assertDateRange = (startDate: string, endDate: string) => {
  const start = dayjs.tz(startDate);
  const end = dayjs.tz(endDate);
  if (!start.isValid() || !end.isValid()) throw new Error('Rentang tanggal tidak valid.');
  if (end.isBefore(start, 'day')) throw new Error('Tanggal selesai tidak boleh sebelum tanggal mulai.');
};

const datesBetween = (startDate: string, endDate: string) => {
  assertDateRange(startDate, endDate);
  const dates: string[] = [];
  let cursor = dayjs.tz(startDate).startOf('day');
  const end = dayjs.tz(endDate).startOf('day');
  while (!cursor.isAfter(end, 'day')) {
    dates.push(cursor.format(DATE_FORMAT));
    cursor = cursor.add(1, 'day');
  }
  return dates;
};

const isoWeekday = (date: string) => {
  const weekday = dayjs.tz(date).day();
  return (weekday === 0 ? 7 : weekday) as WorkScheduleDay['weekday'];
};

export const listWorkScheduleTemplates = () => db.workScheduleTemplates.orderBy('name').toArray();

export const saveWorkScheduleTemplate = async (input: {
  id?: string;
  code: string;
  name: string;
  timezone?: string;
  is_active?: boolean;
  days: Array<Pick<WorkScheduleDay, 'weekday' | 'is_working_day' | 'start_time' | 'end_time'>>;
}) => {
  const actor = await requireActor('hr.schedule.manage');
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!code || !name) throw new Error('Kode dan nama jadwal wajib diisi.');
  if (new Set(input.days.map((row) => row.weekday)).size !== input.days.length) {
    throw new Error('Hari pada template jadwal tidak boleh duplikat.');
  }
  const duplicate = await db.workScheduleTemplates
    .where('code')
    .equalsIgnoreCase(code)
    .and((row) => row.id !== input.id)
    .first();
  if (duplicate) throw new Error('Kode jadwal sudah digunakan.');

  const existing = input.id ? await db.workScheduleTemplates.get(input.id) : undefined;
  const now = new Date().toISOString();
  const template: WorkScheduleTemplate = pending({
    id: existing?.id ?? crypto.randomUUID(),
    code,
    name,
    timezone: input.timezone ?? 'Asia/Jakarta',
    is_active: input.is_active ?? true,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });
  const days: WorkScheduleDay[] = input.days.map((row) => pending({
    id: `${template.id}:${row.weekday}`,
    template_id: template.id,
    weekday: row.weekday,
    is_working_day: row.is_working_day,
    start_time: row.is_working_day ? row.start_time : undefined,
    end_time: row.is_working_day ? row.end_time : undefined,
    created_at: now,
    updated_at: now,
  }));
  const sessionToken = await getProtectedMutationSession();
  if (sessionToken) {
    await workforcePostgresAdapter.upsertWorkScheduleTemplateBundle(sessionToken, template, days);
  }
  await db.transaction('rw', [db.workScheduleTemplates, db.workScheduleDays, db.activityLogs], async () => {
    await db.workScheduleTemplates.put(template);
    await db.workScheduleDays.where('template_id').equals(template.id).delete();
    if (days.length > 0) await db.workScheduleDays.bulkPut(days);
    await writeActivityLog({
      user: actor,
      action: existing ? 'WORK_SCHEDULE_UPDATED' : 'WORK_SCHEDULE_CREATED',
      entity: 'workScheduleTemplates',
      entity_id: template.id,
      description: `${actor.name} menyimpan template jadwal ${template.name}.`,
    });
  });
  return template;
};

export const assignEmployeeWorkSchedule = async (input: {
  employee_id: string;
  template_id: string;
  effective_from: string;
  effective_until?: string;
}) => {
  const actor = await requireActor('hr.schedule.manage');
  assertDateRange(input.effective_from, input.effective_until ?? input.effective_from);
  const [employee, template, assignments] = await Promise.all([
    db.employees.get(input.employee_id),
    db.workScheduleTemplates.get(input.template_id),
    db.employeeWorkScheduleAssignments.where('employee_id').equals(input.employee_id).toArray(),
  ]);
  if (!employee?.is_active) throw new Error('Karyawan tidak ditemukan atau tidak aktif.');
  if (!template?.is_active) throw new Error('Template jadwal tidak ditemukan atau tidak aktif.');
  const nextStart = input.effective_from;
  const nextEnd = input.effective_until ?? '9999-12-31';
  const overlap = assignments.some((row) => (
    row.effective_from <= nextEnd &&
    (row.effective_until ?? '9999-12-31') >= nextStart
  ));
  if (overlap) throw new Error('Periode jadwal kerja karyawan tidak boleh tumpang tindih.');

  const now = new Date().toISOString();
  const assignment: EmployeeWorkScheduleAssignment = pending({
    id: crypto.randomUUID(),
    employee_id: employee.id,
    template_id: template.id,
    template_name: template.name,
    effective_from: input.effective_from,
    effective_until: input.effective_until,
    created_at: now,
    updated_at: now,
  });
  const sessionToken = await getProtectedMutationSession();
  if (sessionToken) {
    await workforcePostgresAdapter.upsertEmployeeWorkScheduleAssignment(sessionToken, assignment);
  }
  await db.employeeWorkScheduleAssignments.add(assignment);
  await writeActivityLog({
    user: actor,
    action: 'EMPLOYEE_WORK_SCHEDULE_ASSIGNED',
    entity: 'employeeWorkScheduleAssignments',
    entity_id: assignment.id,
    description: `${actor.name} menetapkan jadwal ${template.name} untuk ${employee.name}.`,
  });
  return assignment;
};

export const saveCompanyCalendarDay = async (input: {
  date: string;
  kind: CompanyCalendarDay['kind'];
  name: string;
}) => {
  await requireActor('hr.schedule.manage');
  const date = dayjs.tz(input.date).format(DATE_FORMAT);
  const existing = await db.companyCalendarDays.where('date').equals(date).first();
  const now = new Date().toISOString();
  const row: CompanyCalendarDay = pending({
    id: existing?.id ?? date,
    date,
    kind: input.kind,
    name: input.name.trim(),
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });
  const sessionToken = await getProtectedMutationSession();
  if (sessionToken) await workforcePostgresAdapter.upsertCompanyCalendarDay(sessionToken, row);
  await db.companyCalendarDays.put(row);
  return row;
};

export const isEmployeeWorkingDate = async (employeeId: string, date: string) => {
  const dateKey = dayjs.tz(date).format(DATE_FORMAT);
  const calendar = await db.companyCalendarDays.where('date').equals(dateKey).first();
  if (calendar?.kind === 'HOLIDAY') return false;
  if (calendar?.kind === 'WORKING_OVERRIDE') return true;

  const assignment = (await db.employeeWorkScheduleAssignments
    .where('employee_id')
    .equals(employeeId)
    .toArray())
    .filter((row) => row.effective_from <= dateKey && (!row.effective_until || row.effective_until >= dateKey))
    .sort((left, right) => right.effective_from.localeCompare(left.effective_from))[0];
  if (!assignment) return isoWeekday(dateKey) <= 5;
  const day = await db.workScheduleDays
    .where('[template_id+weekday]')
    .equals([assignment.template_id, isoWeekday(dateKey)])
    .first();
  return day?.is_working_day ?? false;
};

export const calculateLeaveWorkingDates = async (
  employeeId: string,
  startDate: string,
  endDate: string,
) => {
  const values = await Promise.all(
    datesBetween(startDate, endDate).map(async (date) => (
      await isEmployeeWorkingDate(employeeId, date) ? date : undefined
    )),
  );
  return values.filter((date): date is string => Boolean(date));
};

export const saveLeaveType = async (input: {
  id?: string;
  code: string;
  name: string;
  is_paid: boolean;
  requires_balance: boolean;
  annual_quota_days: number;
  is_active?: boolean;
}) => {
  await requireActor('hr.leave.policy.manage');
  if (input.annual_quota_days < 0) throw new Error('Kuota cuti tidak boleh negatif.');
  const existing = input.id ? await db.leaveTypes.get(input.id) : undefined;
  const now = new Date().toISOString();
  const row: LeaveType = pending({
    id: existing?.id ?? crypto.randomUUID(),
    code: input.code.trim().toUpperCase(),
    name: input.name.trim(),
    is_paid: input.is_paid,
    requires_balance: input.requires_balance,
    annual_quota_days: input.annual_quota_days,
    is_active: input.is_active ?? true,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });
  const sessionToken = await getProtectedMutationSession();
  if (sessionToken) await workforcePostgresAdapter.upsertLeaveType(sessionToken, row);
  await db.leaveTypes.put(row);
  return row;
};

export const getLeaveBalance = async (employeeId: string, leaveTypeId: string, year: number) => {
  const rows = await db.leaveBalanceLedger
    .where('[employee_id+leave_type_id+year]')
    .equals([employeeId, leaveTypeId, year])
    .toArray();
  return rows.reduce((summary, row) => ({
    available: summary.available + row.available_delta,
    reserved: summary.reserved + row.reserved_delta,
    used: summary.used + row.used_delta,
  }), { available: 0, reserved: 0, used: 0 });
};

export const adjustLeaveBalance = async (input: {
  employee_id: string;
  leave_type_id: string;
  year: number;
  days: number;
  notes: string;
}) => {
  const actor = await requireActor('hr.leave.policy.manage');
  if (!input.days) throw new Error('Nilai adjustment tidak boleh nol.');
  const row: LeaveBalanceLedgerEntry = pending({
    id: crypto.randomUUID(),
    employee_id: input.employee_id,
    leave_type_id: input.leave_type_id,
    year: input.year,
    movement_kind: 'ADJUSTMENT',
    available_delta: input.days,
    reserved_delta: 0,
    used_delta: 0,
    notes: input.notes.trim(),
    created_at: new Date().toISOString(),
    created_by: actor.id,
    created_by_name: actor.name,
  });
  const sessionToken = await getProtectedMutationSession();
  if (sessionToken) await workforcePostgresAdapter.upsertLeaveBalanceLedger(sessionToken, row);
  await db.leaveBalanceLedger.add(row);
  return row;
};

export const grantAnnualLeave = async (
  employeeId: string,
  leaveTypeId: string,
  year: number,
  days?: number,
) => {
  const actor = await requireActor('hr.leave.policy.manage');
  const leaveType = await db.leaveTypes.get(leaveTypeId);
  if (!leaveType) throw new Error('Tipe cuti tidak ditemukan.');
  const existing = (await db.leaveBalanceLedger
    .where('[employee_id+leave_type_id+year]')
    .equals([employeeId, leaveTypeId, year])
    .toArray())
    .some((row) => row.movement_kind === 'GRANT');
  if (existing) throw new Error('Kuota tahun ini sudah diberikan.');
  const row: LeaveBalanceLedgerEntry = pending({
    id: crypto.randomUUID(),
    employee_id: employeeId,
    leave_type_id: leaveTypeId,
    year,
    movement_kind: 'GRANT',
    available_delta: days ?? leaveType.annual_quota_days,
    reserved_delta: 0,
    used_delta: 0,
    notes: `Kuota ${year}`,
    created_at: new Date().toISOString(),
    created_by: actor.id,
    created_by_name: actor.name,
  });
  const sessionToken = await getProtectedMutationSession();
  if (sessionToken) await workforcePostgresAdapter.upsertLeaveBalanceLedger(sessionToken, row);
  await db.leaveBalanceLedger.add(row);
  return row;
};

const assertLeaveOwnerOrHr = async (employeeId: string) => {
  const actor = await getCurrentSessionUser();
  if (!actor) throw new Error('Sesi pengguna tidak ditemukan.');
  if (actor.employee_id === employeeId) {
    await requireUserPermission(actor, 'hr.leave.self_service');
    return actor;
  }
  await requireUserPermission(actor, 'hr.leave.hr_approve');
  return actor;
};

export const createLeaveRequest = async (input: {
  employee_id: string;
  leave_type_id: string;
  start_date: string;
  end_date: string;
  reason: string;
}) => {
  const actor = await assertLeaveOwnerOrHr(input.employee_id);
  if (input.start_date.slice(0, 4) !== input.end_date.slice(0, 4)) {
    throw new Error('Pengajuan cuti lintas tahun harus dipisahkan per tahun saldo.');
  }
  const [employee, leaveType, workingDates] = await Promise.all([
    db.employees.get(input.employee_id),
    db.leaveTypes.get(input.leave_type_id),
    calculateLeaveWorkingDates(input.employee_id, input.start_date, input.end_date),
  ]);
  if (!employee?.is_active) throw new Error('Karyawan tidak ditemukan atau tidak aktif.');
  if (!leaveType?.is_active) throw new Error('Tipe cuti tidak ditemukan atau tidak aktif.');
  if (workingDates.length === 0) throw new Error('Rentang cuti tidak memiliki hari kerja.');
  const overlap = (await db.leaveRequests.where('employee_id').equals(employee.id).toArray())
    .some((row) => (
      !['REJECTED', 'CANCELLED'].includes(row.status) &&
      row.start_date <= input.end_date &&
      row.end_date >= input.start_date
    ));
  if (overlap) throw new Error('Pengajuan cuti bertumpang tindih dengan pengajuan lain.');

  const now = new Date().toISOString();
  const request: LeaveRequest = pending({
    id: crypto.randomUUID(),
    employee_id: employee.id,
    employee_name: employee.name,
    leave_type_id: leaveType.id,
    leave_type_name: leaveType.name,
    start_date: input.start_date,
    end_date: input.end_date,
    day_count: workingDates.length,
    reason: input.reason.trim(),
    status: 'DRAFT',
    supervisor_id: employee.supervisor_id,
    supervisor_name: employee.supervisor_name,
    created_at: now,
    updated_at: now,
  });
  await db.transaction('rw', [db.leaveRequests, db.leaveRequestActions], async () => {
    await db.leaveRequests.add(request);
    await addAction(request.id, 'CREATED', actor);
  });
  await enqueueLeaveWorkflowSync(request, 'create');
  return request;
};

export const submitLeaveRequest = async (requestId: string) => {
  const request = await db.leaveRequests.get(requestId);
  if (!request) throw new Error('Pengajuan cuti tidak ditemukan.');
  const actor = await assertLeaveOwnerOrHr(request.employee_id);
  if (request.status !== 'DRAFT') throw new Error('Hanya draft yang dapat diajukan.');
  const leaveType = await db.leaveTypes.get(request.leave_type_id);
  if (!leaveType) throw new Error('Tipe cuti tidak ditemukan.');
  if (leaveType.requires_balance) {
    const balance = await getLeaveBalance(
      request.employee_id,
      request.leave_type_id,
      Number(request.start_date.slice(0, 4)),
    );
    if (balance.available < request.day_count) throw new Error('Saldo cuti tidak mencukupi.');
  }

  const supervisorCandidate = request.supervisor_id
    ? await db.authUsers.where('employee_id').equals(request.supervisor_id).and((row) => row.is_active).first()
    : undefined;
  const supervisorUser = supervisorCandidate && await hasUserPermission(
    supervisorCandidate,
    'hr.leave.supervisor_approve',
  )
    ? supervisorCandidate
    : undefined;
  const nextStatus: LeaveRequest['status'] = supervisorUser ? 'PENDING_SUPERVISOR' : 'PENDING_HR';
  const now = new Date().toISOString();
  const reservation: LeaveBalanceLedgerEntry | undefined = leaveType.requires_balance ? pending({
    id: `${request.id}:RESERVE`,
    employee_id: request.employee_id,
    leave_type_id: request.leave_type_id,
    year: Number(request.start_date.slice(0, 4)),
    movement_kind: 'RESERVE' as const,
    available_delta: -request.day_count,
    reserved_delta: request.day_count,
    used_delta: 0,
    leave_request_id: request.id,
    notes: `Reservasi ${request.leave_type_name}`,
    created_at: now,
    created_by: actor.id,
    created_by_name: actor.name,
  }) : undefined;
  const updated = pending({
    ...request,
    status: nextStatus,
    submitted_at: now,
    updated_at: now,
  });
  await db.transaction('rw', [
    db.leaveRequests,
    db.leaveRequestActions,
    db.leaveBalanceLedger,
  ], async () => {
    await db.leaveRequests.put(updated);
    if (reservation) await db.leaveBalanceLedger.add(reservation);
    await addAction(request.id, 'SUBMITTED', actor);
    if (!supervisorUser) {
      await addAction(request.id, 'SUPERVISOR_SKIPPED', actor, 'Atasan aktif dengan user aplikasi tidak ditemukan.');
    }
  });
  await enqueueLeaveWorkflowSync(updated, 'update');
  return updated;
};

export const approveLeaveAsSupervisor = async (requestId: string, notes?: string) => {
  const actor = await requireActor('hr.leave.supervisor_approve');
  const request = await db.leaveRequests.get(requestId);
  if (!request) throw new Error('Pengajuan cuti tidak ditemukan.');
  if (request.status !== 'PENDING_SUPERVISOR') throw new Error('Pengajuan tidak menunggu approval atasan.');
  if (actor.employee_id === request.employee_id) throw new Error('Pengaju tidak boleh menyetujui cutinya sendiri.');
  if (actor.employee_id !== request.supervisor_id && actor.role !== 'OWNER') {
    throw new Error('Hanya atasan langsung yang dapat menyetujui pengajuan ini.');
  }
  const now = new Date().toISOString();
  const updated = pending({
    ...request,
    status: 'PENDING_HR' as const,
    supervisor_decided_at: now,
    updated_at: now,
  });
  await db.transaction('rw', [db.leaveRequests, db.leaveRequestActions], async () => {
    await db.leaveRequests.put(updated);
    await addAction(request.id, 'SUPERVISOR_APPROVED', actor, notes);
  });
  await enqueueLeaveWorkflowSync(updated, 'update');
  return updated;
};

const buildApprovedLeaveSideEffects = async (
  request: LeaveRequest,
  actor: Awaited<ReturnType<typeof requireActor>>,
) => {
  const now = new Date().toISOString();
  const allDates = datesBetween(request.start_date, request.end_date);
  const existingAvailability = await db.employeeAvailabilityExceptions
    .where('source_id')
    .equals(request.id)
    .toArray();
  const availabilityKeys = new Set(existingAvailability.map((row) => row.date));
  const availability: EmployeeAvailabilityException[] = allDates
    .filter((date) => !availabilityKeys.has(date))
    .map((date) => pending({
      id: `${request.id}:${date}`,
      employee_id: request.employee_id,
      date,
      source_type: 'LEAVE' as const,
      source_id: request.id,
      reason: request.reason,
      created_at: now,
      updated_at: now,
    }));

  const schedules = await db.employeeCollectionSchedules
    .where('employee_id')
    .equals(request.employee_id)
    .and((row) => row.is_active)
    .toArray();
  const existingCoverage = await db.collectionCoverageExceptions
    .where('source_leave_request_id')
    .equals(request.id)
    .toArray();
  const coverageKeys = new Set(existingCoverage.map((row) => `${row.collection_schedule_id}:${row.collection_date}`));
  const employee = await db.employees.get(request.employee_id);
  const coverage = schedules.flatMap((schedule) => allDates
    .filter((date) => (
      isoWeekday(date) === schedule.weekday &&
      (!schedule.effective_from || schedule.effective_from.slice(0, 10) <= date) &&
      (!schedule.effective_until || schedule.effective_until.slice(0, 10) >= date) &&
      !coverageKeys.has(`${schedule.id}:${date}`)
    ))
    .map((date) => pending({
      id: `${schedule.id}:${date}`,
      collection_schedule_id: schedule.id,
      area_id: schedule.area_id,
      area_name: schedule.area_name,
      original_employee_id: request.employee_id,
      original_employee_name: employee?.name ?? request.employee_name,
      collection_date: date,
      source_leave_request_id: request.id,
      status: 'OPEN' as const,
      created_at: now,
      updated_at: now,
    })));
  return { availability, coverage, now, actor };
};

export const approveLeaveAsHr = async (
  requestId: string,
  notes?: string,
) => {
  const actor = await requireActor('hr.leave.hr_approve');
  const request = await db.leaveRequests.get(requestId);
  if (!request) throw new Error('Pengajuan cuti tidak ditemukan.');
  if (request.status !== 'PENDING_HR') throw new Error('Pengajuan tidak menunggu approval HR.');
  if (actor.employee_id === request.employee_id && actor.role !== 'OWNER') {
    throw new Error('Pengaju tidak boleh memberi approval final untuk cutinya sendiri.');
  }
  if (actor.employee_id === request.employee_id && !notes?.trim()) {
    throw new Error('Owner wajib mengisi alasan ketika melakukan self-approval.');
  }
  const health = await postgresAdapter.healthCheck();
  if (!health.available) {
    throw new Error('Approval final HR wajib dilakukan saat PostgreSQL terhubung.');
  }
  const sessionToken = await getCurrentServerSessionToken();
  if (!sessionToken) throw new Error('Sesi server tidak tersedia. Silakan login ulang.');

  const { availability, coverage, now } = await buildApprovedLeaveSideEffects(request, actor);
  const reservedRows = await db.leaveBalanceLedger
    .where('[employee_id+leave_type_id+year]')
    .equals([request.employee_id, request.leave_type_id, Number(request.start_date.slice(0, 4))])
    .toArray();
  const reservation = reservedRows.find((row) => row.movement_kind === 'RESERVE');
  const consume: LeaveBalanceLedgerEntry | undefined = reservation ? pending({
    id: `${request.id}:CONSUME`,
    employee_id: request.employee_id,
    leave_type_id: request.leave_type_id,
    year: Number(request.start_date.slice(0, 4)),
    movement_kind: 'CONSUME' as const,
    available_delta: 0,
    reserved_delta: -request.day_count,
    used_delta: request.day_count,
    leave_request_id: request.id,
    notes: `Pemakaian ${request.leave_type_name}`,
    created_at: now,
    created_by: actor.id,
    created_by_name: actor.name,
  }) : undefined;
  const updated = pending({
    ...request,
    status: 'APPROVED' as const,
    hr_decided_at: now,
    decided_by: actor.id,
    decided_by_name: actor.name,
    decision_notes: notes?.trim() || undefined,
    updated_at: now,
  });
  const approvalAction: LeaveRequestAction = pending({
    id: `${request.id}:HR_APPROVED`,
    leave_request_id: request.id,
    action: 'HR_APPROVED',
    actor_user_id: actor.id,
    actor_name: actor.name,
    notes: notes?.trim() || undefined,
    created_at: now,
  });
  const auditActions = await db.leaveRequestActions
    .where('leave_request_id')
    .equals(request.id)
    .toArray();
  const leaveType = await db.leaveTypes.get(request.leave_type_id);
  if (!leaveType) {
    throw new Error('Jenis cuti tidak ditemukan. Sinkronkan ulang data HR sebelum approval final.');
  }
  await workforcePostgresAdapter.finalizeLeaveRequest({
    session_token: sessionToken,
    leave_type: leaveType,
    request: updated,
    actions: [...auditActions, approvalAction],
    ledger: consume ? [...reservedRows, consume] : reservedRows,
    availability,
    coverage,
  });
  const locallyApproved = {
    ...updated,
    sync_status: 'synced' as const,
    sync_error: undefined,
    last_synced_at: now,
    remote_updated_at: now,
  };
  await db.transaction('rw', [
    db.leaveRequests,
    db.leaveRequestActions,
    db.leaveBalanceLedger,
    db.employeeAvailabilityExceptions,
    db.collectionCoverageExceptions,
    db.activityLogs,
  ], async () => {
    await db.leaveRequests.put(locallyApproved);
    if (consume) await db.leaveBalanceLedger.add(consume);
    if (availability.length > 0) await db.employeeAvailabilityExceptions.bulkPut(availability);
    if (coverage.length > 0) await db.collectionCoverageExceptions.bulkPut(coverage);
    await db.leaveRequestActions.put(approvalAction);
    await writeActivityLog({
      user: actor,
      action: 'LEAVE_REQUEST_APPROVED',
      entity: 'leaveRequests',
      entity_id: request.id,
      description: `${actor.name} menyetujui cuti ${request.employee_name}; ${coverage.length} konflik penagihan dibuat.`,
    });
  });
  return locallyApproved;
};

const releaseReservation = (
  request: LeaveRequest,
  actor: Awaited<ReturnType<typeof getCurrentSessionUser>>,
  movementKind: 'RELEASE' | 'REVERSAL',
): LeaveBalanceLedgerEntry => pending({
  id: `${request.id}:${movementKind}`,
  employee_id: request.employee_id,
  leave_type_id: request.leave_type_id,
  year: Number(request.start_date.slice(0, 4)),
  movement_kind: movementKind,
  available_delta: request.day_count,
  reserved_delta: movementKind === 'RELEASE' ? -request.day_count : 0,
  used_delta: movementKind === 'REVERSAL' ? -request.day_count : 0,
  leave_request_id: request.id,
  notes: movementKind === 'RELEASE' ? 'Pelepasan reservasi cuti' : 'Pembalikan pemakaian cuti',
  created_at: new Date().toISOString(),
  created_by: actor?.id,
  created_by_name: actor?.name,
});

export const rejectLeaveRequest = async (requestId: string, notes: string) => {
  const request = await db.leaveRequests.get(requestId);
  if (!request) throw new Error('Pengajuan cuti tidak ditemukan.');
  const permission: Permission = request.status === 'PENDING_SUPERVISOR'
    ? 'hr.leave.supervisor_approve'
    : 'hr.leave.hr_approve';
  const actor = await requireActor(permission);
  if (!['PENDING_SUPERVISOR', 'PENDING_HR'].includes(request.status)) {
    throw new Error('Pengajuan tidak dapat ditolak pada status saat ini.');
  }
  if (actor.employee_id === request.employee_id) throw new Error('Pengaju tidak boleh menolak cutinya sendiri.');
  const hasReservation = (await db.leaveBalanceLedger.where('leave_request_id').equals(request.id).toArray())
    .some((row) => row.movement_kind === 'RESERVE');
  const now = new Date().toISOString();
  const updated = pending({
    ...request,
    status: 'REJECTED' as const,
    decided_by: actor.id,
    decided_by_name: actor.name,
    decision_notes: notes.trim(),
    updated_at: now,
  });
  await db.transaction('rw', [db.leaveRequests, db.leaveRequestActions, db.leaveBalanceLedger], async () => {
    await db.leaveRequests.put(updated);
    if (hasReservation) await db.leaveBalanceLedger.add(releaseReservation(request, actor, 'RELEASE'));
    await addAction(request.id, 'REJECTED', actor, notes);
  });
  await enqueueLeaveWorkflowSync(updated, 'update');
  return updated;
};

export const cancelLeaveRequest = async (requestId: string, notes: string) => {
  const request = await db.leaveRequests.get(requestId);
  if (!request) throw new Error('Pengajuan cuti tidak ditemukan.');
  const actor = request.status === 'APPROVED'
    ? await requireActor('hr.leave.hr_approve')
    : await assertLeaveOwnerOrHr(request.employee_id);
  if (!['DRAFT', 'PENDING_SUPERVISOR', 'PENDING_HR', 'APPROVED'].includes(request.status)) {
    throw new Error('Pengajuan tidak dapat dibatalkan pada status saat ini.');
  }
  if (request.status === 'APPROVED') {
    const health = await postgresAdapter.healthCheck();
    if (!health.available) throw new Error('Pembatalan cuti approved wajib dilakukan saat PostgreSQL terhubung.');
  }
  const coverage = await db.collectionCoverageExceptions
    .where('source_leave_request_id')
    .equals(request.id)
    .toArray();
  if (coverage.some((row) => row.status === 'RESOLVED' && row.collection_date < dayjs().tz().format(DATE_FORMAT))) {
    throw new Error('Coverage yang sudah berjalan tidak dapat dihapus; buat koreksi operasional.');
  }
  const ledger = await db.leaveBalanceLedger.where('leave_request_id').equals(request.id).toArray();
  const movement = request.status === 'APPROVED'
    ? (ledger.some((row) => row.movement_kind === 'CONSUME') ? 'REVERSAL' : undefined)
    : (ledger.some((row) => row.movement_kind === 'RESERVE') ? 'RELEASE' : undefined);
  const now = new Date().toISOString();
  const updated = pending({ ...request, status: 'CANCELLED' as const, decision_notes: notes.trim(), updated_at: now });
  const balanceReversal = movement ? releaseReservation(request, actor, movement) : undefined;
  const cancellationAction: LeaveRequestAction = pending({
    id: `${request.id}:CANCELLED`,
    leave_request_id: request.id,
    action: 'CANCELLED',
    actor_user_id: actor.id,
    actor_name: actor.name,
    notes: notes.trim(),
    created_at: now,
  });
  if (request.status === 'APPROVED') {
    const sessionToken = await getCurrentServerSessionToken();
    if (!sessionToken) throw new Error('Sesi server tidak tersedia. Silakan login ulang.');
    await workforcePostgresAdapter.cancelApprovedLeaveRequest({
      session_token: sessionToken,
      request: updated,
      action: cancellationAction,
      ledger: balanceReversal,
    });
  }
  const locallyCancelled = request.status === 'APPROVED'
    ? {
        ...updated,
        sync_status: 'synced' as const,
        sync_error: undefined,
        last_synced_at: now,
        remote_updated_at: now,
      }
    : updated;
  await db.transaction('rw', [
    db.leaveRequests,
    db.leaveRequestActions,
    db.leaveBalanceLedger,
    db.employeeAvailabilityExceptions,
    db.collectionCoverageExceptions,
  ], async () => {
    await db.leaveRequests.put(locallyCancelled);
    if (balanceReversal) await db.leaveBalanceLedger.put(balanceReversal);
    await db.employeeAvailabilityExceptions.where('source_id').equals(request.id).delete();
    for (const row of coverage) {
      await db.collectionCoverageExceptions.put(pending({
        ...row,
        status: 'CANCELLED' as const,
        updated_at: now,
      }));
    }
    await db.leaveRequestActions.put(cancellationAction);
  });
  if (request.status !== 'APPROVED') {
    await enqueueLeaveWorkflowSync(locallyCancelled, 'update');
  }
  return locallyCancelled;
};
