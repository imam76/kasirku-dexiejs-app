import { FINANCE_CATEGORIES } from '@/constants/finance';
import {
  getCurrentServerSessionToken,
  getCurrentSessionUser,
  hasUserPermission,
  requireUserPermission,
  writeActivityLog,
} from '@/auth/authService';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import {
  cooperativeLoanApplicationSchema,
  cooperativeLoanApprovalSchema,
  cooperativeLoanDisbursementSchema,
  cooperativeLoanInstallmentCollectionSchema,
  cooperativeLoanPaymentReversalSchema,
  cooperativeLoanPaymentSchema,
  cooperativeLoanRejectionSchema,
} from '@/lib/validations/cooperativeLoan';
import {
  getCashOrBankAccountForPayment,
  isGeneralLedgerPostingEnabled,
  postCooperativeLoanDisbursementJournal,
  postCooperativeIptwJournal,
  postCooperativeLoanPaymentJournal,
  postCooperativeSavingTransactionJournal,
  reverseCooperativeIptwJournal,
  reverseCooperativeLoanPaymentJournal,
  reverseCooperativeSavingTransactionJournal,
} from '@/services/generalLedgerService';
import {
  recordCashBankTransferInCurrentTransaction,
  type RecordCashBankTransferResult,
} from '@/services/cashBankTransferService';
import { enqueueFinanceTransactionsSync, withPendingFinanceTransactionSync } from '@/services/financeTransactionSyncService';
import {
  mergeRemoteFinanceTransactionsIntoDexie,
  refreshFinanceTransactionsFromPostgres,
} from '@/services/financeTransactionReadService';
import {
  mergeRemoteJournalEntryBundlesIntoDexie,
  refreshJournalEntriesFromPostgres,
} from '@/services/journalEntryReadService';
import {
  mergeRemoteCooperativeLoanInstallmentsIntoDexie,
  mergeRemoteCooperativeLoanPaymentsIntoDexie,
  mergeRemoteCooperativeLoansIntoDexie,
  refreshCooperativeDataFromPostgres,
} from '@/services/cooperativeReadService';
import {
  mapRemoteCooperativeCollectionEventToLocal,
} from '@/services/cooperativeCollectionEventService';
import {
  cooperativeCollectionEventPostgresAdapter,
  cooperativePostingPostgresAdapter,
  postgresAdapter,
} from '@/services/postgresAdapter';
import {
  assertSufficientCashAccountBalance,
  buildFieldCashFinanceTransactionFields,
  getCashAccountBalance,
  getFieldCashContextForCashAccount,
  type CooperativeFieldCashContext,
} from '@/services/cooperativeFieldCashService';
import {
  enqueueCooperativeMemberSavingBalancesSync,
  enqueueCooperativeLoanCollectionEventsSync,
  enqueueCooperativeLoanInstallmentsSync,
  enqueueCooperativeLoanPaymentsSync,
  enqueueCooperativeLoansSync,
  enqueueCooperativeSavingTransactionsSync,
  withPendingCooperativeSync,
} from '@/services/cooperativeSyncService';
import type {
  CooperativeLoan,
  CooperativeLoanBillingFrequency,
  CooperativeLoanDeductionMethod,
  CooperativeLoanInstallment,
  CooperativeLoanInstallmentCollectionStatus,
  CooperativeLoanCollectionEvent,
  CooperativeLoanInterestCalculationType,
  CooperativeLoanPayment,
  CooperativePaymentApprovalRequest,
  CooperativeMember,
  CooperativeMemberSavingBalance,
  CooperativeSavingTransaction,
  EmployeeCollectionSchedule,
  FinanceTransaction,
  PaymentMethod,
} from '@/types';
import { getFinanceAccountSnapshotForCategory } from '@/utils/chartOfAccounts/getFinanceAccountSnapshotForCategory';
import {
  allocateLoanPaymentAcrossInstallments,
  getInstallmentRemainingAmounts,
} from '@/utils/koperasi/loanPaymentAllocation';
import {
  buildFlexibleLoanInstallmentAmounts,
  buildFlatLoanInstallmentAmounts,
  calculateFlatLoanSummary,
  calculateTotalPercentLoanSummary,
  roundCurrency,
} from '@/utils/koperasi/loanSchedule';
import {
  calculateCooperativeIptwAmount,
  isCooperativeLoanEligibleForIptw,
} from '@/utils/koperasi/iptw';
import {
  findCollectionScheduleByWeekday,
  getCollectionWeekdayLabel,
  getFirstScheduledDueDate,
  getIsoWeekday,
  getScheduledInstallmentDate,
  resolveCollectionScheduleForDisbursement,
} from '@/utils/koperasi/collectionSchedule';

export interface CreateCooperativeLoanApplicationInput {
  member_id: string;
  principal_amount: number;
  interest_calculation_type?: CooperativeLoanInterestCalculationType;
  interest_rate_per_month?: number;
  tenor_months?: number;
  billing_frequency?: CooperativeLoanBillingFrequency;
  installment_count?: number;
  loan_service_rate?: number;
  admin_fee_rate?: number;
  mandatory_saving_rate?: number;
  deduction_method?: CooperativeLoanDeductionMethod;
  application_date?: string;
  notes?: string;
}

export interface ApproveCooperativeLoanInput {
  loan_id: string;
  approval_date?: string;
  notes?: string;
}

export interface RejectCooperativeLoanInput {
  loan_id: string;
  reason: string;
}

export interface DisburseCooperativeLoanInput {
  loan_id: string;
  disbursement_date?: string;
  first_due_date?: string;
  historical_entry?: boolean;
  migration_entry?: boolean;
  settled_through_installment_number?: number;
  migration_outstanding_principal_amount?: number;
  migration_outstanding_interest_amount?: number;
  payment_method?: PaymentMethod;
  cash_account_id?: string;
  payment_channel?: string;
  notes?: string;
}

export interface DisburseCooperativeLoanViaFieldCashInput extends DisburseCooperativeLoanInput {
  finance_cash_account_id?: string;
  field_cash_account_id?: string;
  dropping_amount?: number;
}

export interface DisburseCooperativeLoanResult {
  loan: CooperativeLoan;
  installments: CooperativeLoanInstallment[];
}

export interface DisburseCooperativeLoanViaFieldCashResult extends DisburseCooperativeLoanResult {
  droppingTransfer?: RecordCashBankTransferResult;
}

export interface RecordCooperativeLoanPaymentInput {
  idempotency_key?: string;
  installment_id: string;
  amount: number;
  payment_date?: string;
  payment_method?: PaymentMethod;
  cash_account_id?: string;
  payment_channel?: string;
  collector_id?: string;
  notes?: string;
}

export interface RecordCooperativeLoanInstallmentCollectionInput {
  event_id?: string;
  installment_id: string;
  collection_status: Exclude<CooperativeLoanInstallmentCollectionStatus, 'NONE'>;
  follow_up_date?: string;
  collection_notes: string;
}

export interface ReverseCooperativeLoanPaymentInput {
  payment_id: string;
  reason: string;
}

export interface RecordCooperativeLoanPaymentResult {
  status: 'POSTED';
  payment: CooperativeLoanPayment;
  payments: CooperativeLoanPayment[];
  installment: CooperativeLoanInstallment;
  installments: CooperativeLoanInstallment[];
  loan: CooperativeLoan;
  payment_group_id?: string;
  payment_group_number?: string;
}

export interface PendingCooperativeLoanPaymentApprovalResult {
  status: 'PENDING_APPROVAL';
  approval_request: CooperativePaymentApprovalRequest;
}

export type RecordCooperativeLoanPaymentOutcome =
  | RecordCooperativeLoanPaymentResult
  | PendingCooperativeLoanPaymentApprovalResult;

export interface RecordCooperativeLoanInstallmentCollectionResult {
  event: CooperativeLoanCollectionEvent;
  installment: CooperativeLoanInstallment;
}

const mapRemotePaymentApprovalRequest = (
  request: Awaited<ReturnType<typeof cooperativePostingPostgresAdapter.listApprovalRequests>>[number],
): CooperativePaymentApprovalRequest => ({
  id: request.id,
  action_type: request.action_type,
  status: request.status,
  payment_id: request.payment_id ?? undefined,
  installment_id: request.installment_id ?? undefined,
  idempotency_key: request.idempotency_key ?? undefined,
  amount: request.amount ?? undefined,
  payment_date: request.payment_date ?? undefined,
  payment_method: request.payment_method ?? undefined,
  cash_account_id: request.cash_account_id ?? undefined,
  payment_channel: request.payment_channel ?? undefined,
  collector_id: request.collector_id ?? undefined,
  maker_reason: request.maker_reason,
  maker_user_id: request.maker_user_id,
  maker_user_name: request.maker_user_name,
  requested_at: request.requested_at,
  checker_user_id: request.checker_user_id ?? undefined,
  checker_user_name: request.checker_user_name ?? undefined,
  checker_notes: request.checker_notes ?? undefined,
  decided_at: request.decided_at ?? undefined,
  result_payment_id: request.result_payment_id ?? undefined,
  created_at: request.created_at,
  updated_at: request.updated_at,
});

const cooperativeLoanTables = [
  db.cooperativeMembers,
  db.cooperativeSavingTransactions,
  db.cooperativeMemberSavingBalances,
  db.cooperativeLoans,
  db.cooperativeLoanInstallments,
  db.cooperativeLoanPayments,
  db.cooperativeLoanCollectionEvents,
  db.cooperativeFieldCashSessions,
  db.employees,
  db.employeeAreas,
  db.employeeCollectionSchedules,
  db.financeTransactions,
  db.financeBalance,
  db.chartOfAccounts,
  db.financeAccountMappings,
  db.enabledModules,
  db.generalLedgerSetting,
  db.journalEntries,
  db.journalEntryLines,
  db.activityLogs,
];

const assertActiveMember = (member: CooperativeMember | undefined) => {
  if (!member) {
    throw new Error('Anggota koperasi tidak ditemukan.');
  }
  if (member.status !== 'ACTIVE') {
    throw new Error('Hanya anggota aktif yang boleh mengajukan pinjaman.');
  }

  return member;
};

const createCooperativeLoanNumber = async (date: string | Date = new Date()) => {
  const prefix = 'KSP-PJ';
  const datePart = dayjs(date).tz().format('YYYYMMDD');
  const numberPrefix = `${prefix}-${datePart}-`;
  const existingNumbers = await db.cooperativeLoans
    .where('loan_number')
    .startsWith(numberPrefix)
    .toArray();
  const nextSequence = existingNumbers.reduce((highestSequence, loan) => {
    const sequence = Number(loan.loan_number.slice(numberPrefix.length));
    return Number.isInteger(sequence) ? Math.max(highestSequence, sequence) : highestSequence;
  }, 0) + 1;

  return `${numberPrefix}${String(nextSequence).padStart(4, '0')}`;
};

const createCooperativeLoanPaymentNumber = async (date = new Date(), sequenceOffset = 0) => {
  const prefix = 'KSP-ANG';
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, '');
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const count = await db.cooperativeLoanPayments
    .where('created_at')
    .between(dayStart.toISOString(), dayEnd.toISOString(), true, true)
    .and((payment) => payment.payment_number.startsWith(`${prefix}-${datePart}`))
    .count();

  return `${prefix}-${datePart}-${String(count + 1 + sequenceOffset).padStart(4, '0')}`;
};

const createCooperativeLoanPaymentGroupNumber = (date: Date, paymentGroupId: string) => {
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, '');
  return `KSP-ANG-GRP-${datePart}-${paymentGroupId.slice(0, 8).toUpperCase()}`;
};

const getMandatorySavingBalanceId = (memberId: string) => `${memberId}:WAJIB`;
const AUTO_MANDATORY_SAVING_RETURN_TOKEN_PREFIX = 'AUTO_MANDATORY_SAVING_RETURN_PAYMENT';

const getAutoMandatorySavingReturnToken = (paymentId: string) => (
  `[${AUTO_MANDATORY_SAVING_RETURN_TOKEN_PREFIX}:${paymentId}]`
);

const resolveLoanCalculationType = (
  loan: Pick<CooperativeLoan, 'interest_calculation_type'>,
): CooperativeLoanInterestCalculationType => loan.interest_calculation_type ?? 'MONTHLY_RATE';

const resolveLoanBillingFrequency = (
  loan: Pick<CooperativeLoan, 'billing_frequency'>,
): CooperativeLoanBillingFrequency => loan.billing_frequency ?? 'MONTHLY';

const resolveLoanInstallmentCount = (
  loan: Pick<CooperativeLoan, 'installment_count' | 'tenor_months'>,
) => Math.max(1, Math.trunc(Number(loan.installment_count ?? loan.tenor_months)));

const resolveLoanDeductionMethod = (
  loan: Pick<CooperativeLoan, 'deduction_method'>,
): CooperativeLoanDeductionMethod => loan.deduction_method ?? 'NONE';

const resolveNetDisbursementAmount = (
  loan: Pick<CooperativeLoan, 'principal_amount' | 'admin_fee_amount' | 'mandatory_saving_amount' | 'net_disbursement_amount' | 'deduction_method'>,
) => {
  if (resolveLoanDeductionMethod(loan) !== 'DEDUCT_ON_DISBURSEMENT') {
    return roundCurrency(loan.principal_amount);
  }

  return roundCurrency(
    loan.net_disbursement_amount ??
    loan.principal_amount - Number(loan.admin_fee_amount || 0) - Number(loan.mandatory_saving_amount || 0),
  );
};

const addBillingInterval = (
  date: dayjs.Dayjs,
  frequency: CooperativeLoanBillingFrequency,
  intervalIndex: number,
) => {
  if (frequency === 'WEEKLY') return date.add(intervalIndex, 'week');
  if (frequency === 'BIWEEKLY') return date.add(intervalIndex * 2, 'week');
  return date.add(intervalIndex, 'month');
};

const updateFinanceBalanceForDisbursement = async (amount: number, now: string) => {
  const currentFinanceBalance = await db.financeBalance.get('current');
  const nextFinanceBalance = roundCurrency(Number(currentFinanceBalance?.amount || 0) - amount);

  await db.financeBalance.put({
    id: 'current',
    amount: nextFinanceBalance,
    updated_at: now,
  });
};

