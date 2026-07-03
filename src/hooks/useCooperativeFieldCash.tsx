import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import type { Dayjs } from 'dayjs';
import { useAuth } from '@/auth/useAuth';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import { createCooperativeCashReportEmployee } from '@/services/cooperativeCashReportService';
import {
  closeFieldCashBookToFinance,
  type CloseFieldCashBookInput,
  getCashAccountBalance,
  recordDepositFromPetugasToFinance,
  recordDroppingFromFinanceToPetugas,
  type RecordFieldCashTransferInput,
} from '@/services/cooperativeFieldCashService';
import {
  getCooperativeFieldCashReport,
  type CooperativeFieldCashReportFilters,
} from '@/services/cooperativeFieldCashReportService';
import type { ChartOfAccount, Employee } from '@/types';

const RELATED_QUERY_KEYS = [
  'cooperativeFieldCashSessions',
  'cooperativeFieldCashReport',
  'cooperativeFieldCashCashDetail',
  'cooperativeCashReport',
  'cooperativeDailyFieldCashReport',
  'financeTransactions',
  'financeBalance',
  'journalEntries',
  'trialBalance',
];

export const buildDailyFieldCashReportFilters = (
  date: Dayjs = dayjs.tz().startOf('day'),
  employeeId?: string,
): CooperativeFieldCashReportFilters => ({
  fromDate: date.startOf('day').toISOString(),
  toDate: date.endOf('day').toISOString(),
  ...(employeeId ? { employeeId } : {}),
});

export const useCooperativeFieldCash = () => {
  const queryClient = useQueryClient();
  const { can, currentRole, currentUser } = useAuth();
  const [reportFilters, setReportFilters] = useState<CooperativeFieldCashReportFilters>(() => (
    buildDailyFieldCashReportFilters()
  ));
  const [cashDetailDate, setCashDetailDate] = useState(() => dayjs.tz().startOf('day'));
  const canViewAllFieldCash = Boolean(
    currentRole?.is_owner ||
    currentUser?.role === 'OWNER' ||
    currentUser?.role === 'ADMIN' ||
    can('COOPERATIVE_FIELD_CASH_MANAGE')
  );
  const scopedEmployeeId = canViewAllFieldCash ? undefined : (currentUser?.employee_id ?? currentUser?.id);

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
    [] as ChartOfAccount[],
  );

  const allFieldCashEmployees = useMemo(
    () => employees.filter((employee) => employee.is_active && employee.field_cash_account_id),
    [employees],
  );
  const fieldCashEmployees = useMemo(
    () => allFieldCashEmployees.filter((employee) => (
      canViewAllFieldCash || employee.id === scopedEmployeeId
    )),
    [allFieldCashEmployees, canViewAllFieldCash, scopedEmployeeId],
  );
  const allFieldCashAccountIds = useMemo(
    () => new Set(allFieldCashEmployees.map((employee) => employee.field_cash_account_id).filter(Boolean) as string[]),
    [allFieldCashEmployees],
  );
  const financeAccounts = useMemo(
    () => paymentAccounts.filter((account) => !allFieldCashAccountIds.has(account.id)),
    [allFieldCashAccountIds, paymentAccounts],
  );

  const balances = useLiveQuery(
    async () => {
      const pairs = await Promise.all(fieldCashEmployees.map(async (employee) => {
        const cashAccountId = employee.field_cash_account_id;
        return cashAccountId ? [cashAccountId, await getCashAccountBalance(cashAccountId)] as const : undefined;
      }));

      return new Map(pairs.filter((pair): pair is readonly [string, number] => Boolean(pair)));
    },
    [fieldCashEmployees.map((employee) => employee.field_cash_account_id).join('|')],
    new Map<string, number>(),
  );

  const reportQuery = useQuery({
    queryKey: ['cooperativeFieldCashReport', reportFilters, currentUser?.id, currentUser?.employee_id, canViewAllFieldCash],
    queryFn: () => getCooperativeFieldCashReport(canViewAllFieldCash ? reportFilters : {}),
  });
  const cashDetailDateKey = cashDetailDate.format('YYYY-MM-DD');
  const cashDetailQuery = useQuery({
    queryKey: ['cooperativeFieldCashCashDetail', cashDetailDateKey, currentUser?.id, currentUser?.employee_id, canViewAllFieldCash],
    queryFn: async () => {
      const selectedDate = dayjs.tz(cashDetailDateKey);
      const rows = await getCooperativeFieldCashReport({
        fromDate: selectedDate.startOf('day').toISOString(),
        toDate: selectedDate.endOf('day').toISOString(),
      });

      return rows.map(createCooperativeCashReportEmployee);
    },
  });

  const invalidate = () => Promise.all(
    RELATED_QUERY_KEYS.map((queryKey) => queryClient.invalidateQueries({ queryKey: [queryKey] })),
  );

  const droppingMutation = useMutation({
    mutationFn: recordDroppingFromFinanceToPetugas,
    onSuccess: invalidate,
  });
  const depositMutation = useMutation({
    mutationFn: recordDepositFromPetugasToFinance,
    onSuccess: invalidate,
  });
  const closeBookMutation = useMutation({
    mutationFn: closeFieldCashBookToFinance,
    onSuccess: invalidate,
  });

  return {
    employees,
    canViewAllFieldCash,
    fieldCashEmployees,
    paymentAccounts,
    financeAccounts,
    balances,
    reportRows: reportQuery.data ?? [],
    reportFilters,
    setReportFilters,
    isReportLoading: reportQuery.isLoading,
    cashDetailDate,
    setCashDetailDate,
    cashDetailEmployees: cashDetailQuery.data ?? [],
    isCashDetailLoading: cashDetailQuery.isLoading || cashDetailQuery.isFetching,
    cashDetailError: cashDetailQuery.error,
    recordDropping: (input: RecordFieldCashTransferInput) => droppingMutation.mutateAsync(input),
    recordDeposit: (input: RecordFieldCashTransferInput) => depositMutation.mutateAsync(input),
    closeBook: (input: CloseFieldCashBookInput) => closeBookMutation.mutateAsync(input),
    isMutating: droppingMutation.isPending || depositMutation.isPending || closeBookMutation.isPending,
  };
};
