import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  recordCooperativeLoanPayment,
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
} from '@/types';

export type CooperativeInstallmentStatusFilter = CooperativeLoanInstallmentStatus | 'DUE' | 'ALL';
export type CooperativeLoanPaymentStatusFilter = CooperativeLoanPaymentStatus | 'ALL';

const COOPERATIVE_INSTALLMENT_RELATED_QUERY_KEYS = [
  'cooperativeLoans',
  'cooperativeLoanInstallments',
  'cooperativeLoanPayments',
  'financeBalance',
  'financeTransactions',
  'journalEntries',
  'trialBalance',
  'incomeStatement',
  'balanceSheet',
];

export const useCooperativeInstallments = () => {
  const queryClient = useQueryClient();
  const [payingInstallment, setPayingInstallment] = useState<CooperativeLoanInstallment | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<CooperativeLoanPayment | null>(null);
  const [searchText, setSearchText] = useState('');
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

      return matchesSearch && matchesStatus && (!loan || loan.status !== 'REVERSED');
    });
  }, [installmentStatusFilter, installments, loanById, searchText]);

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

      return matchesSearch && matchesStatus;
    });
  }, [paymentStatusFilter, payments, searchText]);

  const invalidate = () => {
    COOPERATIVE_INSTALLMENT_RELATED_QUERY_KEYS.forEach((queryKey) => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    });
  };

  const recordMutation = useMutation({
    mutationFn: recordCooperativeLoanPayment,
    onSuccess: invalidate,
  });
  const reverseMutation = useMutation({
    mutationFn: reverseCooperativeLoanPayment,
    onSuccess: invalidate,
  });

  return {
    loans: loans as CooperativeLoan[],
    installments,
    filteredInstallments,
    payableInstallments,
    payments,
    filteredPayments,
    paymentAccounts: paymentAccounts as ChartOfAccount[],
    loanById,
    payingInstallment,
    setPayingInstallment,
    selectedPayment,
    setSelectedPayment,
    searchText,
    setSearchText,
    installmentStatusFilter,
    setInstallmentStatusFilter,
    paymentStatusFilter,
    setPaymentStatusFilter,
    recordPayment: (input: RecordCooperativeLoanPaymentInput) => recordMutation.mutateAsync(input),
    reversePayment: (input: ReverseCooperativeLoanPaymentInput) => reverseMutation.mutateAsync(input),
    isMutating: recordMutation.isPending || reverseMutation.isPending,
  };
};
