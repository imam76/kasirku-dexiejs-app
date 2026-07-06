import { getFinanceTransactionBusinessType } from '@/constants/finance';
import { db } from '@/lib/db';
import {
  financeTransactionPostgresAdapter,
  isTauriRuntime,
  type RemoteFinanceTransactionDto,
} from '@/services/postgresAdapter';
import type {
  AccountType,
  CooperativeFieldCashMovementKind,
  FinanceTransaction,
  FinanceTransactionType,
  PaymentMethod,
} from '@/types';

export interface FinanceTransactionReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  deleted: number;
  skipped: number;
}

const EMPTY_FINANCE_TRANSACTION_READ_SYNC_RESULT: FinanceTransactionReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  deleted: 0,
  skipped: 0,
};

const VALID_FINANCE_TRANSACTION_TYPES: FinanceTransactionType[] = ['INCOME', 'EXPENSE', 'OPENING_BALANCE'];
const VALID_PAYMENT_METHODS: PaymentMethod[] = ['TUNAI', 'NON_TUNAI'];
const VALID_ACCOUNT_TYPES: AccountType[] = ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'CONTRA_REVENUE', 'EXPENSE'];
const VALID_TRANSFER_DIRECTIONS: Array<NonNullable<FinanceTransaction['transfer_direction']>> = ['OUT', 'IN'];
const VALID_FIELD_CASH_MOVEMENT_KINDS: CooperativeFieldCashMovementKind[] = [
  'DROPPING_FROM_FINANCE',
  'STORTING_LOAN_PAYMENT',
  'STORTING_SAVING_DEPOSIT',
  'LOAN_DISBURSEMENT',
  'SAVING_WITHDRAWAL',
  'IPTW_PAYOUT',
  'DEPOSIT_TO_FINANCE',
];

let isRefreshingFinanceTransactionsFromPostgres = false;

const optionalString = (value: string | null | undefined) => value ?? undefined;
const optionalNumber = (value: number | null | undefined) => (
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
);

const isFinanceTransactionType = (type: string): type is FinanceTransactionType => (
  VALID_FINANCE_TRANSACTION_TYPES.includes(type as FinanceTransactionType)
);

const isPaymentMethod = (method: string | null | undefined): method is PaymentMethod => (
  Boolean(method) && VALID_PAYMENT_METHODS.includes(method as PaymentMethod)
);

const isAccountType = (type: string | null | undefined): type is AccountType => (
  Boolean(type) && VALID_ACCOUNT_TYPES.includes(type as AccountType)
);

const isTransferDirection = (
  direction: string | null | undefined,
): direction is NonNullable<FinanceTransaction['transfer_direction']> => (
  Boolean(direction) &&
  VALID_TRANSFER_DIRECTIONS.includes(direction as NonNullable<FinanceTransaction['transfer_direction']>)
);

const isFieldCashMovementKind = (
  kind: string | null | undefined,
): kind is CooperativeFieldCashMovementKind => (
  Boolean(kind) &&
  VALID_FIELD_CASH_MOVEMENT_KINDS.includes(kind as CooperativeFieldCashMovementKind)
);

const toPositiveVersion = (version: number | null | undefined) => (
  typeof version === 'number' && Number.isFinite(version) && version > 0 ? version : 1
);

const mapRemoteFinanceTransactionToLocal = (
  remoteTransaction: RemoteFinanceTransactionDto,
  syncedAt: string,
): FinanceTransaction => ({
  id: remoteTransaction.id,
  type: isFinanceTransactionType(remoteTransaction.type) ? remoteTransaction.type : 'EXPENSE',
  category: remoteTransaction.category,
  amount: optionalNumber(remoteTransaction.amount) ?? 0,
  description: remoteTransaction.description,
  created_at: remoteTransaction.created_at,
  reference_id: optionalString(remoteTransaction.reference_id),
  account_id: optionalString(remoteTransaction.account_id),
  account_code: optionalString(remoteTransaction.account_code),
  account_name: optionalString(remoteTransaction.account_name),
  account_type: isAccountType(remoteTransaction.account_type) ? remoteTransaction.account_type : undefined,
  payment_method: isPaymentMethod(remoteTransaction.payment_method) ? remoteTransaction.payment_method : undefined,
  payment_channel: optionalString(remoteTransaction.payment_channel),
  cash_account_id: optionalString(remoteTransaction.cash_account_id),
  cash_account_code: optionalString(remoteTransaction.cash_account_code),
  cash_account_name: optionalString(remoteTransaction.cash_account_name),
  transfer_group_id: optionalString(remoteTransaction.transfer_group_id),
  transfer_direction: isTransferDirection(remoteTransaction.transfer_direction)
    ? remoteTransaction.transfer_direction
    : undefined,
  reversal_of_transfer_group_id: optionalString(remoteTransaction.reversal_of_transfer_group_id),
  field_cash_session_id: optionalString(remoteTransaction.field_cash_session_id),
  field_cash_session_number: optionalString(remoteTransaction.field_cash_session_number),
  field_employee_id: optionalString(remoteTransaction.field_employee_id),
  field_employee_name: optionalString(remoteTransaction.field_employee_name),
  field_cash_movement_kind: isFieldCashMovementKind(remoteTransaction.field_cash_movement_kind)
    ? remoteTransaction.field_cash_movement_kind
    : undefined,
  cash_bank_reconciliation_id: optionalString(remoteTransaction.cash_bank_reconciliation_id),
  cash_bank_reconciled_at: optionalString(remoteTransaction.cash_bank_reconciled_at),
  cash_bank_reconciled_by: optionalString(remoteTransaction.cash_bank_reconciled_by),
  cash_bank_reconciled_by_name: optionalString(remoteTransaction.cash_bank_reconciled_by_name),
  version: toPositiveVersion(remoteTransaction.version),
  created_by: optionalString(remoteTransaction.created_by),
  created_by_name: optionalString(remoteTransaction.created_by_name),
  updated_by: optionalString(remoteTransaction.updated_by),
  updated_by_name: optionalString(remoteTransaction.updated_by_name),
  updated_at: remoteTransaction.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remoteTransaction.updated_at,
});

