import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from '@/lib/dayjs';
import { db } from '@/lib/db';
import { useCooperativeAreaScope } from '@/hooks/useCooperativeAreaScope';
import {
  recordCooperativeLoanInstallmentCollection,
  recordCooperativeLoanPayment,
  type RecordCooperativeLoanInstallmentCollectionInput,
  type RecordCooperativeLoanPaymentInput,
} from '@/services/cooperativeLoanService';
import type {
  ChartOfAccount,
  CooperativeLoan,
  CooperativeLoanInstallment,
  CooperativeMember,
  Employee,
} from '@/types';
import { getInstallmentRemainingAmounts } from '@/utils/koperasi/loanPaymentAllocation';

const COOPERATIVE_BILLING_RELATED_QUERY_KEYS = [
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
  'ledgerReport',
  'cooperativeIptwReport',
  'cooperativeInstallmentBookReport',
  'cooperativeMemberRegisterReport',
  'financeBalance',
  'financeTransactions',
  'journalEntries',
  'trialBalance',
];

export const useCooperativeBilling = () => {
  const queryClient = useQueryClient();
  const areaScope = useCooperativeAreaScope();
  const [searchText, setSearchText] = useState('');
  const [memberFilter, setMemberFilter] = useState<string>('ALL');
  const [officerFilter, setOfficerFilter] = useState<string>('ALL');
  const [selectedInstallment, setSelectedInstallment] = useState<CooperativeLoanInstallment | null>(null);

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
  
  const paymentAccounts = useLiveQuery(
    () => db.chartOfAccounts
      .where('type')
      .equals('ASSET')
      .filter((account) => account.is_active && account.is_postable)
      .toArray(),
    [],
    [],
  );

  const loanById = useMemo(() => new Map(loans.map((loan) => [loan.id, loan])), [loans]);
  const memberById = useMemo(() => new Map(members.map((member) => [member.id, member])), [members]);
  const employeeById = useMemo(() => new Map(employees.map((employee) => [employee.id, employee])), [employees]);
  const activeCollectors = useMemo(() => (
    employees.filter((employee) => employee.is_active)
  ), [employees]);
  const visibleMemberIds = useMemo(() => {
    if (!areaScope.isScoped) return null;
    const allowedAreaIds = new Set(areaScope.areaIds);
    return new Set(
      members
        .filter((member) => member.area_id && allowedAreaIds.has(member.area_id))
        .map((member) => member.id),
    );
  }, [areaScope.areaIds, areaScope.isScoped, members]);

  const allUnpaidInstallments = useMemo(() => {
    return installments.filter((installment) => {
      const loan = loanById.get(installment.loan_id);
      const matchesAreaScope = !visibleMemberIds || visibleMemberIds.has(installment.member_id);
      return loan?.status === 'DISBURSED' && installment.status !== 'PAID' && matchesAreaScope;
    });
  }, [installments, loanById, visibleMemberIds]);

  const memberFilterOptions = useMemo(() => {
    const memberById = new Map<string, { value: string; label: string; memberNumber: string; memberName: string }>();
    allUnpaidInstallments.forEach((installment) => {
      if (!memberById.has(installment.member_id)) {
        memberById.set(installment.member_id, {
          value: installment.member_id,
          label: `${installment.member_number} - ${installment.member_name}`,
          memberNumber: installment.member_number,
          memberName: installment.member_name,
        });
      }
    });
    return Array.from(memberById.values()).sort((a, b) => (
      a.memberNumber.localeCompare(b.memberNumber) || a.memberName.localeCompare(b.memberName)
    ));
  }, [allUnpaidInstallments]);

  const officerFilterOptions = useMemo(() => {
    const officerById = new Map<string, { value: string; label: string; officerName: string }>();

    allUnpaidInstallments.forEach((installment) => {
      const member = memberById.get(installment.member_id);
      if (!member?.officer_id || officerById.has(member.officer_id)) return;

      const officerName = member.officer_name ?? employeeById.get(member.officer_id)?.name ?? member.officer_id;
      officerById.set(member.officer_id, {
        value: member.officer_id,
        label: officerName,
        officerName,
      });
    });

    return Array.from(officerById.values())
      .sort((left, right) => left.officerName.localeCompare(right.officerName));
  }, [allUnpaidInstallments, employeeById, memberById]);

  const {
    overdueInstallments,
    dueTodayInstallments,
    dueThisWeekInstallments,
  } = useMemo(() => {
    const today = dayjs().startOf('day');
    const nextWeek = today.add(7, 'day');

    const overdue: CooperativeLoanInstallment[] = [];
    const todayDue: CooperativeLoanInstallment[] = [];
    const thisWeekDue: CooperativeLoanInstallment[] = [];

    allUnpaidInstallments.forEach(installment => {
      const dueDate = dayjs(installment.due_date).startOf('day');
      
      if (dueDate.isBefore(today)) {
        overdue.push(installment);
      }
      
      if (dueDate.isSame(today)) {
        todayDue.push(installment);
      }
      
      if ((dueDate.isSame(today) || dueDate.isAfter(today)) && dueDate.isBefore(nextWeek)) {
        thisWeekDue.push(installment);
      }
    });

    return {
      overdueInstallments: overdue,
      dueTodayInstallments: todayDue,
      dueThisWeekInstallments: thisWeekDue,
    };
  }, [allUnpaidInstallments]);

  // Compute stats
  const overdueTotalAmount = useMemo(() => {
    return overdueInstallments.reduce((sum, inst) => {
      return sum + getInstallmentRemainingAmounts(inst).total_amount;
    }, 0);
  }, [overdueInstallments]);

  const overdueCount = overdueInstallments.length;
  const dueTodayCount = dueTodayInstallments.length;
  const dueTodayTotalAmount = useMemo(() => {
    return dueTodayInstallments.reduce((sum, inst) => {
      return sum + getInstallmentRemainingAmounts(inst).total_amount;
    }, 0);
  }, [dueTodayInstallments]);
  const dueThisWeekCount = dueThisWeekInstallments.length;

  const filterInstallments = (list: CooperativeLoanInstallment[]) => {
    const query = searchText.trim().toLowerCase();
    return list.filter((installment) => {
      const matchesSearch = !query || [
        installment.loan_number,
        installment.member_number,
        installment.member_name,
      ].some((value) => value.toLowerCase().includes(query));
      
      const matchesMember = memberFilter === 'ALL' || installment.member_id === memberFilter;
      const member = memberById.get(installment.member_id);
      const matchesOfficer = officerFilter === 'ALL' || member?.officer_id === officerFilter;

      return matchesSearch && matchesMember && matchesOfficer;
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

  const invalidate = () => {
    COOPERATIVE_BILLING_RELATED_QUERY_KEYS.forEach((queryKey) => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    });
  };

  const recordMutation = useMutation({
    mutationFn: recordCooperativeLoanPayment,
    onSuccess: invalidate,
  });
  const collectionMutation = useMutation({
    mutationFn: recordCooperativeLoanInstallmentCollection,
    onSuccess: invalidate,
  });

  return {
    loans: loans as CooperativeLoan[],
    installments,
    loanById,
    allUnpaidInstallments: filterInstallments(allUnpaidInstallments),
    overdueInstallments: filterInstallments(overdueInstallments),
    dueTodayInstallments: filterInstallments(dueTodayInstallments),
    dueThisWeekInstallments: filterInstallments(dueThisWeekInstallments),
    memberFilterOptions,
    activeCollectors,
    paymentAccounts: paymentAccounts as ChartOfAccount[],
    selectedInstallment,
    setSelectedInstallment,
    searchText,
    setSearchText,
    memberFilter,
    setMemberFilter,
    officerFilter,
    setOfficerFilter,
    officerFilterOptions,
    overdueCount,
    overdueTotalAmount,
    dueTodayCount,
    dueTodayTotalAmount,
    dueThisWeekCount,
    recordPayment: (input: RecordCooperativeLoanPaymentInput) => recordMutation.mutateAsync(input),
    recordCollection: (input: RecordCooperativeLoanInstallmentCollectionInput) => collectionMutation.mutateAsync(input),
    getFieldCashPaymentStatusForInstallment,
    getDefaultCollectorIdForInstallment,
    isMutating: recordMutation.isPending || collectionMutation.isPending,
  };
};
