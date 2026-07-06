import { db } from '@/lib/db';
import {
  cooperativeLoanInstallmentPostgresAdapter,
  cooperativeLoanPaymentPostgresAdapter,
  cooperativeLoanPostgresAdapter,
  cooperativeMemberPostgresAdapter,
  cooperativeMemberSavingBalancePostgresAdapter,
  cooperativeSavingTransactionPostgresAdapter,
  isTauriRuntime,
  type RemoteCooperativeLoanDto,
  type RemoteCooperativeLoanInstallmentDto,
  type RemoteCooperativeLoanPaymentDto,
  type RemoteCooperativeMemberDto,
  type RemoteCooperativeMemberSavingBalanceDto,
  type RemoteCooperativeSavingTransactionDto,
} from '@/services/postgresAdapter';
import type {
  CooperativeLoan,
  CooperativeLoanInstallment,
  CooperativeLoanPayment,
  CooperativeMember,
  CooperativeMemberSavingBalance,
  CooperativeSavingTransaction,
} from '@/types';

export interface CooperativeReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

export interface CooperativeReadSyncSummary {
  members: CooperativeReadSyncResult;
  savingTransactions: CooperativeReadSyncResult;
  savingBalances: CooperativeReadSyncResult;
  loans: CooperativeReadSyncResult;
  loanInstallments: CooperativeReadSyncResult;
  loanPayments: CooperativeReadSyncResult;
}

const EMPTY_READ_SYNC_RESULT: CooperativeReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
};

const optionalString = (value: string | null | undefined) => value ?? undefined;
const optionalNumber = (value: number | null | undefined) => value ?? undefined;
const optionalPaymentType = (value: RemoteCooperativeLoanPaymentDto['payment_type']) => value ?? undefined;

let isRefreshingCooperativeDataFromPostgres = false;

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const hasLocalUnsyncedChanges = (item: { sync_status?: string }) => (
  item.sync_status === 'pending' || item.sync_status === 'failed'
);