const hasLocalUnsyncedChanges = (transaction: FinanceTransaction) => (
  transaction.sync_status === 'pending' || transaction.sync_status === 'failed'
);

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const shouldApplyRemoteFinanceTransaction = (
  localTransaction: FinanceTransaction | undefined,
  remoteTransaction: RemoteFinanceTransactionDto,
) => {
  if (!localTransaction) return true;
  if (hasLocalUnsyncedChanges(localTransaction)) return false;

  const localVersion = toPositiveVersion(localTransaction.version);
  const remoteVersion = toPositiveVersion(remoteTransaction.version);
  if (remoteVersion !== localVersion) {
    return remoteVersion > localVersion;
  }

  const localRemoteUpdatedAt = localTransaction.remote_updated_at ?? localTransaction.updated_at ?? localTransaction.created_at;
  const remoteTimestamp = toTimestamp(remoteTransaction.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteTransaction.updated_at >= localRemoteUpdatedAt;
};

const recalculateFinanceBalanceFromTransactions = async (updatedAt: string) => {
  const transactions = await db.financeTransactions.toArray();
  const amount = transactions.reduce((runningBalance, transaction) => {
    const businessType = getFinanceTransactionBusinessType(transaction);

    if (businessType === 'INCOME' || businessType === 'OPENING_BALANCE') {
      return runningBalance + Number(transaction.amount || 0);
    }

    if (businessType === 'EXPENSE') {
      return runningBalance - Number(transaction.amount || 0);
    }

    return runningBalance;
  }, 0);

  await db.financeBalance.put({
    id: 'current',
    amount,
    updated_at: updatedAt,
  });
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

export const mergeRemoteFinanceTransactionsIntoDexie = async (
  remoteTransactions: RemoteFinanceTransactionDto[],
  syncedAt = new Date().toISOString(),
): Promise<FinanceTransactionReadSyncResult> => {
  const result: FinanceTransactionReadSyncResult = {
    ...EMPTY_FINANCE_TRANSACTION_READ_SYNC_RESULT,
    fetched: remoteTransactions.length,
  };
  if (remoteTransactions.length === 0) return result;

  let changed = false;

  await db.transaction('rw', db.financeTransactions, db.financeBalance, async () => {
    for (const remoteTransaction of remoteTransactions) {
      const localTransaction = await db.financeTransactions.get(remoteTransaction.id);
      if (!shouldApplyRemoteFinanceTransaction(localTransaction, remoteTransaction)) {
        result.skipped += 1;
        continue;
      }

      if (remoteTransaction.deleted_at) {
        if (localTransaction) {
          await db.financeTransactions.delete(remoteTransaction.id);
          result.deleted += 1;
          changed = true;
        } else {
          result.skipped += 1;
        }
        continue;
      }

      await db.financeTransactions.put(mapRemoteFinanceTransactionToLocal(remoteTransaction, syncedAt));
      changed = true;

      if (localTransaction) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }

    if (changed) {
      await recalculateFinanceBalanceFromTransactions(syncedAt);
    }
  });

  return result;
};

export const refreshFinanceTransactionsFromPostgres = async (): Promise<FinanceTransactionReadSyncResult> => {
  if (isRefreshingFinanceTransactionsFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_FINANCE_TRANSACTION_READ_SYNC_RESULT };
  }

  isRefreshingFinanceTransactionsFromPostgres = true;
  try {
    const remoteTransactions = await financeTransactionPostgresAdapter.list();
    return mergeRemoteFinanceTransactionsIntoDexie(remoteTransactions);
  } finally {
    isRefreshingFinanceTransactionsFromPostgres = false;
  }
};
