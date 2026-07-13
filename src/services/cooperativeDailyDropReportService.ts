import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import type {
  CooperativeLoan,
  CooperativeMember,
  Employee,
} from '@/types';
import {
  getCooperativeLoanPaidOffDateByLoanId,
  getLatestReportableLoanPaymentDateByLoanId,
} from '@/utils/koperasi/loanReport';
import { roundCurrency } from '@/utils/koperasi/loanSchedule';
import { getCurrentSessionUser, requireAnyUserPermission } from '@/auth/authService';

export interface CooperativeDailyDropReportFilters {
  startDate?: string;
  endDate?: string;
}

export type CooperativeDailyDropReportEventType = 'DROP' | 'PAID_OFF';

export interface CooperativeDailyDropReportSummary {
  row_count: number;
  old_member_count: number;
  new_member_count: number;
  exit_member_count: number;
  principal_amount: number;
  net_disbursement_amount: number;
  loan_service_amount: number;
  admin_fee_amount: number;
  mandatory_saving_amount: number;
  total_payable_amount: number;
}

export interface CooperativeDailyDropReportRow {
  id: string;
  event_type: CooperativeDailyDropReportEventType;
  event_date: string;
  date_key: string;
  officer_id?: string;
  officer_name?: string;
  officer_position?: string;
  loan_id: string;
  loan_number: string;
  member_id: string;
  member_number: string;
  member_name: string;
  loan_sequence: number;
  old_member_count: number;
  new_member_count: number;
  exit_member_count: number;
  principal_amount: number;
  net_disbursement_amount: number;
  loan_service_amount: number;
  admin_fee_amount: number;
  mandatory_saving_amount: number;
  total_payable_amount: number;
}

export interface CooperativeDailyDropReportGroup {
  key: string;
  date_key: string;
  officer_id?: string;
  officer_name?: string;
  officer_position?: string;
  rows: CooperativeDailyDropReportRow[];
  summary: CooperativeDailyDropReportSummary;
}

export interface CooperativeDailyDropReport {
  rows: CooperativeDailyDropReportRow[];
  groups: CooperativeDailyDropReportGroup[];
  summary: CooperativeDailyDropReportSummary;
}

export const createEmptyCooperativeDailyDropReportSummary = (): CooperativeDailyDropReportSummary => ({
  row_count: 0,
  old_member_count: 0,
  new_member_count: 0,
  exit_member_count: 0,
  principal_amount: 0,
  net_disbursement_amount: 0,
  loan_service_amount: 0,
  admin_fee_amount: 0,
  mandatory_saving_amount: 0,
  total_payable_amount: 0,
});

const getDateKey = (value: string) => dayjs(value).tz().format('YYYY-MM-DD');

const compareDateAsc = (left?: string, right?: string) => (
  (left ?? '').localeCompare(right ?? '')
);

const isDateKeyInRange = (value: string, startDate?: string, endDate?: string) => {
  const dateKey = getDateKey(value);
  const startKey = startDate ? getDateKey(startDate) : undefined;
  const endKey = endDate ? getDateKey(endDate) : undefined;

  return (!startKey || dateKey >= startKey) && (!endKey || dateKey <= endKey);
};

const isDroppedLoan = (loan: CooperativeLoan) => (
  (loan.status === 'DISBURSED' || loan.status === 'PAID_OFF') && Boolean(loan.disbursed_at)
);

const isOperationalDropLoan = (loan: CooperativeLoan) => (
  isDroppedLoan(loan) && !loan.is_migration
);

const getOfficer = (
  member: CooperativeMember | undefined,
  employeeById: Map<string, Employee>,
) => {
  const employee = member?.officer_id ? employeeById.get(member.officer_id) : undefined;

  return {
    officer_id: member?.officer_id,
    officer_name: employee?.name ?? member?.officer_name,
    officer_position: employee?.position ?? member?.officer_position,
  };
};

const getLoanNetDisbursementAmount = (loan: CooperativeLoan) => roundCurrency(
  Number(loan.net_disbursement_amount ?? loan.principal_amount),
);

