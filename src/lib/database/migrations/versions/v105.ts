import type {
  AuthUser,
  CooperativeLoan,
  CooperativeMember,
  Employee,
  EmployeeArea,
  EmployeeCollectionSchedule,
  LeaveType,
  Role,
  WorkScheduleDay,
  WorkScheduleTemplate,
  ImplementationReviewItem,
} from '@/types';
import type { KasirkuDB } from '../../KasirkuDB';

const dateKey = (value?: string) => value?.slice(0, 10);

export function registerMigrationV105(db: KasirkuDB) {
  db.version(105).stores({
    authUsers: 'id, name, &email, role, role_id, employee_id, is_active, created_at, updated_at, sync_status',
    employees: 'id, &employee_number, &nik, name, email, phone, user_id, login_role_id, field_cash_account_id, department_id, job_position_id, supervisor_id, employment_status, active_status, join_date, contract_end_date, is_active, updated_at, sync_status, created_at',
    cooperativeMembers: 'id, member_number, name, area_id, officer_id, collection_schedule_id, collection_weekday, collection_assignment_needs_review, status, sync_status, updated_at, created_at',
    employeeAreas: 'id, employee_id, area_id, [employee_id+area_id], effective_from, effective_until, is_primary, sync_status, updated_at, created_at',
    employeeCollectionSchedules: 'id, employee_id, area_id, weekday, [employee_id+area_id], [employee_id+area_id+weekday], is_default_for_new_members, is_active, sync_status, effective_from, effective_until, updated_at, created_at',
    workScheduleTemplates: 'id, &code, name, is_active, updated_at, sync_status',
    workScheduleDays: 'id, template_id, [template_id+weekday], weekday, is_working_day, updated_at, sync_status',
    employeeWorkScheduleAssignments: 'id, employee_id, template_id, [employee_id+effective_from], effective_from, effective_until, updated_at, sync_status',
    companyCalendarDays: 'id, &date, kind, updated_at, sync_status',
    leaveTypes: 'id, &code, name, is_paid, requires_balance, is_active, updated_at, sync_status',
    leaveRequests: 'id, employee_id, leave_type_id, status, start_date, end_date, supervisor_id, updated_at, sync_status',
    leaveRequestActions: 'id, leave_request_id, action, actor_user_id, created_at, sync_status',
    leaveBalanceLedger: 'id, employee_id, leave_type_id, [employee_id+leave_type_id+year], year, movement_kind, leave_request_id, created_at, sync_status',
    employeeAvailabilityExceptions: 'id, employee_id, date, [employee_id+date], source_type, source_id, updated_at, sync_status',
    collectionCoverageExceptions: 'id, collection_schedule_id, area_id, original_employee_id, collection_date, source_leave_request_id, [collection_schedule_id+collection_date], status, resolution_type, replacement_employee_id, rescheduled_date, updated_at, sync_status',
    implementationReviewQueue: 'id, review_type, entity_type, entity_id, status, updated_at, created_at',
  }).upgrade(async (transaction) => {
    const now = new Date().toISOString();
    const employeeTable = transaction.table<Employee>('employees');
    const authUserTable = transaction.table<AuthUser>('authUsers');
    const roleTable = transaction.table<Role>('roles');
    const areaTable = transaction.table<EmployeeArea>('employeeAreas');
    const scheduleTable = transaction.table<EmployeeCollectionSchedule>('employeeCollectionSchedules');
    const memberTable = transaction.table<CooperativeMember>('cooperativeMembers');
    const reviewTable = transaction.table<ImplementationReviewItem>('implementationReviewQueue');
    const loanTable = transaction.table<CooperativeLoan>('cooperativeLoans');

    const [employees, users, roles, assignments, schedules, members, loans] = await Promise.all([
      employeeTable.toArray(),
      authUserTable.toArray(),
      roleTable.toArray(),
      areaTable.toArray(),
      scheduleTable.toArray(),
      memberTable.toArray(),
      loanTable.toArray(),
    ]);

    const userById = new Map(users.map((user) => [user.id, user]));
    const userByEmployeeId = new Map(
      users.filter((user) => user.employee_id).map((user) => [user.employee_id as string, user]),
    );
    const roleById = new Map(roles.map((role) => [role.id, role]));
    const migratedUsers: AuthUser[] = [];

    for (const employee of employees) {
      const linked = (employee.user_id ? userById.get(employee.user_id) : undefined)
        ?? userByEmployeeId.get(employee.id);
      if (linked) {
        if (linked.employee_id !== employee.id) {
          migratedUsers.push({
            ...linked,
            employee_id: employee.id,
            updated_at: now,
            sync_status: 'pending',
            sync_error: undefined,
          });
        }
        continue;
      }
      if (!employee.pin_hash || !employee.pin_salt || !employee.login_role_id) continue;

      const role = roleById.get(employee.login_role_id);
      const preferredId = employee.user_id && !userById.has(employee.user_id)
        ? employee.user_id
        : employee.id;
      if (userById.has(preferredId)) continue;
      migratedUsers.push({
        id: preferredId,
        name: employee.name,
        email: employee.email,
        role: role?.code === 'OWNER' || role?.code === 'ADMIN' || role?.code === 'GUDANG'
          ? role.code
          : 'KASIR',
        role_id: role?.id ?? employee.login_role_id,
        role_name: role?.name,
        employee_id: employee.id,
        pin_hash: employee.pin_hash,
        pin_salt: employee.pin_salt,
        is_active: employee.is_active,
        created_at: employee.created_at,
        updated_at: now,
        sync_status: 'pending',
      });
    }
    if (migratedUsers.length > 0) await authUserTable.bulkPut(migratedUsers);

    if (assignments.length > 0) {
      await areaTable.bulkPut(assignments.map((assignment) => ({
        ...assignment,
        effective_from: assignment.effective_from ?? dateKey(assignment.created_at) ?? dateKey(now),
        is_primary: assignment.is_primary ?? false,
        updated_at: now,
        sync_status: 'pending',
        sync_error: undefined,
      })));
    }

    const activeSchedulesByArea = new Map<string, EmployeeCollectionSchedule[]>();
    schedules.forEach((schedule) => {
      if (!schedule.is_active) return;
      const candidates = activeSchedulesByArea.get(schedule.area_id) ?? [];
      candidates.push(schedule);
      activeSchedulesByArea.set(schedule.area_id, candidates);
    });
    if (schedules.length > 0) {
      await scheduleTable.bulkPut(schedules.map((schedule) => ({
        ...schedule,
        is_default_for_new_members: schedule.is_default_for_new_members
          ?? activeSchedulesByArea.get(schedule.area_id)?.length === 1,
        updated_at: now,
        sync_status: 'pending',
        sync_error: undefined,
      })));
    }

    const loansByMember = new Map<string, CooperativeLoan[]>();
    loans.forEach((loan) => {
      const rows = loansByMember.get(loan.member_id) ?? [];
      rows.push(loan);
      loansByMember.set(loan.member_id, rows);
    });
    const migratedMembers = members.map((member) => {
      if (member.collection_schedule_id || !member.area_id || !member.officer_id) return member;
      const candidates = schedules.filter((schedule) => (
        schedule.employee_id === member.officer_id &&
        schedule.area_id === member.area_id &&
        schedule.is_active
      ));
      const loanScheduleId = (loansByMember.get(member.id) ?? [])
        .sort((left, right) => right.updated_at.localeCompare(left.updated_at))
        .find((loan) => loan.collection_schedule_id)?.collection_schedule_id;
      const selected = candidates.find((schedule) => schedule.id === loanScheduleId)
        ?? (candidates.length === 1 ? candidates[0] : undefined);
      return {
        ...member,
        collection_schedule_id: selected?.id,
        collection_weekday: selected?.weekday,
        collection_assignment_needs_review: !selected,
        updated_at: now,
        sync_status: 'pending' as const,
        sync_error: undefined,
      };
    });
    if (migratedMembers.length > 0) await memberTable.bulkPut(migratedMembers);
    const reviewItems: ImplementationReviewItem[] = migratedMembers
      .filter((member) => member.collection_assignment_needs_review)
      .map((member) => ({
        id: `member-collection-schedule:${member.id}`,
        review_type: 'MEMBER_COLLECTION_SCHEDULE',
        entity_type: 'cooperativeMembers',
        entity_id: member.id,
        summary: `${member.member_number} - ${member.name} belum memiliki jadwal penagihan yang dapat ditentukan secara tunggal.`,
        status: 'OPEN',
        payload: {
          area_id: member.area_id,
          officer_id: member.officer_id,
        },
        created_at: now,
        updated_at: now,
      }));
    if (reviewItems.length > 0) await reviewTable.bulkPut(reviewItems);

    const template: WorkScheduleTemplate = {
      id: 'work-schedule-default-weekdays',
      code: 'DEFAULT-WEEKDAYS',
      name: 'Senin–Jumat',
      timezone: 'Asia/Jakarta',
      is_active: true,
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
    };
    await transaction.table<WorkScheduleTemplate>('workScheduleTemplates').put(template);
    const workDays: WorkScheduleDay[] = [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
      id: `${template.id}:${weekday}`,
      template_id: template.id,
      weekday: weekday as WorkScheduleDay['weekday'],
      is_working_day: weekday <= 5,
      start_time: weekday <= 5 ? '08:00' : undefined,
      end_time: weekday <= 5 ? '17:00' : undefined,
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
    }));
    await transaction.table<WorkScheduleDay>('workScheduleDays').bulkPut(workDays);

    const annualLeave: LeaveType = {
      id: 'leave-type-annual',
      code: 'ANNUAL',
      name: 'Cuti Tahunan',
      is_paid: true,
      requires_balance: true,
      annual_quota_days: 12,
      is_active: true,
      created_at: now,
      updated_at: now,
      sync_status: 'pending',
    };
    await transaction.table<LeaveType>('leaveTypes').put(annualLeave);
  });
}
