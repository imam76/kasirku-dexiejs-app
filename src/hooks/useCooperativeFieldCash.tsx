import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  closeCooperativeFieldCashSession,
  getCashAccountBalance,
  openCooperativeFieldCashSession,
  recordDepositFromPetugasToFinance,
  recordDroppingFromFinanceToPetugas,
  type CloseCooperativeFieldCashSessionInput,
  type OpenCooperativeFieldCashSessionInput,
  type RecordFieldCashTransferInput,
} from '@/services/cooperativeFieldCashService';
import {
  getCooperativeFieldCashSessionReport,
  type CooperativeFieldCashReportFilters,
} from '@/services/cooperativeFieldCashReportService';
import type { ChartOfAccount, CooperativeFieldCashSession, Employee } from '@/types';

const RELATED_QUERY_KEYS = [
  'cooperativeFieldCashSessions',
  'cooperativeFieldCashReport',
  'financeTransactions',
  'financeBalance',
  'journalEntries',
  'trialBalance',
];

export const useCooperativeFieldCash = () => {
  const queryClient = useQueryClient();
  const [reportFilters, setReportFilters] = useState<CooperativeFieldCashReportFilters>({
    status: 'ALL',
  });

  const employees = useLiveQuery(
    () => db.employees.orderBy('name').toArray(),
    [],
    [] as Employee[],
  );
  const sessions = useLiveQuery(
    () => db.cooperativeFieldCashSessions.orderBy('opened_at').reverse().toArray(),
    [],
    [] as CooperativeFieldCashSession[],
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

  const fieldCashEmployees = useMemo(
    () => employees.filter((employee) => employee.is_active && employee.field_cash_account_id),
    [employees],
  );
  const activeSessions = useMemo(
    () => sessions.filter((session) => session.status === 'OPEN'),
    [sessions],
  );
  const fieldCashAccountIds = useMemo(
    () => new Set(fieldCashEmployees.map((employee) => employee.field_cash_account_id).filter(Boolean) as string[]),
    [fieldCashEmployees],
  );
  const financeAccounts = useMemo(
    () => paymentAccounts.filter((account) => !fieldCashAccountIds.has(account.id)),
    [fieldCashAccountIds, paymentAccounts],
  );

  const balances = useLiveQuery(
    async () => {
      const pairs = await Promise.all(fieldCashEmployees.map(async (employee) => {
        const cashAccountId = employee.field_cash_account_id;
        return cashAccountId ? [cashAccountId, await getCashAccountBalance(cashAccountId)] as const : undefined;
      }));

      return new Map(pairs.filter((pair): pair is readonly [string, number] => Boolean(pair)));
    },
    [fieldCashEmployees.map((employee) => employee.field_cash_account_id).join('|'), sessions.length],
    new Map<string, number>(),
  );

  const reportQuery = useQuery({
    queryKey: ['cooperativeFieldCashReport', reportFilters],
    queryFn: () => getCooperativeFieldCashSessionReport(reportFilters),
  });

  const invalidate = () => {
    RELATED_QUERY_KEYS.forEach((queryKey) => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    });
  };

  const openMutation = useMutation({
    mutationFn: openCooperativeFieldCashSession,
    onSuccess: invalidate,
  });
  const closeMutation = useMutation({
    mutationFn: closeCooperativeFieldCashSession,
    onSuccess: invalidate,
  });
  const droppingMutation = useMutation({
    mutationFn: recordDroppingFromFinanceToPetugas,
    onSuccess: invalidate,
  });
  const depositMutation = useMutation({
    mutationFn: recordDepositFromPetugasToFinance,
    onSuccess: invalidate,
  });

  return {
    employees,
    fieldCashEmployees,
    sessions,
    activeSessions,
    paymentAccounts,
    financeAccounts,
    balances,
    reportRows: reportQuery.data ?? [],
    reportFilters,
    setReportFilters,
    isReportLoading: reportQuery.isLoading,
    openSession: (input: OpenCooperativeFieldCashSessionInput) => openMutation.mutateAsync(input),
    closeSession: (input: CloseCooperativeFieldCashSessionInput) => closeMutation.mutateAsync(input),
    recordDropping: (input: RecordFieldCashTransferInput) => droppingMutation.mutateAsync(input),
    recordDeposit: (input: RecordFieldCashTransferInput) => depositMutation.mutateAsync(input),
    isMutating: openMutation.isPending || closeMutation.isPending || droppingMutation.isPending || depositMutation.isPending,
  };
};
