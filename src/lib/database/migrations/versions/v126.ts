import type {
  CollectionCoverageException,
  CompanyCalendarDay,
  EmployeeAvailabilityException,
  EmployeeCashAdvance,
  EmployeeCashAdvanceRepayment,
  EmployeeWorkScheduleAssignment,
  LeaveBalanceLedgerEntry,
  LeaveRequest,
  LeaveRequestAction,
  LeaveType,
  PayrollRun,
  PayrollRunItem,
  WorkScheduleDay,
  WorkScheduleTemplate,
} from '@/types';
import { normalizeStoredTimestamp } from '@/utils/timestamps';
import type { KasirkuDB } from '../../KasirkuDB';

export function registerMigrationV126(db: KasirkuDB) {
  db.version(126).stores({}).upgrade(async (migration) => {
    await migration.table<PayrollRun>('payrollRuns').toCollection().modify((run) => {
      run.approved_at = normalizeStoredTimestamp(run.approved_at);
      run.paid_at = normalizeStoredTimestamp(run.paid_at);
      run.voided_at = normalizeStoredTimestamp(run.voided_at);
      run.created_at = normalizeStoredTimestamp(run.created_at) ?? run.created_at;
      run.updated_at = normalizeStoredTimestamp(run.updated_at) ?? run.updated_at;
      run.last_synced_at = normalizeStoredTimestamp(run.last_synced_at);
      run.remote_updated_at = normalizeStoredTimestamp(run.remote_updated_at);
    });

    await migration.table<PayrollRunItem>('payrollRunItems').toCollection().modify((item) => {
      item.created_at = normalizeStoredTimestamp(item.created_at) ?? item.created_at;
      item.updated_at = normalizeStoredTimestamp(item.updated_at) ?? item.updated_at;
    });

    await migration.table<EmployeeCashAdvance>('employeeCashAdvances').toCollection().modify((cashAdvance) => {
      cashAdvance.disbursed_at = normalizeStoredTimestamp(cashAdvance.disbursed_at) ?? cashAdvance.disbursed_at;
      cashAdvance.voided_at = normalizeStoredTimestamp(cashAdvance.voided_at);
      cashAdvance.created_at = normalizeStoredTimestamp(cashAdvance.created_at) ?? cashAdvance.created_at;
      cashAdvance.updated_at = normalizeStoredTimestamp(cashAdvance.updated_at) ?? cashAdvance.updated_at;
      cashAdvance.last_synced_at = normalizeStoredTimestamp(cashAdvance.last_synced_at);
      cashAdvance.remote_updated_at = normalizeStoredTimestamp(cashAdvance.remote_updated_at);
    });

    await migration.table<EmployeeCashAdvanceRepayment>('employeeCashAdvanceRepayments').toCollection().modify((repayment) => {
      repayment.allocated_at = normalizeStoredTimestamp(repayment.allocated_at) ?? repayment.allocated_at;
      repayment.posted_at = normalizeStoredTimestamp(repayment.posted_at);
      repayment.voided_at = normalizeStoredTimestamp(repayment.voided_at);
      repayment.created_at = normalizeStoredTimestamp(repayment.created_at) ?? repayment.created_at;
      repayment.updated_at = normalizeStoredTimestamp(repayment.updated_at) ?? repayment.updated_at;
    });

    await migration.table<WorkScheduleTemplate>('workScheduleTemplates').toCollection().modify((template) => {
      template.created_at = normalizeStoredTimestamp(template.created_at) ?? template.created_at;
      template.updated_at = normalizeStoredTimestamp(template.updated_at) ?? template.updated_at;
      template.last_synced_at = normalizeStoredTimestamp(template.last_synced_at);
      template.remote_updated_at = normalizeStoredTimestamp(template.remote_updated_at);
    });

    await migration.table<WorkScheduleDay>('workScheduleDays').toCollection().modify((day) => {
      day.created_at = normalizeStoredTimestamp(day.created_at) ?? day.created_at;
      day.updated_at = normalizeStoredTimestamp(day.updated_at) ?? day.updated_at;
      day.last_synced_at = normalizeStoredTimestamp(day.last_synced_at);
      day.remote_updated_at = normalizeStoredTimestamp(day.remote_updated_at);
    });

    await migration.table<EmployeeWorkScheduleAssignment>('employeeWorkScheduleAssignments').toCollection().modify((assignment) => {
      assignment.created_at = normalizeStoredTimestamp(assignment.created_at) ?? assignment.created_at;
      assignment.updated_at = normalizeStoredTimestamp(assignment.updated_at) ?? assignment.updated_at;
      assignment.last_synced_at = normalizeStoredTimestamp(assignment.last_synced_at);
      assignment.remote_updated_at = normalizeStoredTimestamp(assignment.remote_updated_at);
    });

    await migration.table<CompanyCalendarDay>('companyCalendarDays').toCollection().modify((day) => {
      day.created_at = normalizeStoredTimestamp(day.created_at) ?? day.created_at;
      day.updated_at = normalizeStoredTimestamp(day.updated_at) ?? day.updated_at;
      day.last_synced_at = normalizeStoredTimestamp(day.last_synced_at);
      day.remote_updated_at = normalizeStoredTimestamp(day.remote_updated_at);
    });

    await migration.table<LeaveType>('leaveTypes').toCollection().modify((leaveType) => {
      leaveType.created_at = normalizeStoredTimestamp(leaveType.created_at) ?? leaveType.created_at;
      leaveType.updated_at = normalizeStoredTimestamp(leaveType.updated_at) ?? leaveType.updated_at;
      leaveType.last_synced_at = normalizeStoredTimestamp(leaveType.last_synced_at);
      leaveType.remote_updated_at = normalizeStoredTimestamp(leaveType.remote_updated_at);
    });

    await migration.table<LeaveRequest>('leaveRequests').toCollection().modify((request) => {
      request.submitted_at = normalizeStoredTimestamp(request.submitted_at);
      request.supervisor_decided_at = normalizeStoredTimestamp(request.supervisor_decided_at);
      request.hr_decided_at = normalizeStoredTimestamp(request.hr_decided_at);
      request.created_at = normalizeStoredTimestamp(request.created_at) ?? request.created_at;
      request.updated_at = normalizeStoredTimestamp(request.updated_at) ?? request.updated_at;
      request.last_synced_at = normalizeStoredTimestamp(request.last_synced_at);
      request.remote_updated_at = normalizeStoredTimestamp(request.remote_updated_at);
    });

    await migration.table<LeaveRequestAction>('leaveRequestActions').toCollection().modify((action) => {
      action.created_at = normalizeStoredTimestamp(action.created_at) ?? action.created_at;
      action.last_synced_at = normalizeStoredTimestamp(action.last_synced_at);
      action.remote_updated_at = normalizeStoredTimestamp(action.remote_updated_at);
    });

    await migration.table<LeaveBalanceLedgerEntry>('leaveBalanceLedger').toCollection().modify((ledger) => {
      ledger.created_at = normalizeStoredTimestamp(ledger.created_at) ?? ledger.created_at;
      ledger.last_synced_at = normalizeStoredTimestamp(ledger.last_synced_at);
      ledger.remote_updated_at = normalizeStoredTimestamp(ledger.remote_updated_at);
    });

    await migration.table<EmployeeAvailabilityException>('employeeAvailabilityExceptions').toCollection().modify((exception) => {
      exception.created_at = normalizeStoredTimestamp(exception.created_at) ?? exception.created_at;
      exception.updated_at = normalizeStoredTimestamp(exception.updated_at) ?? exception.updated_at;
      exception.last_synced_at = normalizeStoredTimestamp(exception.last_synced_at);
      exception.remote_updated_at = normalizeStoredTimestamp(exception.remote_updated_at);
    });

    await migration.table<CollectionCoverageException>('collectionCoverageExceptions').toCollection().modify((coverage) => {
      coverage.resolved_at = normalizeStoredTimestamp(coverage.resolved_at);
      coverage.created_at = normalizeStoredTimestamp(coverage.created_at) ?? coverage.created_at;
      coverage.updated_at = normalizeStoredTimestamp(coverage.updated_at) ?? coverage.updated_at;
      coverage.last_synced_at = normalizeStoredTimestamp(coverage.last_synced_at);
      coverage.remote_updated_at = normalizeStoredTimestamp(coverage.remote_updated_at);
    });
  });
}
