import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  recordCooperativeSaving,
  reverseCooperativeSaving,
  type RecordCooperativeSavingInput,
  type ReverseCooperativeSavingInput,
} from '@/services/cooperativeSavingService';
import { getCashAccountBalance } from '@/services/cooperativeFieldCashService';
import type {
  ChartOfAccount,
  CooperativeMember,
  CooperativeMemberSavingBalance,
  CooperativeSavingTransaction,
  CooperativeSavingTransactionType,
  CooperativeSavingType,
} from '@/types';

export type CooperativeSavingTypeFilter = CooperativeSavingType | 'ALL';
export type CooperativeSavingTransactionTypeFilter = CooperativeSavingTransactionType | 'ALL';
export type CooperativeSavingStatusFilter = CooperativeSavingTransaction['status'] | 'ALL';

const COOPERATIVE_SAVING_RELATED_QUERY_KEYS = [
  'cooperativeSavings',
  'financeBalance',
  'financeTransactions',
  'journalEntries',
  'trialBalance',
  'incomeStatement',
  'balanceSheet',
];

export const useCooperativeSavings = () => {
  const queryClient = useQueryClient();
  const [selectedTransaction, setSelectedTransaction] = useState<CooperativeSavingTransaction | null>(null);
  const [searchText, setSearchText] = useState('');
  const [savingTypeFilter, setSavingTypeFilter] = useState<CooperativeSavingTypeFilter>('ALL');
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<CooperativeSavingTransactionTypeFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<CooperativeSavingStatusFilter>('POSTED');

  const members = useLiveQuery(
    () => db.cooperativeMembers.orderBy('member_number').toArray(),
    [],
    [],
  );
  const transactions = useLiveQuery(
    () => db.cooperativeSavingTransactions.orderBy('transaction_date').reverse().toArray(),
    [],
    [],
  );
  const balances = useLiveQuery(
    () => db.cooperativeMemberSavingBalances.orderBy('member_number').toArray(),
    [],
    [],
  );
  const paymentAccounts = useLiveQuery(
    () => db.chartOfAccounts
      .where('type')
      .equals('ASSET')
      .filter((account) => account.is_active && account.is_postable)
      .toArray(),
    [],
    [],
  );
  const fieldCashEmployees = useLiveQuery(
    () => db.employees
      .where('field_cash_account_id')
      .above('')
      .filter((employee) => employee.is_active && Boolean(employee.field_cash_account_id))
      .toArray(),
    [],
    [],
  );
  const fieldCashBalances = useLiveQuery(
    async () => {
      const pairs = await Promise.all(fieldCashEmployees.map(async (employee) => {
        const accountId = employee.field_cash_account_id;
        return accountId ? [accountId, await getCashAccountBalance(accountId)] as const : undefined;
      }));
      return new Map(pairs.filter((pair): pair is readonly [string, number] => Boolean(pair)));
    },
    [fieldCashEmployees.map((employee) => employee.field_cash_account_id).join('|')],
    new Map<string, number>(),
  );
  const fieldCashAccountIds = useMemo(
    () => new Set(fieldCashEmployees.map((employee) => employee.field_cash_account_id).filter(Boolean) as string[]),
    [fieldCashEmployees],
  );

  const activeMembers = useMemo(
    () => members.filter((member) => member.status === 'ACTIVE'),
    [members],
  );

  const filteredTransactions = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return transactions.filter((transaction) => {
      const matchesSearch = !query || [
        transaction.member_number,
        transaction.member_name,
        transaction.cash_account_name,
        transaction.notes,
        transaction.reversal_reason,
      ].some((value) => value?.toLowerCase().includes(query));
      const matchesSavingType = savingTypeFilter === 'ALL' || transaction.saving_type === savingTypeFilter;
      const matchesTransactionType = transactionTypeFilter === 'ALL' || transaction.transaction_type === transactionTypeFilter;
      const matchesStatus = statusFilter === 'ALL' || transaction.status === statusFilter;

      return matchesSearch && matchesSavingType && matchesTransactionType && matchesStatus;
    });
  }, [savingTypeFilter, searchText, statusFilter, transactionTypeFilter, transactions]);

  const filteredBalances = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return balances.filter((balance) => {
      const matchesSearch = !query || [
        balance.member_number,
        balance.member_name,
      ].some((value) => value.toLowerCase().includes(query));
      const matchesSavingType = savingTypeFilter === 'ALL' || balance.saving_type === savingTypeFilter;

      return matchesSearch && matchesSavingType;
    });
  }, [balances, savingTypeFilter, searchText]);

  const invalidate = () => {
    COOPERATIVE_SAVING_RELATED_QUERY_KEYS.forEach((queryKey) => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    });
  };

  const recordMutation = useMutation({
    mutationFn: recordCooperativeSaving,
    onSuccess: invalidate,
  });
  const reverseMutation = useMutation({
    mutationFn: reverseCooperativeSaving,
    onSuccess: invalidate,
  });

  return {
    members,
    activeMembers,
    transactions,
    filteredTransactions,
    balances,
    filteredBalances,
    paymentAccounts: paymentAccounts as ChartOfAccount[],
    fieldCashAccountIds,
    fieldCashBalances,
    selectedTransaction,
    setSelectedTransaction,
    searchText,
    setSearchText,
    savingTypeFilter,
    setSavingTypeFilter,
    transactionTypeFilter,
    setTransactionTypeFilter,
    statusFilter,
    setStatusFilter,
    recordSaving: (input: RecordCooperativeSavingInput) => recordMutation.mutateAsync(input),
    reverseSaving: (input: ReverseCooperativeSavingInput) => reverseMutation.mutateAsync(input),
    isMutating: recordMutation.isPending || reverseMutation.isPending,
  };
};

export type CooperativeSavingMemberOption = Pick<CooperativeMember, 'id' | 'member_number' | 'name'>;
export type CooperativeSavingBalanceRow = CooperativeMemberSavingBalance;
