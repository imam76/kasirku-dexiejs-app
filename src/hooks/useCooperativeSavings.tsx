import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  buildCooperativeSavingOpeningBalanceSuggestions,
  recordCooperativeSaving,
  recordCooperativeSavingOpeningBalance,
  reverseCooperativeSaving,
  type CooperativeSavingOpeningBalanceSuggestion,
  type RecordCooperativeSavingOpeningBalanceInput,
  type RecordCooperativeSavingInput,
  type ReverseCooperativeSavingInput,
} from '@/services/cooperativeSavingService';
import { getCashAccountBalance } from '@/services/cooperativeFieldCashService';
import type {
  ChartOfAccount,
  CooperativeLoan,
  CooperativeLoanPayment,
  CooperativeMember,
  CooperativeMemberSavingBalance,
  CooperativeSavingTransaction,
  CooperativeSavingTransactionType,
  CooperativeSavingType,
  Employee,
} from '@/types';
import { calculateCooperativeSavingInterest } from '@/utils/koperasi/savingInterest';

export type CooperativeSavingTypeFilter = CooperativeSavingType | 'ALL';
export type CooperativeSavingTransactionTypeFilter = CooperativeSavingTransactionType | 'ALL';
export type CooperativeSavingStatusFilter = CooperativeSavingTransaction['status'] | 'ALL';

export interface CooperativeSavingPendingReturn {
  key: string;
  member_id: string;
  member_number: string;
  member_name: string;
  saving_type: 'WAJIB';
  amount: number;
  loan_numbers: string[];
  tokens: string[];
}

const COOPERATIVE_SAVING_RELATED_QUERY_KEYS = [
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
const AUTO_MANDATORY_SAVING_RETURN_TOKEN_PREFIX = 'AUTO_MANDATORY_SAVING_RETURN_PAYMENT';

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const getAutoMandatorySavingReturnToken = (paymentId: string) => (
  `[${AUTO_MANDATORY_SAVING_RETURN_TOKEN_PREFIX}:${paymentId}]`
);

const isPostedLoanPayment = (payment: CooperativeLoanPayment) => (
  payment.status === 'POSTED' &&
  payment.payment_type !== 'REVERSAL' &&
  !payment.reversal_of_payment_id
);

const compareDateAsc = (left?: string, right?: string) => (
  (left ?? '').localeCompare(right ?? '')
);

const getLoanPaidOffPaymentByLoanId = (
  loans: CooperativeLoan[],
  payments: CooperativeLoanPayment[],
) => {
  const paidOffLoanIds = new Set(
    loans
      .filter((loan) => loan.status === 'PAID_OFF')
      .map((loan) => loan.id),
  );
  const paymentByLoanId = new Map<string, CooperativeLoanPayment>();

  payments
    .filter((payment) => paidOffLoanIds.has(payment.loan_id))
    .filter(isPostedLoanPayment)
    .forEach((payment) => {
      const currentPayment = paymentByLoanId.get(payment.loan_id);
      if (
        !currentPayment ||
        compareDateAsc(currentPayment.payment_date, payment.payment_date) < 0 ||
        (
          compareDateAsc(currentPayment.payment_date, payment.payment_date) === 0 &&
          compareDateAsc(currentPayment.created_at, payment.created_at) < 0
        )
      ) {
        paymentByLoanId.set(payment.loan_id, payment);
      }
    });

  return paymentByLoanId;
};

const buildPendingMandatorySavingReturns = (
  loans: CooperativeLoan[],
  payments: CooperativeLoanPayment[],
  transactions: CooperativeSavingTransaction[],
) => {
  const paidTokens = new Set(
    transactions
      .filter((transaction) => (
        transaction.status === 'POSTED' &&
        transaction.transaction_type === 'WITHDRAWAL' &&
        transaction.saving_type === 'WAJIB'
      ))
      .flatMap((transaction) => (
        transaction.notes?.match(/\[AUTO_MANDATORY_SAVING_RETURN_PAYMENT:[^\]]+\]/g) ?? []
      )),
  );
  const paidOffPaymentByLoanId = getLoanPaidOffPaymentByLoanId(loans, payments);
  const pendingByKey = new Map<string, CooperativeSavingPendingReturn>();

  loans
    .filter((loan) => loan.status === 'PAID_OFF')
    .forEach((loan) => {
      const amount = roundCurrency(Number(loan.mandatory_saving_amount || 0));
      if (amount <= 0) return;
      const payment = paidOffPaymentByLoanId.get(loan.id);
      if (!payment) return;

      const token = getAutoMandatorySavingReturnToken(payment.id);
      if (paidTokens.has(token)) return;

      const key = `${loan.member_id}:WAJIB`;
      const current = pendingByKey.get(key);
      if (!current) {
        pendingByKey.set(key, {
          key,
          member_id: loan.member_id,
          member_number: loan.member_number,
          member_name: loan.member_name,
          saving_type: 'WAJIB',
          amount,
          loan_numbers: [loan.loan_number],
          tokens: [token],
        });
        return;
      }

      current.amount = roundCurrency(current.amount + amount);
      current.loan_numbers.push(loan.loan_number);
      current.tokens.push(token);
    });

  return pendingByKey;
};