const updateFinanceBalanceForPayment = async (
  amount: number,
  now: string,
  isReversal = false,
) => {
  const currentFinanceBalance = await db.financeBalance.get('current');
  const nextFinanceBalance = roundCurrency(
    Number(currentFinanceBalance?.amount || 0) + (isReversal ? -amount : amount),
  );

  await db.financeBalance.put({
    id: 'current',
    amount: nextFinanceBalance,
    updated_at: now,
  });
};

const updateFinanceBalanceForSavingWithdrawal = async (
  amount: number,
  now: string,
  isReversal = false,
) => {
  const currentFinanceBalance = await db.financeBalance.get('current');
  const nextFinanceBalance = roundCurrency(
    Number(currentFinanceBalance?.amount || 0) + (isReversal ? amount : -amount),
  );

  await db.financeBalance.put({
    id: 'current',
    amount: nextFinanceBalance,
    updated_at: now,
  });
};

const updateMandatorySavingBalance = async ({
  memberId,
  memberNumber,
  memberName,
  amountDelta,
  now,
}: {
  memberId: string;
  memberNumber: string;
  memberName: string;
  amountDelta: number;
  now: string;
}) => {
  const balanceId = getMandatorySavingBalanceId(memberId);
  const existingBalance = await db.cooperativeMemberSavingBalances.get(balanceId);
  const nextBalance = roundCurrency(Number(existingBalance?.balance || 0) + amountDelta);
  if (nextBalance < -0.01) {
    throw new Error('Saldo simpanan wajib anggota tidak cukup untuk pengembalian pelunasan pinjaman.');
  }

  const balance: CooperativeMemberSavingBalance = withPendingCooperativeSync({
    id: balanceId,
    member_id: memberId,
    member_number: memberNumber,
    member_name: memberName,
    saving_type: 'WAJIB',
    balance: Math.max(0, nextBalance),
    updated_at: now,
  });

  await db.cooperativeMemberSavingBalances.put(balance);
  return balance;
};

const findAutoMandatorySavingReturnTransaction = async (
  payment: Pick<CooperativeLoanPayment, 'id' | 'member_id'>,
) => {
  const token = getAutoMandatorySavingReturnToken(payment.id);

  return db.cooperativeSavingTransactions
    .where('member_id')
    .equals(payment.member_id)
    .filter((transaction) => (
      transaction.saving_type === 'WAJIB' &&
      transaction.transaction_type === 'WITHDRAWAL' &&
      Boolean(transaction.notes?.includes(token))
    ))
    .first();
};

const recordMandatorySavingReturnOnPaidOff = async ({
  loan,
  payment,
  amount,
  now,
  fieldCashContext,
  currentUser,
}: {
  loan: CooperativeLoan;
  payment: CooperativeLoanPayment;
  amount: number;
  now: string;
  fieldCashContext?: CooperativeFieldCashContext;
  currentUser?: { id: string; name: string } | null;
}): Promise<{
  transaction?: CooperativeSavingTransaction;
  balance?: CooperativeMemberSavingBalance;
  financeTransaction?: FinanceTransaction;
}> => {
  const mandatorySavingAmount = roundCurrency(amount);
  if (mandatorySavingAmount <= 0) return {};
  if (await findAutoMandatorySavingReturnTransaction(payment)) return {};
  if (!payment.cash_account_id) return {};

  const token = getAutoMandatorySavingReturnToken(payment.id);
  const savingTransactionId = crypto.randomUUID();
  const financeTransactionId = crypto.randomUUID();
  const accountSnapshot = await getFinanceAccountSnapshotForCategory(FINANCE_CATEGORIES.KSP_SAVING_WITHDRAWAL);
  const description = `Pengembalian simpanan wajib pelunasan pinjaman ${loan.loan_number} ${loan.member_number} - ${loan.member_name}`;
  const savingTransaction: CooperativeSavingTransaction = withPendingCooperativeSync({
    id: savingTransactionId,
    member_id: loan.member_id,
    member_number: loan.member_number,
    member_name: loan.member_name,
    saving_type: 'WAJIB',
    transaction_type: 'WITHDRAWAL',
    amount: mandatorySavingAmount,
    transaction_date: payment.payment_date,
    status: 'POSTED',
    cash_account_id: payment.cash_account_id,
    cash_account_code: payment.cash_account_code,
    cash_account_name: payment.cash_account_name,
    payment_method: payment.payment_method,
    payment_channel: payment.payment_channel,
    finance_transaction_id: financeTransactionId,
    notes: `${description}. ${token}`,
    created_at: now,
    updated_at: now,
    created_by: currentUser?.id,
    created_by_name: currentUser?.name,
    updated_by: currentUser?.id,
    updated_by_name: currentUser?.name,
  });
  const financeTransaction = withPendingFinanceTransactionSync({
    id: financeTransactionId,
    type: 'EXPENSE',
    category: FINANCE_CATEGORIES.KSP_SAVING_WITHDRAWAL,
    amount: mandatorySavingAmount,
    description,
    created_at: payment.payment_date,
    reference_id: savingTransaction.id,
    payment_method: payment.payment_method,
    payment_channel: payment.payment_channel,
    cash_account_id: payment.cash_account_id,
    cash_account_code: payment.cash_account_code,
    cash_account_name: payment.cash_account_name,
    ...accountSnapshot,
    ...(fieldCashContext
      ? buildFieldCashFinanceTransactionFields(fieldCashContext, 'SAVING_WITHDRAWAL')
      : {}),
  }, currentUser, now);

  await updateFinanceBalanceForSavingWithdrawal(mandatorySavingAmount, now);
  const balance = await updateMandatorySavingBalance({
    memberId: loan.member_id,
    memberNumber: loan.member_number,
    memberName: loan.member_name,
    amountDelta: -mandatorySavingAmount,
    now,
  });
  await db.financeTransactions.add(financeTransaction);
  await db.cooperativeSavingTransactions.add(savingTransaction);

  const journalEntry = await postCooperativeSavingTransactionJournal(savingTransaction, currentUser);
  if (!journalEntry) {
    return { transaction: savingTransaction, balance, financeTransaction };
  }

  const transactionWithJournal: CooperativeSavingTransaction = {
    ...savingTransaction,
    journal_entry_id: journalEntry.id,
    updated_at: now,
    sync_status: 'pending',
    sync_error: undefined,
  };
  await db.cooperativeSavingTransactions.update(savingTransaction.id, {
    journal_entry_id: journalEntry.id,
    updated_at: now,
    sync_status: 'pending',
    sync_error: undefined,
  });

  return { transaction: transactionWithJournal, balance, financeTransaction };
};

const reverseAutoMandatorySavingReturn = async ({
  payment,
  reason,
  now,
  currentUser,
}: {
  payment: CooperativeLoanPayment;
  reason: string;
  now: string;
  currentUser?: { id: string; name: string } | null;
}): Promise<{
  reversalTransaction?: CooperativeSavingTransaction;
  updatedOriginalTransaction?: CooperativeSavingTransaction;
  balance?: CooperativeMemberSavingBalance;
  financeTransaction?: FinanceTransaction;
}> => {
  const originalTransaction = await findAutoMandatorySavingReturnTransaction(payment);
  if (!originalTransaction || originalTransaction.status !== 'POSTED') return {};

  const amount = roundCurrency(Number(originalTransaction.amount || 0));
  if (amount <= 0) return {};

  const reversalTransactionId = crypto.randomUUID();
  const reversalFinanceTransactionId = crypto.randomUUID();
  const accountSnapshot = await getFinanceAccountSnapshotForCategory(FINANCE_CATEGORIES.KSP_SAVING_WITHDRAWAL);
  const financeTransaction = withPendingFinanceTransactionSync({
    id: reversalFinanceTransactionId,
    type: 'INCOME',
    category: FINANCE_CATEGORIES.KSP_SAVING_WITHDRAWAL,
    amount,
    description: `Reversal pengembalian simpanan wajib ${payment.payment_number}. ${reason}`,
    created_at: now,
    reference_id: reversalTransactionId,
    payment_method: originalTransaction.payment_method,
    payment_channel: originalTransaction.payment_channel,
    cash_account_id: originalTransaction.cash_account_id,
    cash_account_code: originalTransaction.cash_account_code,
    cash_account_name: originalTransaction.cash_account_name,
    ...accountSnapshot,
  }, currentUser, now);
  const reversalTransaction: CooperativeSavingTransaction = withPendingCooperativeSync({
    id: reversalTransactionId,
    member_id: originalTransaction.member_id,
    member_number: originalTransaction.member_number,
    member_name: originalTransaction.member_name,
    saving_type: originalTransaction.saving_type,
    transaction_type: 'REVERSAL',
    amount,
    transaction_date: now,
    status: 'POSTED',
    cash_account_id: originalTransaction.cash_account_id,
    cash_account_code: originalTransaction.cash_account_code,
    cash_account_name: originalTransaction.cash_account_name,
    payment_method: originalTransaction.payment_method,
    payment_channel: originalTransaction.payment_channel,
    finance_transaction_id: reversalFinanceTransactionId,
    reversal_of_transaction_id: originalTransaction.id,
    notes: reason,
    created_at: now,
    updated_at: now,
    created_by: currentUser?.id,
    created_by_name: currentUser?.name,
    updated_by: currentUser?.id,
    updated_by_name: currentUser?.name,
  });

  await updateFinanceBalanceForSavingWithdrawal(amount, now, true);
  const balance = await updateMandatorySavingBalance({
    memberId: originalTransaction.member_id,
    memberNumber: originalTransaction.member_number,
    memberName: originalTransaction.member_name,
    amountDelta: amount,
    now,
  });
  await db.financeTransactions.add(financeTransaction);
  await db.cooperativeSavingTransactions.add(reversalTransaction);

  const reversalEntries = originalTransaction.journal_entry_id
    ? await reverseCooperativeSavingTransactionJournal(
        originalTransaction,
        `Reversal pengembalian simpanan wajib ${payment.payment_number}: ${reason}`,
        currentUser,
        now,
      )
    : [];
  const reversalJournalEntryId = reversalEntries[0]?.id;
  const updatedOriginalTransaction: CooperativeSavingTransaction = withPendingCooperativeSync({
    ...originalTransaction,
    status: 'REVERSED' as const,
    reversal_transaction_id: reversalTransaction.id,
    reversal_finance_transaction_id: reversalFinanceTransactionId,
    reversal_journal_entry_id: reversalJournalEntryId,
    reversed_at: now,
    reversal_reason: reason,
    updated_at: now,
    updated_by: currentUser?.id,
    updated_by_name: currentUser?.name,
  });
  await db.cooperativeSavingTransactions.put(updatedOriginalTransaction);

  if (!reversalJournalEntryId) {
    return {
      reversalTransaction,
      updatedOriginalTransaction,
      balance,
      financeTransaction,
    };
  }

  const reversalTransactionWithJournal: CooperativeSavingTransaction = {
    ...reversalTransaction,
    journal_entry_id: reversalJournalEntryId,
    updated_at: now,
    sync_status: 'pending',
    sync_error: undefined,
  };
  await db.cooperativeSavingTransactions.update(reversalTransaction.id, {
    journal_entry_id: reversalJournalEntryId,
    updated_at: now,
    sync_status: 'pending',
    sync_error: undefined,
  });

  return {
    reversalTransaction: reversalTransactionWithJournal,
    updatedOriginalTransaction,
    balance,
    financeTransaction,
  };
};

const findIptwPayoutTransaction = async (
  payment: Pick<CooperativeLoanPayment, 'id'>,
) => db.financeTransactions
  .where('reference_id')
  .equals(payment.id)
  .filter((transaction) => (
    transaction.category === FINANCE_CATEGORIES.KSP_IPTW &&
    transaction.type === 'EXPENSE' &&
    !transaction.deleted_at
  ))
  .first();

const getIptwExpenseAccountSnapshot = async () => {
  const mappedSnapshot = await getFinanceAccountSnapshotForCategory(FINANCE_CATEGORIES.KSP_IPTW);
  if (mappedSnapshot) return mappedSnapshot;

  const accounts = await db.chartOfAccounts.toArray();
  const account = accounts.find((item) => (
    item.is_active &&
    item.is_postable &&
    item.type === 'EXPENSE' &&
    (
      item.id === 'cooperative-iptw-expense' ||
      item.id === 'template-cooperative-iptw-expense' ||
      item.code === '6090'
    )
  )) ?? accounts.find((item) => (
    item.is_active &&
    item.is_postable &&
    item.type === 'EXPENSE' &&
    (item.id === 'other-expense' || item.id === 'template-other-expense' || item.code === '6900')
  ));

  return account
    ? {
        account_id: account.id,
        account_code: account.code,
        account_name: account.name,
        account_type: account.type,
      }
    : undefined;
};

const recordIptwPayoutOnPaidOff = async ({
  loan,
  payment,
  amount,
  now,
  fieldCashContext,
  currentUser,
}: {
  loan: CooperativeLoan;
  payment: CooperativeLoanPayment;
  amount: number;
  now: string;
  fieldCashContext?: CooperativeFieldCashContext;
  currentUser?: { id: string; name: string } | null;
}): Promise<FinanceTransaction | undefined> => {
  const iptwAmount = roundCurrency(amount);
  if (iptwAmount <= 0 || !payment.cash_account_id) return undefined;
  if (await findIptwPayoutTransaction(payment)) return undefined;

  const financeTransactionId = crypto.randomUUID();
  const description = `IPTW 5% pelunasan tepat waktu ${loan.loan_number} ${loan.member_number} - ${loan.member_name}`;
  const financeTransaction = withPendingFinanceTransactionSync({
    id: financeTransactionId,
    type: 'EXPENSE',
    category: FINANCE_CATEGORIES.KSP_IPTW,
    amount: iptwAmount,
    description,
    created_at: payment.payment_date,
    reference_id: payment.id,
    payment_method: payment.payment_method,
    payment_channel: payment.payment_channel,
    cash_account_id: payment.cash_account_id,
    cash_account_code: payment.cash_account_code,
    cash_account_name: payment.cash_account_name,
    ...await getIptwExpenseAccountSnapshot(),
    ...(fieldCashContext
      ? buildFieldCashFinanceTransactionFields(fieldCashContext, 'IPTW_PAYOUT')
      : {}),
  }, currentUser, now);

  await updateFinanceBalanceForSavingWithdrawal(iptwAmount, now);
  await db.financeTransactions.add(financeTransaction);
  await postCooperativeIptwJournal(financeTransaction, payment, currentUser);

  return financeTransaction;
};

