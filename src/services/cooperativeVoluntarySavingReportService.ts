import { getCurrentSessionUser, requireUserPermission } from '@/auth/authService';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import type { Dayjs } from 'dayjs';
import type { CooperativeSavingTransaction } from '@/types';
import {
  calculateCooperativeSavingInterest,
  COOPERATIVE_SAVING_INTEREST_RATE_PER_MONTH,
} from '@/utils/koperasi/savingInterest';

export interface CooperativeVoluntarySavingReportFilters {
  asOfDate?: string;
  searchText?: string;
}

export interface CooperativeVoluntarySavingReportRow {
  id: string;
  member_id: string;
  member_number: string;
  member_name: string;
  balance: number;
  available_interest: number;
  sub_total: number;
}

export interface CooperativeVoluntarySavingReportSummary {
  row_count: number;
  total_balance: number;
  total_available_interest: number;
  total_sub_total: number;
}

export interface CooperativeVoluntarySavingReportData {
  as_of_date: string;
  interest_rate_per_month: number;
  rows: CooperativeVoluntarySavingReportRow[];
  summary: CooperativeVoluntarySavingReportSummary;
}

const MONEY_TOLERANCE = 0.01;

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const parseAsOfDate = (value?: string) => {
  if (!value) return dayjs().tz().endOf('day');
  return value.includes('T') ? dayjs(value).tz().endOf('day') : dayjs.tz(value).endOf('day');
};

const normalizeSearchText = (value?: string) => value?.trim().toLowerCase() ?? '';

const buildInterestTransactions = (
  transactions: CooperativeSavingTransaction[],
  asOfDate: Dayjs,
) => transactions.map((transaction) => {
  if (
    transaction.status === 'REVERSED' &&
    transaction.reversed_at &&
    dayjs(transaction.reversed_at).isAfter(asOfDate)
  ) {
    return { ...transaction, status: 'POSTED' as const };
  }

  return transaction;
});

const getSavingTransactionDelta = (
  transaction: CooperativeSavingTransaction,
  transactionById: Map<string, CooperativeSavingTransaction>,
) => {
  if (transaction.transaction_type === 'DEPOSIT' || transaction.transaction_type === 'OPENING_BALANCE') {
    return Number(transaction.amount || 0);
  }
  if (transaction.transaction_type === 'WITHDRAWAL') {
    return transaction.withdrawal_source === 'INTEREST' ? 0 : -Number(transaction.amount || 0);
  }

  const original = transaction.reversal_of_transaction_id
    ? transactionById.get(transaction.reversal_of_transaction_id)
    : undefined;

  if (original?.transaction_type === 'WITHDRAWAL') {
    return original.withdrawal_source === 'INTEREST' ? 0 : Number(transaction.amount || 0);
  }

  return -Number(transaction.amount || 0);
};

const summarizeRows = (rows: CooperativeVoluntarySavingReportRow[]): CooperativeVoluntarySavingReportSummary => {
  const summary = rows.reduce((acc, row) => {
    acc.row_count += 1;
    acc.total_balance += row.balance;
    acc.total_available_interest += row.available_interest;
    acc.total_sub_total += row.sub_total;
    return acc;
  }, {
    row_count: 0,
    total_balance: 0,
    total_available_interest: 0,
    total_sub_total: 0,
  });

  return {
    row_count: summary.row_count,
    total_balance: roundCurrency(summary.total_balance),
    total_available_interest: roundCurrency(summary.total_available_interest),
    total_sub_total: roundCurrency(summary.total_sub_total),
  };
};

export const getCooperativeVoluntarySavingReport = async (
  filters: CooperativeVoluntarySavingReportFilters = {},
): Promise<CooperativeVoluntarySavingReportData> => {
  await requireUserPermission(await getCurrentSessionUser(), 'COOPERATIVE_SAVING_VIEW');

  const asOfDate = parseAsOfDate(filters.asOfDate);
  const asOfIso = asOfDate.toISOString();
  const query = normalizeSearchText(filters.searchText);
  const transactions = await db.cooperativeSavingTransactions
    .where('saving_type')
    .equals('SUKARELA')
    .toArray();
  const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
  const interestTransactions = buildInterestTransactions(transactions, asOfDate);
  const balanceByMemberId = new Map<string, CooperativeVoluntarySavingReportRow>();

  transactions
    .filter((transaction) => !dayjs(transaction.transaction_date).isAfter(asOfDate))
    .sort((left, right) => (
      left.transaction_date.localeCompare(right.transaction_date) ||
      left.created_at.localeCompare(right.created_at) ||
      left.id.localeCompare(right.id)
    ))
    .forEach((transaction) => {
      const current = balanceByMemberId.get(transaction.member_id) ?? {
        id: transaction.member_id,
        member_id: transaction.member_id,
        member_number: transaction.member_number,
        member_name: transaction.member_name,
        balance: 0,
        available_interest: 0,
        sub_total: 0,
      };

      current.balance = roundCurrency(
        current.balance + getSavingTransactionDelta(transaction, transactionById),
      );
      balanceByMemberId.set(transaction.member_id, current);
    });

  const rows = Array.from(balanceByMemberId.values())
    .map((row) => {
      const interest = calculateCooperativeSavingInterest(
        interestTransactions,
        row.member_id,
        'SUKARELA',
        asOfIso,
      );
      const balance = Math.max(0, roundCurrency(row.balance));
      const availableInterest = roundCurrency(interest.availableInterest);

      return {
        ...row,
        balance,
        available_interest: availableInterest,
        sub_total: roundCurrency(balance + availableInterest),
      };
    })
    .filter((row) => row.balance > MONEY_TOLERANCE)
    .filter((row) => {
      if (!query) return true;
      return [row.member_number, row.member_name].some((value) => (
        value.toLowerCase().includes(query)
      ));
    })
    .sort((left, right) => {
      const nameCompare = left.member_name.localeCompare(right.member_name);
      if (nameCompare !== 0) return nameCompare;
      return left.member_number.localeCompare(right.member_number);
    });

  return {
    as_of_date: asOfDate.format('YYYY-MM-DD'),
    interest_rate_per_month: COOPERATIVE_SAVING_INTEREST_RATE_PER_MONTH,
    rows,
    summary: summarizeRows(rows),
  };
};
