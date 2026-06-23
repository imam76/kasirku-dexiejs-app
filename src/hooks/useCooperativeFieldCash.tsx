import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { useAuth } from '@/auth/useAuth';
import { db } from '@/lib/db';
import {
  buildFieldCashSessionReconciliation,
  closeCooperativeFieldCashSession,
  getCashAccountBalance,
  openCooperativeFieldCashSession,
  recordDepositFromPetugasToFinance,
  recordDroppingFromFinanceToPetugas,
  type RecordFieldCashTransferInput,
} from '@/services/cooperativeFieldCashService';
import {
  getCooperativeFieldCashReport,
  type CooperativeFieldCashReportFilters,
} from '@/services/cooperativeFieldCashReportService';
import type { ChartOfAccount, CooperativeFieldCashSession, Employee } from '@/types';

const RELATED_QUERY_KEYS = [
  'cooperativeFieldCashSessions',
  'cooperativeFieldCashReport',
  'cooperativeFieldCashReconciliation',
  'financeTransactions',
  'financeBalance',
  'journalEntries',
  'trialBalance',
];

export const useCooperativeFieldCash = () => {
  const queryClient = useQueryClient();
  const { can, currentRole, currentUser } = useAuth();
  const [reportFilters, setReportFilters] = useState<CooperativeFieldCashReportFilters>({});
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

  const openSessions = useLiveQuery(
    async () => {
      const sessions = await db.cooperativeFieldCashSessions
        .where('status')
        .equals('OPEN')
        .toArray();

      return new Map(sessions.map((session) => [session.employee_id, session]));
    },
    [],
    new Map<string, CooperativeFieldCashSession>(),
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

  const invalidate = () => {
    RELATED_QUERY_KEYS.forEach((queryKey) => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    });
  };

  const droppingMutation = useMutation({
    mutationFn: recordDroppingFromFinanceToPetugas,
    onSuccess: invalidate,
  });
  const depositMutation = useMutation({
    mutationFn: recordDepositFromPetugasToFinance,
    onSuccess: invalidate,
  });
  const openSessionMutation = useMutation({
    mutationFn: openCooperativeFieldCashSession,
    onSuccess: invalidate,
  });
  const closeSessionMutation = useMutation({
    mutationFn: closeCooperativeFieldCashSession,
    onSuccess: invalidate,
  });

  return {
    employees,
    canViewAllFieldCash,
    fieldCashEmployees,
    paymentAccounts,
    financeAccounts,
    balances,
    openSessions,
    reportRows: reportQuery.data ?? [],
    reportFilters,
    setReportFilters,
    isReportLoading: reportQuery.isLoading,
    recordDropping: (input: RecordFieldCashTransferInput) => droppingMutation.mutateAsync(input),
    recordDeposit: (input: RecordFieldCashTransferInput) => depositMutation.mutateAsync(input),
    openSession: openSessionMutation.mutateAsync,
    closeSession: closeSessionMutation.mutateAsync,
    previewReconciliation: buildFieldCashSessionReconciliation,
    isMutating: droppingMutation.isPending
      || depositMutation.isPending
      || openSessionMutation.isPending
      || closeSessionMutation.isPending,
  };
};