const reverseAutoIptwPayout = async ({
  payment,
  reason,
  now,
  currentUser,
}: {
  payment: CooperativeLoanPayment;
  reason: string;
  now: string;
  currentUser?: { id: string; name: string } | null;
}): Promise<FinanceTransaction | undefined> => {
  const originalTransaction = await findIptwPayoutTransaction(payment);
  if (!originalTransaction) return undefined;

  const existingReversal = await db.financeTransactions
    .where('reference_id')
    .equals(originalTransaction.id)
    .filter((transaction) => (
      transaction.category === FINANCE_CATEGORIES.KSP_IPTW &&
      transaction.type === 'INCOME' &&
      !transaction.deleted_at
    ))
    .first();
  if (existingReversal) return undefined;

  const financeTransaction = withPendingFinanceTransactionSync({
    id: crypto.randomUUID(),
    type: 'INCOME',
    category: FINANCE_CATEGORIES.KSP_IPTW,
    amount: originalTransaction.amount,
    description: `Reversal IPTW pembayaran ${payment.payment_number}. ${reason}`,
    created_at: now,
    reference_id: originalTransaction.id,
    payment_method: originalTransaction.payment_method,
    payment_channel: originalTransaction.payment_channel,
    cash_account_id: originalTransaction.cash_account_id,
    cash_account_code: originalTransaction.cash_account_code,
    cash_account_name: originalTransaction.cash_account_name,
    account_id: originalTransaction.account_id,
    account_code: originalTransaction.account_code,
    account_name: originalTransaction.account_name,
    account_type: originalTransaction.account_type,
    field_cash_session_id: originalTransaction.field_cash_session_id,
    field_cash_session_number: originalTransaction.field_cash_session_number,
    field_employee_id: originalTransaction.field_employee_id,
    field_employee_name: originalTransaction.field_employee_name,
    field_cash_movement_kind: originalTransaction.field_cash_movement_kind,
  }, currentUser, now);

  await updateFinanceBalanceForSavingWithdrawal(originalTransaction.amount, now, true);
  await db.financeTransactions.add(financeTransaction);
  await reverseCooperativeIptwJournal(
    originalTransaction,
    `Reversal IPTW pembayaran ${payment.payment_number}: ${reason}`,
    currentUser,
    now,
  );

  return financeTransaction;
};

export interface CooperativeLoanMigrationState {
  /** Bunga flat: angsuran 1..N ditandai lunas historis penuh. */
  settledThroughInstallmentNumber?: number;
  /** Anuitas/menurun/bayar lompat: sisa pokok dinyatakan eksplisit. */
  outstandingPrincipalAmount?: number;
  /** Opsional: sisa bunga eksplisit. Bila kosong, bunga mengikuti pokok yang lunas penuh. */
  outstandingInterestAmount?: number;
}

const MIGRATION_EPSILON = 0.01;

/**
 * Menolak input posisi migrasi yang tidak mungkin secara bisnis, memakai data loan sebagai batas:
 * settled installment <= jumlah angsuran, sisa pokok <= pokok, sisa bunga <= total bunga.
 * Service jadi sumber kebenaran sehingga caller non-UI pun ikut terjaga.
 */
const assertMigrationPositionWithinLoan = (
  loan: Pick<
    CooperativeLoan,
    'principal_amount' | 'total_interest_amount' | 'installment_count' | 'tenor_months'
  >,
  input: Pick<
    ParsedCooperativeLoanDisbursementInput,
    | 'settled_through_installment_number'
    | 'migration_outstanding_principal_amount'
    | 'migration_outstanding_interest_amount'
  >,
) => {
  const installmentCount = resolveLoanInstallmentCount(loan);
  const settledThrough = input.settled_through_installment_number;
  if (settledThrough !== undefined && settledThrough > installmentCount) {
    throw new Error(
      `Jumlah angsuran yang sudah lunas (${settledThrough}) tidak boleh melebihi jumlah angsuran (${installmentCount}).`,
    );
  }

  const outstandingPrincipal = input.migration_outstanding_principal_amount;
  if (
    outstandingPrincipal !== undefined &&
    outstandingPrincipal > roundCurrency(Number(loan.principal_amount || 0)) + MIGRATION_EPSILON
  ) {
    throw new Error('Sisa pokok migrasi tidak boleh melebihi pokok pinjaman.');
  }

  const outstandingInterest = input.migration_outstanding_interest_amount;
  if (
    outstandingInterest !== undefined &&
    outstandingInterest > roundCurrency(Number(loan.total_interest_amount || 0)) + MIGRATION_EPSILON
  ) {
    throw new Error('Sisa bunga migrasi tidak boleh melebihi total bunga pinjaman.');
  }
};

/**
 * Menandai angsuran mana yang sudah lunas historis (tanpa jurnal & tanpa CooperativeLoanPayment)
 * berdasarkan posisi migrasi. Mengembalikan kartu angsuran dengan paid_* & status terisi.
 */
const applyMigrationPaidState = (
  installments: CooperativeLoanInstallment[],
  migration: CooperativeLoanMigrationState,
  now: string,
): CooperativeLoanInstallment[] => {
  const ordered = [...installments].sort((a, b) => a.installment_number - b.installment_number);

  if (migration.outstandingPrincipalAmount !== undefined) {
    const totalPrincipal = roundCurrency(
      ordered.reduce((sum, row) => sum + Number(row.principal_amount || 0), 0),
    );
    const totalInterest = roundCurrency(
      ordered.reduce((sum, row) => sum + Number(row.interest_amount || 0), 0),
    );
    let principalToSettle = roundCurrency(Math.max(0, totalPrincipal - migration.outstandingPrincipalAmount));
    const interestGiven = migration.outstandingInterestAmount !== undefined;
    let interestToSettle = interestGiven
      ? roundCurrency(Math.max(0, totalInterest - (migration.outstandingInterestAmount ?? 0)))
      : 0;

    for (const row of ordered) {
      const principal = Number(row.principal_amount || 0);
      if (principalToSettle >= principal - MIGRATION_EPSILON) {
        row.paid_principal_amount = principal;
        principalToSettle = roundCurrency(principalToSettle - principal);
      } else if (principalToSettle > MIGRATION_EPSILON) {
        row.paid_principal_amount = roundCurrency(principalToSettle);
        principalToSettle = 0;
      } else {
        row.paid_principal_amount = 0;
      }

      const interest = Number(row.interest_amount || 0);
      if (interestGiven) {
        if (interestToSettle >= interest - MIGRATION_EPSILON) {
          row.paid_interest_amount = interest;
          interestToSettle = roundCurrency(interestToSettle - interest);
        } else if (interestToSettle > MIGRATION_EPSILON) {
          row.paid_interest_amount = roundCurrency(interestToSettle);
          interestToSettle = 0;
        } else {
          row.paid_interest_amount = 0;
        }
      } else {
        // Default: bunga dianggap lunas hanya pada angsuran yang pokoknya lunas penuh.
        row.paid_interest_amount = row.paid_principal_amount >= principal - MIGRATION_EPSILON ? interest : 0;
      }
    }
  } else if (migration.settledThroughInstallmentNumber !== undefined) {
    const settledThrough = migration.settledThroughInstallmentNumber;
    for (const row of ordered) {
      if (row.installment_number <= settledThrough) {
        row.paid_principal_amount = row.principal_amount;
        row.paid_interest_amount = row.interest_amount;
        row.paid_penalty_amount = row.penalty_amount;
      }
    }
  }

  for (const row of ordered) {
    row.status = getInstallmentNextStatus(row);
    if (row.status === 'PAID') {
      row.paid_at = now;
    }
  }

  return ordered;
};

const buildInstallments = (
  loan: CooperativeLoan,
  firstDueDate: string,
  now: string,
  migration?: CooperativeLoanMigrationState,
): CooperativeLoanInstallment[] => {
  const baseDueDate = dayjs(firstDueDate);
  const billingFrequency = resolveLoanBillingFrequency(loan);
  const amounts = resolveLoanCalculationType(loan) === 'MONTHLY_RATE'
    ? buildFlatLoanInstallmentAmounts({
        principalAmount: loan.principal_amount,
        totalInterestAmount: loan.total_interest_amount,
        tenorMonths: loan.tenor_months,
      })
    : buildFlexibleLoanInstallmentAmounts({
        principalAmount: loan.principal_amount,
        totalInterestAmount: loan.total_interest_amount,
        installmentCount: resolveLoanInstallmentCount(loan),
      });

  const rows: CooperativeLoanInstallment[] = amounts.map((amount) => withPendingCooperativeSync({
    id: crypto.randomUUID(),
    loan_id: loan.id,
    loan_number: loan.loan_number,
    member_id: loan.member_id,
    member_number: loan.member_number,
    member_name: loan.member_name,
    installment_number: amount.installment_number,
    due_date: loan.collection_weekday
      ? getScheduledInstallmentDate({
          firstDueDate: baseDueDate,
          frequency: billingFrequency,
          weekday: loan.collection_weekday,
          installmentOffset: amount.installment_number - 1,
        }).toISOString()
      : addBillingInterval(baseDueDate, billingFrequency, amount.installment_number - 1).toISOString(),
    principal_amount: amount.principal_amount,
    interest_amount: amount.interest_amount,
    penalty_amount: 0,
    paid_principal_amount: 0,
    paid_interest_amount: 0,
    paid_penalty_amount: 0,
    status: 'UNPAID',
    collection_status: 'NONE',
    created_at: now,
    updated_at: now,
  }));

  if (!migration) return rows;
  return applyMigrationPaidState(rows, migration, now);
};

const recordMandatorySavingDeduction = async ({
  loan,
  amount,
  transactionDate,
  now,
  cashAccount,
  paymentMethod,
  paymentChannel,
  currentUser,
}: {
  loan: CooperativeLoan;
  amount: number;
  transactionDate: string;
  now: string;
  cashAccount: { id: string; code: string; name: string };
  paymentMethod: PaymentMethod;
  paymentChannel?: string;
  currentUser?: { id: string; name: string } | null;
}): Promise<{
  transaction?: CooperativeSavingTransaction;
  balance?: CooperativeMemberSavingBalance;
}> => {
  const mandatorySavingAmount = roundCurrency(amount);
  if (mandatorySavingAmount <= 0) return {};

  const balanceId = getMandatorySavingBalanceId(loan.member_id);
  const existingBalance = await db.cooperativeMemberSavingBalances.get(balanceId);
  const nextBalance = roundCurrency(Number(existingBalance?.balance || 0) + mandatorySavingAmount);
  const balance: CooperativeMemberSavingBalance = withPendingCooperativeSync({
    id: balanceId,
    member_id: loan.member_id,
    member_number: loan.member_number,
    member_name: loan.member_name,
    saving_type: 'WAJIB',
    balance: nextBalance,
    updated_at: now,
  });
  const transaction: CooperativeSavingTransaction = withPendingCooperativeSync({
    id: crypto.randomUUID(),
    member_id: loan.member_id,
    member_number: loan.member_number,
    member_name: loan.member_name,
    saving_type: 'WAJIB',
    transaction_type: 'DEPOSIT',
    amount: mandatorySavingAmount,
    transaction_date: transactionDate,
    status: 'POSTED',
    cash_account_id: cashAccount.id,
    cash_account_code: cashAccount.code,
    cash_account_name: cashAccount.name,
    payment_method: paymentMethod,
    payment_channel: paymentChannel,
    notes: `Potongan simpanan wajib dari pencairan pinjaman ${loan.loan_number}.`,
    created_at: now,
    updated_at: now,
    created_by: currentUser?.id,
    created_by_name: currentUser?.name,
    updated_by: currentUser?.id,
    updated_by_name: currentUser?.name,
  });

  await db.cooperativeMemberSavingBalances.put(balance);
  await db.cooperativeSavingTransactions.add(transaction);

  return { transaction, balance };
};

const getInstallmentNextStatus = (installment: CooperativeLoanInstallment) => {
  const remaining = getInstallmentRemainingAmounts(installment);
  const paidAmount = roundCurrency(
    Number(installment.paid_penalty_amount || 0) +
    Number(installment.paid_interest_amount || 0) +
    Number(installment.paid_principal_amount || 0),
  );

  if (remaining.total_amount <= 0.01) return 'PAID' as const;
  if (paidAmount > 0) return 'PARTIAL' as const;
  return 'UNPAID' as const;
};

const assertOutstandingNotNegative = (loan: CooperativeLoan) => {
  if (
    loan.outstanding_principal_amount < -0.01 ||
    loan.outstanding_interest_amount < -0.01 ||
    loan.outstanding_penalty_amount < -0.01
  ) {
    throw new Error('Outstanding pinjaman tidak boleh negatif.');
  }
};

const getLoanNextStatus = (
  loan: CooperativeLoan,
  installments: CooperativeLoanInstallment[],
) => {
  const isOutstandingSettled = (
    loan.outstanding_principal_amount <= 0.01 &&
    loan.outstanding_interest_amount <= 0.01 &&
    loan.outstanding_penalty_amount <= 0.01
  );
  const areInstallmentsPaid = installments.length > 0 && installments.every((installment) => installment.status === 'PAID');

  return isOutstandingSettled && areInstallmentsPaid ? 'PAID_OFF' as const : 'DISBURSED' as const;
};

/**
 * Membentuk record pinjaman berstatus SUBMITTED di dalam transaksi Dexie yang sedang berjalan.
 * Dipakai bersama oleh pengajuan biasa (`createCooperativeLoanApplication`) dan alur migrasi
 * atomic (`migrateCooperativeLoan`) agar logika perhitungan & pembentukan loan tidak terduplikasi.
 * Pemanggil bertanggung jawab menambahkan loan ke db, menulis activity log, dan enqueue sync.
 */
