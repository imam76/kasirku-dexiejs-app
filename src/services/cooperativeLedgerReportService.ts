import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import {
  getJournalEntriesWithLines,
  type JournalEntryWithLines,
} from '@/services/generalLedgerService';
import type {
  AccountNormalBalance,
  ChartOfAccount,
  JournalEntryLine,
  JournalSourceType,
} from '@/types';
import { roundCurrency } from '@/utils/koperasi/loanSchedule';

const COOPERATIVE_JOURNAL_SOURCE_TYPES: JournalSourceType[] = [
  'COOPERATIVE_SAVING',
  'COOPERATIVE_LOAN',
];

export type CooperativeLedgerReportRowType = 'OPENING' | 'MOVEMENT' | 'ENDING';

export interface CooperativeLedgerReportFilters {
  startDate?: string;
  endDate?: string;
  fromAccountId?: string;
  toAccountId?: string;
  hideZeroBalance?: boolean;
}

export interface CooperativeLedgerReportMovementRow {
  id: string;
  row_type: CooperativeLedgerReportRowType;
  account_id: string;
  entry_id?: string;
  entry_date?: string;
  entry_number: string;
  source_type?: JournalSourceType;
  source_number?: string;
  source_event?: string;
  description: string;
  debit: number;
  credit: number;
  running_balance: number;
}

export interface CooperativeLedgerReportAccountGroup {
  account_id: string;
  account_code: string;
  account_name: string;
  normal_balance: AccountNormalBalance;
  opening_balance: number;
  total_debit: number;
  total_credit: number;
  ending_balance: number;
  rows: CooperativeLedgerReportMovementRow[];
}

export interface CooperativeLedgerReportOption {
  id: string;
  code?: string;
  name: string;
}

export type CooperativeLedgerExportRowKind = 'ACCOUNT' | 'HEADER' | 'ROW';

export interface CooperativeLedgerExportRow {
  kind: CooperativeLedgerExportRowKind;
  account_code?: string;
  account_name?: string;
  row_type?: CooperativeLedgerReportRowType;
  date?: string;
  entry_number?: string;
  source_number?: string;
  description?: string;
  debit?: number;
  credit?: number;
  running_balance?: number;
  opening_balance?: number;
  ending_balance?: number;
}

export interface CooperativeLedgerReportData {
  accounts: ChartOfAccount[];
  groups: CooperativeLedgerReportAccountGroup[];
  exportRows: CooperativeLedgerExportRow[];
}

type MasterLike = {
  id: string;
  code?: string;
  name: string;
};

type JournalLinePair = {
  entry: JournalEntryWithLines;
  line: JournalEntryLine;
};

const MONEY_TOLERANCE = 0.01;

const getDateKey = (value: string) => dayjs(value).tz().format('YYYY-MM-DD');

const isDateKeyInRange = (value: string, startDate?: string, endDate?: string) => {
  const dateKey = getDateKey(value);
  const startKey = startDate ? getDateKey(startDate) : undefined;
  const endKey = endDate ? getDateKey(endDate) : undefined;

  return (!startKey || dateKey >= startKey) && (!endKey || dateKey <= endKey);
};

const isBeforeStartDate = (value: string, startDate?: string) => (
  Boolean(startDate) && getDateKey(value) < getDateKey(startDate as string)
);

const getComparableCode = (item: MasterLike) => (item.code?.trim() || item.name || item.id).toLowerCase();

const compareByCode = (left: MasterLike, right: MasterLike) => (
  getComparableCode(left).localeCompare(getComparableCode(right), undefined, { numeric: true })
);

const getSelectedIdsByCodeRange = <T extends MasterLike>(
  items: T[],
  fromId?: string,
  toId?: string,
) => {
  if (!fromId && !toId) return undefined;

  const sortedItems = [...items].sort(compareByCode);
  const fromItem = fromId ? sortedItems.find((item) => item.id === fromId) : undefined;
  const toItem = toId ? sortedItems.find((item) => item.id === toId) : undefined;
  const fromKey = fromItem ? getComparableCode(fromItem) : undefined;
  const toKey = toItem ? getComparableCode(toItem) : undefined;
  const lowerKey = fromKey && toKey && fromKey > toKey ? toKey : fromKey;
  const upperKey = fromKey && toKey && fromKey > toKey ? fromKey : toKey;

  return new Set(
    sortedItems
      .filter((item) => {
        const key = getComparableCode(item);
        return (!lowerKey || key >= lowerKey) && (!upperKey || key <= upperKey);
      })
      .map((item) => item.id),
  );
};

const getAccountMovement = (
  debit: number,
  credit: number,
  account: Pick<ChartOfAccount, 'normal_balance'>,
) => account.normal_balance === 'DEBIT'
  ? debit - credit
  : credit - debit;

const isZeroAmount = (value: number) => Math.abs(value) <= MONEY_TOLERANCE;

const isZeroAccountGroup = (group: CooperativeLedgerReportAccountGroup) => (
  isZeroAmount(group.opening_balance) &&
  isZeroAmount(group.total_debit) &&
  isZeroAmount(group.total_credit) &&
  isZeroAmount(group.ending_balance)
);

