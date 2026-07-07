import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  approveCooperativeLoan,
  createCooperativeLoanApplication,
  disburseCooperativeLoan,
  disburseCooperativeLoanViaFieldCash,
  migrateCooperativeLoan,
  rejectCooperativeLoan,
  type ApproveCooperativeLoanInput,
  type CreateCooperativeLoanApplicationInput,
  type DisburseCooperativeLoanInput,
  type DisburseCooperativeLoanViaFieldCashInput,
  type MigrateCooperativeLoanInput,
  type RejectCooperativeLoanInput,
} from '@/services/cooperativeLoanService';
import { getCashAccountBalance } from '@/services/cooperativeFieldCashService';
import type {
  ChartOfAccount,
  CooperativeLoan,
  CooperativeLoanInstallment,
  CooperativeLoanStatus,
  Employee,
  EmployeeCollectionSchedule,
} from '@/types';

export type CooperativeLoanStatusFilter = CooperativeLoanStatus | 'ALL';

const isCashBankAccount = (account: ChartOfAccount) => (
  account.id === 'cash' ||
  account.id === 'bank' ||
  account.code === '1010' ||
  account.code === '1020' ||
  account.parent_id === 'cash-and-bank' ||
  account.parent_code === '1000'
);

const COOPERATIVE_LOAN_RELATED_QUERY_KEYS = [
  'cooperativeLoans',
  'cooperativeLoanInstallments',
  'cooperativeSavings',
  'cooperativeFieldCashReport',
  'cooperativeFieldCashCashDetail',
  'cooperativeReports',
  'cooperativeDailyDropReport',
  'cooperativeWeeklyEmployeeDropReport',
  'cooperativeDailyStortingReport',
  'cooperativeDailyTargetReport',
  'cooperativeDailyFieldCashReport',
  'cooperativeCashReport',
  'cooperativeLedgerReport',
  'cooperativeIptwReport',
  'cooperativeInstallmentBookReport',
  'cooperativeMemberRegisterReport',
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
  const fieldCashEmployees = useLiveQuery(
    () => db.employees
      .where('field_cash_account_id')
      .above('')
      .filter((employee) => employee.is_active && Boolean(employee.field_cash_account_id))
      .toArray(),
    [],
    [],
  );
  const employeeCollectionSchedules = useLiveQuery(
    () => db.employeeCollectionSchedules.toArray(),
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
  const financeAccounts = useMemo(
    () => paymentAccounts.filter((account) => (
      isCashBankAccount(account) && !fieldCashAccountIds.has(account.id)
    )),
    [fieldCashAccountIds, paymentAccounts],
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
  const disburseViaFieldCashMutation = useMutation({
    mutationFn: disburseCooperativeLoanViaFieldCash,
    onSuccess: invalidate,
  });
  const migrateMutation = useMutation({
    mutationFn: migrateCooperativeLoan,
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
    financeAccounts: financeAccounts as ChartOfAccount[],
    fieldCashEmployees: fieldCashEmployees as Employee[],
    employeeCollectionSchedules: employeeCollectionSchedules as EmployeeCollectionSchedule[],
    fieldCashAccountIds,
    fieldCashBalances,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    createLoan: (input: CreateCooperativeLoanApplicationInput) => createMutation.mutateAsync(input),
    approveLoan: (input: ApproveCooperativeLoanInput) => approveMutation.mutateAsync(input),
    rejectLoan: (input: RejectCooperativeLoanInput) => rejectMutation.mutateAsync(input),
    disburseLoan: (input: DisburseCooperativeLoanInput) => disburseMutation.mutateAsync(input),
    disburseLoanViaFieldCash: (input: DisburseCooperativeLoanViaFieldCashInput) => disburseViaFieldCashMutation.mutateAsync(input),
    migrateLoan: (input: MigrateCooperativeLoanInput) => migrateMutation.mutateAsync(input),
    isMutating: createMutation.isPending ||
      approveMutation.isPending ||
      rejectMutation.isPending ||
      disburseMutation.isPending ||
      disburseViaFieldCashMutation.isPending ||
      migrateMutation.isPending,
  };
};