const buildCooperativeLoanApplicationRecord = async ({
  input,
  now,
  currentUser,
}: {
  input: CreateCooperativeLoanApplicationInput;
  now: string;
  currentUser: Awaited<ReturnType<typeof getCurrentSessionUser>>;
}): Promise<CooperativeLoan> => {
  const parsedInput = cooperativeLoanApplicationSchema.parse(input);
  const calculationType = parsedInput.interest_calculation_type;
  const flatSummary = calculationType === 'MONTHLY_RATE'
    ? calculateFlatLoanSummary({
        principalAmount: parsedInput.principal_amount,
        interestRatePerMonth: Number(parsedInput.interest_rate_per_month || 0),
        tenorMonths: Number(parsedInput.tenor_months || 1),
      })
    : undefined;
  const totalPercentSummary = calculationType === 'TOTAL_PERCENT'
    ? calculateTotalPercentLoanSummary({
        principalAmount: parsedInput.principal_amount,
        loanServiceRate: Number(parsedInput.loan_service_rate || 0),
        adminFeeRate: Number(parsedInput.admin_fee_rate || 0),
        mandatorySavingRate: Number(parsedInput.mandatory_saving_rate || 0),
        installmentCount: Number(parsedInput.installment_count || 1),
      })
    : undefined;
  const summary = flatSummary ?? totalPercentSummary;
  if (!summary) {
    throw new Error('Skema perhitungan pinjaman tidak valid.');
  }
  if (totalPercentSummary && totalPercentSummary.net_disbursement_amount < -0.01) {
    throw new Error('Estimasi uang diterima anggota tidak boleh negatif.');
  }
  const applicationDate = parsedInput.application_date ?? now;
  const member = assertActiveMember(await db.cooperativeMembers.get(parsedInput.member_id));

  return withPendingCooperativeSync({
    id: crypto.randomUUID(),
    loan_number: await createCooperativeLoanNumber(applicationDate),
    member_id: member.id,
    member_number: member.member_number,
    member_name: member.name,
    principal_amount: summary.principal_amount,
    interest_rate_per_month: flatSummary?.interest_rate_per_month ?? 0,
    tenor_months: flatSummary?.tenor_months ?? totalPercentSummary?.installment_count ?? 1,
    interest_calculation_type: calculationType,
    billing_frequency: calculationType === 'TOTAL_PERCENT'
      ? parsedInput.billing_frequency ?? 'MONTHLY'
      : 'MONTHLY',
    installment_count: flatSummary?.tenor_months ?? totalPercentSummary?.installment_count ?? 1,
    loan_service_rate: flatSummary?.interest_rate_per_month ?? totalPercentSummary?.loan_service_rate ?? 0,
    loan_service_amount: summary.total_interest_amount,
    admin_fee_rate: totalPercentSummary?.admin_fee_rate ?? 0,
    admin_fee_amount: totalPercentSummary?.admin_fee_amount ?? 0,
    mandatory_saving_rate: totalPercentSummary?.mandatory_saving_rate ?? 0,
    mandatory_saving_amount: totalPercentSummary?.mandatory_saving_amount ?? 0,
    deduction_method: calculationType === 'TOTAL_PERCENT'
      ? parsedInput.deduction_method ?? 'DEDUCT_ON_DISBURSEMENT'
      : 'NONE',
    net_disbursement_amount: totalPercentSummary?.net_disbursement_amount ?? summary.principal_amount,
    total_interest_amount: summary.total_interest_amount,
    total_payable_amount: summary.total_payable_amount,
    outstanding_principal_amount: summary.principal_amount,
    outstanding_interest_amount: summary.total_interest_amount,
    outstanding_penalty_amount: 0,
    status: 'SUBMITTED',
    application_date: applicationDate,
    notes: parsedInput.notes,
    created_at: now,
    updated_at: now,
    created_by: currentUser?.id,
    created_by_name: currentUser?.name,
    updated_by: currentUser?.id,
    updated_by_name: currentUser?.name,
  });
};

export const createCooperativeLoanApplication = async (
  input: CreateCooperativeLoanApplicationInput,
): Promise<CooperativeLoan> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'COOPERATIVE_PAYMENT_CREATE');

  const now = new Date().toISOString();
  let savedLoan: CooperativeLoan | undefined;

  await db.transaction('rw', cooperativeLoanTables, async () => {
    const loan = await buildCooperativeLoanApplicationRecord({ input, now, currentUser });

    await db.cooperativeLoans.add(loan);
    savedLoan = loan;

    await writeActivityLog({
      user: currentUser,
      action: 'COOPERATIVE_LOAN_SUBMITTED',
      entity: 'cooperativeLoans',
      entity_id: loan.id,
      description: `${currentUser?.name ?? 'User'} mengajukan pinjaman ${loan.loan_number} untuk ${loan.member_number} sebesar ${loan.principal_amount}.`,
    });
  });

  if (!savedLoan) {
    throw new Error('Pengajuan pinjaman gagal disimpan.');
  }

  await enqueueCooperativeLoansSync([savedLoan], 'create');

  return savedLoan;
};

export const approveCooperativeLoan = async (
  input: ApproveCooperativeLoanInput,
): Promise<CooperativeLoan> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'COOPERATIVE_LOAN_MANAGE');

  const parsedInput = cooperativeLoanApprovalSchema.parse({
    approval_date: input.approval_date,
    notes: input.notes,
  });
  const now = new Date().toISOString();
  const approvalDate = parsedInput.approval_date ?? now;
  let approvedLoan: CooperativeLoan | undefined;

  await db.transaction('rw', cooperativeLoanTables, async () => {
    const loan = await db.cooperativeLoans.get(input.loan_id);
    if (!loan) {
      throw new Error('Pinjaman koperasi tidak ditemukan.');
    }
    if (loan.status !== 'SUBMITTED') {
      throw new Error('Hanya pinjaman berstatus submitted yang bisa di-approve.');
    }

    const nextApprovedLoan: CooperativeLoan = withPendingCooperativeSync({
      ...loan,
      status: 'APPROVED' as const,
      approved_at: approvalDate,
      approved_by: currentUser?.id,
      approved_by_name: currentUser?.name,
      approval_notes: parsedInput.notes,
      updated_at: now,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
    });
    approvedLoan = nextApprovedLoan;

    await db.cooperativeLoans.put(nextApprovedLoan);

    await writeActivityLog({
      user: currentUser,
      action: 'COOPERATIVE_LOAN_APPROVED',
      entity: 'cooperativeLoans',
      entity_id: loan.id,
      description: `${currentUser?.name ?? 'User'} menyetujui pinjaman ${loan.loan_number}.`,
    });
  });

  if (!approvedLoan) {
    throw new Error('Approval pinjaman gagal disimpan.');
  }

  await enqueueCooperativeLoansSync([approvedLoan], 'update');

  return approvedLoan;
};

export const rejectCooperativeLoan = async (
  input: RejectCooperativeLoanInput,
): Promise<CooperativeLoan> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'COOPERATIVE_LOAN_MANAGE');

  const parsedInput = cooperativeLoanRejectionSchema.parse({ reason: input.reason });
  const now = new Date().toISOString();
  let rejectedLoan: CooperativeLoan | undefined;

  await db.transaction('rw', cooperativeLoanTables, async () => {
    const loan = await db.cooperativeLoans.get(input.loan_id);
    if (!loan) {
      throw new Error('Pinjaman koperasi tidak ditemukan.');
    }
    if (loan.status !== 'SUBMITTED') {
      throw new Error('Hanya pinjaman berstatus submitted yang bisa di-reject.');
    }

    const nextRejectedLoan: CooperativeLoan = withPendingCooperativeSync({
      ...loan,
      status: 'REJECTED' as const,
      rejected_at: now,
      rejected_by: currentUser?.id,
      rejected_by_name: currentUser?.name,
      rejection_reason: parsedInput.reason,
      updated_at: now,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
    });
    rejectedLoan = nextRejectedLoan;

    await db.cooperativeLoans.put(nextRejectedLoan);

    await writeActivityLog({
      user: currentUser,
      action: 'COOPERATIVE_LOAN_REJECTED',
      entity: 'cooperativeLoans',
      entity_id: loan.id,
      description: `${currentUser?.name ?? 'User'} menolak pinjaman ${loan.loan_number}. Alasan: ${parsedInput.reason}`,
    });
  });

  if (!rejectedLoan) {
    throw new Error('Reject pinjaman gagal disimpan.');
  }

  await enqueueCooperativeLoansSync([rejectedLoan], 'update');

  return rejectedLoan;
};

type ParsedCooperativeLoanDisbursementInput = ReturnType<typeof cooperativeLoanDisbursementSchema.parse>;

interface CooperativeLoanDisbursementWriteResult {
  loan: CooperativeLoan;
  installments: CooperativeLoanInstallment[];
  financeTransaction?: FinanceTransaction;
  mandatorySavingTransaction?: CooperativeSavingTransaction;
  mandatorySavingBalance?: CooperativeMemberSavingBalance;
}

