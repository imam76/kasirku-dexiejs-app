import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import type {
  CooperativeCollectionWeekday,
  CooperativeLoan,
  CooperativeLoanPayment,
  Employee,
} from '@/types';
import {
  getCollectionDatesInMonth,
  getIsoWeekday,
} from '@/utils/koperasi/collectionSchedule';
import { roundCurrency } from '@/utils/koperasi/loanSchedule';

export const COOPERATIVE_INSTALLMENT_BOOK_UNASSIGNED_EMPLOYEE = '__UNASSIGNED__';

export type CooperativeInstallmentBookAgingCategory =
  | 'CURRENT'
  | 'WATCHLIST'
  | 'DELINQUENT';

export interface CooperativeInstallmentBookReportFilters {
  monthDate?: string;
  employeeId?: string;
  visibleAreaIds?: string[];
  collectionWeekday?: CooperativeCollectionWeekday;
}

export interface CooperativeInstallmentBookReportSummary {
  row_count: number;
  principal_amount: number;
  opening_balance: number;
  installment_amount: number;
  ending_balance: number;
}

export interface CooperativeInstallmentBookReportRow {
  id: string;
  loan_id: string;
  loan_number: string;
  loan_date: string;
  member_id: string;
  member_number: string;
  member_name: string;
  member_category: 'L' | 'B';
  officer_id?: string;
  officer_name?: string;
  officer_position?: string;
  area_id?: string;
  area_code?: string;
  area_name?: string;
  collection_weekday?: CooperativeCollectionWeekday;
  age_month: number;
  aging_category: CooperativeInstallmentBookAgingCategory;
  principal_amount: number;
  opening_balance: number;
  payment_by_collection_date: Record<number, number>;
  installment_amount: number;
  ending_balance: number;
}

export interface CooperativeInstallmentBookReportSection {
  category: CooperativeInstallmentBookAgingCategory;
  rows: CooperativeInstallmentBookReportRow[];
  summary: CooperativeInstallmentBookReportSummary;
}

export interface CooperativeInstallmentBookReportGroup {
  key: string;
  officer_id?: string;
  officer_name?: string;
  officer_position?: string;
  area_names: string[];
  collection_weekdays: CooperativeCollectionWeekday[];
  collection_dates: number[];
  sections: CooperativeInstallmentBookReportSection[];
  summary: CooperativeInstallmentBookReportSummary;
}

export interface CooperativeInstallmentBookEmployeeOption {
  id: string;
  name: string;
  position?: string;
}

export interface CooperativeInstallmentBookReport {
  month_key: string;
  start_date: string;
  end_date: string;
  collection_weekday: CooperativeCollectionWeekday;
  groups: CooperativeInstallmentBookReportGroup[];
  employeeOptions: CooperativeInstallmentBookEmployeeOption[];
  summary: CooperativeInstallmentBookReportSummary;
}

const CATEGORY_ORDER: CooperativeInstallmentBookAgingCategory[] = [
  'DELINQUENT',
  'WATCHLIST',
  'CURRENT',
];

const createEmptySummary = (): CooperativeInstallmentBookReportSummary => ({
  row_count: 0,
  principal_amount: 0,
  opening_balance: 0,
  installment_amount: 0,
  ending_balance: 0,
});

const summarizeRows = (
  rows: CooperativeInstallmentBookReportRow[],
): CooperativeInstallmentBookReportSummary => rows.reduce((summary, row) => ({
  row_count: summary.row_count + 1,
  principal_amount: roundCurrency(summary.principal_amount + row.principal_amount),
  opening_balance: roundCurrency(summary.opening_balance + row.opening_balance),
  installment_amount: roundCurrency(summary.installment_amount + row.installment_amount),
  ending_balance: roundCurrency(summary.ending_balance + row.ending_balance),
}), createEmptySummary());

const getLoanDate = (loan: CooperativeLoan) => loan.disbursed_at ?? loan.application_date;

const isReportableLoan = (loan: CooperativeLoan) => (
  loan.status === 'DISBURSED' || loan.status === 'PAID_OFF'
);