const getLoanServiceAmount = (loan: CooperativeLoan) => roundCurrency(
  Number(loan.loan_service_amount ?? loan.total_interest_amount ?? 0),
);

const buildLoanSequenceByLoanId = (loans: CooperativeLoan[]) => {
  const sequenceByLoanId = new Map<string, number>();
  const countByMemberId = new Map<string, number>();

  loans
    .filter(isDroppedLoan)
    .sort((left, right) => {
      const disbursedCompare = compareDateAsc(left.disbursed_at, right.disbursed_at);
      if (disbursedCompare !== 0) return disbursedCompare;
      return left.loan_number.localeCompare(right.loan_number);
    })
    .forEach((loan) => {
      const nextSequence = (countByMemberId.get(loan.member_id) ?? 0) + 1;
      countByMemberId.set(loan.member_id, nextSequence);
      sequenceByLoanId.set(loan.id, nextSequence);
    });

  return sequenceByLoanId;
};

export const summarizeCooperativeDailyDropReportRows = (
  rows: CooperativeDailyDropReportRow[],
): CooperativeDailyDropReportSummary => rows.reduce((summary, row) => ({
  row_count: summary.row_count + 1,
  old_member_count: summary.old_member_count + row.old_member_count,
  new_member_count: summary.new_member_count + row.new_member_count,
  exit_member_count: summary.exit_member_count + row.exit_member_count,
  principal_amount: roundCurrency(summary.principal_amount + row.principal_amount),
  net_disbursement_amount: roundCurrency(summary.net_disbursement_amount + row.net_disbursement_amount),
  loan_service_amount: roundCurrency(summary.loan_service_amount + row.loan_service_amount),
  admin_fee_amount: roundCurrency(summary.admin_fee_amount + row.admin_fee_amount),
  mandatory_saving_amount: roundCurrency(summary.mandatory_saving_amount + row.mandatory_saving_amount),
  total_payable_amount: roundCurrency(summary.total_payable_amount + row.total_payable_amount),
}), createEmptyCooperativeDailyDropReportSummary());

const createRowFromLoan = ({
  loan,
  eventDate,
  eventType,
  sequence,
  member,
  employeeById,
}: {
  loan: CooperativeLoan;
  eventDate: string;
  eventType: CooperativeDailyDropReportEventType;
  sequence: number;
  member: CooperativeMember | undefined;
  employeeById: Map<string, Employee>;
}): CooperativeDailyDropReportRow => {
  const officer = getOfficer(member, employeeById);
  const isDrop = eventType === 'DROP';
  const isOldMember = isDrop && sequence > 1;
  const isNewMember = isDrop && sequence < 2;

  return {
    id: `${eventType}:${loan.id}:${getDateKey(eventDate)}`,
    event_type: eventType,
    event_date: eventDate,
    date_key: getDateKey(eventDate),
    officer_id: officer.officer_id,
    officer_name: officer.officer_name,
    officer_position: officer.officer_position,
    loan_id: loan.id,
    loan_number: loan.loan_number,
    member_id: loan.member_id,
    member_number: loan.member_number,
    member_name: loan.member_name,
    loan_sequence: sequence,
    old_member_count: isOldMember ? 1 : 0,
    new_member_count: isNewMember ? 1 : 0,
    exit_member_count: eventType === 'PAID_OFF' ? 1 : 0,
    principal_amount: isDrop ? roundCurrency(Number(loan.principal_amount || 0)) : 0,
    net_disbursement_amount: isDrop ? getLoanNetDisbursementAmount(loan) : 0,
    loan_service_amount: isDrop ? getLoanServiceAmount(loan) : 0,
    admin_fee_amount: isDrop ? roundCurrency(Number(loan.admin_fee_amount || 0)) : 0,
    mandatory_saving_amount: isDrop ? roundCurrency(Number(loan.mandatory_saving_amount || 0)) : 0,
    total_payable_amount: isDrop ? roundCurrency(Number(loan.total_payable_amount || 0)) : 0,
  };
};

