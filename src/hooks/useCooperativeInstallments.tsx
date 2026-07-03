import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '@/auth/useAuth';
import { db } from '@/lib/db';
import {
  approveCooperativePaymentRequest,
  listCooperativePaymentApprovalRequests,
  recordCooperativeLoanPayment,
  rejectCooperativePaymentRequest,
  reverseCooperativeLoanPayment,
  type RecordCooperativeLoanPaymentInput,
  type ReverseCooperativeLoanPaymentInput,
} from '@/services/cooperativeLoanService';
import type {
  ChartOfAccount,
  CooperativeLoan,
  CooperativeLoanInstallment,
  CooperativeLoanInstallmentStatus,
  CooperativeLoanPayment,
  CooperativeLoanPaymentStatus,
  CooperativeMember,
  Employee,
} from '@/types';

export type CooperativeInstallmentStatusFilter = CooperativeLoanInstallmentStatus | 'DUE' | 'ALL';
export type CooperativeLoanPaymentStatusFilter = CooperativeLoanPaymentStatus | 'ALL';
export type CooperativeInstallmentMemberFilter = string;

interface CooperativeInstallmentMemberOption {
  value: string;
  label: string;
  memberNumber: string;
  memberName: string;
}

type CooperativeInstallmentMemberSnapshot = Pick<CooperativeLoanInstallment, 'member_id' | 'member_number' | 'member_name'>;

