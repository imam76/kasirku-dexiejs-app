import { FINANCE_CATEGORIES } from '@/constants/finance';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import {
  getJournalEntriesWithLines,
  type BalanceSheetReport,
  type IncomeStatementReport,
  type JournalEntryWithLines,
} from '@/services/generalLedgerService';
import {
  getGeneralLedgerReadiness,
  type GeneralLedgerReadinessResult,
} from '@/utils/accounting/getGeneralLedgerReadiness';
import { getAccountNormalBalance } from '@/utils/chartOfAccounts/getAccountNormalBalance';
import type {
  AccountNormalBalance,
  AccountType,
  ChartOfAccount,
  CooperativeLoan,
  CooperativeLoanInstallment,
  CooperativeLoanInstallmentStatus,
  CooperativeLoanPayment,
  CooperativeMember,
  CooperativeMemberSavingBalance,
  CooperativeSavingTransaction,
  FinanceTransaction,
  JournalEntryLine,
  JournalSourceType,
} from '@/types';
import { getCurrentSessionUser, requireAnyUserPermission } from '@/auth/authService';
import { getInstallmentRemainingAmounts } from '@/utils/koperasi/loanPaymentAllocation';
import { roundCurrency } from '@/utils/koperasi/loanSchedule';

const COOPERATIVE_JOURNAL_SOURCE_TYPES: JournalSourceType[] = [
  'COOPERATIVE_SAVING',
  'COOPERATIVE_LOAN',
];

const COOPERATIVE_FORMAL_STATEMENT_SOURCE_TYPES: JournalSourceType[] = [
  'OPENING_BALANCE',
  'COOPERATIVE_SAVING',
  'COOPERATIVE_LOAN',
  'MANUAL_JOURNAL',
];

const KSP_FINANCE_CATEGORIES = new Set<string>([
  FINANCE_CATEGORIES.KSP_SAVING_DEPOSIT,
  FINANCE_CATEGORIES.KSP_SAVING_WITHDRAWAL,
  FINANCE_CATEGORIES.KSP_LOAN_DISBURSEMENT,
  FINANCE_CATEGORIES.KSP_LOAN_PAYMENT,
]);

const MONEY_TOLERANCE = 0.01;

type JournalLinePair = {
  entry: JournalEntryWithLines;
  line: JournalEntryLine;
};

export type CooperativeCashFlowActivity = 'OPERATING' | 'INVESTING' | 'FINANCING';

const COOPERATIVE_CASH_FLOW_ACTIVITIES: CooperativeCashFlowActivity[] = [
  'OPERATING',
  'INVESTING',
  'FINANCING',
];

export interface CooperativeReportFilters {
  startDate?: string;
  endDate?: string;
  asOfDate?: string;
  cashFlowActivity?: CooperativeCashFlowActivity;
  cashFlowAccountType?: AccountType;
  cashFlowAccountId?: string;
}

export interface CooperativeOperationalSummary {
  member_count: number;
  active_member_count: number;
  total_saving_balance: number;
  active_loan_count: number;
  outstanding_loan_amount: number;
  overdue_amount: number;
  cash_in_amount: number;
  cash_out_amount: number;
  net_cash_amount: number;
}

export interface CooperativeMemberReportRow {
  id: string;
  member_number: string;
  name: string;
  phone?: string;
  officer_id?: string;
  officer_name?: string;
  officer_position?: string;
  join_date: string;
  status: CooperativeMember['status'];
  saving_balance: number;
  active_loan_count: number;
  outstanding_loan_amount: number;
}

export interface CooperativeSavingBalanceReportRow {
  id: string;
  member_id: string;
  member_number: string;
  member_name: string;
  saving_type: CooperativeMemberSavingBalance['saving_type'];
  balance: number;
  expected_balance: number;
  difference_amount: number;
  updated_at: string;
}

export interface CooperativeSavingMutationReportRow {
  id: string;
  member_id: string;
  member_number: string;
  member_name: string;
  saving_type: CooperativeSavingTransaction['saving_type'];
  transaction_type: CooperativeSavingTransaction['transaction_type'];
  amount: number;
  transaction_date: string;
  status: CooperativeSavingTransaction['status'];
  finance_transaction_id?: string;
  journal_entry_id?: string;
}

export interface CooperativeLoanReportRow {
  id: string;
  loan_number: string;
  member_id: string;
  member_number: string;
  member_name: string;
  principal_amount: number;
  total_interest_amount: number;
  total_payable_amount: number;
  outstanding_principal_amount: number;
  outstanding_interest_amount: number;
  outstanding_penalty_amount: number;
  outstanding_total_amount: number;
  installment_remaining_amount: number;
  installment_count: number;
  paid_installment_count: number;
  status: CooperativeLoan['status'];
  application_date: string;
  disbursed_at?: string;
  finance_transaction_id?: string;
  journal_entry_id?: string;
}

export interface CooperativeInstallmentReportRow {
  id: string;
  loan_id: string;
  loan_number: string;
  member_id: string;
  member_number: string;
  member_name: string;
  installment_number: number;
  due_date: string;
  principal_amount: number;
  interest_amount: number;
  penalty_amount: number;
  bill_amount: number;
  paid_amount: number;
  remaining_amount: number;
  status: CooperativeLoanInstallmentStatus;
}

export interface CooperativeLoanPaymentReportRow {
  id: string;
  payment_number: string;
  payment_type?: CooperativeLoanPayment['payment_type'];
  loan_id: string;
  loan_number: string;
  installment_id?: string;
  member_id: string;
  member_number: string;
  member_name: string;
  amount: number;
  principal_amount: number;
  interest_amount: number;
  penalty_amount: number;
  payment_date: string;
  status: CooperativeLoanPayment['status'];
  finance_transaction_id?: string;
  journal_entry_id?: string;
}

export interface CooperativeCashBankReportRow {
  id: string;
  type: FinanceTransaction['type'];
  category: string;
  amount: number;
  description: string;
  created_at: string;
  reference_id?: string;
  cash_account_code?: string;
  cash_account_name?: string;
  payment_method?: FinanceTransaction['payment_method'];
  payment_channel?: string;
}

export interface CooperativeFinancialReadiness {
  is_ready: boolean;
  is_module_enabled: boolean;
  can_show_financial_statements: boolean;
  cutoff_date?: string;
  messages: string[];
}

export interface CooperativeFinancialStatementRow {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: AccountType;
  normal_balance: AccountNormalBalance;
  debit: number;
  credit: number;
  balance: number;
}

export interface CooperativeBalanceSheetReport extends BalanceSheetReport {
  rows: CooperativeFinancialStatementRow[];
}

export interface CooperativeShuReport extends IncomeStatementReport {
  shu_amount: number;
  rows: CooperativeFinancialStatementRow[];
}