const writeCooperativeLoanDisbursementInCurrentTransaction = async ({
  loanId,
  parsedInput,
  now,
  currentUser,
}: {
  loanId: string;
  parsedInput: ParsedCooperativeLoanDisbursementInput;
  now: string;
  currentUser: Awaited<ReturnType<typeof getCurrentSessionUser>>;
}): Promise<CooperativeLoanDisbursementWriteResult> => {
  const disbursementDate = parsedInput.disbursement_date ?? now;
  const paymentMethod = parsedInput.payment_method ?? 'TUNAI';
  const isMigration = parsedInput.migration_entry === true;
  // Mode migrasi memakai relaksasi jadwal historis, tetapi tanpa jurnal & tanpa kas.
  const historicalMode = Boolean(parsedInput.historical_entry) || isMigration;
  const financeTransactionId = crypto.randomUUID();
  let disbursedLoan: CooperativeLoan | undefined;
  let installments: CooperativeLoanInstallment[] = [];
  let mandatorySavingTransaction: CooperativeSavingTransaction | undefined;
  let mandatorySavingBalance: CooperativeMemberSavingBalance | undefined;

  const loan = await db.cooperativeLoans.get(loanId);
  if (!loan) {
    throw new Error('Pinjaman koperasi tidak ditemukan.');
  }
  if (loan.status !== 'APPROVED') {
    throw new Error('Pinjaman hanya bisa dicairkan setelah approved.');
  }
  // Piutang migrasi harus masuk periode saldo awal (sebelum cutoff) supaya tidak menghasilkan
  // pinjaman berpiutang tanpa jejak GL. Bila posting sudah aktif untuk tanggal ini, tolak.
  if (isMigration && await isGeneralLedgerPostingEnabled(disbursementDate)) {
    throw new Error(
      'Pinjaman migrasi harus bertanggal sebelum cutoff buku besar. Piutangnya dicatat lewat saldo awal, bukan jurnal pencairan.',
    );
  }
  // Service adalah sumber kebenaran: tolak posisi migrasi yang mustahil secara bisnis sebelum
  // mencemari kartu angsuran / outstanding. Validasi UI hanya lapis pertama.
  if (isMigration) {
    assertMigrationPositionWithinLoan(loan, parsedInput);
  }

  const existingInstallment = await db.cooperativeLoanInstallments
    .where('loan_id')
    .equals(loan.id)
    .first();
  if (existingInstallment) {
    throw new Error('Jadwal angsuran pinjaman ini sudah pernah dibuat.');
  }

  const member = await db.cooperativeMembers.get(loan.member_id);
  if (!member) {
    throw new Error('Anggota pinjaman tidak ditemukan.');
  }
  if (!member.officer_id) {
    throw new Error('Petugas/Resort anggota wajib ditentukan sebelum pencairan.');
  }
  if (!member.area_id) {
    throw new Error('Area anggota wajib ditentukan sebelum pencairan.');
  }
  const officer = await db.employees.get(member.officer_id);
  if (!officer || !officer.is_active) {
    throw new Error('Petugas/Resort anggota tidak ditemukan atau sudah nonaktif.');
  }
  const areaAssignment = await db.employeeAreas
    .where('employee_id')
    .equals(officer.id)
    .and((assignment) => assignment.area_id === member.area_id)
    .first();
  if (!areaAssignment) {
    throw new Error('Area anggota belum termasuk wilayah tugas petugas/Resort.');
  }
  const collectionSchedules = await db.employeeCollectionSchedules
    .where('[employee_id+area_id]')
    .equals([officer.id, member.area_id])
    .toArray() as EmployeeCollectionSchedule[];
  const resolvedSchedule = resolveCollectionScheduleForDisbursement({
    schedules: collectionSchedules,
    value: disbursementDate,
    allowHistoricalFallback: historicalMode,
  });
  if (!resolvedSchedule) {
    const weekday = getCollectionWeekdayLabel(
      ((dayjs(disbursementDate).tz().day() || 7)) as 1 | 2 | 3 | 4 | 5 | 6 | 7,
    );
    throw new Error(
      `Pencairan tidak dapat dilakukan pada hari ${weekday}. Pilih tanggal sesuai jadwal penagihan ${officer.name} untuk area ${member.area_name ?? member.area_code ?? member.area_id}.`,
    );
  }
  if (
    parsedInput.historical_entry &&
    !dayjs(disbursementDate).tz().isBefore(dayjs().tz(), 'day')
  ) {
    throw new Error('Mode data historis hanya dapat digunakan untuk tanggal pencairan sebelum hari ini.');
  }
  if (
    !historicalMode &&
    dayjs(disbursementDate).tz().isBefore(dayjs(loan.application_date).tz(), 'day')
  ) {
    throw new Error('Tanggal pencairan tidak boleh sebelum tanggal pengajuan.');
  }

  const cashAccount = isMigration
    ? undefined
    : await getCashOrBankAccountForPayment(paymentMethod, parsedInput.cash_account_id);
  const accountSnapshot = isMigration
    ? undefined
    : await getFinanceAccountSnapshotForCategory(FINANCE_CATEGORIES.KSP_LOAN_DISBURSEMENT);
  const disbursementAmount = isMigration ? 0 : resolveNetDisbursementAmount(loan);
  if (disbursementAmount < -0.01) {
    throw new Error('Nominal pencairan net tidak boleh negatif.');
  }
  const fieldCashContext = !isMigration && paymentMethod === 'TUNAI' && cashAccount
    ? await getFieldCashContextForCashAccount(cashAccount.id)
    : undefined;
  if (fieldCashContext && cashAccount && disbursementAmount > 0) {
    await assertSufficientCashAccountBalance(cashAccount.id, disbursementAmount);
  }
  const firstDueDate = historicalMode && parsedInput.first_due_date
    ? parsedInput.first_due_date
    : getFirstScheduledDueDate({
        disbursementDate: dayjs(disbursementDate).tz(),
        frequency: resolveLoanBillingFrequency(loan),
        weekday: resolvedSchedule.weekday,
      }).toISOString();
  if (!dayjs(firstDueDate).tz().isAfter(dayjs(disbursementDate).tz(), 'day')) {
    throw new Error('Jatuh tempo pertama harus setelah tanggal pencairan.');
  }
  const collectionWeekday = historicalMode && parsedInput.first_due_date
    ? getIsoWeekday(firstDueDate)
    : resolvedSchedule.weekday;
  const collectionSchedule = historicalMode
    ? findCollectionScheduleByWeekday(collectionSchedules, firstDueDate)
    : resolvedSchedule.schedule;
  if (!collectionSchedule) {
    throw new Error(
      `Jatuh tempo pertama harus mengikuti salah satu hari jadwal penagihan ${officer.name}.`,
    );
  }
  if (!isMigration) {
    await updateFinanceBalanceForDisbursement(Math.max(0, disbursementAmount), now);
  }

  const nextDisbursedLoan: CooperativeLoan = withPendingCooperativeSync({
    ...loan,
    status: 'DISBURSED' as const,
    disbursed_at: disbursementDate,
    officer_id: officer.id,
    officer_name: officer.name,
    officer_position: officer.position,
    area_id: member.area_id,
    area_name: member.area_name,
    area_code: member.area_code,
    collection_schedule_id: collectionSchedule?.id,
    collection_weekday: collectionWeekday,
    cash_account_id: cashAccount?.id,
    cash_account_code: cashAccount?.code,
    cash_account_name: cashAccount?.name,
    payment_method: paymentMethod,
    payment_channel: parsedInput.payment_channel,
    finance_transaction_id: isMigration ? undefined : financeTransactionId,
    is_migration: isMigration ? true : undefined,
    disbursement_notes: parsedInput.notes,
    net_disbursement_amount: Math.max(0, disbursementAmount),
    outstanding_principal_amount: loan.principal_amount,
    outstanding_interest_amount: loan.total_interest_amount,
    outstanding_penalty_amount: 0,
    updated_at: now,
    updated_by: currentUser?.id,
    updated_by_name: currentUser?.name,
  });
  disbursedLoan = nextDisbursedLoan;

  const migrationState: CooperativeLoanMigrationState | undefined = isMigration
    ? {
        settledThroughInstallmentNumber: parsedInput.settled_through_installment_number,
        outstandingPrincipalAmount: parsedInput.migration_outstanding_principal_amount,
        outstandingInterestAmount: parsedInput.migration_outstanding_interest_amount,
      }
    : undefined;
  installments = buildInstallments(nextDisbursedLoan, firstDueDate, now, migrationState);

  if (isMigration) {
    // Outstanding pinjaman migrasi diturunkan dari sisa kartu angsuran, bukan pokok penuh.
    const remaining = installments.reduce(
      (acc, installment) => {
        const rem = getInstallmentRemainingAmounts(installment);
        acc.principal += rem.principal_amount;
        acc.interest += rem.interest_amount;
        acc.penalty += rem.penalty_amount;
        return acc;
      },
      { principal: 0, interest: 0, penalty: 0 },
    );
    nextDisbursedLoan.outstanding_principal_amount = roundCurrency(remaining.principal);
    nextDisbursedLoan.outstanding_interest_amount = roundCurrency(remaining.interest);
    nextDisbursedLoan.outstanding_penalty_amount = roundCurrency(remaining.penalty);
    nextDisbursedLoan.net_disbursement_amount = 0;
    nextDisbursedLoan.status = getLoanNextStatus(nextDisbursedLoan, installments);
  }

  let financeTransaction: FinanceTransaction | undefined;
  if (!isMigration && cashAccount) {
    financeTransaction = withPendingFinanceTransactionSync({
      id: financeTransactionId,
      type: 'EXPENSE',
      category: FINANCE_CATEGORIES.KSP_LOAN_DISBURSEMENT,
      amount: Math.max(0, disbursementAmount),
      description: `Pencairan pinjaman ${loan.loan_number} ${loan.member_number} - ${loan.member_name}`,
      created_at: disbursementDate,
      reference_id: loan.id,
      payment_method: paymentMethod,
      payment_channel: parsedInput.payment_channel,
      cash_account_id: cashAccount.id,
      cash_account_code: cashAccount.code,
      cash_account_name: cashAccount.name,
      ...accountSnapshot,
      ...(fieldCashContext
        ? buildFieldCashFinanceTransactionFields(fieldCashContext, 'LOAN_DISBURSEMENT')
        : {}),
    }, currentUser, now);

    await db.financeTransactions.add(financeTransaction);
    if (resolveLoanDeductionMethod(nextDisbursedLoan) === 'DEDUCT_ON_DISBURSEMENT') {
      const mandatorySavingResult = await recordMandatorySavingDeduction({
        loan: nextDisbursedLoan,
        amount: Number(nextDisbursedLoan.mandatory_saving_amount || 0),
        transactionDate: disbursementDate,
        now,
        cashAccount,
        paymentMethod,
        paymentChannel: parsedInput.payment_channel,
        currentUser,
      });
      mandatorySavingTransaction = mandatorySavingResult.transaction;
      mandatorySavingBalance = mandatorySavingResult.balance;
    }
  }
  await db.cooperativeLoanInstallments.bulkAdd(installments);
  await db.cooperativeLoans.put(nextDisbursedLoan);

  if (!isMigration) {
    const journalEntry = await postCooperativeLoanDisbursementJournal(nextDisbursedLoan, currentUser);
    if (journalEntry) {
      disbursedLoan = {
        ...nextDisbursedLoan,
        journal_entry_id: journalEntry.id,
        updated_at: now,
        sync_status: 'pending',
        sync_error: undefined,
      };
      await db.cooperativeLoans.update(loan.id, {
        journal_entry_id: journalEntry.id,
        updated_at: now,
        sync_status: 'pending',
        sync_error: undefined,
      });
    }
  }

  await writeActivityLog({
    user: currentUser,
    action: isMigration ? 'COOPERATIVE_LOAN_MIGRATED' : 'COOPERATIVE_LOAN_DISBURSED',
    entity: 'cooperativeLoans',
    entity_id: loan.id,
    description: isMigration
      ? `${currentUser?.name ?? 'User'} mencatat migrasi pinjaman ${loan.loan_number} (sisa pokok ${nextDisbursedLoan.outstanding_principal_amount}).`
      : `${currentUser?.name ?? 'User'} mencairkan pinjaman ${loan.loan_number} sebesar ${Math.max(0, disbursementAmount)}.`,
  });

  if (!disbursedLoan) {
    throw new Error('Pencairan pinjaman gagal disimpan.');
  }

  return {
    loan: disbursedLoan,
    installments,
    financeTransaction,
    mandatorySavingTransaction,
    mandatorySavingBalance,
  };
};

const enqueueCooperativeLoanDisbursementResultSync = async (
  result: CooperativeLoanDisbursementWriteResult,
) => {
  if (result.financeTransaction) {
    await enqueueFinanceTransactionsSync([result.financeTransaction], 'create');
  }
  if (result.mandatorySavingTransaction) {
    await enqueueCooperativeSavingTransactionsSync([result.mandatorySavingTransaction], 'create');
  }
  if (result.mandatorySavingBalance) {
    await enqueueCooperativeMemberSavingBalancesSync([result.mandatorySavingBalance], 'update');
  }
  await enqueueCooperativeLoansSync([result.loan], 'update');
  await enqueueCooperativeLoanInstallmentsSync(result.installments, 'create');
};

export const disburseCooperativeLoan = async (
  input: DisburseCooperativeLoanInput,
): Promise<DisburseCooperativeLoanResult> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'COOPERATIVE_LOAN_DISBURSE');

  const parsedInput = cooperativeLoanDisbursementSchema.parse(input);
  const now = new Date().toISOString();
  let result: CooperativeLoanDisbursementWriteResult | undefined;

  await db.transaction('rw', cooperativeLoanTables, async () => {
    result = await writeCooperativeLoanDisbursementInCurrentTransaction({
      loanId: input.loan_id,
      parsedInput,
      now,
      currentUser,
    });
  });

  if (!result) {
    throw new Error('Pencairan pinjaman gagal disimpan.');
  }

  await enqueueCooperativeLoanDisbursementResultSync(result);

  return {
    loan: result.loan,
    installments: result.installments,
  };
};

export interface MigrateCooperativeLoanInput {
  member_id: string;
  principal_amount: number;
  interest_calculation_type?: CooperativeLoanInterestCalculationType;
  interest_rate_per_month?: number;
  tenor_months?: number;
  billing_frequency?: CooperativeLoanBillingFrequency;
  installment_count?: number;
  loan_service_rate?: number;
  admin_fee_rate?: number;
  mandatory_saving_rate?: number;
  application_date?: string;
  disbursement_date: string;
  first_due_date?: string;
  settled_through_installment_number?: number;
  migration_outstanding_principal_amount?: number;
  migration_outstanding_interest_amount?: number;
  notes?: string;
}

/**
 * Mencatat pinjaman migrasi (pinjaman berjalan yang dibawa saat cut-off) secara ATOMIC:
 * create + approve + disburse-mode-migrasi berjalan dalam satu transaksi Dexie. Bila salah satu
 * tahap gagal (validasi/disburse), tidak ada loan `SUBMITTED`/`APPROVED` parsial yang tertinggal.
 * Queue sync dijalankan hanya setelah transaksi lokal sukses.
 */
export const migrateCooperativeLoan = async (
  input: MigrateCooperativeLoanInput,
): Promise<DisburseCooperativeLoanResult> => {
  const currentUser = await getCurrentSessionUser();
  // Migrasi menjalankan create + approve + disburse; wajibkan izin ketiga operasi tersebut.
  await requireUserPermission(currentUser, 'COOPERATIVE_PAYMENT_CREATE');
  await requireUserPermission(currentUser, 'COOPERATIVE_LOAN_MANAGE');
  await requireUserPermission(currentUser, 'COOPERATIVE_LOAN_DISBURSE');

  const parsedDisbursement = cooperativeLoanDisbursementSchema.parse({
    disbursement_date: input.disbursement_date,
    first_due_date: input.first_due_date,
    migration_entry: true,
    settled_through_installment_number: input.settled_through_installment_number,
    migration_outstanding_principal_amount: input.migration_outstanding_principal_amount,
    migration_outstanding_interest_amount: input.migration_outstanding_interest_amount,
    notes: input.notes,
  });

  const applicationInput: CreateCooperativeLoanApplicationInput = {
    member_id: input.member_id,
    principal_amount: input.principal_amount,
    interest_calculation_type: input.interest_calculation_type,
    interest_rate_per_month: input.interest_rate_per_month,
    tenor_months: input.tenor_months,
    billing_frequency: input.billing_frequency,
    installment_count: input.installment_count,
    loan_service_rate: input.loan_service_rate,
    admin_fee_rate: input.admin_fee_rate,
    mandatory_saving_rate: input.mandatory_saving_rate,
    application_date: input.application_date,
    notes: input.notes,
  };

  const now = new Date().toISOString();
  const approvalDate = input.application_date ?? now;
  let result: CooperativeLoanDisbursementWriteResult | undefined;

  await db.transaction('rw', cooperativeLoanTables, async () => {
    // 1) Buat record pinjaman (SUBMITTED).
    const loan = await buildCooperativeLoanApplicationRecord({ input: applicationInput, now, currentUser });
    await db.cooperativeLoans.add(loan);

    // 2) Setujui pinjaman (APPROVED) supaya memenuhi prasyarat pencairan.
    const approvedLoan: CooperativeLoan = withPendingCooperativeSync({
      ...loan,
      status: 'APPROVED' as const,
      approved_at: approvalDate,
      approved_by: currentUser?.id,
      approved_by_name: currentUser?.name,
      updated_at: now,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
    });
    await db.cooperativeLoans.put(approvedLoan);

    // 3) Catat pencairan mode migrasi (tanpa jurnal & tanpa kas). Menandai angsuran lunas historis,
    //    menurunkan outstanding dari sisa kartu, dan menulis activity log COOPERATIVE_LOAN_MIGRATED.
    result = await writeCooperativeLoanDisbursementInCurrentTransaction({
      loanId: loan.id,
      parsedInput: parsedDisbursement,
      now,
      currentUser,
    });
  });

  if (!result) {
    throw new Error('Migrasi pinjaman gagal disimpan.');
  }

  // Sync hanya setelah transaksi lokal sukses. Loan baru dibuat -> 'create'.
  await enqueueCooperativeLoansSync([result.loan], 'create');
  await enqueueCooperativeLoanInstallmentsSync(result.installments, 'create');

  return {
    loan: result.loan,
    installments: result.installments,
  };
};

export const disburseCooperativeLoanViaFieldCash = async (
  input: DisburseCooperativeLoanViaFieldCashInput,
): Promise<DisburseCooperativeLoanViaFieldCashResult> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'COOPERATIVE_LOAN_DISBURSE');

  if (input.migration_entry) {
    throw new Error('Pinjaman migrasi tidak boleh melalui jalur kas petugas karena tidak menggerakkan kas. Gunakan pencatatan migrasi biasa.');
  }

  const droppingAmount = roundCurrency(Number(input.dropping_amount || 0));
  if (!Number.isFinite(droppingAmount) || droppingAmount < 0) {
    throw new Error('Nominal dropping tidak boleh negatif.');
  }

  const parsedInput = cooperativeLoanDisbursementSchema.parse({
    ...input,
    payment_method: 'TUNAI',
    cash_account_id: input.field_cash_account_id,
  });
  const now = new Date().toISOString();
  let disbursementResult: CooperativeLoanDisbursementWriteResult | undefined;
  let droppingTransfer: RecordCashBankTransferResult | undefined;

  await db.transaction('rw', cooperativeLoanTables, async () => {
    const loan = await db.cooperativeLoans.get(input.loan_id);
    if (!loan) {
      throw new Error('Pinjaman koperasi tidak ditemukan.');
    }
    if (loan.status !== 'APPROVED') {
      throw new Error('Pinjaman hanya bisa dicairkan setelah approved.');
    }

    const member = await db.cooperativeMembers.get(loan.member_id);
    if (!member?.officer_id) {
      throw new Error('Petugas/Resort anggota wajib ditentukan sebelum pencairan.');
    }
    const officer = await db.employees.get(member.officer_id);
    if (!officer || !officer.is_active) {
      throw new Error('Petugas/Resort anggota tidak ditemukan atau sudah nonaktif.');
    }
    if (!officer.field_cash_account_id) {
      throw new Error(`Petugas/Resort ${officer.name} belum memiliki akun kas PDL.`);
    }

    const fieldCashAccountId = parsedInput.cash_account_id ?? officer.field_cash_account_id;
    if (fieldCashAccountId !== officer.field_cash_account_id) {
      throw new Error(`Akun kas PDL tidak sesuai dengan petugas/Resort ${officer.name}.`);
    }

    const disbursementAmount = Math.max(0, resolveNetDisbursementAmount(loan));
    const currentFieldCashBalance = await getCashAccountBalance(fieldCashAccountId);
    if (roundCurrency(currentFieldCashBalance + droppingAmount) + 0.01 < disbursementAmount) {
      const shortage = roundCurrency(disbursementAmount - currentFieldCashBalance - droppingAmount);
      throw new Error(`Saldo kas PDL setelah dropping belum cukup untuk pencairan. Kekurangan Rp ${shortage.toLocaleString('id-ID')}.`);
    }

    const disbursementDate = parsedInput.disbursement_date ?? now;
    if (droppingAmount > 0) {
      if (!input.finance_cash_account_id) {
        throw new Error('Akun kas/bank finance wajib dipilih jika ada dropping.');
      }

      droppingTransfer = await recordCashBankTransferInCurrentTransaction({
        from_cash_account_id: input.finance_cash_account_id,
        to_cash_account_id: fieldCashAccountId,
        amount: droppingAmount,
        transfer_date: disbursementDate,
        payment_channel: parsedInput.payment_channel,
        reference_id: loan.id,
        notes: `Dropping kas pencairan pinjaman ${loan.loan_number} ke ${officer.name}.`,
      }, currentUser);
    }

    disbursementResult = await writeCooperativeLoanDisbursementInCurrentTransaction({
      loanId: input.loan_id,
      parsedInput: {
        ...parsedInput,
        payment_method: 'TUNAI',
        cash_account_id: fieldCashAccountId,
      },
      now,
      currentUser,
    });
  });

  if (!disbursementResult) {
    throw new Error('Pencairan pinjaman gagal disimpan.');
  }

  if (droppingTransfer) {
    await enqueueFinanceTransactionsSync([
      droppingTransfer.outTransaction,
      droppingTransfer.inTransaction,
    ], 'create');
  }
  await enqueueCooperativeLoanDisbursementResultSync(disbursementResult);

  return {
    loan: disbursementResult.loan,
    installments: disbursementResult.installments,
    droppingTransfer,
  };
};

