import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  approveCooperativeLoan,
  createCooperativeLoanApplication,
  disburseCooperativeLoan,
  rejectCooperativeLoan,
  type ApproveCooperativeLoanInput,
  type CreateCooperativeLoanApplicationInput,
  type DisburseCooperativeLoanInput,
  type RejectCooperativeLoanInput,
} from '@/services/cooperativeLoanService';
import type {
  ChartOfAccount,
  CooperativeLoan,
  CooperativeLoanInstallment,
  CooperativeLoanStatus,
} from '@/types';

export type CooperativeLoanStatusFilter = CooperativeLoanStatus | 'ALL';

const COOPERATIVE_LOAN_RELATED_QUERY_KEYS = [
  'cooperativeLoans',
  'cooperativeLoanInstallments',
  'cooperativeSavings',
  'financeBalance',
  'financeTransactions',
  'journalEntries',
  'trialBalance',
  'incomeStatement',
  'balanceSheet',
];

export const useCooperativeLoans = () => {
  const queryClient = useQueryClient();
  const [selectedLoan, setSelectedLoan] = useState<CooperativeLoan | null>(null);
  const [disbursingLoan, setDisbursingLoan] = useState<CooperativeLoan | null>(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<CooperativeLoanStatusFilter>('ALL');

  const members = useLiveQuery(
    () => db.cooperativeMembers.orderBy('member_number').toArray(),
    [],
    [],
  );
  const loans = useLiveQuery(
    () => db.cooperativeLoans.orderBy('application_date').reverse().toArray(),
    [],
    [],
  );
  const installments = useLiveQuery(
    () => db.cooperativeLoanInstallments.orderBy('due_date').toArray(),
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

  const activeMembers = useMemo(
    () => members.filter((member) => member.status === 'ACTIVE'),
    [members],
  );

  const filteredLoans = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return loans.filter((loan) => {
      const matchesSearch = !query || [
        loan.loan_number,
        loan.member_number,
        loan.member_name,
        loan.cash_account_name,
        loan.notes,
        loan.rejection_reason,
      ].some((value) => value?.toLowerCase().includes(query));
      const matchesStatus = statusFilter === 'ALL' || loan.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [loans, searchText, statusFilter]);

  const selectedLoanInstallments = useMemo(() => {
    if (!selectedLoan) return [];

    return installments
      .filter((installment) => installment.loan_id === selectedLoan.id)
      .sort((left, right) => left.installment_number - right.installment_number);
  }, [installments, selectedLoan]);

  const invalidate = () => {
    COOPERATIVE_LOAN_RELATED_QUERY_KEYS.forEach((queryKey) => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    });
  };

  const createMutation = useMutation({
    mutationFn: createCooperativeLoanApplication,
    onSuccess: invalidate,
  });
  const approveMutation = useMutation({
    mutationFn: approveCooperativeLoan,
    onSuccess: invalidate,
  });
  const rejectMutation = useMutation({
    mutationFn: rejectCooperativeLoan,
    onSuccess: invalidate,
  });
  const disburseMutation = useMutation({
    mutationFn: disburseCooperativeLoan,
    onSuccess: invalidate,
  });

  return {
    members,
    activeMembers,
    loans,
    filteredLoans,
    installments,
    selectedLoan,
    setSelectedLoan,
    selectedLoanInstallments: selectedLoanInstallments as CooperativeLoanInstallment[],
    disbursingLoan,
    setDisbursingLoan,
    paymentAccounts: paymentAccounts as ChartOfAccount[],
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    createLoan: (input: CreateCooperativeLoanApplicationInput) => createMutation.mutateAsync(input),
    approveLoan: (input: ApproveCooperativeLoanInput) => approveMutation.mutateAsync(input),
    rejectLoan: (input: RejectCooperativeLoanInput) => rejectMutation.mutateAsync(input),
    disburseLoan: (input: DisburseCooperativeLoanInput) => disburseMutation.mutateAsync(input),
    isMutating: createMutation.isPending || approveMutation.isPending || rejectMutation.isPending || disburseMutation.isPending,
  };
};