export const getCooperativeDailyDropReport = async (
  filters: CooperativeDailyDropReportFilters = {},
): Promise<CooperativeDailyDropReport> => {
  await requireAnyUserPermission(await getCurrentSessionUser(), [
    'COOPERATIVE_DAILY_DROP_REPORT_VIEW',
    'COOPERATIVE_WEEKLY_DROP_REPORT_VIEW',
  ]);
  const [loans, members, employees, payments, installments] = await Promise.all([
    db.cooperativeLoans.orderBy('loan_number').toArray(),
    db.cooperativeMembers.orderBy('member_number').toArray(),
    db.employees.orderBy('name').toArray(),
    db.cooperativeLoanPayments.orderBy('payment_date').reverse().toArray(),
    db.cooperativeLoanInstallments.orderBy('loan_id').toArray(),
  ]);
  const memberById = new Map(members.map((member) => [member.id, member]));
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const loanSequenceByLoanId = buildLoanSequenceByLoanId(loans);
  const paidOffDateByLoanId = getCooperativeLoanPaidOffDateByLoanId(
    loans,
    payments,
    installments,
  );
  const latestPaymentDateByLoanId = getLatestReportableLoanPaymentDateByLoanId(payments);
  const dropRows = loans
    .filter(isOperationalDropLoan)
    .filter((loan) => loan.disbursed_at && isDateKeyInRange(loan.disbursed_at, filters.startDate, filters.endDate))
    .map((loan) => createRowFromLoan({
      loan,
      eventDate: loan.disbursed_at as string,
      eventType: 'DROP',
      sequence: loanSequenceByLoanId.get(loan.id) ?? 1,
      member: memberById.get(loan.member_id),
      employeeById,
    }));
  const paidOffRows = loans
    .filter((loan) => loan.status === 'PAID_OFF')
    .map((loan) => {
      const paidOffDate = loan.is_migration
        ? latestPaymentDateByLoanId.get(loan.id)
        : paidOffDateByLoanId.get(loan.id);
      if (!paidOffDate || !isDateKeyInRange(paidOffDate, filters.startDate, filters.endDate)) return undefined;

      return createRowFromLoan({
        loan,
        eventDate: paidOffDate,
        eventType: 'PAID_OFF',
        sequence: loanSequenceByLoanId.get(loan.id) ?? 1,
        member: memberById.get(loan.member_id),
        employeeById,
      });
    })
    .filter((row): row is CooperativeDailyDropReportRow => Boolean(row));
  const rows = [...dropRows, ...paidOffRows].sort((left, right) => {
    const dateCompare = compareDateAsc(left.event_date, right.event_date);
    if (dateCompare !== 0) return dateCompare;
    const officerCompare = (left.officer_name ?? '').localeCompare(right.officer_name ?? '');
    if (officerCompare !== 0) return officerCompare;
    return left.member_number.localeCompare(right.member_number);
  });
  const rowsByGroupKey = new Map<string, CooperativeDailyDropReportRow[]>();

  rows.forEach((row) => {
    const groupKey = `${row.date_key}:${row.officer_id ?? 'UNASSIGNED'}`;
    const current = rowsByGroupKey.get(groupKey) ?? [];
    current.push(row);
    rowsByGroupKey.set(groupKey, current);
  });

  const groups = Array.from(rowsByGroupKey.entries())
    .map(([key, groupRows]) => {
      const firstRow = groupRows[0];
      return {
        key,
        date_key: firstRow.date_key,
        officer_id: firstRow.officer_id,
        officer_name: firstRow.officer_name,
        officer_position: firstRow.officer_position,
        rows: groupRows,
        summary: summarizeCooperativeDailyDropReportRows(groupRows),
      } satisfies CooperativeDailyDropReportGroup;
    })
    .sort((left, right) => {
      const dateCompare = left.date_key.localeCompare(right.date_key);
      if (dateCompare !== 0) return dateCompare;
      return (left.officer_name ?? '').localeCompare(right.officer_name ?? '');
    });

  return {
    rows,
    groups,
    summary: summarizeCooperativeDailyDropReportRows(rows),
  };
};
