import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import dayjs from '@/lib/dayjs';
import { db } from '@/lib/db';
import {
  recordCooperativeLoanPayment,
  type RecordCooperativeLoanPaymentInput,
} from '@/services/cooperativeLoanService';
import type {
  ChartOfAccount,
  CooperativeLoan,
  CooperativeLoanInstallment,
} from '@/types';
import { getInstallmentRemainingAmounts } from '@/utils/koperasi/loanPaymentAllocation';

const COOPERATIVE_BILLING_RELATED_QUERY_KEYS = [
  'cooperativeLoans',
  'cooperativeLoanInstallments',
  'cooperativeLoanPayments',
  'financeBalance',
  'financeTransactions',
  'journalEntries',
  'trialBalance',
];

export const useCooperativeBilling = () => {
  const queryClient = useQueryClient();
  const [searchText, setSearchText] = useState('');
  const [memberFilter, setMemberFilter] = useState<string>('ALL');
  const [selectedInstallment, setSelectedInstallment] = useState<CooperativeLoanInstallment | null>(null);

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

  const allUnpaidInstallments = useMemo(() => {
    return installments.filter((installment) => {
      const loan = loanById.get(installment.loan_id);
      return loan?.status === 'DISBURSED' && installment.status !== 'PAID';
    });
  }, [installments, loanById]);

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

      return matchesSearch && matchesMember;
    });
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

  return {
    loans: loans as CooperativeLoan[],
    installments,
    loanById,
    allUnpaidInstallments: filterInstallments(allUnpaidInstallments),
    overdueInstallments: filterInstallments(overdueInstallments),
    dueTodayInstallments: filterInstallments(dueTodayInstallments),
    dueThisWeekInstallments: filterInstallments(dueThisWeekInstallments),
    memberFilterOptions,
    paymentAccounts: paymentAccounts as ChartOfAccount[],
    selectedInstallment,
    setSelectedInstallment,
    searchText,
    setSearchText,
    memberFilter,
    setMemberFilter,
    overdueCount,
    overdueTotalAmount,
    dueTodayCount,
    dueTodayTotalAmount,
    dueThisWeekCount,
    recordPayment: (input: RecordCooperativeLoanPaymentInput) => recordMutation.mutateAsync(input),
    isMutating: recordMutation.isPending,
  };
};
