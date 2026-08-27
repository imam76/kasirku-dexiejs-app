import { db } from '@/lib/db';
import { workforcePostgresAdapter } from '@/services/postgresAdapter';
import type {
  CollectionCoverageException,
  CompanyCalendarDay,
  EmployeeAvailabilityException,
  EmployeeWorkScheduleAssignment,
  LeaveBalanceLedgerEntry,
  LeaveRequest,
  LeaveRequestAction,
  LeaveType,
  WorkScheduleDay,
  WorkScheduleTemplate,
} from '@/types';
import { toCanonicalIsoTimestamp, toCanonicalOptionalIsoTimestamp } from '@/utils/timestamps';

const synced = <T extends object>(row: T) => ({
  ...row,
  sync_status: 'synced' as const,
  sync_error: undefined,
  last_synced_at: new Date().toISOString(),
});

const normalizeWorkScheduleTemplate = (row: WorkScheduleTemplate): WorkScheduleTemplate => ({
  ...row,
  created_at: toCanonicalIsoTimestamp(row.created_at),
  updated_at: toCanonicalIsoTimestamp(row.updated_at),
});

const normalizeWorkScheduleDay = (row: WorkScheduleDay): WorkScheduleDay => ({
  ...row,
  created_at: toCanonicalIsoTimestamp(row.created_at),
  updated_at: toCanonicalIsoTimestamp(row.updated_at),
});

const normalizeEmployeeWorkScheduleAssignment = (
  row: EmployeeWorkScheduleAssignment,
): EmployeeWorkScheduleAssignment => ({
  ...row,
  created_at: toCanonicalIsoTimestamp(row.created_at),
  updated_at: toCanonicalIsoTimestamp(row.updated_at),
});

const normalizeCompanyCalendarDay = (row: CompanyCalendarDay): CompanyCalendarDay => ({
  ...row,
  created_at: toCanonicalIsoTimestamp(row.created_at),
  updated_at: toCanonicalIsoTimestamp(row.updated_at),
});

const normalizeLeaveType = (row: LeaveType): LeaveType => ({
  ...row,
  created_at: toCanonicalIsoTimestamp(row.created_at),
  updated_at: toCanonicalIsoTimestamp(row.updated_at),
});

const normalizeLeaveRequest = (row: LeaveRequest): LeaveRequest => ({
  ...row,
  submitted_at: toCanonicalOptionalIsoTimestamp(row.submitted_at),
  supervisor_decided_at: toCanonicalOptionalIsoTimestamp(row.supervisor_decided_at),
  hr_decided_at: toCanonicalOptionalIsoTimestamp(row.hr_decided_at),
  created_at: toCanonicalIsoTimestamp(row.created_at),
  updated_at: toCanonicalIsoTimestamp(row.updated_at),
});

const normalizeLeaveRequestAction = (row: LeaveRequestAction): LeaveRequestAction => ({
  ...row,
  created_at: toCanonicalIsoTimestamp(row.created_at),
});

const normalizeLeaveBalanceLedgerEntry = (
  row: LeaveBalanceLedgerEntry,
): LeaveBalanceLedgerEntry => ({
  ...row,
  created_at: toCanonicalIsoTimestamp(row.created_at),
});

const normalizeEmployeeAvailabilityException = (
  row: EmployeeAvailabilityException,
): EmployeeAvailabilityException => ({
  ...row,
  created_at: toCanonicalIsoTimestamp(row.created_at),
  updated_at: toCanonicalIsoTimestamp(row.updated_at),
});

const normalizeCollectionCoverageException = (
  row: CollectionCoverageException,
): CollectionCoverageException => ({
  ...row,
  resolved_at: toCanonicalOptionalIsoTimestamp(row.resolved_at),
  created_at: toCanonicalIsoTimestamp(row.created_at),
  updated_at: toCanonicalIsoTimestamp(row.updated_at),
});

export const refreshWorkforceStateFromPostgres = async () => {
  const state = await workforcePostgresAdapter.listState();
  if (!state) return {
    leaveRequests: 0,
    coverage: 0,
  };
  const serverRequestIds = new Set(state.leave_requests.map((row) => row.id));
  const serverAvailabilityIds = new Set(state.availability.map((row) => row.id));
  await db.transaction('rw', [
    db.workScheduleTemplates,
    db.workScheduleDays,
    db.employeeWorkScheduleAssignments,
    db.companyCalendarDays,
    db.leaveTypes,
    db.leaveRequests,
    db.leaveRequestActions,
    db.leaveBalanceLedger,
    db.employeeAvailabilityExceptions,
    db.collectionCoverageExceptions,
  ], async () => {
    if (state.work_schedule_templates.length > 0) {
      await db.workScheduleTemplates.bulkPut(
        state.work_schedule_templates.map(normalizeWorkScheduleTemplate).map(synced),
      );
    }
    if (state.work_schedule_days.length > 0) {
      await db.workScheduleDays.bulkPut(
        state.work_schedule_days.map(normalizeWorkScheduleDay).map(synced),
      );
    }
    if (state.employee_work_schedule_assignments.length > 0) {
      await db.employeeWorkScheduleAssignments.bulkPut(
        state.employee_work_schedule_assignments
          .map(normalizeEmployeeWorkScheduleAssignment)
          .map(synced),
      );
    }
    if (state.company_calendar_days.length > 0) {
      await db.companyCalendarDays.bulkPut(
        state.company_calendar_days.map(normalizeCompanyCalendarDay).map(synced),
      );
    }
    if (state.leave_types.length > 0) {
      await db.leaveTypes.bulkPut(state.leave_types.map(normalizeLeaveType).map(synced));
    }
    if (state.leave_requests.length > 0) {
      await db.leaveRequests.bulkPut(state.leave_requests.map(normalizeLeaveRequest).map(synced));
    }
    if (state.leave_request_actions.length > 0) {
      await db.leaveRequestActions.bulkPut(
        state.leave_request_actions.map(normalizeLeaveRequestAction).map(synced),
      );
    }
    if (state.leave_balance_ledger.length > 0) {
      await db.leaveBalanceLedger.bulkPut(
        state.leave_balance_ledger.map(normalizeLeaveBalanceLedgerEntry).map(synced),
      );
    }
    if (state.availability.length > 0) {
      await db.employeeAvailabilityExceptions.bulkPut(
        state.availability.map(normalizeEmployeeAvailabilityException).map(synced),
      );
    }
    if (state.coverage.length > 0) {
      await db.collectionCoverageExceptions.bulkPut(
        state.coverage.map(normalizeCollectionCoverageException).map(synced),
      );
    }
    const staleAvailability = (await db.employeeAvailabilityExceptions.toArray())
      .filter((row) => serverRequestIds.has(row.source_id) && !serverAvailabilityIds.has(row.id))
      .map((row) => row.id);
    if (staleAvailability.length > 0) {
      await db.employeeAvailabilityExceptions.bulkDelete(staleAvailability);
    }
  });
  return {
    leaveRequests: state.leave_requests.length,
    coverage: state.coverage.length,
  };
};