const getLoanStartingBalance = (loan: CooperativeLoan) => roundCurrency(
  Number(loan.total_payable_amount || 0) ||
  Number(loan.principal_amount || 0) + Number(loan.total_interest_amount || 0),
);

const getEffectivePaymentAmount = (payment: CooperativeLoanPayment) => {
  const allocatedInstallment = roundCurrency(
    Number(payment.principal_amount || 0) + Number(payment.interest_amount || 0),
  );

  return allocatedInstallment > 0
    ? allocatedInstallment
    : roundCurrency(Number(payment.amount || 0));
};

const getSignedPaymentAmount = (payment: CooperativeLoanPayment) => (
  payment.payment_type === 'REVERSAL'
    ? -getEffectivePaymentAmount(payment)
    : getEffectivePaymentAmount(payment)
);

const getMonthAge = (loanDate: string, reportMonth: dayjs.Dayjs) => {
  const start = dayjs(loanDate).tz();
  const monthDifference =
    (reportMonth.year() - start.year()) * 12 +
    (reportMonth.month() - start.month());

  return Math.max(1, monthDifference + 1);
};

export const getCooperativeInstallmentBookAgingCategory = (
  ageMonth: number,
): CooperativeInstallmentBookAgingCategory => {
  if (ageMonth >= 6) return 'DELINQUENT';
  if (ageMonth === 5) return 'WATCHLIST';
  return 'CURRENT';
};

const buildLoanSequenceByLoanId = (loans: CooperativeLoan[]) => {
  const sequenceByLoanId = new Map<string, number>();
  const countByMemberId = new Map<string, number>();

  loans
    .filter(isReportableLoan)
    .sort((left, right) => {
      const dateCompare = getLoanDate(left).localeCompare(getLoanDate(right));
      if (dateCompare !== 0) return dateCompare;
      return left.loan_number.localeCompare(right.loan_number, undefined, { numeric: true });
    })
    .forEach((loan) => {
      const sequence = (countByMemberId.get(loan.member_id) ?? 0) + 1;
      countByMemberId.set(loan.member_id, sequence);
      sequenceByLoanId.set(loan.id, sequence);
    });

  return sequenceByLoanId;
};

const resolveCollectionWeekday = ({
  loan,
  loanDate,
}: {
  loan: CooperativeLoan;
  loanDate: string;
}) => loan.collection_weekday ?? getIsoWeekday(loanDate);

const compareEmployeeOptions = (
  left: CooperativeInstallmentBookEmployeeOption,
  right: CooperativeInstallmentBookEmployeeOption,
) => `${left.name} ${left.position ?? ''}`.localeCompare(
  `${right.name} ${right.position ?? ''}`,
  undefined,
  { numeric: true },
);

const buildEmployeeOptions = (
  employees: Employee[],
  rows: CooperativeInstallmentBookReportRow[],
) => {
  const optionById = new Map<string, CooperativeInstallmentBookEmployeeOption>();
  employees.forEach((employee) => {
    optionById.set(employee.id, {
      id: employee.id,
      name: employee.name,
      position: employee.position,
    });
  });
  rows.forEach((row) => {
    if (!row.officer_id || !row.officer_name || optionById.has(row.officer_id)) return;
    optionById.set(row.officer_id, {
      id: row.officer_id,
      name: row.officer_name,
      position: row.officer_position,
    });
  });
  return Array.from(optionById.values()).sort(compareEmployeeOptions);
};

const matchesFilters = (
  row: Pick<
    CooperativeInstallmentBookReportRow,
    'officer_id' | 'area_id' | 'collection_weekday'
  >,
  filters: CooperativeInstallmentBookReportFilters,
) => {
  if (filters.visibleAreaIds) {
    if (!row.area_id || !filters.visibleAreaIds.includes(row.area_id)) return false;
  }
  if (
    filters.collectionWeekday &&
    row.collection_weekday !== filters.collectionWeekday
  ) {
    return false;
  }
  if (!filters.employeeId) return true;
  if (filters.employeeId === COOPERATIVE_INSTALLMENT_BOOK_UNASSIGNED_EMPLOYEE) {
    return !row.officer_id;
  }
  return row.officer_id === filters.employeeId;
};