const findPostingAccount = async (
  ids: string[],
  codes: string[],
) => {
  const accounts = await db.chartOfAccounts.toArray();
  const account = ids
    .map((id) => accounts.find((item) => item.id === id))
    .find(Boolean) ?? codes
    .map((code) => accounts.find((item) => item.code === code))
    .find(Boolean);

  if (!account || !account.is_active || !account.is_postable) {
    throw new Error(`Akun posting ${codes.join('/')} belum aktif dan postable.`);
  }

  return account;
};

const ensureServerPostingAccounts = async (
  sessionToken: string,
  currentUser: Awaited<ReturnType<typeof getCurrentSessionUser>>,
  cashAccount: Awaited<ReturnType<typeof getCashOrBankAccountForPayment>>,
) => {
  if (!await hasUserPermission(currentUser, 'FINANCE_ACCESS')) return;

  const [receivableAccount, interestAccount, penaltyAccount, iptwExpenseAccount] = await Promise.all([
    findPostingAccount(['cooperative-loan-receivable'], ['1120']),
    findPostingAccount(['cooperative-loan-interest-income'], ['4040']),
    findPostingAccount(['cooperative-loan-penalty-income'], ['4050']),
    findPostingAccount(
      ['cooperative-iptw-expense', 'template-cooperative-iptw-expense', 'other-expense', 'template-other-expense'],
      ['6090', '6900'],
    ),
  ]);

  await cooperativePostingPostgresAdapter.registerAccounts(sessionToken, [
    {
      id: cashAccount.id,
      code: cashAccount.code,
      name: cashAccount.name,
      account_type: cashAccount.type,
      is_postable: cashAccount.is_postable,
      is_active: cashAccount.is_active,
      is_cash_or_bank: true,
      updated_at: cashAccount.updated_at,
    },
    {
      id: receivableAccount.id,
      account_key: 'COOPERATIVE_LOAN_RECEIVABLE',
      code: receivableAccount.code,
      name: receivableAccount.name,
      account_type: receivableAccount.type,
      is_postable: receivableAccount.is_postable,
      is_active: receivableAccount.is_active,
      is_cash_or_bank: false,
      updated_at: receivableAccount.updated_at,
    },
    {
      id: interestAccount.id,
      account_key: 'COOPERATIVE_LOAN_INTEREST_INCOME',
      code: interestAccount.code,
      name: interestAccount.name,
      account_type: interestAccount.type,
      is_postable: interestAccount.is_postable,
      is_active: interestAccount.is_active,
      is_cash_or_bank: false,
      updated_at: interestAccount.updated_at,
    },
    {
      id: penaltyAccount.id,
      account_key: 'COOPERATIVE_LOAN_PENALTY_INCOME',
      code: penaltyAccount.code,
      name: penaltyAccount.name,
      account_type: penaltyAccount.type,
      is_postable: penaltyAccount.is_postable,
      is_active: penaltyAccount.is_active,
      is_cash_or_bank: false,
      updated_at: penaltyAccount.updated_at,
    },
    {
      id: iptwExpenseAccount.id,
      account_key: 'COOPERATIVE_IPTW_EXPENSE',
      code: iptwExpenseAccount.code,
      name: iptwExpenseAccount.name,
      account_type: iptwExpenseAccount.type,
      is_postable: iptwExpenseAccount.is_postable,
      is_active: iptwExpenseAccount.is_active,
      is_cash_or_bank: false,
      updated_at: iptwExpenseAccount.updated_at,
    },
  ]);
};

const recordCooperativeLoanPaymentOnServer = async (
  input: RecordCooperativeLoanPaymentInput,
): Promise<RecordCooperativeLoanPaymentOutcome> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'COOPERATIVE_PAYMENT_CREATE');
  const parsedInput = cooperativeLoanPaymentSchema.parse(input);
  const sessionToken = await getCurrentServerSessionToken();
  if (!sessionToken) {
    throw new Error('Sesi server tidak tersedia. Silakan logout lalu login kembali.');
  }

  const paymentMethod = parsedInput.payment_method ?? 'TUNAI';
  const cashAccount = await getCashOrBankAccountForPayment(
    paymentMethod,
    parsedInput.cash_account_id,
  );
  await ensureServerPostingAccounts(sessionToken, currentUser, cashAccount);

  const remoteResult = await cooperativePostingPostgresAdapter.postPaymentBatch({
    session_token: sessionToken,
    idempotency_key: parsedInput.idempotency_key ?? crypto.randomUUID(),
    installment_id: parsedInput.installment_id,
    amount: roundCurrency(parsedInput.amount),
    payment_date: parsedInput.payment_date ?? new Date().toISOString(),
    payment_method: paymentMethod,
    cash_account_id: cashAccount.id,
    payment_channel: parsedInput.payment_channel,
    collector_id: parsedInput.collector_id,
    notes: parsedInput.notes,
  });
  if (!remoteResult) {
    throw new Error('Posting pembayaran server tidak menghasilkan data.');
  }
  if (remoteResult.status === 'PENDING_APPROVAL') {
    return {
      status: 'PENDING_APPROVAL',
      approval_request: mapRemotePaymentApprovalRequest(remoteResult.approval_request),
    };
  }
  const postedResult = remoteResult.result;

  await Promise.all([
    mergeRemoteCooperativeLoanPaymentsIntoDexie(postedResult.payments),
    mergeRemoteCooperativeLoanInstallmentsIntoDexie(postedResult.installments),
    mergeRemoteCooperativeLoansIntoDexie([postedResult.loan]),
    mergeRemoteFinanceTransactionsIntoDexie(postedResult.finance_transactions),
    mergeRemoteJournalEntryBundlesIntoDexie(postedResult.journal_entries),
  ]);
  if (postedResult.loan.status === 'PAID_OFF') {
    await Promise.all([
      refreshFinanceTransactionsFromPostgres(),
      refreshJournalEntriesFromPostgres(),
    ]);
  }

  const [payments, installments, loan] = await Promise.all([
    db.cooperativeLoanPayments.bulkGet(postedResult.payments.map((payment) => payment.id)),
    db.cooperativeLoanInstallments.bulkGet(postedResult.installments.map((installment) => installment.id)),
    db.cooperativeLoans.get(postedResult.loan.id),
  ]);
  const savedPayments = payments.filter((payment): payment is CooperativeLoanPayment => Boolean(payment));
  const savedInstallments = installments.filter((installment): installment is CooperativeLoanInstallment => Boolean(installment));
  if (
    savedPayments.length !== postedResult.payments.length ||
    savedInstallments.length !== postedResult.installments.length ||
    !loan
  ) {
    throw new Error('Hasil posting pembayaran gagal diterapkan ke database lokal.');
  }

  return {
    status: 'POSTED',
    payment: savedPayments[0],
    payments: savedPayments,
    installment: savedInstallments[0],
    installments: savedInstallments,
    loan,
    payment_group_id: postedResult.payment_group_id ?? undefined,
    payment_group_number: postedResult.payment_group_number ?? undefined,
  };
};