export const useCooperativeSavings = () => {
  const queryClient = useQueryClient();
  const [selectedTransaction, setSelectedTransaction] = useState<CooperativeSavingTransaction | null>(null);
  const [searchText, setSearchText] = useState('');
  const [savingTypeFilter, setSavingTypeFilter] = useState<CooperativeSavingTypeFilter>('ALL');
  const [transactionTypeFilter, setTransactionTypeFilter] = useState<CooperativeSavingTransactionTypeFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<CooperativeSavingStatusFilter>('POSTED');

  const members = useLiveQuery(
    () => db.cooperativeMembers.orderBy('member_number').toArray(),
    [],
    [],
  );
  const transactions = useLiveQuery(
    () => db.cooperativeSavingTransactions.orderBy('transaction_date').reverse().toArray(),
    [],
    [],
  );
  const balances = useLiveQuery(
    () => db.cooperativeMemberSavingBalances.orderBy('member_number').toArray(),
    [],
    [],
  );
  const loans = useLiveQuery(
    () => db.cooperativeLoans.orderBy('loan_number').toArray(),
    [],
    [],
  );
  const loanPayments = useLiveQuery(
    () => db.cooperativeLoanPayments.orderBy('payment_date').toArray(),
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

  const activeMembers = useMemo(
    () => members.filter((member) => member.status === 'ACTIVE'),
    [members],
  );

  const filteredTransactions = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return transactions.filter((transaction) => {
      const matchesSearch = !query || [
        transaction.member_number,
        transaction.member_name,
        transaction.cash_account_name,
        transaction.notes,
        transaction.reversal_reason,
      ].some((value) => value?.toLowerCase().includes(query));
      const matchesSavingType = savingTypeFilter === 'ALL' || transaction.saving_type === savingTypeFilter;
      const matchesTransactionType = transactionTypeFilter === 'ALL' || transaction.transaction_type === transactionTypeFilter;
      const matchesStatus = statusFilter === 'ALL' || transaction.status === statusFilter;

      return matchesSearch && matchesSavingType && matchesTransactionType && matchesStatus;
    });
  }, [savingTypeFilter, searchText, statusFilter, transactionTypeFilter, transactions]);

  const filteredBalances = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return balances.filter((balance) => {
      const matchesSearch = !query || [
        balance.member_number,
        balance.member_name,
      ].some((value) => value.toLowerCase().includes(query));
      const matchesSavingType = savingTypeFilter === 'ALL' || balance.saving_type === savingTypeFilter;

      return matchesSearch && matchesSavingType;
    });
  }, [balances, savingTypeFilter, searchText]);

  const pendingReturnByBalanceKey = useMemo(() => (
    buildPendingMandatorySavingReturns(loans, loanPayments, transactions)
  ), [loanPayments, loans, transactions]);
  const openingBalanceSuggestionByMemberId = useMemo(() => {
    const suggestions = buildCooperativeSavingOpeningBalanceSuggestions(
      loans,
      balances,
      transactions,
    );
    return new Map(suggestions.map((suggestion) => [suggestion.member_id, suggestion]));
  }, [balances, loans, transactions]);
  const interestByBalanceKey = useMemo(() => {
    const result = new Map<string, number>();

    balances.forEach((balance) => {
      result.set(
        balance.id,
        calculateCooperativeSavingInterest(
          transactions,
          balance.member_id,
          balance.saving_type,
        ).availableInterest,
      );
    });

    return result;
  }, [balances, transactions]);

  const invalidate = () => {
    COOPERATIVE_SAVING_RELATED_QUERY_KEYS.forEach((queryKey) => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    });
  };

  const recordMutation = useMutation({
    mutationFn: recordCooperativeSaving,
    onSuccess: invalidate,
  });
  const recordOpeningBalanceMutation = useMutation({
    mutationFn: recordCooperativeSavingOpeningBalance,
    onSuccess: invalidate,
  });
  const reverseMutation = useMutation({
    mutationFn: reverseCooperativeSaving,
    onSuccess: invalidate,
  });

  return {
    members,
    activeMembers,
    transactions,
    filteredTransactions,
    balances,
    filteredBalances,
    pendingReturnByBalanceKey,
    openingBalanceSuggestionByMemberId,
    interestByBalanceKey,
    paymentAccounts: paymentAccounts as ChartOfAccount[],
    fieldCashEmployees: fieldCashEmployees as Employee[],
    fieldCashAccountIds,
    fieldCashBalances,
    selectedTransaction,
    setSelectedTransaction,
    searchText,
    setSearchText,
    savingTypeFilter,
    setSavingTypeFilter,
    transactionTypeFilter,
    setTransactionTypeFilter,
    statusFilter,
    setStatusFilter,
    recordSaving: (input: RecordCooperativeSavingInput) => recordMutation.mutateAsync(input),
    recordOpeningBalance: (input: RecordCooperativeSavingOpeningBalanceInput) => (
      recordOpeningBalanceMutation.mutateAsync(input)
    ),
    reverseSaving: (input: ReverseCooperativeSavingInput) => reverseMutation.mutateAsync(input),
    isMutating: recordMutation.isPending || recordOpeningBalanceMutation.isPending || reverseMutation.isPending,
  };
};

export type CooperativeSavingMemberOption = Pick<CooperativeMember, 'id' | 'member_number' | 'name'>;
export type CooperativeSavingBalanceRow = CooperativeMemberSavingBalance;
export type { CooperativeSavingOpeningBalanceSuggestion };
