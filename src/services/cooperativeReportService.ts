import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import {
  getBalanceSheetReport,
  getIncomeStatementReport,
  getJournalEntriesWithLines,
  type BalanceSheetReport,
  type IncomeStatementReport,
  type JournalEntryWithLines,
} from '@/services/generalLedgerService';
import type {
  ChartOfAccount,
  CooperativeLoan,
  CooperativeLoanInstallment,
  CooperativeLoanInstallmentStatus,
  JournalSourceType,
} from '@/types';
import { getInstallmentRemainingAmounts } from '@/utils/koperasi/loanPaymentAllocation';
import { roundCurrency } from '@/utils/koperasi/loanSchedule';

const COOPERATIVE_JOURNAL_SOURCE_TYPES: JournalSourceType[] = [
  'COOPERATIVE_SAVING',
  'COOPERATIVE_LOAN',
];

export interface CooperativeReportFilters {
  startDate?: string;
  endDate?: string;
  asOfDate?: string;
  accountId?: string;
}

export interface CooperativeOverdueReportRow {
  id: string;
  installment_id: string;
  loan_id: string;
  loan_number: string;
  member_id: string;
  member_number: string;
  member_name: string;
  installment_number: number;
  due_date: string;
  days_overdue: number;
  status: CooperativeLoanInstallmentStatus;
  remaining_principal_amount: number;
  remaining_interest_amount: number;
  remaining_penalty_amount: number;
  remaining_total_amount: number;
}

export interface CooperativeOverdueReportSummary {
  row_count: number;
  loan_count: number;
  total_principal: number;
  total_interest: number;
  total_penalty: number;
  total_amount: number;
  max_days_overdue: number;
}

export interface CooperativeOverdueReport {
  rows: CooperativeOverdueReportRow[];
  summary: CooperativeOverdueReportSummary;
  as_of_date: string;
}

export interface CooperativeLedgerRow {
  id: string;
  entry_id: string;
  entry_date: string;
  entry_number: string;
  source_type: JournalSourceType;
  source_number?: string;
  source_event?: string;
  description: string;
  debit: number;
  credit: number;
  running_balance: number;
}

export interface CooperativeReportData {
  accounts: ChartOfAccount[];
  selectedAccount?: ChartOfAccount;
  journalEntries: JournalEntryWithLines[];
  ledgerRows: CooperativeLedgerRow[];
  incomeStatement: IncomeStatementReport;
  balanceSheet: BalanceSheetReport;
  overdueReport: CooperativeOverdueReport;
}

const createEmptyOverdueSummary = (): CooperativeOverdueReportSummary => ({
  row_count: 0,
  loan_count: 0,
  total_principal: 0,
  total_interest: 0,
  total_penalty: 0,
  total_amount: 0,
  max_days_overdue: 0,
});

const parseReportDate = (value?: string) => {
  if (!value) return dayjs.tz();
  return value.includes('T') ? dayjs(value).tz() : dayjs.tz(value);
};

const getDateKey = (value: string) => dayjs(value).tz().format('YYYY-MM-DD');

const isDateKeyInRange = (value: string, startDate?: string, endDate?: string) => {
  const dateKey = getDateKey(value);
  const startKey = startDate ? getDateKey(startDate) : undefined;
  const endKey = endDate ? getDateKey(endDate) : undefined;

  return (!startKey || dateKey >= startKey) && (!endKey || dateKey <= endKey);
};

const isLoanEligibleForOverdueReport = (loan: CooperativeLoan | undefined) => (
  loan?.status === 'DISBURSED'
);

const summarizeOverdueRows = (rows: CooperativeOverdueReportRow[]): CooperativeOverdueReportSummary => {
  const loanIds = new Set<string>();

  const summary = rows.reduce((acc, row) => {
    loanIds.add(row.loan_id);
    acc.row_count += 1;
    acc.total_principal += row.remaining_principal_amount;
    acc.total_interest += row.remaining_interest_amount;
    acc.total_penalty += row.remaining_penalty_amount;
    acc.total_amount += row.remaining_total_amount;
    acc.max_days_overdue = Math.max(acc.max_days_overdue, row.days_overdue);
    return acc;
  }, createEmptyOverdueSummary());

  return {
    ...summary,
    loan_count: loanIds.size,
    total_principal: roundCurrency(summary.total_principal),
    total_interest: roundCurrency(summary.total_interest),
    total_penalty: roundCurrency(summary.total_penalty),
    total_amount: roundCurrency(summary.total_amount),
  };
};