const recordCooperativeLoanPaymentLocally = async (
  input: RecordCooperativeLoanPaymentInput,
): Promise<RecordCooperativeLoanPaymentResult> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'COOPERATIVE_PAYMENT_CREATE');

  const parsedInput = cooperativeLoanPaymentSchema.parse(input);
  const amount = roundCurrency(parsedInput.amount);
  const now = new Date().toISOString();
  const paymentDate = parsedInput.payment_date ?? now;
  if (!dayjs(paymentDate).isSame(dayjs(now), 'day')) {
    throw new Error(
      'Pembayaran backdate membutuhkan maker-checker dan hanya tersedia saat PostgreSQL aktif.',
    );
  }
  const paymentMethod = parsedInput.payment_method ?? 'TUNAI';
  let savedPayments: CooperativeLoanPayment[] = [];
  let savedInstallments: CooperativeLoanInstallment[] = [];
  let savedLoan: CooperativeLoan | undefined;
  let financeTransactions: FinanceTransaction[] = [];
  let mandatorySavingReturnTransaction: CooperativeSavingTransaction | undefined;
  let mandatorySavingReturnBalance: CooperativeMemberSavingBalance | undefined;
  let mandatorySavingReturnFinanceTransaction: FinanceTransaction | undefined;
  let iptwFinanceTransaction: FinanceTransaction | undefined;
  let paymentGroupId: string | undefined;
  let paymentGroupNumber: string | undefined;

  await db.transaction('rw', cooperativeLoanTables, async () => {
    const installment = await db.cooperativeLoanInstallments.get(parsedInput.installment_id);
    if (!installment) {
      throw new Error('Jadwal angsuran tidak ditemukan.');
    }
    if (installment.status === 'PAID') {
      throw new Error('Angsuran ini sudah lunas.');
    }

    const loan = await db.cooperativeLoans.get(installment.loan_id);
    if (!loan) {
      throw new Error('Pinjaman koperasi tidak ditemukan.');
    }
    if (loan.status !== 'DISBURSED') {
      throw new Error('Pembayaran hanya bisa dicatat untuk pinjaman yang sudah dicairkan dan belum lunas.');
    }

    const member = await db.cooperativeMembers.get(loan.member_id);
    const collectorId = parsedInput.collector_id || member?.officer_id;
    const collector = collectorId ? await db.employees.get(collectorId) : undefined;
    if (parsedInput.collector_id && !collector) {
      throw new Error('Kolektor penagihan tidak ditemukan.');
    }
    if (collector && !collector.is_active) {
      throw new Error(`Kolektor ${collector.name} sudah nonaktif.`);
    }
    const collectorName = collector?.name ?? (
      collectorId === member?.officer_id ? member?.officer_name : undefined
    );
    const collectorPosition = collector?.position ?? (
      collectorId === member?.officer_id ? member?.officer_position : undefined
    );

    const loanInstallments = await db.cooperativeLoanInstallments
      .where('loan_id')
      .equals(loan.id)
      .toArray();
    const allocationRows = allocateLoanPaymentAcrossInstallments(
      loanInstallments.filter((item) => item.status !== 'PAID'),
      amount,
    );
    if (allocationRows.length === 0) {
      throw new Error('Tidak ada sisa angsuran yang dapat dialokasikan.');
    }

    const cashAccount = await getCashOrBankAccountForPayment(paymentMethod, parsedInput.cash_account_id);
    const fieldCashContext = paymentMethod === 'TUNAI'
      ? await getFieldCashContextForCashAccount(cashAccount.id)
      : undefined;
    const totalAllocatedAmount = roundCurrency(allocationRows.reduce(
      (sum, row) => sum + row.allocation.total_amount,
      0,
    ));
    await updateFinanceBalanceForPayment(totalAllocatedAmount, now);

    if (allocationRows.length > 1) {
      paymentGroupId = crypto.randomUUID();
      paymentGroupNumber = createCooperativeLoanPaymentGroupNumber(new Date(now), paymentGroupId);
    }

    const updatedInstallmentById = new Map<string, CooperativeLoanInstallment>();
    const payments: CooperativeLoanPayment[] = [];
    const nextFinanceTransactions: FinanceTransaction[] = [];

    const nextLoanDraft: CooperativeLoan = {
      ...loan,
      updated_at: now,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
    };

    const baseIdempotencyKey = parsedInput.idempotency_key ?? paymentGroupId ?? crypto.randomUUID();
    for (const [index, row] of allocationRows.entries()) {
      const paymentId = crypto.randomUUID();
      const financeTransactionId = crypto.randomUUID();
      const { allocation } = row;
      const nextInstallment: CooperativeLoanInstallment = withPendingCooperativeSync({
        ...row.installment,
        paid_principal_amount: roundCurrency(row.installment.paid_principal_amount + allocation.principal_amount),
        paid_interest_amount: roundCurrency(row.installment.paid_interest_amount + allocation.interest_amount),
        paid_penalty_amount: roundCurrency(row.installment.paid_penalty_amount + allocation.penalty_amount),
        updated_at: now,
      });
      const nextInstallmentStatus = getInstallmentNextStatus(nextInstallment);
      nextInstallment.status = nextInstallmentStatus;
      nextInstallment.paid_at = nextInstallmentStatus === 'PAID' ? paymentDate : undefined;
      if (nextInstallmentStatus === 'PAID') {
        nextInstallment.collection_status = 'NONE';
        nextInstallment.follow_up_date = undefined;
        nextInstallment.collection_notes = undefined;
        nextInstallment.last_contacted_at = undefined;
      }
      updatedInstallmentById.set(nextInstallment.id, nextInstallment);

      const payment: CooperativeLoanPayment = withPendingCooperativeSync({
        id: paymentId,
        payment_number: await createCooperativeLoanPaymentNumber(new Date(now), index),
        payment_type: 'PAYMENT',
        payment_group_id: paymentGroupId,
        payment_group_number: paymentGroupNumber,
        payment_group_sequence: paymentGroupId ? index + 1 : undefined,
        payment_group_total: paymentGroupId ? allocationRows.length : undefined,
        loan_id: loan.id,
        loan_number: loan.loan_number,
        installment_id: row.installment.id,
        member_id: loan.member_id,
        member_number: loan.member_number,
        member_name: loan.member_name,
        amount: allocation.total_amount,
        principal_amount: allocation.principal_amount,
        interest_amount: allocation.interest_amount,
        penalty_amount: allocation.penalty_amount,
        payment_date: paymentDate,
        status: 'POSTED',
        cash_account_id: cashAccount.id,
        cash_account_code: cashAccount.code,
        cash_account_name: cashAccount.name,
        payment_method: paymentMethod,
        payment_channel: parsedInput.payment_channel,
        collector_id: collectorId,
        collector_name: collectorName,
        collector_position: collectorPosition,
        received_by: currentUser?.id,
        received_by_name: currentUser?.name,
        posted_at: now,
        finance_transaction_id: financeTransactionId,
        idempotency_key: allocationRows.length === 1
          ? baseIdempotencyKey
          : `${baseIdempotencyKey}:${index + 1}`,
        notes: parsedInput.notes,
        created_at: now,
        updated_at: now,
        created_by: currentUser?.id,
        created_by_name: currentUser?.name,
        updated_by: currentUser?.id,
        updated_by_name: currentUser?.name,
      });
      payments.push(payment);

      nextFinanceTransactions.push(withPendingFinanceTransactionSync({
        id: financeTransactionId,
        type: 'INCOME',
        category: FINANCE_CATEGORIES.KSP_LOAN_PAYMENT,
        amount: allocation.total_amount,
        description: `Pembayaran angsuran ${loan.loan_number} ${loan.member_number} - ${loan.member_name}`,
        created_at: paymentDate,
        reference_id: payment.id,
        payment_method: paymentMethod,
        payment_channel: parsedInput.payment_channel,
        cash_account_id: cashAccount.id,
        cash_account_code: cashAccount.code,
        cash_account_name: cashAccount.name,
        account_id: cashAccount.id,
        account_code: cashAccount.code,
        account_name: cashAccount.name,
        account_type: cashAccount.type,
        ...(fieldCashContext
          ? buildFieldCashFinanceTransactionFields(fieldCashContext, 'STORTING_LOAN_PAYMENT')
          : {}),
      }, currentUser, now));

      nextLoanDraft.outstanding_principal_amount = roundCurrency(
        nextLoanDraft.outstanding_principal_amount - allocation.principal_amount,
      );
      nextLoanDraft.outstanding_interest_amount = roundCurrency(
        nextLoanDraft.outstanding_interest_amount - allocation.interest_amount,
      );
      nextLoanDraft.outstanding_penalty_amount = roundCurrency(
        nextLoanDraft.outstanding_penalty_amount - allocation.penalty_amount,
      );
    }
    assertOutstandingNotNegative(nextLoanDraft);

    const nextInstallments = loanInstallments.map((item) => (
      updatedInstallmentById.get(item.id) ?? item
    ));
    const updatedInstallments = Array.from(updatedInstallmentById.values());
    const nextLoan: CooperativeLoan = withPendingCooperativeSync({
      ...nextLoanDraft,
      outstanding_principal_amount: Math.max(0, nextLoanDraft.outstanding_principal_amount),
      outstanding_interest_amount: Math.max(0, nextLoanDraft.outstanding_interest_amount),
      outstanding_penalty_amount: Math.max(0, nextLoanDraft.outstanding_penalty_amount),
      status: getLoanNextStatus(nextLoanDraft, nextInstallments),
    });

    await db.financeTransactions.bulkAdd(nextFinanceTransactions);
    await db.cooperativeLoanPayments.bulkAdd(payments);
    await db.cooperativeLoanInstallments.bulkPut(updatedInstallments);
    await db.cooperativeLoans.put(nextLoan);

    if (nextLoan.status === 'PAID_OFF') {
      const paidOffPayment = payments[payments.length - 1];
      const iptwAmount = isCooperativeLoanEligibleForIptw(nextInstallments)
        ? calculateCooperativeIptwAmount(nextLoan.principal_amount)
        : 0;
      const mandatorySavingAmount = roundCurrency(Number(nextLoan.mandatory_saving_amount || 0));
      if (fieldCashContext) {
        await assertSufficientCashAccountBalance(
          cashAccount.id,
          roundCurrency(mandatorySavingAmount + iptwAmount),
          { actionLabel: 'pengembalian simpanan wajib dan pembayaran IPTW' },
        );
      }

      const mandatorySavingReturn = await recordMandatorySavingReturnOnPaidOff({
        loan: nextLoan,
        payment: paidOffPayment,
        amount: mandatorySavingAmount,
        now,
        fieldCashContext,
        currentUser,
      });
      mandatorySavingReturnTransaction = mandatorySavingReturn.transaction;
      mandatorySavingReturnBalance = mandatorySavingReturn.balance;
      mandatorySavingReturnFinanceTransaction = mandatorySavingReturn.financeTransaction;
      iptwFinanceTransaction = await recordIptwPayoutOnPaidOff({
        loan: nextLoan,
        payment: paidOffPayment,
        amount: iptwAmount,
        now,
        fieldCashContext,
        currentUser,
      });
    }

    const paymentsWithJournal: CooperativeLoanPayment[] = [];
    for (const payment of payments) {
      const journalEntry = await postCooperativeLoanPaymentJournal(payment, currentUser);
      if (!journalEntry) {
        paymentsWithJournal.push(payment);
        continue;
      }

      const paymentWithJournal: CooperativeLoanPayment = {
        ...payment,
        journal_entry_id: journalEntry.id,
        updated_at: now,
        sync_status: 'pending',
        sync_error: undefined,
      };
      paymentsWithJournal.push(paymentWithJournal);
      await db.cooperativeLoanPayments.update(payment.id, {
        journal_entry_id: journalEntry.id,
        updated_at: now,
        sync_status: 'pending',
        sync_error: undefined,
      });
    }

    savedPayments = paymentsWithJournal;
    savedInstallments = updatedInstallments;
    savedLoan = nextLoan;
    financeTransactions = nextFinanceTransactions;

    await writeActivityLog({
      user: currentUser,
      action: 'COOPERATIVE_LOAN_PAYMENT_RECORDED',
      entity: 'cooperativeLoanPayments',
      entity_id: paymentGroupId ?? payments[0].id,
      description: `${currentUser?.name ?? 'User'} mencatat pembayaran angsuran ${paymentGroupNumber ?? payments[0].payment_number} untuk ${loan.loan_number} sebesar ${totalAllocatedAmount}.`,
    });
  });

  if (savedPayments.length === 0 || savedInstallments.length === 0 || !savedLoan) {
    throw new Error('Pembayaran angsuran gagal disimpan.');
  }

  if (financeTransactions.length > 0) {
    await enqueueFinanceTransactionsSync(financeTransactions, 'create');
  }
  if (mandatorySavingReturnFinanceTransaction) {
    await enqueueFinanceTransactionsSync([mandatorySavingReturnFinanceTransaction], 'create');
  }
  if (iptwFinanceTransaction) {
    await enqueueFinanceTransactionsSync([iptwFinanceTransaction], 'create');
  }
  if (mandatorySavingReturnTransaction) {
    await enqueueCooperativeSavingTransactionsSync([mandatorySavingReturnTransaction], 'create');
  }
  if (mandatorySavingReturnBalance) {
    await enqueueCooperativeMemberSavingBalancesSync([mandatorySavingReturnBalance], 'update');
  }
  await enqueueCooperativeLoanPaymentsSync(savedPayments, 'create');
  await enqueueCooperativeLoanInstallmentsSync(savedInstallments, 'update');
  await enqueueCooperativeLoansSync([savedLoan], 'update');

  return {
    status: 'POSTED',
    payment: savedPayments[0],
    payments: savedPayments,
    installment: savedInstallments[0],
    installments: savedInstallments,
    loan: savedLoan,
    payment_group_id: paymentGroupId,
    payment_group_number: paymentGroupNumber,
  };
};

export const recordCooperativeLoanPayment = async (
  input: RecordCooperativeLoanPaymentInput,
): Promise<RecordCooperativeLoanPaymentOutcome> => {
  const health = await postgresAdapter.healthCheck();
  if (health.available) {
    return recordCooperativeLoanPaymentOnServer(input);
  }
  if (health.status !== 'unconfigured') {
    throw new Error(
      'PostgreSQL sedang tidak dapat dijangkau. Pembayaran diblokir untuk mencegah duplikasi lintas perangkat.',
    );
  }

  return recordCooperativeLoanPaymentLocally(input);
};

const recordCooperativeLoanInstallmentCollectionLocally = async (
  input: RecordCooperativeLoanInstallmentCollectionInput,
): Promise<RecordCooperativeLoanInstallmentCollectionResult> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'COOPERATIVE_PAYMENT_CREATE');

  const parsedInput = cooperativeLoanInstallmentCollectionSchema.parse(input);
  const now = new Date().toISOString();
  let savedInstallment: CooperativeLoanInstallment | undefined;
  let savedEvent: CooperativeLoanCollectionEvent | undefined;

  await db.transaction('rw', cooperativeLoanTables, async () => {
    const installment = await db.cooperativeLoanInstallments.get(parsedInput.installment_id);
    if (!installment) {
      throw new Error('Jadwal angsuran tidak ditemukan.');
    }
    if (installment.status === 'PAID') {
      throw new Error('Angsuran yang sudah lunas tidak perlu tindak lanjut penagihan.');
    }

    const loan = await db.cooperativeLoans.get(installment.loan_id);
    if (!loan) {
      throw new Error('Pinjaman koperasi tidak ditemukan.');
    }
    if (loan.status !== 'DISBURSED') {
      throw new Error('Tindak lanjut penagihan hanya bisa dicatat untuk pinjaman aktif.');
    }

    const nextInstallment: CooperativeLoanInstallment = withPendingCooperativeSync({
      ...installment,
      collection_status: parsedInput.collection_status,
      follow_up_date: parsedInput.follow_up_date,
      collection_notes: parsedInput.collection_notes,
      last_contacted_at: now,
      updated_at: now,
    });
    const collectionEvent: CooperativeLoanCollectionEvent = {
      id: parsedInput.event_id ?? crypto.randomUUID(),
      installment_id: installment.id,
      loan_id: loan.id,
      loan_number: loan.loan_number,
      member_id: loan.member_id,
      member_number: loan.member_number,
      member_name: loan.member_name,
      collection_status: parsedInput.collection_status,
      follow_up_date: parsedInput.follow_up_date,
      collection_notes: parsedInput.collection_notes,
      contacted_at: now,
      actor_user_id: currentUser?.id,
      actor_user_name: currentUser?.name,
      actor_employee_id: currentUser?.employee_id,
      created_at: now,
      sync_status: 'pending',
      sync_error: undefined,
    };

    await db.cooperativeLoanInstallments.put(nextInstallment);
    await db.cooperativeLoanCollectionEvents.add(collectionEvent);
    savedInstallment = nextInstallment;
    savedEvent = collectionEvent;

    await writeActivityLog({
      user: currentUser,
      action: 'COOPERATIVE_LOAN_INSTALLMENT_COLLECTION_RECORDED',
      entity: 'cooperativeLoanInstallments',
      entity_id: installment.id,
      description: `${currentUser?.name ?? 'User'} mencatat tindak lanjut penagihan ${installment.loan_number} angsuran ${installment.installment_number}.`,
    });
  });

  if (!savedInstallment || !savedEvent) {
    throw new Error('Tindak lanjut penagihan gagal disimpan.');
  }

  await enqueueCooperativeLoanInstallmentsSync([savedInstallment], 'update');
  await enqueueCooperativeLoanCollectionEventsSync([savedEvent], 'create');

  return {
    event: savedEvent,
    installment: savedInstallment,
  };
};

const recordCooperativeLoanInstallmentCollectionOnServer = async (
  input: RecordCooperativeLoanInstallmentCollectionInput,
): Promise<RecordCooperativeLoanInstallmentCollectionResult> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'COOPERATIVE_PAYMENT_CREATE');
  const parsedInput = cooperativeLoanInstallmentCollectionSchema.parse(input);
  const sessionToken = await getCurrentServerSessionToken();
  if (!sessionToken) {
    throw new Error('Sesi server tidak tersedia. Silakan logout lalu login kembali.');
  }

  const remoteResult = await cooperativeCollectionEventPostgresAdapter.record({
    session_token: sessionToken,
    event_id: parsedInput.event_id ?? crypto.randomUUID(),
    installment_id: parsedInput.installment_id,
    collection_status: parsedInput.collection_status,
    follow_up_date: parsedInput.follow_up_date,
    collection_notes: parsedInput.collection_notes,
  });
  if (!remoteResult) {
    throw new Error('Pencatatan tindak lanjut server tidak menghasilkan data.');
  }

  await Promise.all([
    mergeRemoteCooperativeLoanInstallmentsIntoDexie([remoteResult.installment]),
    db.cooperativeLoanCollectionEvents.put(
      mapRemoteCooperativeCollectionEventToLocal(remoteResult.event),
    ),
  ]);

  const installment = await db.cooperativeLoanInstallments.get(remoteResult.installment.id);
  const event = await db.cooperativeLoanCollectionEvents.get(remoteResult.event.id);
  if (!installment || !event) {
    throw new Error('Hasil tindak lanjut gagal diterapkan ke database lokal.');
  }

  return { event, installment };
};

export const recordCooperativeLoanInstallmentCollection = async (
  input: RecordCooperativeLoanInstallmentCollectionInput,
): Promise<RecordCooperativeLoanInstallmentCollectionResult> => {
  const health = await postgresAdapter.healthCheck();
  if (health.available) {
    return recordCooperativeLoanInstallmentCollectionOnServer(input);
  }
  if (health.status !== 'unconfigured') {
    throw new Error(
      'PostgreSQL sedang tidak dapat dijangkau. Tindak lanjut diblokir agar histori penagihan tidak terpecah.',
    );
  }

  return recordCooperativeLoanInstallmentCollectionLocally(input);
};