const COOPERATIVE_INSTALLMENT_RELATED_QUERY_KEYS = [
  'cooperativeLoans',
  'cooperativeLoanInstallments',
  'cooperativeLoanPayments',
  'cooperativeFieldCashReport',
  'cooperativeFieldCashCashDetail',
  'cooperativeReports',
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

export const useCooperativeInstallments = () => {
  const queryClient = useQueryClient();
  const { can } = useAuth();
  const canApprovePayment = can('COOPERATIVE_PAYMENT_APPROVE');
  const [payingInstallment, setPayingInstallment] = useState<CooperativeLoanInstallment | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<CooperativeLoanPayment | null>(null);
  const [searchText, setSearchText] = useState('');
  const [memberFilter, setMemberFilter] = useState<CooperativeInstallmentMemberFilter>('ALL');
  const [installmentStatusFilter, setInstallmentStatusFilter] = useState<CooperativeInstallmentStatusFilter>('DUE');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<CooperativeLoanPaymentStatusFilter>('POSTED');

  const loans = useLiveQuery(
    () => db.cooperativeLoans.orderBy('loan_number').toArray(),
    [],
    [],
  );
  const installments = useLiveQuery(
    () => db.cooperativeLoanInstallments.orderBy('due_date').toArray(),
    [],
    [],
  );
  const payments = useLiveQuery(
    () => db.cooperativeLoanPayments.orderBy('payment_date').reverse().toArray(),
    [],
    [],
  );
  const members = useLiveQuery(
    () => db.cooperativeMembers.toArray(),
    [],
    [] as CooperativeMember[],
  );
  const employees = useLiveQuery(
    () => db.employees.orderBy('name').toArray(),
    [],
    [] as Employee[],
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
  const approvalRequestsQuery = useQuery({
    queryKey: ['cooperativePaymentApprovalRequests'],
    queryFn: listCooperativePaymentApprovalRequests,
    enabled: canApprovePayment,
  });

  const loanById = useMemo(() => new Map(loans.map((loan) => [loan.id, loan])), [loans]);
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const activeCollectors = useMemo(() => (
    employees.filter((employee) => employee.is_active)
  ), [employees]);

  const memberFilterOptions = useMemo(() => {
    const memberById = new Map<string, CooperativeInstallmentMemberOption>();
    const addMember = (member: CooperativeInstallmentMemberSnapshot) => {
      if (!memberById.has(member.member_id)) {
        memberById.set(member.member_id, {
          value: member.member_id,
          label: `${member.member_number} - ${member.member_name}`,
          memberNumber: member.member_number,
          memberName: member.member_name,
        });
      }
    };

    installments.forEach(addMember);
    payments.forEach(addMember);

    return Array.from(memberById.values()).sort((a, b) => (
      a.memberNumber.localeCompare(b.memberNumber) || a.memberName.localeCompare(b.memberName)
    ));
  }, [installments, payments]);

  const payableInstallments = useMemo(() => (
    installments.filter((installment) => {
      const loan = loanById.get(installment.loan_id);
      return loan?.status === 'DISBURSED' && installment.status !== 'PAID';
    })
  ), [installments, loanById]);

  const filteredInstallments = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return installments.filter((installment) => {
      const loan = loanById.get(installment.loan_id);
      const matchesSearch = !query || [
        installment.loan_number,
        installment.member_number,
        installment.member_name,
      ].some((value) => value.toLowerCase().includes(query));
      const matchesStatus = installmentStatusFilter === 'ALL' ||
        (installmentStatusFilter === 'DUE'
          ? installment.status !== 'PAID'
          : installment.status === installmentStatusFilter);
      const matchesMember = memberFilter === 'ALL' || installment.member_id === memberFilter;

      return matchesSearch && matchesStatus && matchesMember && (!loan || loan.status !== 'REVERSED');
    });
  }, [installmentStatusFilter, installments, loanById, memberFilter, searchText]);

  const filteredPayments = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return payments.filter((payment) => {
      const matchesSearch = !query || [
        payment.payment_number,
        payment.loan_number,
        payment.member_number,
        payment.member_name,
        payment.cash_account_name,
        payment.notes,
        payment.reversal_reason,
      ].some((value) => value?.toLowerCase().includes(query));
      const matchesStatus = paymentStatusFilter === 'ALL' || payment.status === paymentStatusFilter;
      const matchesMember = memberFilter === 'ALL' || payment.member_id === memberFilter;

      return matchesSearch && matchesStatus && matchesMember;
    });
  }, [memberFilter, paymentStatusFilter, payments, searchText]);

  const invalidate = () => {
    COOPERATIVE_INSTALLMENT_RELATED_QUERY_KEYS.forEach((queryKey) => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    });
  };

  const getFieldCashPaymentStatusForInstallment = (installment: CooperativeLoanInstallment) => {
    const member = memberById.get(installment.member_id);
    const employee = member?.officer_id ? employeeById.get(member.officer_id) : undefined;
    if (!employee?.is_active || !employee.field_cash_account_id) return undefined;

    return {
      employee,
      cash_account_id: employee.field_cash_account_id,
      badge: `Setoran kolektor ${employee.name} - ${employee.field_cash_account_code ?? '-'}`,
    };
  };

  const getDefaultCollectorIdForInstallment = (installment: CooperativeLoanInstallment) => {
    const member = memberById.get(installment.member_id);
    return member?.officer_id && employeeById.get(member.officer_id)?.is_active
      ? member.officer_id
      : undefined;
  };

  const recordMutation = useMutation({
    mutationFn: recordCooperativeLoanPayment,
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['cooperativePaymentApprovalRequests'] });
    },
  });
  const reverseMutation = useMutation({
    mutationFn: reverseCooperativeLoanPayment,
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['cooperativePaymentApprovalRequests'] });
    },
  });
  const approveMutation = useMutation({
    mutationFn: ({ requestId, notes }: { requestId: string; notes?: string }) => (
      approveCooperativePaymentRequest(requestId, notes)
    ),
    onSuccess: () => {
      invalidate();
      queryClient.invalidateQueries({ queryKey: ['cooperativePaymentApprovalRequests'] });
    },
  });
  const rejectMutation = useMutation({
    mutationFn: ({ requestId, notes }: { requestId: string; notes: string }) => (
      rejectCooperativePaymentRequest(requestId, notes)
    ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cooperativePaymentApprovalRequests'] });
    },
  });

  return {
    loans: loans as CooperativeLoan[],
    installments,
    filteredInstallments,
    payableInstallments,
    payments,
    filteredPayments,
    memberFilterOptions,
    activeCollectors,
    paymentAccounts: paymentAccounts as ChartOfAccount[],
    loanById,
    payingInstallment,
    setPayingInstallment,
    selectedPayment,
    setSelectedPayment,
    searchText,
    setSearchText,
    memberFilter,
    setMemberFilter,
    installmentStatusFilter,
    setInstallmentStatusFilter,
    paymentStatusFilter,
    setPaymentStatusFilter,
    approvalRequests: approvalRequestsQuery.data ?? [],
    canApprovePayment,
    recordPayment: (input: RecordCooperativeLoanPaymentInput) => recordMutation.mutateAsync(input),
    reversePayment: (input: ReverseCooperativeLoanPaymentInput) => reverseMutation.mutateAsync(input),
    approvePaymentRequest: (requestId: string, notes?: string) => (
      approveMutation.mutateAsync({ requestId, notes })
    ),
    rejectPaymentRequest: (requestId: string, notes: string) => (
      rejectMutation.mutateAsync({ requestId, notes })
    ),
    getFieldCashPaymentStatusForInstallment,
    getDefaultCollectorIdForInstallment,
    isMutating: recordMutation.isPending || reverseMutation.isPending ||
      approveMutation.isPending || rejectMutation.isPending,
  };
};
