import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { App } from 'antd';
import { db } from '@/lib/db';
import {
  approvePayrollRun,
  createPayrollRun,
  payPayrollRun,
  updatePayrollRun,
  voidPayrollRun,
  type PayrollPaymentInput,
  type PayrollRunUpsertInput,
} from '@/services/payrollService';
import type {
  ChartOfAccount,
  Employee,
  EmployeeCashAdvanceRepayment,
  PayrollRun,
  PayrollRunItem,
  PayrollRunStatus,
} from '@/types';

export interface PayrollRunWithItems extends PayrollRun {
  items: PayrollRunItem[];
  cash_advance_repayments: EmployeeCashAdvanceRepayment[];
}

export type PayrollStatusFilter = PayrollRunStatus | 'ALL';

const invalidatePayrollQueries = (queryClient: ReturnType<typeof useQueryClient>) => {
  queryClient.invalidateQueries({ queryKey: ['payrollRuns'] });
  queryClient.invalidateQueries({ queryKey: ['employeeCashAdvances'] });
  queryClient.invalidateQueries({ queryKey: ['financeTransactions'] });
  queryClient.invalidateQueries({ queryKey: ['financeBalance'] });
  queryClient.invalidateQueries({ queryKey: ['profitBalance'] });
  queryClient.invalidateQueries({ queryKey: ['profitLogs'] });
};

export const usePayroll = () => {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<PayrollStatusFilter>('ALL');

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

  const payrollRuns = useLiveQuery(
    async () => {
      const [runs, items, cashAdvanceRepayments] = await Promise.all([
        db.payrollRuns.orderBy('created_at').reverse().toArray(),
        db.payrollRunItems.toArray(),
        db.employeeCashAdvanceRepayments.toArray(),
      ]);
      const itemsByRun = items.reduce<Record<string, PayrollRunItem[]>>((acc, item) => {
        acc[item.payroll_run_id] = [...(acc[item.payroll_run_id] ?? []), item];
        return acc;
      }, {});
      const repaymentsByRun = cashAdvanceRepayments.reduce<Record<string, EmployeeCashAdvanceRepayment[]>>((acc, repayment) => {
        acc[repayment.payroll_run_id] = [...(acc[repayment.payroll_run_id] ?? []), repayment];
        return acc;
      }, {});

      return runs.map<PayrollRunWithItems>((run) => {
        const normalizedItems = (itemsByRun[run.id] ?? []).map((item) => {
          const otherDeductionAmount = Number(item.other_deduction_amount ?? item.deduction_amount ?? 0);
          const cashAdvanceDeductionAmount = Number(item.cash_advance_deduction_amount ?? 0);
          const deductionAmount = Number(item.deduction_amount ?? otherDeductionAmount + cashAdvanceDeductionAmount);

          return {
            ...item,
            other_deduction_amount: otherDeductionAmount,
            cash_advance_deduction_amount: cashAdvanceDeductionAmount,
            deduction_amount: deductionAmount,
          };
        }).sort((left, right) => (
          left.employee_name.localeCompare(right.employee_name)
        ));
        const otherDeductionAmount = Number(run.other_deduction_amount ?? run.deduction_amount ?? 0);
        const cashAdvanceDeductionAmount = Number(run.cash_advance_deduction_amount ?? 0);
        const deductionAmount = Number(run.deduction_amount ?? otherDeductionAmount + cashAdvanceDeductionAmount);

        return {
          ...run,
          other_deduction_amount: otherDeductionAmount,
          cash_advance_deduction_amount: cashAdvanceDeductionAmount,
          deduction_amount: deductionAmount,
          items: normalizedItems,
          cash_advance_repayments: (repaymentsByRun[run.id] ?? []).sort((left, right) => (
            left.cash_advance_number.localeCompare(right.cash_advance_number)
          )),
        };
      });
    },
    [],
    [] as PayrollRunWithItems[],
  );

  const filteredPayrollRuns = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return payrollRuns.filter((run) => {
      const matchesStatus = statusFilter === 'ALL' || run.status === statusFilter;
      const matchesSearch = !query || [
        run.payroll_number,
        run.period_start,
        run.period_end,
        run.notes,
        run.cash_account_name,
        ...run.cash_advance_repayments.flatMap((repayment) => [
          repayment.cash_advance_number,
          repayment.status,
        ]),
        ...run.items.flatMap((item) => [item.employee_name, item.employee_position, item.notes]),
      ].some((value) => value?.toLowerCase().includes(query));

      return matchesStatus && matchesSearch;
    });
  }, [payrollRuns, searchText, statusFilter]);

  const createMutation = useMutation({
    mutationFn: createPayrollRun,
    onSuccess: () => {
      invalidatePayrollQueries(queryClient);
      message.success('Payroll berhasil dibuat.');
    },
    onError: (error: Error) => {
      modal.error({
        title: 'Gagal Membuat Payroll',
        content: error.message,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: PayrollRunUpsertInput }) => updatePayrollRun(id, input),
    onSuccess: () => {
      invalidatePayrollQueries(queryClient);
      message.success('Payroll berhasil diperbarui.');
    },
    onError: (error: Error) => {
      modal.error({
        title: 'Gagal Mengubah Payroll',
        content: error.message,
      });
    },
  });

  const approveMutation = useMutation({
    mutationFn: approvePayrollRun,
    onSuccess: () => {
      invalidatePayrollQueries(queryClient);
      message.success('Payroll berhasil di-approve.');
    },
    onError: (error: Error) => {
      modal.error({
        title: 'Gagal Approve Payroll',
        content: error.message,
      });
    },
  });

  const payMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: PayrollPaymentInput }) => payPayrollRun(id, input),
    onSuccess: () => {
      invalidatePayrollQueries(queryClient);
      message.success('Payroll berhasil dibayar dan masuk ke Cash & Bank.');
    },
    onError: (error: Error) => {
      modal.error({
        title: 'Gagal Membayar Payroll',
        content: error.message,
      });
    },
  });

  const voidMutation = useMutation({
    mutationFn: voidPayrollRun,
    onSuccess: () => {
      invalidatePayrollQueries(queryClient);
      message.success('Payroll berhasil dibatalkan.');
    },
    onError: (error: Error) => {
      modal.error({
        title: 'Gagal Membatalkan Payroll',
        content: error.message,
      });
    },
  });

  return {
    employees,
    cashBankAccounts,
    payrollRuns,
    filteredPayrollRuns,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    createPayrollRun: createMutation.mutateAsync,
    updatePayrollRun: updateMutation.mutateAsync,
    approvePayrollRun: approveMutation.mutateAsync,
    payPayrollRun: payMutation.mutateAsync,
    voidPayrollRun: voidMutation.mutateAsync,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
    isApproving: approveMutation.isPending,
    isPaying: payMutation.isPending,
    isVoiding: voidMutation.isPending,
  };
};