const buildOverdueReport = (
  loans: CooperativeLoan[],
  installments: CooperativeLoanInstallment[],
  filters: CooperativeReportFilters,
): CooperativeOverdueReport => {
  const loanById = new Map(loans.map((loan) => [loan.id, loan]));
  const asOfDate = parseReportDate(filters.asOfDate).startOf('day');
  const asOfDateKey = asOfDate.format('YYYY-MM-DD');

  const rows = installments
    .filter((installment) => isDateKeyInRange(installment.due_date, filters.startDate, filters.endDate))
    .map((installment) => {
      const loan = loanById.get(installment.loan_id);
      if (!isLoanEligibleForOverdueReport(loan)) return undefined;

      const dueDate = dayjs(installment.due_date).tz().startOf('day');
      const daysOverdue = Math.max(0, asOfDate.diff(dueDate, 'day'));
      const remaining = getInstallmentRemainingAmounts(installment);
      if (daysOverdue <= 0 || remaining.total_amount <= 0) return undefined;

      return {
        id: installment.id,
        installment_id: installment.id,
        loan_id: installment.loan_id,
        loan_number: installment.loan_number,
        member_id: installment.member_id,
        member_number: installment.member_number,
        member_name: installment.member_name,
        installment_number: installment.installment_number,
        due_date: installment.due_date,
        days_overdue: daysOverdue,
        status: installment.status,
        remaining_principal_amount: remaining.principal_amount,
        remaining_interest_amount: remaining.interest_amount,
        remaining_penalty_amount: remaining.penalty_amount,
        remaining_total_amount: remaining.total_amount,
      } satisfies CooperativeOverdueReportRow;
    })
    .filter((row): row is CooperativeOverdueReportRow => Boolean(row))
    .sort((left, right) => {
      const dueCompare = left.due_date.localeCompare(right.due_date);
      if (dueCompare !== 0) return dueCompare;
      return left.loan_number.localeCompare(right.loan_number);
    });

  return {
    rows,
    summary: summarizeOverdueRows(rows),
    as_of_date: asOfDateKey,
  };
};

const buildLedgerRows = (
  journalEntries: JournalEntryWithLines[],
  selectedAccount?: ChartOfAccount,
): CooperativeLedgerRow[] => {
  if (!selectedAccount) return [];

  let runningBalance = 0;

  return journalEntries
    .flatMap((entry) => entry.lines.map((line) => ({ entry, line })))
    .filter(({ line }) => line.account_id === selectedAccount.id)
    .sort((left, right) => {
      const dateCompare = left.entry.entry_date.localeCompare(right.entry.entry_date);
      if (dateCompare !== 0) return dateCompare;
      return left.entry.entry_number.localeCompare(right.entry.entry_number);
    })
    .map(({ entry, line }) => {
      const movement = selectedAccount.normal_balance === 'DEBIT'
        ? line.debit - line.credit
        : line.credit - line.debit;
      runningBalance = roundCurrency(runningBalance + movement);

      return {
        id: line.id,
        entry_id: entry.id,
        entry_date: entry.entry_date,
        entry_number: entry.entry_number,
        source_type: entry.source_type,
        source_number: entry.source_number,
        source_event: entry.source_event,
        description: line.description || entry.description,
        debit: line.debit,
        credit: line.credit,
        running_balance: runningBalance,
      };
    });
};

export const getCooperativeReportData = async (
  filters: CooperativeReportFilters = {},
): Promise<CooperativeReportData> => {
  const cooperativeLedgerFilters = {
    startDate: filters.startDate,
    endDate: filters.endDate,
    sourceTypes: COOPERATIVE_JOURNAL_SOURCE_TYPES,
  };

  const [
    accounts,
    journalEntries,
    incomeStatement,
    balanceSheet,
    loans,
    installments,
  ] = await Promise.all([
    db.chartOfAccounts.orderBy('code').toArray(),
    getJournalEntriesWithLines(cooperativeLedgerFilters),
    getIncomeStatementReport(cooperativeLedgerFilters),
    getBalanceSheetReport(cooperativeLedgerFilters),
    db.cooperativeLoans.toArray(),
    db.cooperativeLoanInstallments.orderBy('due_date').toArray(),
  ]);

  const selectedAccount = filters.accountId
    ? accounts.find((account) => account.id === filters.accountId)
    : undefined;

  return {
    accounts,
    selectedAccount,
    journalEntries,
    ledgerRows: buildLedgerRows(journalEntries, selectedAccount),
    incomeStatement,
    balanceSheet,
    overdueReport: buildOverdueReport(loans, installments, filters),
  };
};
