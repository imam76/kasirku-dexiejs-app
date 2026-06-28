import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { App } from 'antd';
import { db } from '@/lib/db';
import {
  createEmployeeCashAdvance,
  voidEmployeeCashAdvance,
  type CreateEmployeeCashAdvanceInput,
  type VoidEmployeeCashAdvanceInput,
} from '@/services/employeeCashAdvanceService';
import type {
  ChartOfAccount,
  Employee,
  EmployeeCashAdvance,
  EmployeeCashAdvanceRepayment,
  EmployeeCashAdvanceStatus,
} from '@/types';

export interface EmployeeCashAdvanceWithRepayments extends EmployeeCashAdvance {
  repayments: EmployeeCashAdvanceRepayment[];
  reserved_amount: number;
  posted_amount: number;
}

export type EmployeeCashAdvanceStatusFilter = EmployeeCashAdvanceStatus | 'ALL';

const roundCurrency = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const invalidateEmployeeCashAdvanceQueries = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries({ queryKey: ['employeeCashAdvances'] });
  queryClient.invalidateQueries({ queryKey: ['payrollRuns'] });
  queryClient.invalidateQueries({ queryKey: ['financeTransactions'] });
  queryClient.invalidateQueries({ queryKey: ['financeBalance'] });
  queryClient.invalidateQueries({ queryKey: ['profitBalance'] });
  queryClient.invalidateQueries({ queryKey: ['profitLogs'] });
};

export const useEmployeeCashAdvances = () => {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<EmployeeCashAdvanceStatusFilter>('ALL');

  const employees = useLiveQuery(
    () => db.employees
      .orderBy('name')
      .filter((employee) => employee.is_active)
      .toArray(),
    [],
    [] as Employee[],
  );

  const cashBankAccounts = useLiveQuery(
    () => db.chartOfAccounts
      .where('type')
      .equals('ASSET')
      .filter((account) => account.is_active && account.is_postable)
      .toArray(),
    [],
    [] as ChartOfAccount[],
  );

  const cashAdvances = useLiveQuery(
    async () => {
      const [advances, repayments] = await Promise.all([
        db.employeeCashAdvances.orderBy('disbursed_at').reverse().toArray(),
        db.employeeCashAdvanceRepayments.toArray(),
      ]);
      const repaymentsByAdvance = repayments.reduce<Record<string, EmployeeCashAdvanceRepayment[]>>((acc, repayment) => {
        acc[repayment.cash_advance_id] = [...(acc[repayment.cash_advance_id] ?? []), repayment];
        return acc;
      }, {});

      return advances.map<EmployeeCashAdvanceWithRepayments>((advance) => {
        const advanceRepayments = (repaymentsByAdvance[advance.id] ?? []).sort((left, right) => (
          right.created_at.localeCompare(left.created_at)
        ));

        return {
          ...advance,
          repayments: advanceRepayments,
          reserved_amount: roundCurrency(advanceRepayments
            .filter((repayment) => repayment.status === 'RESERVED')
            .reduce((total, repayment) => total + repayment.amount, 0)),
          posted_amount: roundCurrency(advanceRepayments
            .filter((repayment) => repayment.status === 'POSTED')
            .reduce((total, repayment) => total + repayment.amount, 0)),
        };
      });
    },
    [],
    [] as EmployeeCashAdvanceWithRepayments[],
  );

  const filteredCashAdvances = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return cashAdvances.filter((advance) => {
      const matchesStatus = statusFilter === 'ALL' || advance.status === statusFilter;
      const matchesSearch = !query || [
        advance.advance_number,
        advance.employee_name,
        advance.employee_position,
        advance.cash_account_name,
        advance.notes,
        advance.void_reason,
        ...advance.repayments.flatMap((repayment) => [
          repayment.cash_advance_number,
          repayment.payroll_number,
          repayment.employee_name,
          repayment.status,
        ]),
      ].some((value) => value?.toLowerCase().includes(query));

      return matchesStatus && matchesSearch;
    });
  }, [cashAdvances, searchText, statusFilter]);

  const summary = useMemo(() => cashAdvances.reduce((acc, advance) => {
    if (advance.status === 'VOIDED') return acc;

    acc.totalAmount = roundCurrency(acc.totalAmount + advance.amount);
    acc.outstandingAmount = roundCurrency(acc.outstandingAmount + advance.outstanding_amount);
    acc.reservedAmount = roundCurrency(acc.reservedAmount + advance.reserved_amount);
    if (advance.status === 'ACTIVE') acc.activeCount += 1;
    if (advance.status === 'PAID') acc.paidCount += 1;
    return acc;
  }, {
    activeCount: 0,
    paidCount: 0,
    totalAmount: 0,
    outstandingAmount: 0,
    reservedAmount: 0,
  }), [cashAdvances]);

  const createMutation = useMutation({
    mutationFn: createEmployeeCashAdvance,
    onSuccess: () => {
      invalidateEmployeeCashAdvanceQueries(queryClient);
      message.success('Kasbon berhasil dicairkan.');
    },
    onError: (error: Error) => {
      modal.error({
        title: 'Gagal Mencairkan Kasbon',
        content: error.message,
      });
    },
  });

  const voidMutation = useMutation({
    mutationFn: voidEmployeeCashAdvance,
    onSuccess: () => {
      invalidateEmployeeCashAdvanceQueries(queryClient);
      message.success('Kasbon berhasil dibatalkan.');
    },
    onError: (error: Error) => {
      modal.error({
        title: 'Gagal Membatalkan Kasbon',
        content: error.message,
      });
    },
  });

  return {
    employees,
    cashBankAccounts,
    cashAdvances,
    filteredCashAdvances,
    summary,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    createCashAdvance: createMutation.mutateAsync as (input: CreateEmployeeCashAdvanceInput) => Promise<EmployeeCashAdvance>,
    voidCashAdvance: voidMutation.mutateAsync as (input: VoidEmployeeCashAdvanceInput) => Promise<EmployeeCashAdvance>,
    isCreating: createMutation.isPending,
    isVoiding: voidMutation.isPending,
  };
};