export interface CooperativeCashFlowRow {
  id: string;
  entry_id: string;
  entry_date: string;
  entry_number: string;
  source_type: JournalSourceType;
  source_number?: string;
  description: string;
  amount: number;
}

export interface CooperativeCashFlowSection {
  activity: CooperativeCashFlowActivity;
  cash_in_amount: number;
  cash_out_amount: number;
  net_amount: number;
  rows: CooperativeCashFlowRow[];
}

export interface CooperativeCashFlowStatement {
  beginning_cash_amount: number;
  operating_net_amount: number;
  investing_net_amount: number;
  financing_net_amount: number;
  net_cash_change_amount: number;
  ending_cash_amount: number;
  sections: CooperativeCashFlowSection[];
}

export interface CooperativeEquityChangeReport {
  opening_equity_amount: number;
  addition_amount: number;
  reduction_amount: number;
  period_shu_amount: number;
  ending_equity_amount: number;
  rows: CooperativeFinancialStatementRow[];
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

export type CooperativeReconciliationStatus = 'OK' | 'WARNING';

export type CooperativeReconciliationKey =
  | 'SAVING_BALANCE'
  | 'LOAN_OUTSTANDING'
  | 'PAYMENT_INSTALLMENT'
  | 'FINANCE_TRANSACTION'
  | 'JOURNAL_ENTRY';

export interface CooperativeReconciliationRow {
  key: CooperativeReconciliationKey;
  status: CooperativeReconciliationStatus;
  mismatch_count: number;
  expected_amount: number;
  actual_amount: number;
  difference_amount: number;
}

export interface CooperativeReconciliationSummary {
  status: CooperativeReconciliationStatus;
  mismatch_count: number;
  rows: CooperativeReconciliationRow[];
}

export interface CooperativeReportData {
  accounts: ChartOfAccount[];
  financialReadiness: CooperativeFinancialReadiness;
  summary: CooperativeOperationalSummary;
  memberRows: CooperativeMemberReportRow[];
  savingBalanceRows: CooperativeSavingBalanceReportRow[];
  savingMutationRows: CooperativeSavingMutationReportRow[];
  loanRows: CooperativeLoanReportRow[];
  installmentRows: CooperativeInstallmentReportRow[];
  loanPaymentRows: CooperativeLoanPaymentReportRow[];
  cashBankRows: CooperativeCashBankReportRow[];
  reconciliation: CooperativeReconciliationSummary;
  journalEntries: JournalEntryWithLines[];
  incomeStatement: IncomeStatementReport;
  balanceSheet: BalanceSheetReport;
  cooperativeBalanceSheet: CooperativeBalanceSheetReport;
  cooperativeShuReport: CooperativeShuReport;
  cooperativeCashFlowStatement: CooperativeCashFlowStatement;
  cooperativeEquityChangeReport: CooperativeEquityChangeReport;
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

const compareDateDesc = (left?: string, right?: string) => (
  (right ?? '').localeCompare(left ?? '')
);

const compareDateAsc = (left?: string, right?: string) => (
  (left ?? '').localeCompare(right ?? '')
);

const getStatementEndDate = (filters: CooperativeReportFilters) => (
  filters.endDate ?? parseReportDate(filters.asOfDate).endOf('day').toISOString()
);

const getBalanceSheetEndDate = (filters: CooperativeReportFilters) => (
  parseReportDate(filters.asOfDate).endOf('day').toISOString()
);

const isDateKeyOnOrBefore = (value: string, endDate?: string) => (
  !endDate || getDateKey(value) <= getDateKey(endDate)
);

const isDateKeyBefore = (value: string, startDate?: string) => (
  Boolean(startDate) && getDateKey(value) < getDateKey(startDate as string)
);

const isDateInStatementPeriod = (value: string, filters: CooperativeReportFilters) => (
  isDateKeyInRange(value, filters.startDate, getStatementEndDate(filters))
);

const getLoanOutstandingTotal = (loan: Pick<
  CooperativeLoan,
  'outstanding_principal_amount' | 'outstanding_interest_amount' | 'outstanding_penalty_amount'
>) => roundCurrency(
  Number(loan.outstanding_principal_amount || 0) +
  Number(loan.outstanding_interest_amount || 0) +
  Number(loan.outstanding_penalty_amount || 0),
);

const getInstallmentBillAmount = (installment: CooperativeLoanInstallment) => roundCurrency(
  Number(installment.principal_amount || 0) +
  Number(installment.interest_amount || 0) +
  Number(installment.penalty_amount || 0),
);

const getInstallmentPaidAmount = (installment: CooperativeLoanInstallment) => roundCurrency(
  Number(installment.paid_principal_amount || 0) +
  Number(installment.paid_interest_amount || 0) +
  Number(installment.paid_penalty_amount || 0),
);

const isLoanEligibleForOverdueReport = (loan: CooperativeLoan | undefined) => (
  loan?.status === 'DISBURSED'
);

const isOutstandingLoan = (loan: CooperativeLoan) => (
  loan.status === 'DISBURSED' || loan.status === 'PAID_OFF'
);

const isBalanceMismatch = (value: number) => Math.abs(value) > MONEY_TOLERANCE;

const getPostedLinePairs = (entries: JournalEntryWithLines[]): JournalLinePair[] => entries
  .filter((entry) => entry.status === 'POSTED')
  .flatMap((entry) => entry.lines.map((line) => ({ entry, line })));

const getLineNormalBalance = (
  line: JournalEntryLine,
  accountById: Map<string, ChartOfAccount>,
) => accountById.get(line.account_id)?.normal_balance ?? getAccountNormalBalance(line.account_type);

const getFinancialMovement = (
  debit: number,
  credit: number,
  normalBalance: AccountNormalBalance,
) => normalBalance === 'DEBIT'
  ? roundCurrency(debit - credit)
  : roundCurrency(credit - debit);

const isCashOrBankLine = (line: JournalEntryLine) => {
  const accountName = line.account_name.toLowerCase();
  return (
    line.account_code === '1010' ||
    line.account_code === '1020' ||
    accountName.includes('kas') ||
    accountName.includes('bank') ||
    accountName.includes('cash')
  );
};

const buildFinancialReadiness = (
  readiness: GeneralLedgerReadinessResult,
  generalLedgerModule: { is_enabled?: boolean } | undefined,
): CooperativeFinancialReadiness => {
  const isModuleEnabled = Boolean(generalLedgerModule?.is_enabled);
  const messages = [
    ...(!isModuleEnabled ? ['Module General Ledger belum aktif.'] : []),
    ...readiness.checks.filter((check) => !check.passed).map((check) => check.message),
  ];

  return {
    is_ready: readiness.isReady,
    is_module_enabled: isModuleEnabled,
    can_show_financial_statements: readiness.isReady && isModuleEnabled,
    cutoff_date: readiness.setting?.cutoff_date,
    messages,
  };
};

const buildFinancialRows = (
  entries: JournalEntryWithLines[],
  accounts: ChartOfAccount[],
  accountTypes: AccountType[],
  filters: CooperativeReportFilters,
  options: { useAsOfDate?: boolean; excludeOpeningBalance?: boolean } = {},
): CooperativeFinancialStatementRow[] => {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const endDate = options.useAsOfDate ? getBalanceSheetEndDate(filters) : getStatementEndDate(filters);
  const movementByAccountId = new Map<string, {
    account_id: string;
    account_code: string;
    account_name: string;
    account_type: AccountType;
    normal_balance: AccountNormalBalance;
    debit: number;
    credit: number;
  }>();

  getPostedLinePairs(entries)
    .filter(({ entry }) => isDateKeyOnOrBefore(entry.entry_date, endDate))
    .filter(({ entry }) => !options.excludeOpeningBalance || entry.source_type !== 'OPENING_BALANCE')
    .filter(({ entry }) => (
      options.useAsOfDate
        ? true
        : isDateInStatementPeriod(entry.entry_date, filters)
    ))
    .filter(({ line }) => accountTypes.includes(line.account_type))
    .forEach(({ line }) => {
      const normalBalance = getLineNormalBalance(line, accountById);
      const current = movementByAccountId.get(line.account_id) ?? {
        account_id: line.account_id,
        account_code: accountById.get(line.account_id)?.code ?? line.account_code,
        account_name: accountById.get(line.account_id)?.name ?? line.account_name,
        account_type: accountById.get(line.account_id)?.type ?? line.account_type,
        normal_balance: normalBalance,
        debit: 0,
        credit: 0,
      };

      current.debit = roundCurrency(current.debit + Number(line.debit || 0));
      current.credit = roundCurrency(current.credit + Number(line.credit || 0));
      movementByAccountId.set(line.account_id, current);
    });

  return Array.from(movementByAccountId.values())
    .map((row) => ({
      ...row,
      balance: getFinancialMovement(row.debit, row.credit, row.normal_balance),
    }))
    .filter((row) => row.debit > 0 || row.credit > 0 || Math.abs(row.balance) > MONEY_TOLERANCE)
    .sort((left, right) => left.account_code.localeCompare(right.account_code));
};

const buildCooperativeShuReport = (
  entries: JournalEntryWithLines[],
  accounts: ChartOfAccount[],
  filters: CooperativeReportFilters,
): CooperativeShuReport => {
  const rows = buildFinancialRows(
    entries,
    accounts,
    ['REVENUE', 'CONTRA_REVENUE', 'EXPENSE'],
    filters,
    { excludeOpeningBalance: true },
  );
  const revenue = roundCurrency(
    rows.filter((row) => row.account_type === 'REVENUE').reduce((sum, row) => sum + row.balance, 0),
  );
  const contraRevenue = roundCurrency(
    rows.filter((row) => row.account_type === 'CONTRA_REVENUE').reduce((sum, row) => sum + row.balance, 0),
  );
  const expense = roundCurrency(
    rows.filter((row) => row.account_type === 'EXPENSE').reduce((sum, row) => sum + row.balance, 0),
  );
  const netRevenue = roundCurrency(revenue - contraRevenue);
  const shuAmount = roundCurrency(netRevenue - expense);
  const sections: CooperativeShuReport['sections'] = [
    {
      key: 'REVENUE',
      total: revenue,
      rows: rows
        .filter((row) => row.account_type === 'REVENUE')
        .map((row) => ({
          account_id: row.account_id,
          account_code: row.account_code,
          account_name: row.account_name,
          account_type: row.account_type,
          amount: row.balance,
        })),
    },
    {
      key: 'CONTRA_REVENUE',
      total: contraRevenue,
      rows: rows
        .filter((row) => row.account_type === 'CONTRA_REVENUE')
        .map((row) => ({
          account_id: row.account_id,
          account_code: row.account_code,
          account_name: row.account_name,
          account_type: row.account_type,
          amount: row.balance,
        })),
    },
    {
      key: 'COST_OF_REVENUE',
      total: 0,
      rows: [],
    },
    {
      key: 'OPERATING_EXPENSE',
      total: expense,
      rows: rows
        .filter((row) => row.account_type === 'EXPENSE')
        .map((row) => ({
          account_id: row.account_id,
          account_code: row.account_code,
          account_name: row.account_name,
          account_type: row.account_type,
          amount: row.balance,
        })),
    },
  ];

  return {
    revenue,
    contra_revenue: contraRevenue,
    net_revenue: netRevenue,
    cost_of_revenue: 0,
    gross_profit: netRevenue,
    operating_expense: expense,
    expense,
    net_income: shuAmount,
    sections,
    shu_amount: shuAmount,
    rows,
  };
};

const buildCooperativeBalanceSheetReport = (
  entries: JournalEntryWithLines[],
  accounts: ChartOfAccount[],
  filters: CooperativeReportFilters,
): CooperativeBalanceSheetReport => {
  const rows = buildFinancialRows(
    entries,
    accounts,
    ['ASSET', 'LIABILITY', 'EQUITY'],
    filters,
    { useAsOfDate: true },
  );
  const incomeStatement = buildCooperativeShuReport(entries, accounts, {
    ...filters,
    startDate: undefined,
    endDate: getBalanceSheetEndDate(filters),
  });
  const assets = roundCurrency(
    rows.filter((row) => row.account_type === 'ASSET').reduce((sum, row) => sum + row.balance, 0),
  );
  const liabilities = roundCurrency(
    rows.filter((row) => row.account_type === 'LIABILITY').reduce((sum, row) => sum + row.balance, 0),
  );
  const equity = roundCurrency(
    rows.filter((row) => row.account_type === 'EQUITY').reduce((sum, row) => sum + row.balance, 0),
  );
  const currentPeriodIncome = roundCurrency(incomeStatement.shu_amount);
  const totalLiabilitiesAndEquity = roundCurrency(liabilities + equity + currentPeriodIncome);
  const difference = roundCurrency(assets - totalLiabilitiesAndEquity);

  return {
    assets,
    liabilities,
    equity,
    current_period_income: currentPeriodIncome,
    total_liabilities_and_equity: totalLiabilitiesAndEquity,
    difference,
    is_balanced: Math.abs(difference) <= MONEY_TOLERANCE,
    rows,
  };
};

const getCashFlowActivity = (
  entry: JournalEntryWithLines,
  nonCashLines: JournalEntryLine[],
): CooperativeCashFlowActivity => {
  if (entry.source_type === 'COOPERATIVE_SAVING') return 'FINANCING';
  if (entry.source_type === 'COOPERATIVE_LOAN') return 'OPERATING';
  if (nonCashLines.some((line) => line.account_type === 'EQUITY' || line.account_type === 'LIABILITY')) return 'FINANCING';
  if (nonCashLines.some((line) => line.account_type === 'ASSET')) return 'INVESTING';
  return 'OPERATING';
};

const createEmptyCashFlowSection = (activity: CooperativeCashFlowActivity): CooperativeCashFlowSection => ({
  activity,
  cash_in_amount: 0,
  cash_out_amount: 0,
  net_amount: 0,
  rows: [],
});

const getCashFlowFilterLines = (entry: JournalEntryWithLines) => {
  const nonCashLines = entry.lines.filter((line) => !isCashOrBankLine(line));
  return nonCashLines.length > 0 ? nonCashLines : entry.lines;
};

const matchesCashFlowAccountFilters = (
  entry: JournalEntryWithLines,
  filters: CooperativeReportFilters,
) => {
  const hasAccountTypeFilter = Boolean(filters.cashFlowAccountType);
  const hasAccountIdFilter = Boolean(filters.cashFlowAccountId);
  if (!hasAccountTypeFilter && !hasAccountIdFilter) return true;

  const lineMatches = (line: JournalEntryLine) => (
    (!filters.cashFlowAccountType || line.account_type === filters.cashFlowAccountType) &&
    (!filters.cashFlowAccountId || line.account_id === filters.cashFlowAccountId)
  );
  const filterLines = getCashFlowFilterLines(entry);

  return (
    filterLines.some(lineMatches) ||
    (hasAccountIdFilter && entry.lines.some(lineMatches))
  );
};

const buildCooperativeCashFlowStatement = (
  entries: JournalEntryWithLines[],
  filters: CooperativeReportFilters,
): CooperativeCashFlowStatement => {
  const activities = filters.cashFlowActivity
    ? [filters.cashFlowActivity]
    : COOPERATIVE_CASH_FLOW_ACTIVITIES;
  const sectionByActivity = new Map<CooperativeCashFlowActivity, CooperativeCashFlowSection>(
    activities.map((activity) => [activity, createEmptyCashFlowSection(activity)]),
  );
  const statementEndDate = getStatementEndDate(filters);
  const postedEntries = entries
    .filter((entry) => entry.status === 'POSTED')
    .filter((entry) => isDateKeyOnOrBefore(entry.entry_date, statementEndDate));
  const cashMovementForEntry = (entry: JournalEntryWithLines) => roundCurrency(
    (() => {
      const cashLines = entry.lines.filter(isCashOrBankLine);
      const filteredCashLines = filters.cashFlowAccountId && cashLines.some((line) => line.account_id === filters.cashFlowAccountId)
        ? cashLines.filter((line) => line.account_id === filters.cashFlowAccountId)
        : cashLines;

      return filteredCashLines;
    })()
      .reduce((sum, line) => sum + Number(line.debit || 0) - Number(line.credit || 0), 0),
  );
  const beginningCashAmount = roundCurrency(
    postedEntries
      .filter((entry) => (
        filters.startDate
          ? isDateKeyBefore(entry.entry_date, filters.startDate)
          : entry.source_type === 'OPENING_BALANCE'
      ))
      .reduce((sum, entry) => sum + cashMovementForEntry(entry), 0),
  );

  postedEntries
    .filter((entry) => entry.source_type !== 'OPENING_BALANCE')
    .filter((entry) => isDateInStatementPeriod(entry.entry_date, filters))
    .sort((left, right) => compareDateAsc(left.entry_date, right.entry_date))
    .forEach((entry) => {
      const nonCashLines = entry.lines.filter((line) => !isCashOrBankLine(line));
      const activity = getCashFlowActivity(entry, nonCashLines);
      if (filters.cashFlowActivity && activity !== filters.cashFlowActivity) return;
      if (!matchesCashFlowAccountFilters(entry, filters)) return;

      const amount = cashMovementForEntry(entry);
      if (Math.abs(amount) <= MONEY_TOLERANCE) return;

      const section = sectionByActivity.get(activity) ?? createEmptyCashFlowSection(activity);
      section.rows.push({
        id: entry.id,
        entry_id: entry.id,
        entry_date: entry.entry_date,
        entry_number: entry.entry_number,
        source_type: entry.source_type,
        source_number: entry.source_number,
        description: entry.description,
        amount,
      });
      if (amount >= 0) {
        section.cash_in_amount = roundCurrency(section.cash_in_amount + amount);
      } else {
        section.cash_out_amount = roundCurrency(section.cash_out_amount + Math.abs(amount));
      }
      section.net_amount = roundCurrency(section.cash_in_amount - section.cash_out_amount);
      sectionByActivity.set(activity, section);
    });

  const sections = activities.map((activity) => sectionByActivity.get(activity) ?? createEmptyCashFlowSection(activity));
  const operatingNetAmount = sectionByActivity.get('OPERATING')?.net_amount ?? 0;
  const investingNetAmount = sectionByActivity.get('INVESTING')?.net_amount ?? 0;
  const financingNetAmount = sectionByActivity.get('FINANCING')?.net_amount ?? 0;
  const netCashChangeAmount = roundCurrency(operatingNetAmount + investingNetAmount + financingNetAmount);

  return {
    beginning_cash_amount: beginningCashAmount,
    operating_net_amount: operatingNetAmount,
    investing_net_amount: investingNetAmount,
    financing_net_amount: financingNetAmount,
    net_cash_change_amount: netCashChangeAmount,
    ending_cash_amount: roundCurrency(beginningCashAmount + netCashChangeAmount),
    sections,
  };
};

const buildCooperativeEquityChangeReport = (
  entries: JournalEntryWithLines[],
  accounts: ChartOfAccount[],
  shuReport: CooperativeShuReport,
  filters: CooperativeReportFilters,
): CooperativeEquityChangeReport => {
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const statementEndDate = getStatementEndDate(filters);
  const equityPairs = getPostedLinePairs(entries)
    .filter(({ entry }) => isDateKeyOnOrBefore(entry.entry_date, statementEndDate))
    .filter(({ line }) => line.account_type === 'EQUITY');
  const equityMovement = ({ line }: JournalLinePair) => getFinancialMovement(
    Number(line.debit || 0),
    Number(line.credit || 0),
    getLineNormalBalance(line, accountById),
  );
  const openingEquityAmount = roundCurrency(
    equityPairs
      .filter(({ entry }) => (
        filters.startDate
          ? isDateKeyBefore(entry.entry_date, filters.startDate)
          : entry.source_type === 'OPENING_BALANCE'
      ))
      .reduce((sum, pair) => sum + equityMovement(pair), 0),
  );
  const periodRows = buildFinancialRows(
    entries,
    accounts,
    ['EQUITY'],
    filters,
    { excludeOpeningBalance: true },
  );
  const additionAmount = roundCurrency(
    periodRows.filter((row) => row.balance > 0).reduce((sum, row) => sum + row.balance, 0),
  );
  const reductionAmount = roundCurrency(
    periodRows.filter((row) => row.balance < 0).reduce((sum, row) => sum + Math.abs(row.balance), 0),
  );
  const periodShuAmount = roundCurrency(shuReport.shu_amount);

  return {
    opening_equity_amount: openingEquityAmount,
    addition_amount: additionAmount,
    reduction_amount: reductionAmount,
    period_shu_amount: periodShuAmount,
    ending_equity_amount: roundCurrency(openingEquityAmount + additionAmount - reductionAmount + periodShuAmount),
    rows: periodRows,
  };
};

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

const getSavingTransactionDelta = (
  transaction: CooperativeSavingTransaction,
  transactionById: Map<string, CooperativeSavingTransaction>,
) => {
  if (transaction.transaction_type === 'DEPOSIT') return transaction.amount;
  if (transaction.transaction_type === 'WITHDRAWAL') return -transaction.amount;

  const original = transaction.reversal_of_transaction_id
    ? transactionById.get(transaction.reversal_of_transaction_id)
    : undefined;
  return original?.transaction_type === 'WITHDRAWAL'
    ? transaction.amount
    : -transaction.amount;
};

const buildExpectedSavingBalanceByKey = (
  savingTransactions: CooperativeSavingTransaction[],
) => {
  const transactionById = new Map(savingTransactions.map((transaction) => [transaction.id, transaction]));
  const expectedByKey = new Map<string, number>();

  savingTransactions.forEach((transaction) => {
    const key = `${transaction.member_id}:${transaction.saving_type}`;
    const current = expectedByKey.get(key) ?? 0;
    expectedByKey.set(key, roundCurrency(current + getSavingTransactionDelta(transaction, transactionById)));
  });

  return expectedByKey;
};

const buildMemberRows = (
  members: CooperativeMember[],
  savingBalances: CooperativeMemberSavingBalance[],
  loans: CooperativeLoan[],
): CooperativeMemberReportRow[] => {
  const savingTotalByMember = new Map<string, number>();
  savingBalances.forEach((balance) => {
    savingTotalByMember.set(
      balance.member_id,
      roundCurrency((savingTotalByMember.get(balance.member_id) ?? 0) + Number(balance.balance || 0)),
    );
  });

  const loanSummaryByMember = new Map<string, { activeLoanCount: number; outstandingLoanAmount: number }>();
  loans.filter(isOutstandingLoan).forEach((loan) => {
    const current = loanSummaryByMember.get(loan.member_id) ?? { activeLoanCount: 0, outstandingLoanAmount: 0 };
    if (loan.status === 'DISBURSED') current.activeLoanCount += 1;
    current.outstandingLoanAmount = roundCurrency(current.outstandingLoanAmount + getLoanOutstandingTotal(loan));
    loanSummaryByMember.set(loan.member_id, current);
  });

  return members
    .map((member) => {
      const loanSummary = loanSummaryByMember.get(member.id);
      return {
        id: member.id,
        member_number: member.member_number,
        name: member.name,
        phone: member.phone,
        officer_id: member.officer_id,
        officer_name: member.officer_name,
        officer_position: member.officer_position,
        join_date: member.join_date,
        status: member.status,
        saving_balance: savingTotalByMember.get(member.id) ?? 0,
        active_loan_count: loanSummary?.activeLoanCount ?? 0,
        outstanding_loan_amount: loanSummary?.outstandingLoanAmount ?? 0,
      } satisfies CooperativeMemberReportRow;
    })
    .sort((left, right) => left.member_number.localeCompare(right.member_number));
};

const buildSavingBalanceRows = (
  savingBalances: CooperativeMemberSavingBalance[],
  savingTransactions: CooperativeSavingTransaction[],
): CooperativeSavingBalanceReportRow[] => {
  const expectedByKey = buildExpectedSavingBalanceByKey(savingTransactions);

  return savingBalances
    .map((balance) => {
      const expectedBalance = roundCurrency(expectedByKey.get(balance.id) ?? 0);
      const actualBalance = roundCurrency(Number(balance.balance || 0));
      return {
        id: balance.id,
        member_id: balance.member_id,
        member_number: balance.member_number,
        member_name: balance.member_name,
        saving_type: balance.saving_type,
        balance: actualBalance,
        expected_balance: expectedBalance,
        difference_amount: roundCurrency(actualBalance - expectedBalance),
        updated_at: balance.updated_at,
      } satisfies CooperativeSavingBalanceReportRow;
    })
    .sort((left, right) => {
      const memberCompare = left.member_number.localeCompare(right.member_number);
      if (memberCompare !== 0) return memberCompare;
      return left.saving_type.localeCompare(right.saving_type);
    });
};

const buildSavingMutationRows = (
  savingTransactions: CooperativeSavingTransaction[],
  filters: CooperativeReportFilters,
): CooperativeSavingMutationReportRow[] => savingTransactions
  .filter((transaction) => isDateKeyInRange(transaction.transaction_date, filters.startDate, filters.endDate))
  .map((transaction) => ({
    id: transaction.id,
    member_id: transaction.member_id,
    member_number: transaction.member_number,
    member_name: transaction.member_name,
    saving_type: transaction.saving_type,
    transaction_type: transaction.transaction_type,
    amount: transaction.amount,
    transaction_date: transaction.transaction_date,
    status: transaction.status,
    finance_transaction_id: transaction.finance_transaction_id,
    journal_entry_id: transaction.journal_entry_id,
  }))
  .sort((left, right) => compareDateDesc(left.transaction_date, right.transaction_date));

const buildLoanRows = (
  loans: CooperativeLoan[],
  installments: CooperativeLoanInstallment[],
): CooperativeLoanReportRow[] => {
  const installmentRowsByLoanId = new Map<string, CooperativeLoanInstallment[]>();
  installments.forEach((installment) => {
    const rows = installmentRowsByLoanId.get(installment.loan_id) ?? [];
    rows.push(installment);
    installmentRowsByLoanId.set(installment.loan_id, rows);
  });

  return loans
    .filter((loan) => loan.status !== 'REVERSED')
    .map((loan) => {
      const loanInstallments = installmentRowsByLoanId.get(loan.id) ?? [];
      const installmentRemainingAmount = roundCurrency(
        loanInstallments.reduce((sum, installment) => (
          sum + getInstallmentRemainingAmounts(installment).total_amount
        ), 0),
      );

      return {
        id: loan.id,
        loan_number: loan.loan_number,
        member_id: loan.member_id,
        member_number: loan.member_number,
        member_name: loan.member_name,
        principal_amount: loan.principal_amount,
        total_interest_amount: loan.total_interest_amount,
        total_payable_amount: loan.total_payable_amount,
        outstanding_principal_amount: loan.outstanding_principal_amount,
        outstanding_interest_amount: loan.outstanding_interest_amount,
        outstanding_penalty_amount: loan.outstanding_penalty_amount,
        outstanding_total_amount: getLoanOutstandingTotal(loan),
        installment_remaining_amount: installmentRemainingAmount,
        installment_count: loanInstallments.length,
        paid_installment_count: loanInstallments.filter((installment) => installment.status === 'PAID').length,
        status: loan.status,
        application_date: loan.application_date,
        disbursed_at: loan.disbursed_at,
        finance_transaction_id: loan.finance_transaction_id,
        journal_entry_id: loan.journal_entry_id,
      } satisfies CooperativeLoanReportRow;
    })
    .sort((left, right) => compareDateDesc(left.application_date, right.application_date));
};

const buildInstallmentRows = (
  installments: CooperativeLoanInstallment[],
  filters: CooperativeReportFilters,
): CooperativeInstallmentReportRow[] => installments
  .filter((installment) => isDateKeyInRange(installment.due_date, filters.startDate, filters.endDate))
  .map((installment) => {
    const remaining = getInstallmentRemainingAmounts(installment);
    return {
      id: installment.id,
      loan_id: installment.loan_id,
      loan_number: installment.loan_number,
      member_id: installment.member_id,
      member_number: installment.member_number,
      member_name: installment.member_name,
      installment_number: installment.installment_number,
      due_date: installment.due_date,
      principal_amount: installment.principal_amount,
      interest_amount: installment.interest_amount,
      penalty_amount: installment.penalty_amount,
      bill_amount: getInstallmentBillAmount(installment),
      paid_amount: getInstallmentPaidAmount(installment),
      remaining_amount: remaining.total_amount,
      status: installment.status,
    } satisfies CooperativeInstallmentReportRow;
  })
  .sort((left, right) => {
    const dueCompare = left.due_date.localeCompare(right.due_date);
    if (dueCompare !== 0) return dueCompare;
    return left.loan_number.localeCompare(right.loan_number);
  });

const buildLoanPaymentRows = (
  payments: CooperativeLoanPayment[],
  filters: CooperativeReportFilters,
): CooperativeLoanPaymentReportRow[] => payments
  .filter((payment) => isDateKeyInRange(payment.payment_date, filters.startDate, filters.endDate))
  .map((payment) => ({
    id: payment.id,
    payment_number: payment.payment_number,
    payment_type: payment.payment_type,
    loan_id: payment.loan_id,
    loan_number: payment.loan_number,
    installment_id: payment.installment_id,
    member_id: payment.member_id,
    member_number: payment.member_number,
    member_name: payment.member_name,
    amount: payment.amount,
    principal_amount: payment.principal_amount,
    interest_amount: payment.interest_amount,
    penalty_amount: payment.penalty_amount,
    payment_date: payment.payment_date,
    status: payment.status,
    finance_transaction_id: payment.finance_transaction_id,
    journal_entry_id: payment.journal_entry_id,
  }))
  .sort((left, right) => compareDateDesc(left.payment_date, right.payment_date));

const buildCashBankRows = (
  financeTransactions: FinanceTransaction[],
  filters: CooperativeReportFilters,
): CooperativeCashBankReportRow[] => financeTransactions
  .filter((transaction) => KSP_FINANCE_CATEGORIES.has(transaction.category))
  .filter((transaction) => isDateKeyInRange(transaction.created_at, filters.startDate, filters.endDate))
  .map((transaction) => ({
    id: transaction.id,
    type: transaction.type,
    category: transaction.category,
    amount: transaction.amount,
    description: transaction.description,
    created_at: transaction.created_at,
    reference_id: transaction.reference_id,
    cash_account_code: transaction.cash_account_code,
    cash_account_name: transaction.cash_account_name,
    payment_method: transaction.payment_method,
    payment_channel: transaction.payment_channel,
  }))
  .sort((left, right) => compareDateDesc(left.created_at, right.created_at));

const createReconciliationRow = (
  key: CooperativeReconciliationKey,
  mismatchCount: number,
  expectedAmount: number,
  actualAmount: number,
): CooperativeReconciliationRow => ({
  key,
  status: mismatchCount > 0 || isBalanceMismatch(actualAmount - expectedAmount) ? 'WARNING' : 'OK',
  mismatch_count: mismatchCount,
  expected_amount: roundCurrency(expectedAmount),
  actual_amount: roundCurrency(actualAmount),
  difference_amount: roundCurrency(actualAmount - expectedAmount),
});

const buildSavingBalanceReconciliation = (
  savingBalances: CooperativeMemberSavingBalance[],
  savingTransactions: CooperativeSavingTransaction[],
) => {
  const expectedByKey = buildExpectedSavingBalanceByKey(savingTransactions);
  const actualByKey = new Map(savingBalances.map((balance) => [balance.id, Number(balance.balance || 0)]));
  const keys = new Set([...expectedByKey.keys(), ...actualByKey.keys()]);
  let mismatchCount = 0;

  keys.forEach((key) => {
    const expected = roundCurrency(expectedByKey.get(key) ?? 0);
    const actual = roundCurrency(actualByKey.get(key) ?? 0);
    if (isBalanceMismatch(actual - expected)) mismatchCount += 1;
  });

  const expectedAmount = Array.from(expectedByKey.values()).reduce((sum, amount) => sum + amount, 0);
  const actualAmount = savingBalances.reduce((sum, balance) => sum + Number(balance.balance || 0), 0);
  return createReconciliationRow('SAVING_BALANCE', mismatchCount, expectedAmount, actualAmount);
};

const buildLoanOutstandingReconciliation = (
  loans: CooperativeLoan[],
  installments: CooperativeLoanInstallment[],
) => {
  const installmentRemainingByLoanId = new Map<string, number>();
  installments.forEach((installment) => {
    installmentRemainingByLoanId.set(
      installment.loan_id,
      roundCurrency(
        (installmentRemainingByLoanId.get(installment.loan_id) ?? 0) +
        getInstallmentRemainingAmounts(installment).total_amount,
      ),
    );
  });

  const trackedLoans = loans.filter(isOutstandingLoan);
  let mismatchCount = 0;
  trackedLoans.forEach((loan) => {
    const expected = roundCurrency(installmentRemainingByLoanId.get(loan.id) ?? 0);
    const actual = getLoanOutstandingTotal(loan);
    if (isBalanceMismatch(actual - expected)) mismatchCount += 1;
  });

  const expectedAmount = trackedLoans.reduce(
    (sum, loan) => sum + (installmentRemainingByLoanId.get(loan.id) ?? 0),
    0,
  );
  const actualAmount = trackedLoans.reduce((sum, loan) => sum + getLoanOutstandingTotal(loan), 0);
  return createReconciliationRow('LOAN_OUTSTANDING', mismatchCount, expectedAmount, actualAmount);
};

const buildPaymentInstallmentReconciliation = (
  installments: CooperativeLoanInstallment[],
  payments: CooperativeLoanPayment[],
) => {
  const activePayments = payments.filter((payment) => (
    payment.status === 'POSTED' &&
    (payment.payment_type ?? 'PAYMENT') === 'PAYMENT' &&
    !payment.reversal_of_payment_id
  ));
  const expectedByInstallmentId = new Map<string, {
    principal: number;
    interest: number;
    penalty: number;
  }>();
  let orphanPaymentCount = 0;

  activePayments.forEach((payment) => {
    if (!payment.installment_id) {
      orphanPaymentCount += 1;
      return;
    }
    const current = expectedByInstallmentId.get(payment.installment_id) ?? {
      principal: 0,
      interest: 0,
      penalty: 0,
    };
    expectedByInstallmentId.set(payment.installment_id, {
      principal: roundCurrency(current.principal + Number(payment.principal_amount || 0)),
      interest: roundCurrency(current.interest + Number(payment.interest_amount || 0)),
      penalty: roundCurrency(current.penalty + Number(payment.penalty_amount || 0)),
    });
  });

  const installmentIds = new Set(installments.map((installment) => installment.id));
  expectedByInstallmentId.forEach((_amounts, installmentId) => {
    if (!installmentIds.has(installmentId)) orphanPaymentCount += 1;
  });

  let mismatchCount = orphanPaymentCount;
  installments.forEach((installment) => {
    const expected = expectedByInstallmentId.get(installment.id) ?? {
      principal: 0,
      interest: 0,
      penalty: 0,
    };
    if (
      isBalanceMismatch(Number(installment.paid_principal_amount || 0) - expected.principal) ||
      isBalanceMismatch(Number(installment.paid_interest_amount || 0) - expected.interest) ||
      isBalanceMismatch(Number(installment.paid_penalty_amount || 0) - expected.penalty)
    ) {
      mismatchCount += 1;
    }
  });

  const expectedAmount = activePayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const actualAmount = installments.reduce((sum, installment) => (
    sum +
    Number(installment.paid_principal_amount || 0) +
    Number(installment.paid_interest_amount || 0) +
    Number(installment.paid_penalty_amount || 0)
  ), 0);
  return createReconciliationRow(
    'PAYMENT_INSTALLMENT',
    mismatchCount,
    expectedAmount,
    actualAmount,
  );
};

const buildFinanceTransactionReconciliation = (
  savingTransactions: CooperativeSavingTransaction[],
  loans: CooperativeLoan[],
  payments: CooperativeLoanPayment[],
  financeTransactions: FinanceTransaction[],
) => {
  const financeById = new Map(financeTransactions.map((transaction) => [transaction.id, transaction]));
  const expectedRefs: Array<{ financeTransactionId?: string; amount: number }> = [
    ...savingTransactions.map((transaction) => ({
      financeTransactionId: transaction.finance_transaction_id,
      amount: transaction.amount,
    })),
    ...loans
      .filter((loan) => loan.status === 'DISBURSED' || loan.status === 'PAID_OFF' || Boolean(loan.finance_transaction_id))
      .map((loan) => ({
        financeTransactionId: loan.finance_transaction_id,
        amount: loan.principal_amount,
      })),
    ...payments.map((payment) => ({
      financeTransactionId: payment.finance_transaction_id,
      amount: payment.amount,
    })),
  ];

  let mismatchCount = 0;
  let actualAmount = 0;
  expectedRefs.forEach((ref) => {
    const financeTransaction = ref.financeTransactionId
      ? financeById.get(ref.financeTransactionId)
      : undefined;

    if (!financeTransaction || isBalanceMismatch(Number(financeTransaction.amount || 0) - ref.amount)) {
      mismatchCount += 1;
      return;
    }

    actualAmount += Number(financeTransaction.amount || 0);
  });

  const expectedAmount = expectedRefs.reduce((sum, ref) => sum + ref.amount, 0);
  return createReconciliationRow('FINANCE_TRANSACTION', mismatchCount, expectedAmount, actualAmount);
};

const buildJournalEntryReconciliation = (
  savingTransactions: CooperativeSavingTransaction[],
  loans: CooperativeLoan[],
  payments: CooperativeLoanPayment[],
  journalEntries: JournalEntryWithLines[],
) => {
  const journalById = new Map(journalEntries.map((entry) => [entry.id, entry]));
  const savingById = new Map(savingTransactions.map((transaction) => [transaction.id, transaction]));
  const loanById = new Map(loans.map((loan) => [loan.id, loan]));
  const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
  const referencedJournalIds = [
    ...savingTransactions.map((transaction) => transaction.journal_entry_id),
    ...loans.map((loan) => loan.journal_entry_id),
    ...payments.map((payment) => payment.journal_entry_id),
  ].filter((id): id is string => Boolean(id));

  const missingReferencedJournals = referencedJournalIds
    .filter((journalEntryId) => !journalById.has(journalEntryId)).length;
  const orphanJournalEntries = journalEntries.filter((entry) => {
    if (!entry.source_id) return true;
    if (entry.source_type === 'COOPERATIVE_SAVING') {
      return !savingById.has(entry.source_id);
    }
    if (entry.source_event === 'COOPERATIVE_LOAN_PAYMENT_POSTED') {
      return !paymentById.has(entry.source_id);
    }
    return !loanById.has(entry.source_id);
  }).length;
  const matchedJournalAmount = referencedJournalIds.reduce((sum, journalEntryId) => (
    sum + Number(journalById.get(journalEntryId)?.total_debit || 0)
  ), 0);

  return createReconciliationRow(
    'JOURNAL_ENTRY',
    missingReferencedJournals + orphanJournalEntries,
    matchedJournalAmount,
    matchedJournalAmount,
  );
};

const buildReconciliationSummary = (
  savingBalances: CooperativeMemberSavingBalance[],
  savingTransactions: CooperativeSavingTransaction[],
  loans: CooperativeLoan[],
  installments: CooperativeLoanInstallment[],
  payments: CooperativeLoanPayment[],
  financeTransactions: FinanceTransaction[],
  journalEntries: JournalEntryWithLines[],
): CooperativeReconciliationSummary => {
  const rows = [
    buildSavingBalanceReconciliation(savingBalances, savingTransactions),
    buildLoanOutstandingReconciliation(loans, installments),
    buildPaymentInstallmentReconciliation(installments, payments),
    buildFinanceTransactionReconciliation(savingTransactions, loans, payments, financeTransactions),
    buildJournalEntryReconciliation(savingTransactions, loans, payments, journalEntries),
  ];
  const mismatchCount = rows.reduce((sum, row) => sum + row.mismatch_count, 0);

  return {
    status: rows.some((row) => row.status === 'WARNING') ? 'WARNING' : 'OK',
    mismatch_count: mismatchCount,
    rows,
  };
};

const buildOperationalSummary = (
  members: CooperativeMember[],
  savingBalances: CooperativeMemberSavingBalance[],
  loans: CooperativeLoan[],
  cashBankRows: CooperativeCashBankReportRow[],
  overdueReport: CooperativeOverdueReport,
): CooperativeOperationalSummary => {
  const cashInAmount = cashBankRows
    .filter((row) => row.type === 'INCOME' || row.type === 'OPENING_BALANCE')
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const cashOutAmount = cashBankRows
    .filter((row) => row.type === 'EXPENSE')
    .reduce((sum, row) => sum + Number(row.amount || 0), 0);
  const outstandingLoans = loans.filter(isOutstandingLoan);

  return {
    member_count: members.length,
    active_member_count: members.filter((member) => member.status === 'ACTIVE').length,
    total_saving_balance: roundCurrency(savingBalances.reduce((sum, balance) => sum + Number(balance.balance || 0), 0)),
    active_loan_count: loans.filter((loan) => loan.status === 'DISBURSED').length,
    outstanding_loan_amount: roundCurrency(outstandingLoans.reduce((sum, loan) => sum + getLoanOutstandingTotal(loan), 0)),
    overdue_amount: overdueReport.summary.total_amount,
    cash_in_amount: roundCurrency(cashInAmount),
    cash_out_amount: roundCurrency(cashOutAmount),
    net_cash_amount: roundCurrency(cashInAmount - cashOutAmount),
  };
};

export const getCooperativeReportData = async (
  filters: CooperativeReportFilters = {},
): Promise<CooperativeReportData> => {
  await requireAnyUserPermission(await getCurrentSessionUser(), [
    'COOPERATIVE_OVERVIEW_REPORT_VIEW',
    'COOPERATIVE_CASH_FLOW_REPORT_VIEW',
  ]);
  const periodLedgerFilters = {
    startDate: filters.startDate,
    endDate: filters.endDate,
    sourceTypes: COOPERATIVE_JOURNAL_SOURCE_TYPES,
  };
  const formalStatementFilters = {
    sourceTypes: COOPERATIVE_FORMAL_STATEMENT_SOURCE_TYPES,
  };

  const [
    accounts,
    financialReadinessResult,
    generalLedgerModule,
    journalEntries,
    reconciliationJournalEntries,
    formalStatementEntries,
    members,
    savingTransactions,
    savingBalances,
    loans,
    installments,
    payments,
    financeTransactions,
  ] = await Promise.all([
    db.chartOfAccounts.orderBy('code').toArray(),
    getGeneralLedgerReadiness(),
    db.enabledModules.get('GENERAL_LEDGER'),
    getJournalEntriesWithLines(periodLedgerFilters),
    getJournalEntriesWithLines({ sourceTypes: COOPERATIVE_JOURNAL_SOURCE_TYPES }),
    getJournalEntriesWithLines(formalStatementFilters),
    db.cooperativeMembers.orderBy('member_number').toArray(),
    db.cooperativeSavingTransactions.orderBy('transaction_date').reverse().toArray(),
    db.cooperativeMemberSavingBalances.orderBy('member_number').toArray(),
    db.cooperativeLoans.orderBy('loan_number').toArray(),
    db.cooperativeLoanInstallments.orderBy('due_date').toArray(),
    db.cooperativeLoanPayments.orderBy('payment_date').reverse().toArray(),
    db.financeTransactions.orderBy('created_at').reverse().toArray(),
  ]);

  const overdueReport = buildOverdueReport(loans, installments, filters);
  const cashBankRows = buildCashBankRows(financeTransactions, filters);
  const financialReadiness = buildFinancialReadiness(financialReadinessResult, generalLedgerModule);
  const cooperativeShuReport = buildCooperativeShuReport(formalStatementEntries, accounts, filters);
  const cooperativeBalanceSheet = buildCooperativeBalanceSheetReport(formalStatementEntries, accounts, filters);
  const cooperativeCashFlowStatement = buildCooperativeCashFlowStatement(formalStatementEntries, filters);
  const cooperativeEquityChangeReport = buildCooperativeEquityChangeReport(
    formalStatementEntries,
    accounts,
    cooperativeShuReport,
    filters,
  );
  const incomeStatement: IncomeStatementReport = {
    revenue: cooperativeShuReport.revenue,
    contra_revenue: cooperativeShuReport.contra_revenue,
    net_revenue: cooperativeShuReport.net_revenue,
    cost_of_revenue: cooperativeShuReport.cost_of_revenue,
    gross_profit: cooperativeShuReport.gross_profit,
    operating_expense: cooperativeShuReport.operating_expense,
    expense: cooperativeShuReport.expense,
    net_income: cooperativeShuReport.shu_amount,
    sections: cooperativeShuReport.sections,
  };
  const balanceSheet: BalanceSheetReport = {
    assets: cooperativeBalanceSheet.assets,
    liabilities: cooperativeBalanceSheet.liabilities,
    equity: cooperativeBalanceSheet.equity,
    current_period_income: cooperativeBalanceSheet.current_period_income,
    total_liabilities_and_equity: cooperativeBalanceSheet.total_liabilities_and_equity,
    difference: cooperativeBalanceSheet.difference,
    is_balanced: cooperativeBalanceSheet.is_balanced,
  };

  return {
    accounts,
    financialReadiness,
    summary: buildOperationalSummary(members, savingBalances, loans, cashBankRows, overdueReport),
    memberRows: buildMemberRows(members, savingBalances, loans),
    savingBalanceRows: buildSavingBalanceRows(savingBalances, savingTransactions),
    savingMutationRows: buildSavingMutationRows(savingTransactions, filters),
    loanRows: buildLoanRows(loans, installments),
    installmentRows: buildInstallmentRows(installments, filters),
    loanPaymentRows: buildLoanPaymentRows(payments, filters),
    cashBankRows,
    reconciliation: buildReconciliationSummary(
      savingBalances,
      savingTransactions,
      loans,
      installments,
      payments,
      financeTransactions,
      reconciliationJournalEntries,
    ),
    journalEntries,
    incomeStatement,
    balanceSheet,
    cooperativeBalanceSheet,
    cooperativeShuReport,
    cooperativeCashFlowStatement,
    cooperativeEquityChangeReport,
    overdueReport,
  };
};