const createReportRow = ({
  loan,
  employeeById,
  payments,
  reportMonth,
  startDateKey,
  endDateKey,
  sequence,
}: {
  loan: CooperativeLoan;
  employeeById: Map<string, Employee>;
  payments: CooperativeLoanPayment[];
  reportMonth: dayjs.Dayjs;
  startDateKey: string;
  endDateKey: string;
  sequence: number;
}): CooperativeInstallmentBookReportRow | undefined => {
  const loanDate = getLoanDate(loan);
  const loanDateKey = dayjs(loanDate).tz().format('YYYY-MM-DD');
  if (loanDateKey > endDateKey) return undefined;

  let paidBeforeMonth = 0;
  let installmentAmount = 0;
  const paymentByCollectionDate: Record<number, number> = {};

  payments.forEach((payment) => {
    const paymentDate = dayjs(payment.payment_date).tz();
    const paymentDateKey = paymentDate.format('YYYY-MM-DD');
    if (paymentDateKey > endDateKey) return;

    const signedAmount = getSignedPaymentAmount(payment);
    if (paymentDateKey < startDateKey) {
      paidBeforeMonth = roundCurrency(paidBeforeMonth + signedAmount);
      return;
    }

    installmentAmount = roundCurrency(installmentAmount + signedAmount);
    const paymentDay = paymentDate.date();
    paymentByCollectionDate[paymentDay] = roundCurrency(
      (paymentByCollectionDate[paymentDay] ?? 0) + signedAmount,
    );
  });

  const startingBalance = getLoanStartingBalance(loan);
  const openingBalance = roundCurrency(Math.max(0, startingBalance - paidBeforeMonth));
  if (openingBalance <= 0 && Math.abs(installmentAmount) < 0.01) return undefined;

  const officerId = loan.officer_id;
  const employee = officerId ? employeeById.get(officerId) : undefined;
  const areaId = loan.area_id;
  const ageMonth = getMonthAge(loanDate, reportMonth);

  return {
    id: loan.id,
    loan_id: loan.id,
    loan_number: loan.loan_number,
    loan_date: loanDate,
    member_id: loan.member_id,
    member_number: loan.member_number,
    member_name: loan.member_name,
    member_category: sequence > 1 ? 'L' : 'B',
    officer_id: officerId,
    officer_name: loan.officer_name ?? employee?.name,
    officer_position: loan.officer_position ?? employee?.position,
    area_id: areaId,
    area_code: loan.area_code,
    area_name: loan.area_name,
    collection_weekday: resolveCollectionWeekday({
      loan,
      loanDate,
    }),
    age_month: ageMonth,
    aging_category: getCooperativeInstallmentBookAgingCategory(ageMonth),
    principal_amount: roundCurrency(Number(loan.principal_amount || 0)),
    opening_balance: openingBalance,
    payment_by_collection_date: paymentByCollectionDate,
    installment_amount: installmentAmount,
    ending_balance: roundCurrency(Math.max(0, openingBalance - installmentAmount)),
  };
};