export const reverseCooperativeLoanPayment = async (
  input: ReverseCooperativeLoanPaymentInput,
): Promise<CooperativeLoanPayment | CooperativePaymentApprovalRequest> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'COOPERATIVE_PAYMENT_CREATE');
  const postgresHealth = await postgresAdapter.healthCheck();
  if (postgresHealth.available) {
    const sessionToken = await getCurrentServerSessionToken();
    if (!sessionToken) {
      throw new Error('Sesi server tidak tersedia. Silakan logout lalu login kembali.');
    }
    const request = await cooperativePostingPostgresAdapter.requestReversal({
      session_token: sessionToken,
      payment_id: input.payment_id,
      reason: input.reason,
    });
    if (!request) {
      throw new Error('Request reversal tidak menghasilkan data.');
    }
    return mapRemotePaymentApprovalRequest(request);
  }
  if (postgresHealth.status !== 'unconfigured') {
    throw new Error(
      'PostgreSQL sedang tidak dapat dijangkau. Reversal diblokir agar data keuangan tidak terpecah.',
    );
  }
  if (postgresHealth.status === 'unconfigured') {
    throw new Error(
      'Reversal membutuhkan maker-checker dan hanya tersedia saat PostgreSQL aktif.',
    );
  }

  const parsedInput = cooperativeLoanPaymentReversalSchema.parse({ reason: input.reason });
  const now = new Date().toISOString();
  const reversalPaymentId = crypto.randomUUID();
  const reversalFinanceTransactionId = crypto.randomUUID();
  let reversalPayment: CooperativeLoanPayment | undefined;
  let reversalFinanceTransaction: FinanceTransaction | undefined;
  let updatedOriginalPayment: CooperativeLoanPayment | undefined;
  let updatedInstallment: CooperativeLoanInstallment | undefined;
  let updatedLoan: CooperativeLoan | undefined;
  let autoReturnReversalTransaction: CooperativeSavingTransaction | undefined;
  let autoReturnOriginalTransaction: CooperativeSavingTransaction | undefined;
  let autoReturnBalance: CooperativeMemberSavingBalance | undefined;
  let autoReturnFinanceTransaction: FinanceTransaction | undefined;
  let iptwReversalFinanceTransaction: FinanceTransaction | undefined;

  await db.transaction('rw', cooperativeLoanTables, async () => {
    const payment = await db.cooperativeLoanPayments.get(input.payment_id);
    if (!payment) {
      throw new Error('Pembayaran angsuran tidak ditemukan.');
    }
    if (payment.status !== 'POSTED') {
      throw new Error('Pembayaran angsuran sudah pernah direversal.');
    }
    if (payment.payment_type === 'REVERSAL' || payment.reversal_of_payment_id) {
      throw new Error('Baris reversal pembayaran tidak bisa direversal lagi.');
    }

    const existingReversal = await db.cooperativeLoanPayments
      .where('reversal_of_payment_id')
      .equals(payment.id)
      .first();
    if (existingReversal) {
      throw new Error('Pembayaran angsuran sudah memiliki reversal.');
    }

    const loan = await db.cooperativeLoans.get(payment.loan_id);
    if (!loan) {
      throw new Error('Pinjaman koperasi tidak ditemukan.');
    }
    if (loan.status !== 'DISBURSED' && loan.status !== 'PAID_OFF') {
      throw new Error('Pembayaran hanya bisa direversal untuk pinjaman aktif atau lunas.');
    }

    const installment = payment.installment_id
      ? await db.cooperativeLoanInstallments.get(payment.installment_id)
      : undefined;
    if (!installment) {
      throw new Error('Jadwal angsuran pembayaran tidak ditemukan.');
    }

    const nextInstallment: CooperativeLoanInstallment = withPendingCooperativeSync({
      ...installment,
      paid_principal_amount: roundCurrency(installment.paid_principal_amount - payment.principal_amount),
      paid_interest_amount: roundCurrency(installment.paid_interest_amount - payment.interest_amount),
      paid_penalty_amount: roundCurrency(installment.paid_penalty_amount - payment.penalty_amount),
      updated_at: now,
    });
    if (
      nextInstallment.paid_principal_amount < -0.01 ||
      nextInstallment.paid_interest_amount < -0.01 ||
      nextInstallment.paid_penalty_amount < -0.01
    ) {
      throw new Error('Reversal pembayaran membuat paid amount angsuran negatif.');
    }
    nextInstallment.paid_principal_amount = Math.max(0, nextInstallment.paid_principal_amount);
    nextInstallment.paid_interest_amount = Math.max(0, nextInstallment.paid_interest_amount);
    nextInstallment.paid_penalty_amount = Math.max(0, nextInstallment.paid_penalty_amount);
    const nextInstallmentStatus = getInstallmentNextStatus(nextInstallment);
    nextInstallment.status = nextInstallmentStatus;
    nextInstallment.paid_at = nextInstallmentStatus === 'PAID' ? installment.paid_at : undefined;

    const nextLoanDraft: CooperativeLoan = {
      ...loan,
      status: 'DISBURSED',
      outstanding_principal_amount: roundCurrency(loan.outstanding_principal_amount + payment.principal_amount),
      outstanding_interest_amount: roundCurrency(loan.outstanding_interest_amount + payment.interest_amount),
      outstanding_penalty_amount: roundCurrency(loan.outstanding_penalty_amount + payment.penalty_amount),
      updated_at: now,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
    };
    const nextLoan: CooperativeLoan = withPendingCooperativeSync({
      ...nextLoanDraft,
      outstanding_principal_amount: Math.min(loan.principal_amount, nextLoanDraft.outstanding_principal_amount),
      outstanding_interest_amount: Math.min(loan.total_interest_amount, nextLoanDraft.outstanding_interest_amount),
      outstanding_penalty_amount: Math.max(0, nextLoanDraft.outstanding_penalty_amount),
    });

    const autoReturnReversal = await reverseAutoMandatorySavingReturn({
      payment,
      reason: parsedInput.reason,
      now,
      currentUser,
    });
    autoReturnReversalTransaction = autoReturnReversal.reversalTransaction;
    autoReturnOriginalTransaction = autoReturnReversal.updatedOriginalTransaction;
    autoReturnBalance = autoReturnReversal.balance;
    autoReturnFinanceTransaction = autoReturnReversal.financeTransaction;
    iptwReversalFinanceTransaction = await reverseAutoIptwPayout({
      payment,
      reason: parsedInput.reason,
      now,
      currentUser,
    });

    await updateFinanceBalanceForPayment(payment.amount, now, true);
    reversalFinanceTransaction = withPendingFinanceTransactionSync({
      id: reversalFinanceTransactionId,
      type: 'EXPENSE',
      category: FINANCE_CATEGORIES.KSP_LOAN_PAYMENT,
      amount: payment.amount,
      description: `Reversal pembayaran angsuran ${payment.payment_number}. ${parsedInput.reason}`,
      created_at: now,
      reference_id: reversalPaymentId,
      payment_method: payment.payment_method,
      payment_channel: payment.payment_channel,
      cash_account_id: payment.cash_account_id,
      cash_account_code: payment.cash_account_code,
      cash_account_name: payment.cash_account_name,
      account_id: payment.cash_account_id,
      account_code: payment.cash_account_code,
      account_name: payment.cash_account_name,
      account_type: 'ASSET',
    }, currentUser, now);

    const nextReversalPayment: CooperativeLoanPayment = withPendingCooperativeSync({
      id: reversalPaymentId,
      payment_number: await createCooperativeLoanPaymentNumber(new Date(now)),
      payment_type: 'REVERSAL',
      loan_id: payment.loan_id,
      loan_number: payment.loan_number,
      installment_id: payment.installment_id,
      member_id: payment.member_id,
      member_number: payment.member_number,
      member_name: payment.member_name,
      amount: payment.amount,
      principal_amount: payment.principal_amount,
      interest_amount: payment.interest_amount,
      penalty_amount: payment.penalty_amount,
      payment_date: now,
      status: 'POSTED',
      cash_account_id: payment.cash_account_id,
      cash_account_code: payment.cash_account_code,
      cash_account_name: payment.cash_account_name,
      payment_method: payment.payment_method,
      payment_channel: payment.payment_channel,
      collector_id: payment.collector_id,
      collector_name: payment.collector_name,
      collector_position: payment.collector_position,
      received_by: currentUser?.id,
      received_by_name: currentUser?.name,
      posted_at: now,
      finance_transaction_id: reversalFinanceTransactionId,
      reversal_of_payment_id: payment.id,
      notes: parsedInput.reason,
      created_at: now,
      updated_at: now,
      created_by: currentUser?.id,
      created_by_name: currentUser?.name,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
    });
    reversalPayment = nextReversalPayment;

    await db.financeTransactions.add(reversalFinanceTransaction);
    await db.cooperativeLoanPayments.add(nextReversalPayment);
    await db.cooperativeLoanInstallments.put(nextInstallment);
    await db.cooperativeLoans.put(nextLoan);
    updatedInstallment = nextInstallment;
    updatedLoan = nextLoan;

    const reversalEntries = payment.journal_entry_id
      ? await reverseCooperativeLoanPaymentJournal(
          payment,
          `Reversal pembayaran angsuran ${payment.payment_number}: ${parsedInput.reason}`,
          currentUser,
          now,
        )
      : [];
    const reversalJournalEntryId = reversalEntries[0]?.id;

    const nextOriginalPayment: CooperativeLoanPayment = withPendingCooperativeSync({
      ...payment,
      status: 'REVERSED' as const,
      reversal_payment_id: nextReversalPayment.id,
      reversal_finance_transaction_id: reversalFinanceTransactionId,
      reversal_journal_entry_id: reversalJournalEntryId,
      reversed_at: now,
      reversal_reason: parsedInput.reason,
      updated_at: now,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
    });
    updatedOriginalPayment = nextOriginalPayment;
    await db.cooperativeLoanPayments.put(nextOriginalPayment);

    if (reversalJournalEntryId) {
      reversalPayment = {
        ...nextReversalPayment,
        journal_entry_id: reversalJournalEntryId,
        updated_at: now,
        sync_status: 'pending',
        sync_error: undefined,
      };
      await db.cooperativeLoanPayments.update(nextReversalPayment.id, {
        journal_entry_id: reversalJournalEntryId,
        updated_at: now,
        sync_status: 'pending',
        sync_error: undefined,
      });
    }

    await writeActivityLog({
      user: currentUser,
      action: 'COOPERATIVE_LOAN_PAYMENT_REVERSED',
      entity: 'cooperativeLoanPayments',
      entity_id: payment.id,
      description: `${currentUser?.name ?? 'User'} reversal pembayaran angsuran ${payment.payment_number}. Alasan: ${parsedInput.reason}`,
    });
  });

  if (!reversalPayment) {
    throw new Error('Reversal pembayaran angsuran gagal disimpan.');
  }
  if (!updatedOriginalPayment || !updatedInstallment || !updatedLoan) {
    throw new Error('Reversal pembayaran angsuran gagal memperbarui pinjaman.');
  }

  if (reversalFinanceTransaction) {
    await enqueueFinanceTransactionsSync([reversalFinanceTransaction], 'create');
  }
  if (autoReturnFinanceTransaction) {
    await enqueueFinanceTransactionsSync([autoReturnFinanceTransaction], 'create');
  }
  if (iptwReversalFinanceTransaction) {
    await enqueueFinanceTransactionsSync([iptwReversalFinanceTransaction], 'create');
  }
  if (autoReturnReversalTransaction) {
    await enqueueCooperativeSavingTransactionsSync([autoReturnReversalTransaction], 'create');
  }
  if (autoReturnOriginalTransaction) {
    await enqueueCooperativeSavingTransactionsSync([autoReturnOriginalTransaction], 'update');
  }
  if (autoReturnBalance) {
    await enqueueCooperativeMemberSavingBalancesSync([autoReturnBalance], 'update');
  }
  await enqueueCooperativeLoanPaymentsSync([reversalPayment], 'create');
  await enqueueCooperativeLoanPaymentsSync([updatedOriginalPayment], 'update');
  await enqueueCooperativeLoanInstallmentsSync([updatedInstallment], 'update');
  await enqueueCooperativeLoansSync([updatedLoan], 'update');

  return reversalPayment;
};

export const listCooperativePaymentApprovalRequests = async () => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'COOPERATIVE_PAYMENT_APPROVE');
  const sessionToken = await getCurrentServerSessionToken();
  if (!sessionToken) return [];

  const requests = await cooperativePostingPostgresAdapter.listApprovalRequests(sessionToken);
  return requests.map(mapRemotePaymentApprovalRequest);
};

const refreshApprovedCooperativePaymentData = async () => {
  await Promise.all([
    refreshCooperativeDataFromPostgres(),
    refreshFinanceTransactionsFromPostgres(),
    refreshJournalEntriesFromPostgres(),
  ]);
};

export const approveCooperativePaymentRequest = async (
  requestId: string,
  notes?: string,
) => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'COOPERATIVE_PAYMENT_APPROVE');
  const sessionToken = await getCurrentServerSessionToken();
  if (!sessionToken) {
    throw new Error('Sesi server tidak tersedia. Silakan logout lalu login kembali.');
  }

  const request = await cooperativePostingPostgresAdapter.approveRequest({
    session_token: sessionToken,
    request_id: requestId,
    notes,
  });
  if (!request) {
    throw new Error('Approval pembayaran tidak menghasilkan data.');
  }
  await refreshApprovedCooperativePaymentData();
  return mapRemotePaymentApprovalRequest(request);
};

export const rejectCooperativePaymentRequest = async (
  requestId: string,
  notes: string,
) => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'COOPERATIVE_PAYMENT_APPROVE');
  const sessionToken = await getCurrentServerSessionToken();
  if (!sessionToken) {
    throw new Error('Sesi server tidak tersedia. Silakan logout lalu login kembali.');
  }

  const request = await cooperativePostingPostgresAdapter.rejectRequest({
    session_token: sessionToken,
    request_id: requestId,
    notes,
  });
  if (!request) {
    throw new Error('Penolakan approval pembayaran tidak menghasilkan data.');
  }
  return mapRemotePaymentApprovalRequest(request);
};