const getPostedLinePairs = (journalEntries: JournalEntryWithLines[]) => (
  journalEntries
    .filter((entry) => entry.status === 'POSTED')
    .flatMap((entry) => entry.lines.map((line) => ({ entry, line })))
);

const buildAccountGroup = (
  account: ChartOfAccount,
  pairs: JournalLinePair[],
  filters: CooperativeLedgerReportFilters,
): CooperativeLedgerReportAccountGroup => {
  const sortedPairs = pairs
    .filter(({ line }) => line.account_id === account.id)
    .sort((left, right) => {
      const dateCompare = left.entry.entry_date.localeCompare(right.entry.entry_date);
      if (dateCompare !== 0) return dateCompare;
      return left.entry.entry_number.localeCompare(right.entry.entry_number);
    });

  const openingBalance = roundCurrency(
    sortedPairs
      .filter(({ entry }) => isBeforeStartDate(entry.entry_date, filters.startDate))
      .reduce((sum, { line }) => (
        sum + getAccountMovement(line.debit, line.credit, account)
      ), 0),
  );
  const periodPairs = sortedPairs
    .filter(({ entry }) => isDateKeyInRange(entry.entry_date, filters.startDate, filters.endDate));

  let runningBalance = openingBalance;
  const rows: CooperativeLedgerReportMovementRow[] = [{
    id: `${account.id}:opening`,
    row_type: 'OPENING',
    account_id: account.id,
    entry_date: filters.startDate,
    entry_number: '-',
    description: 'Opening balance',
    debit: 0,
    credit: 0,
    running_balance: openingBalance,
  }];
  let totalDebit = 0;
  let totalCredit = 0;

  periodPairs.forEach(({ entry, line }) => {
    totalDebit = roundCurrency(totalDebit + Number(line.debit || 0));
    totalCredit = roundCurrency(totalCredit + Number(line.credit || 0));
    runningBalance = roundCurrency(
      runningBalance + getAccountMovement(line.debit, line.credit, account),
    );
    rows.push({
      id: line.id,
      row_type: 'MOVEMENT',
      account_id: account.id,
      entry_id: entry.id,
      entry_date: entry.entry_date,
      entry_number: entry.entry_number,
      source_type: entry.source_type,
      source_number: entry.source_number,
      source_event: entry.source_event,
      description: line.description || entry.description,
      debit: Number(line.debit || 0),
      credit: Number(line.credit || 0),
      running_balance: runningBalance,
    });
  });

  rows.push({
    id: `${account.id}:ending`,
    row_type: 'ENDING',
    account_id: account.id,
    entry_date: filters.endDate ?? (
      periodPairs.length > 0 ? periodPairs[periodPairs.length - 1].entry.entry_date : filters.startDate
    ),
    entry_number: '-',
    description: 'Ending balance',
    debit: 0,
    credit: 0,
    running_balance: runningBalance,
  });

  return {
    account_id: account.id,
    account_code: account.code,
    account_name: account.name,
    normal_balance: account.normal_balance,
    opening_balance: openingBalance,
    total_debit: totalDebit,
    total_credit: totalCredit,
    ending_balance: runningBalance,
    rows,
  };
};

export const buildCooperativeLedgerExportRows = (
  groups: CooperativeLedgerReportAccountGroup[],
): CooperativeLedgerExportRow[] => groups.flatMap((group) => [
  {
    kind: 'ACCOUNT',
    account_code: group.account_code,
    account_name: group.account_name,
    opening_balance: group.opening_balance,
    debit: group.total_debit,
    credit: group.total_credit,
    ending_balance: group.ending_balance,
  },
  {
    kind: 'HEADER',
    account_code: group.account_code,
    account_name: group.account_name,
  },
  ...group.rows.map((row) => ({
    kind: 'ROW' as const,
    account_code: group.account_code,
    account_name: group.account_name,
    row_type: row.row_type,
    date: row.entry_date,
    entry_number: row.entry_number,
    source_number: row.source_number,
    description: row.description,
    debit: row.debit,
    credit: row.credit,
    running_balance: row.running_balance,
  })),
]);

export const getCooperativeLedgerReportData = async (
  filters: CooperativeLedgerReportFilters = {},
): Promise<CooperativeLedgerReportData> => {
  const [accounts, journalEntries] = await Promise.all([
    db.chartOfAccounts.orderBy('code').toArray(),
    getJournalEntriesWithLines({
      endDate: filters.endDate,
      sourceTypes: COOPERATIVE_JOURNAL_SOURCE_TYPES,
    }),
  ]);

  const selectedAccountIds = getSelectedIdsByCodeRange(accounts, filters.fromAccountId, filters.toAccountId);
  const selectedAccounts = accounts
    .filter((account) => !selectedAccountIds || selectedAccountIds.has(account.id))
    .sort(compareByCode);
  const filteredPairs = getPostedLinePairs(journalEntries);
  const groups = selectedAccounts
    .map((account) => buildAccountGroup(account, filteredPairs, filters))
    .filter((group) => !filters.hideZeroBalance || !isZeroAccountGroup(group));

  return {
    accounts,
    groups,
    exportRows: buildCooperativeLedgerExportRows(groups),
  };
};