const shouldApplyRemoteUpdatedAt = (
  localItem: { sync_status?: string; updated_at: string; remote_updated_at?: string } | undefined,
  remoteUpdatedAt: string,
) => {
  if (!localItem) return true;
  if (hasLocalUnsyncedChanges(localItem)) return false;

  const localRemoteUpdatedAt = localItem.remote_updated_at ?? localItem.updated_at;
  const remoteTimestamp = toTimestamp(remoteUpdatedAt);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteUpdatedAt >= localRemoteUpdatedAt;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

const mapRemoteCooperativeMemberToLocal = (
  remoteMember: RemoteCooperativeMemberDto,
  syncedAt: string,
): CooperativeMember => ({
  id: remoteMember.id,
  member_number: remoteMember.member_number,
  name: remoteMember.name,
  identity_number: optionalString(remoteMember.identity_number),
  phone: optionalString(remoteMember.phone),
  address: optionalString(remoteMember.address),
  area_id: optionalString(remoteMember.area_id),
  area_name: optionalString(remoteMember.area_name),
  area_code: optionalString(remoteMember.area_code),
  officer_id: optionalString(remoteMember.officer_id),
  officer_name: optionalString(remoteMember.officer_name),
  officer_position: optionalString(remoteMember.officer_position),
  join_date: remoteMember.join_date,
  status: remoteMember.status,
  notes: optionalString(remoteMember.notes),
  created_at: remoteMember.created_at,
  updated_at: remoteMember.updated_at,
  created_by: optionalString(remoteMember.created_by),
  created_by_name: optionalString(remoteMember.created_by_name),
  updated_by: optionalString(remoteMember.updated_by),
  updated_by_name: optionalString(remoteMember.updated_by_name),
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteMember.updated_at,
});

const mapRemoteCooperativeSavingTransactionToLocal = (
  remoteTransaction: RemoteCooperativeSavingTransactionDto,
  syncedAt: string,
): CooperativeSavingTransaction => ({
  id: remoteTransaction.id,
  member_id: remoteTransaction.member_id,
  member_number: remoteTransaction.member_number,
  member_name: remoteTransaction.member_name,
  saving_type: remoteTransaction.saving_type,
  transaction_type: remoteTransaction.transaction_type,
  withdrawal_source: remoteTransaction.withdrawal_source ?? undefined,
  interest_rate_per_month: remoteTransaction.interest_rate_per_month ?? undefined,
  amount: remoteTransaction.amount,
  transaction_date: remoteTransaction.transaction_date,
  status: remoteTransaction.status,
  cash_account_id: optionalString(remoteTransaction.cash_account_id),
  cash_account_code: optionalString(remoteTransaction.cash_account_code),
  cash_account_name: optionalString(remoteTransaction.cash_account_name),
  payment_method: remoteTransaction.payment_method ?? undefined,
  payment_channel: optionalString(remoteTransaction.payment_channel),
  finance_transaction_id: optionalString(remoteTransaction.finance_transaction_id),
  journal_entry_id: optionalString(remoteTransaction.journal_entry_id),
  reversal_of_transaction_id: optionalString(remoteTransaction.reversal_of_transaction_id),
  reversal_transaction_id: optionalString(remoteTransaction.reversal_transaction_id),
  reversal_finance_transaction_id: optionalString(remoteTransaction.reversal_finance_transaction_id),
  reversal_journal_entry_id: optionalString(remoteTransaction.reversal_journal_entry_id),
  reversed_at: optionalString(remoteTransaction.reversed_at),
  reversal_reason: optionalString(remoteTransaction.reversal_reason),
  notes: optionalString(remoteTransaction.notes),
  created_at: remoteTransaction.created_at,
  updated_at: remoteTransaction.updated_at,
  created_by: optionalString(remoteTransaction.created_by),
  created_by_name: optionalString(remoteTransaction.created_by_name),
  updated_by: optionalString(remoteTransaction.updated_by),
  updated_by_name: optionalString(remoteTransaction.updated_by_name),
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteTransaction.updated_at,
});

const mapRemoteCooperativeMemberSavingBalanceToLocal = (
  remoteBalance: RemoteCooperativeMemberSavingBalanceDto,
  syncedAt: string,
): CooperativeMemberSavingBalance => ({
  id: remoteBalance.id,
  member_id: remoteBalance.member_id,
  member_number: remoteBalance.member_number,
  member_name: remoteBalance.member_name,
  saving_type: remoteBalance.saving_type,
  balance: remoteBalance.balance,
  updated_at: remoteBalance.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteBalance.updated_at,
});

const mapRemoteCooperativeLoanToLocal = (
  remoteLoan: RemoteCooperativeLoanDto,
  syncedAt: string,
): CooperativeLoan => ({
  id: remoteLoan.id,
  loan_number: remoteLoan.loan_number,
  member_id: remoteLoan.member_id,
  member_number: remoteLoan.member_number,
  member_name: remoteLoan.member_name,
  principal_amount: remoteLoan.principal_amount,
  interest_rate_per_month: remoteLoan.interest_rate_per_month,
  tenor_months: remoteLoan.tenor_months,
  interest_calculation_type: remoteLoan.interest_calculation_type ?? 'MONTHLY_RATE',
  billing_frequency: remoteLoan.billing_frequency ?? 'MONTHLY',
  installment_count: remoteLoan.installment_count ?? remoteLoan.tenor_months,
  loan_service_rate: remoteLoan.loan_service_rate ?? remoteLoan.interest_rate_per_month,
  loan_service_amount: remoteLoan.loan_service_amount ?? remoteLoan.total_interest_amount,
  admin_fee_rate: remoteLoan.admin_fee_rate ?? 0,
  admin_fee_amount: remoteLoan.admin_fee_amount ?? 0,
  mandatory_saving_rate: remoteLoan.mandatory_saving_rate ?? 0,
  mandatory_saving_amount: remoteLoan.mandatory_saving_amount ?? 0,
  deduction_method: remoteLoan.deduction_method ?? 'NONE',
  net_disbursement_amount: remoteLoan.net_disbursement_amount ?? remoteLoan.principal_amount,
  total_interest_amount: remoteLoan.total_interest_amount,
  total_payable_amount: remoteLoan.total_payable_amount,
  outstanding_principal_amount: remoteLoan.outstanding_principal_amount,
  outstanding_interest_amount: remoteLoan.outstanding_interest_amount,
  outstanding_penalty_amount: remoteLoan.outstanding_penalty_amount,
  status: remoteLoan.status,
  application_date: remoteLoan.application_date,
  approved_at: optionalString(remoteLoan.approved_at),
  approved_by: optionalString(remoteLoan.approved_by),
  approved_by_name: optionalString(remoteLoan.approved_by_name),
  approval_notes: optionalString(remoteLoan.approval_notes),
  rejected_at: optionalString(remoteLoan.rejected_at),
  rejected_by: optionalString(remoteLoan.rejected_by),
  rejected_by_name: optionalString(remoteLoan.rejected_by_name),
  rejection_reason: optionalString(remoteLoan.rejection_reason),
  disbursed_at: optionalString(remoteLoan.disbursed_at),
  officer_id: optionalString(remoteLoan.officer_id),
  officer_name: optionalString(remoteLoan.officer_name),
  officer_position: optionalString(remoteLoan.officer_position),
  area_id: optionalString(remoteLoan.area_id),
  area_name: optionalString(remoteLoan.area_name),
  area_code: optionalString(remoteLoan.area_code),
  collection_schedule_id: optionalString(remoteLoan.collection_schedule_id),
  collection_weekday: remoteLoan.collection_weekday ?? undefined,
  cash_account_id: optionalString(remoteLoan.cash_account_id),
  cash_account_code: optionalString(remoteLoan.cash_account_code),
  cash_account_name: optionalString(remoteLoan.cash_account_name),
  payment_method: remoteLoan.payment_method ?? undefined,
  payment_channel: optionalString(remoteLoan.payment_channel),
  finance_transaction_id: optionalString(remoteLoan.finance_transaction_id),
  journal_entry_id: optionalString(remoteLoan.journal_entry_id),
  disbursement_notes: optionalString(remoteLoan.disbursement_notes),
  notes: optionalString(remoteLoan.notes),
  created_at: remoteLoan.created_at,
  updated_at: remoteLoan.updated_at,
  created_by: optionalString(remoteLoan.created_by),
  created_by_name: optionalString(remoteLoan.created_by_name),
  updated_by: optionalString(remoteLoan.updated_by),
  updated_by_name: optionalString(remoteLoan.updated_by_name),
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteLoan.updated_at,
});

const mapRemoteCooperativeLoanInstallmentToLocal = (
  remoteInstallment: RemoteCooperativeLoanInstallmentDto,
  syncedAt: string,
): CooperativeLoanInstallment => ({
  id: remoteInstallment.id,
  loan_id: remoteInstallment.loan_id,
  loan_number: remoteInstallment.loan_number,
  member_id: remoteInstallment.member_id,
  member_number: remoteInstallment.member_number,
  member_name: remoteInstallment.member_name,
  installment_number: remoteInstallment.installment_number,
  due_date: remoteInstallment.due_date,
  principal_amount: remoteInstallment.principal_amount,
  interest_amount: remoteInstallment.interest_amount,
  penalty_amount: remoteInstallment.penalty_amount,
  paid_principal_amount: remoteInstallment.paid_principal_amount,
  paid_interest_amount: remoteInstallment.paid_interest_amount,
  paid_penalty_amount: remoteInstallment.paid_penalty_amount,
  status: remoteInstallment.status,
  paid_at: optionalString(remoteInstallment.paid_at),
  collection_status: remoteInstallment.collection_status ?? 'NONE',
  follow_up_date: optionalString(remoteInstallment.follow_up_date),
  collection_notes: optionalString(remoteInstallment.collection_notes),
  last_contacted_at: optionalString(remoteInstallment.last_contacted_at),
  created_at: remoteInstallment.created_at,
  updated_at: remoteInstallment.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteInstallment.updated_at,
});

const mapRemoteCooperativeLoanPaymentToLocal = (
  remotePayment: RemoteCooperativeLoanPaymentDto,
  syncedAt: string,
): CooperativeLoanPayment => ({
  id: remotePayment.id,
  payment_number: remotePayment.payment_number,
  payment_type: optionalPaymentType(remotePayment.payment_type),
  payment_group_id: optionalString(remotePayment.payment_group_id),
  payment_group_number: optionalString(remotePayment.payment_group_number),
  payment_group_sequence: optionalNumber(remotePayment.payment_group_sequence),
  payment_group_total: optionalNumber(remotePayment.payment_group_total),
  loan_id: remotePayment.loan_id,
  loan_number: remotePayment.loan_number,
  installment_id: optionalString(remotePayment.installment_id),
  member_id: remotePayment.member_id,
  member_number: remotePayment.member_number,
  member_name: remotePayment.member_name,
  amount: remotePayment.amount,
  principal_amount: remotePayment.principal_amount,
  interest_amount: remotePayment.interest_amount,
  penalty_amount: remotePayment.penalty_amount,
  payment_date: remotePayment.payment_date,
  status: remotePayment.status,
  cash_account_id: optionalString(remotePayment.cash_account_id),
  cash_account_code: optionalString(remotePayment.cash_account_code),
  cash_account_name: optionalString(remotePayment.cash_account_name),
  payment_method: remotePayment.payment_method ?? undefined,
  payment_channel: optionalString(remotePayment.payment_channel),
  collector_id: optionalString(remotePayment.collector_id),
  collector_name: optionalString(remotePayment.collector_name),
  collector_position: optionalString(remotePayment.collector_position),
  received_by: optionalString(remotePayment.received_by),
  received_by_name: optionalString(remotePayment.received_by_name),
  posted_at: optionalString(remotePayment.posted_at),
  finance_transaction_id: optionalString(remotePayment.finance_transaction_id),
  journal_entry_id: optionalString(remotePayment.journal_entry_id),
  reversal_of_payment_id: optionalString(remotePayment.reversal_of_payment_id),
  reversal_payment_id: optionalString(remotePayment.reversal_payment_id),
  reversal_finance_transaction_id: optionalString(remotePayment.reversal_finance_transaction_id),
  reversal_journal_entry_id: optionalString(remotePayment.reversal_journal_entry_id),
  reversed_at: optionalString(remotePayment.reversed_at),
  reversal_reason: optionalString(remotePayment.reversal_reason),
  notes: optionalString(remotePayment.notes),
  created_at: remotePayment.created_at,
  updated_at: remotePayment.updated_at,
  created_by: optionalString(remotePayment.created_by),
  created_by_name: optionalString(remotePayment.created_by_name),
  updated_by: optionalString(remotePayment.updated_by),
  updated_by_name: optionalString(remotePayment.updated_by_name),
  idempotency_key: optionalString(remotePayment.idempotency_key),
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remotePayment.updated_at,
});

export const mergeRemoteCooperativeMembersIntoDexie = async (
  remoteMembers: RemoteCooperativeMemberDto[],
  syncedAt = new Date().toISOString(),
): Promise<CooperativeReadSyncResult> => {
  const result = { ...EMPTY_READ_SYNC_RESULT, fetched: remoteMembers.length };
  if (remoteMembers.length === 0) return result;

  await db.transaction('rw', db.cooperativeMembers, async () => {
    const membersToPut: CooperativeMember[] = [];
    for (const remoteMember of remoteMembers) {
      const localMember = await db.cooperativeMembers.get(remoteMember.id);
      if (!shouldApplyRemoteUpdatedAt(localMember, remoteMember.updated_at)) {
        result.skipped += 1;
        continue;
      }
      membersToPut.push(mapRemoteCooperativeMemberToLocal(remoteMember, syncedAt));
      if (localMember) result.updated += 1;
      else result.inserted += 1;
    }
    if (membersToPut.length > 0) await db.cooperativeMembers.bulkPut(membersToPut);
  });

  return result;
};

export const mergeRemoteCooperativeSavingTransactionsIntoDexie = async (
  remoteTransactions: RemoteCooperativeSavingTransactionDto[],
  syncedAt = new Date().toISOString(),
): Promise<CooperativeReadSyncResult> => {
  const result = { ...EMPTY_READ_SYNC_RESULT, fetched: remoteTransactions.length };
  if (remoteTransactions.length === 0) return result;

  await db.transaction('rw', db.cooperativeSavingTransactions, async () => {
    const transactionsToPut: CooperativeSavingTransaction[] = [];
    for (const remoteTransaction of remoteTransactions) {
      const localTransaction = await db.cooperativeSavingTransactions.get(remoteTransaction.id);
      if (!shouldApplyRemoteUpdatedAt(localTransaction, remoteTransaction.updated_at)) {
        result.skipped += 1;
        continue;
      }
      transactionsToPut.push(mapRemoteCooperativeSavingTransactionToLocal(remoteTransaction, syncedAt));
      if (localTransaction) result.updated += 1;
      else result.inserted += 1;
    }
    if (transactionsToPut.length > 0) await db.cooperativeSavingTransactions.bulkPut(transactionsToPut);
  });

  return result;
};

export const mergeRemoteCooperativeMemberSavingBalancesIntoDexie = async (
  remoteBalances: RemoteCooperativeMemberSavingBalanceDto[],
  syncedAt = new Date().toISOString(),
): Promise<CooperativeReadSyncResult> => {
  const result = { ...EMPTY_READ_SYNC_RESULT, fetched: remoteBalances.length };
  if (remoteBalances.length === 0) return result;

  await db.transaction('rw', db.cooperativeMemberSavingBalances, async () => {
    const balancesToPut: CooperativeMemberSavingBalance[] = [];
    for (const remoteBalance of remoteBalances) {
      const localBalance = await db.cooperativeMemberSavingBalances.get(remoteBalance.id);
      if (!shouldApplyRemoteUpdatedAt(localBalance, remoteBalance.updated_at)) {
        result.skipped += 1;
        continue;
      }
      balancesToPut.push(mapRemoteCooperativeMemberSavingBalanceToLocal(remoteBalance, syncedAt));
      if (localBalance) result.updated += 1;
      else result.inserted += 1;
    }
    if (balancesToPut.length > 0) await db.cooperativeMemberSavingBalances.bulkPut(balancesToPut);
  });

  return result;
};

export const mergeRemoteCooperativeLoansIntoDexie = async (
  remoteLoans: RemoteCooperativeLoanDto[],
  syncedAt = new Date().toISOString(),
): Promise<CooperativeReadSyncResult> => {
  const result = { ...EMPTY_READ_SYNC_RESULT, fetched: remoteLoans.length };
  if (remoteLoans.length === 0) return result;

  await db.transaction('rw', db.cooperativeLoans, async () => {
    const loansToPut: CooperativeLoan[] = [];
    for (const remoteLoan of remoteLoans) {
      const localLoan = await db.cooperativeLoans.get(remoteLoan.id);
      if (!shouldApplyRemoteUpdatedAt(localLoan, remoteLoan.updated_at)) {
        result.skipped += 1;
        continue;
      }
      loansToPut.push(mapRemoteCooperativeLoanToLocal(remoteLoan, syncedAt));
      if (localLoan) result.updated += 1;
      else result.inserted += 1;
    }
    if (loansToPut.length > 0) await db.cooperativeLoans.bulkPut(loansToPut);
  });

  return result;
};

export const mergeRemoteCooperativeLoanInstallmentsIntoDexie = async (
  remoteInstallments: RemoteCooperativeLoanInstallmentDto[],
  syncedAt = new Date().toISOString(),
): Promise<CooperativeReadSyncResult> => {
  const result = { ...EMPTY_READ_SYNC_RESULT, fetched: remoteInstallments.length };
  if (remoteInstallments.length === 0) return result;

  await db.transaction('rw', db.cooperativeLoanInstallments, async () => {
    const installmentsToPut: CooperativeLoanInstallment[] = [];
    for (const remoteInstallment of remoteInstallments) {
      const localInstallment = await db.cooperativeLoanInstallments.get(remoteInstallment.id);
      if (!shouldApplyRemoteUpdatedAt(localInstallment, remoteInstallment.updated_at)) {
        result.skipped += 1;
        continue;
      }
      installmentsToPut.push(mapRemoteCooperativeLoanInstallmentToLocal(remoteInstallment, syncedAt));
      if (localInstallment) result.updated += 1;
      else result.inserted += 1;
    }
    if (installmentsToPut.length > 0) await db.cooperativeLoanInstallments.bulkPut(installmentsToPut);
  });

  return result;
};

export const mergeRemoteCooperativeLoanPaymentsIntoDexie = async (
  remotePayments: RemoteCooperativeLoanPaymentDto[],
  syncedAt = new Date().toISOString(),
): Promise<CooperativeReadSyncResult> => {
  const result = { ...EMPTY_READ_SYNC_RESULT, fetched: remotePayments.length };
  if (remotePayments.length === 0) return result;

  await db.transaction('rw', db.cooperativeLoanPayments, async () => {
    const paymentsToPut: CooperativeLoanPayment[] = [];
    for (const remotePayment of remotePayments) {
      const localPayment = await db.cooperativeLoanPayments.get(remotePayment.id);
      if (!shouldApplyRemoteUpdatedAt(localPayment, remotePayment.updated_at)) {
        result.skipped += 1;
        continue;
      }
      paymentsToPut.push(mapRemoteCooperativeLoanPaymentToLocal(remotePayment, syncedAt));
      if (localPayment) result.updated += 1;
      else result.inserted += 1;
    }
    if (paymentsToPut.length > 0) await db.cooperativeLoanPayments.bulkPut(paymentsToPut);
  });

  return result;
};

export const refreshCooperativeDataFromPostgres = async (): Promise<CooperativeReadSyncSummary> => {
  const emptySummary: CooperativeReadSyncSummary = {
    members: { ...EMPTY_READ_SYNC_RESULT },
    savingTransactions: { ...EMPTY_READ_SYNC_RESULT },
    savingBalances: { ...EMPTY_READ_SYNC_RESULT },
    loans: { ...EMPTY_READ_SYNC_RESULT },
    loanInstallments: { ...EMPTY_READ_SYNC_RESULT },
    loanPayments: { ...EMPTY_READ_SYNC_RESULT },
  };

  if (isRefreshingCooperativeDataFromPostgres || !canReadFromPostgres()) {
    return emptySummary;
  }

  isRefreshingCooperativeDataFromPostgres = true;
  try {
    return {
      members: await mergeRemoteCooperativeMembersIntoDexie(await cooperativeMemberPostgresAdapter.list()),
      savingTransactions: await mergeRemoteCooperativeSavingTransactionsIntoDexie(await cooperativeSavingTransactionPostgresAdapter.list()),
      savingBalances: await mergeRemoteCooperativeMemberSavingBalancesIntoDexie(await cooperativeMemberSavingBalancePostgresAdapter.list()),
      loans: await mergeRemoteCooperativeLoansIntoDexie(await cooperativeLoanPostgresAdapter.list()),
      loanInstallments: await mergeRemoteCooperativeLoanInstallmentsIntoDexie(await cooperativeLoanInstallmentPostgresAdapter.list()),
      loanPayments: await mergeRemoteCooperativeLoanPaymentsIntoDexie(await cooperativeLoanPaymentPostgresAdapter.list()),
    };
  } finally {
    isRefreshingCooperativeDataFromPostgres = false;
  }
};
