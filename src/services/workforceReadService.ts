import { db } from '@/lib/db';
import { workforcePostgresAdapter } from '@/services/postgresAdapter';

const synced = <T extends object>(row: T) => ({
  ...row,
  sync_status: 'synced' as const,
  sync_error: undefined,
  last_synced_at: new Date().toISOString(),
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
      await db.workScheduleTemplates.bulkPut(state.work_schedule_templates.map(synced));
    }
    if (state.work_schedule_days.length > 0) {
      await db.workScheduleDays.bulkPut(state.work_schedule_days.map(synced));
    }
    if (state.employee_work_schedule_assignments.length > 0) {
      await db.employeeWorkScheduleAssignments.bulkPut(
        state.employee_work_schedule_assignments.map(synced),
      );
    }
    if (state.company_calendar_days.length > 0) {
      await db.companyCalendarDays.bulkPut(state.company_calendar_days.map(synced));
    }
    if (state.leave_types.length > 0) await db.leaveTypes.bulkPut(state.leave_types.map(synced));
    if (state.leave_requests.length > 0) await db.leaveRequests.bulkPut(state.leave_requests.map(synced));
    if (state.leave_request_actions.length > 0) {
      await db.leaveRequestActions.bulkPut(state.leave_request_actions.map(synced));
    }
    if (state.leave_balance_ledger.length > 0) {
      await db.leaveBalanceLedger.bulkPut(state.leave_balance_ledger.map(synced));
    }
    if (state.availability.length > 0) {
      await db.employeeAvailabilityExceptions.bulkPut(state.availability.map(synced));
    }
    if (state.coverage.length > 0) {
      await db.collectionCoverageExceptions.bulkPut(state.coverage.map(synced));
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