export const getCooperativeInstallmentBookReport = async (
  filters: CooperativeInstallmentBookReportFilters = {},
): Promise<CooperativeInstallmentBookReport> => {
  const reportMonth = (filters.monthDate ? dayjs(filters.monthDate).tz() : dayjs().tz())
    .startOf('month');
  const collectionWeekday = filters.collectionWeekday ?? getIsoWeekday(dayjs().tz());
  const effectiveFilters: CooperativeInstallmentBookReportFilters = {
    ...filters,
    collectionWeekday,
  };
  const monthStart = reportMonth.startOf('month');
  const monthEnd = reportMonth.endOf('month');
  const startDateKey = monthStart.format('YYYY-MM-DD');
  const endDateKey = monthEnd.format('YYYY-MM-DD');
  const [loans, payments, employees] = await Promise.all([
    db.cooperativeLoans.orderBy('loan_number').toArray(),
    db.cooperativeLoanPayments.orderBy('payment_date').toArray(),
    db.employees.orderBy('name').toArray(),
  ]);
  const employeeById = new Map(employees.map((employee) => [employee.id, employee]));
  const paymentsByLoanId = new Map<string, CooperativeLoanPayment[]>();
  const sequenceByLoanId = buildLoanSequenceByLoanId(loans);

  payments.forEach((payment) => {
    const current = paymentsByLoanId.get(payment.loan_id) ?? [];
    current.push(payment);
    paymentsByLoanId.set(payment.loan_id, current);
  });

  const allRows = loans
    .filter(isReportableLoan)
    .map((loan) => createReportRow({
      loan,
      employeeById,
      payments: paymentsByLoanId.get(loan.id) ?? [],
      reportMonth,
      startDateKey,
      endDateKey,
      sequence: sequenceByLoanId.get(loan.id) ?? 1,
    }))
    .filter((row): row is CooperativeInstallmentBookReportRow => Boolean(row));
  const rows = allRows
    .filter((row) => matchesFilters(row, effectiveFilters))
    .sort((left, right) => {
      const categoryCompare =
        CATEGORY_ORDER.indexOf(left.aging_category) -
        CATEGORY_ORDER.indexOf(right.aging_category);
      if (categoryCompare !== 0) return categoryCompare;
      const dateCompare = left.loan_date.localeCompare(right.loan_date);
      if (dateCompare !== 0) return dateCompare;
      return left.member_number.localeCompare(right.member_number, undefined, { numeric: true });
    });
  const rowsByEmployee = new Map<string, CooperativeInstallmentBookReportRow[]>();

  rows.forEach((row) => {
    const key = row.officer_id || COOPERATIVE_INSTALLMENT_BOOK_UNASSIGNED_EMPLOYEE;
    rowsByEmployee.set(key, [...(rowsByEmployee.get(key) ?? []), row]);
  });

  const groups = Array.from(rowsByEmployee.entries())
    .map(([key, employeeRows]): CooperativeInstallmentBookReportGroup => {
      const firstRow = employeeRows[0];
      const areaNames = Array.from(new Set(employeeRows.map((row) => {
        if (row.area_code && row.area_name) return `${row.area_code} - ${row.area_name}`;
        return row.area_code ?? row.area_name;
      }).filter((area): area is string => Boolean(area)))).sort();
      const sections = CATEGORY_ORDER
        .map((category): CooperativeInstallmentBookReportSection => {
          const sectionRows = employeeRows.filter((row) => row.aging_category === category);
          return {
            category,
            rows: sectionRows,
            summary: summarizeRows(sectionRows),
          };
        })
        .filter((section) => section.rows.length > 0);

      return {
        key,
        officer_id: firstRow?.officer_id,
        officer_name: firstRow?.officer_name,
        officer_position: firstRow?.officer_position,
        area_names: areaNames,
        collection_weekdays: [collectionWeekday],
        collection_dates: getCollectionDatesInMonth(reportMonth, [collectionWeekday]),
        sections,
        summary: summarizeRows(employeeRows),
      };
    })
    .sort((left, right) => {
      if (!left.officer_id && right.officer_id) return 1;
      if (left.officer_id && !right.officer_id) return -1;
      return `${left.officer_name ?? ''} ${left.officer_position ?? ''}`.localeCompare(
        `${right.officer_name ?? ''} ${right.officer_position ?? ''}`,
        undefined,
        { numeric: true },
      );
    });

  return {
    month_key: reportMonth.format('YYYY-MM'),
    start_date: monthStart.toISOString(),
    end_date: monthEnd.toISOString(),
    collection_weekday: collectionWeekday,
    groups,
    employeeOptions: buildEmployeeOptions(employees, allRows),
    summary: summarizeRows(rows),
  };
};
