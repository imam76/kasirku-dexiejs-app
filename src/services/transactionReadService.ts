import { db } from '@/lib/db';
import {
  isPostgresUnavailableError,
  isTauriRuntime,
  transactionPostgresAdapter,
  type RemoteTransactionBundleDto,
  type RemoteTransactionDto,
  type RemoteTransactionItemDto,
} from '@/services/postgresAdapter';
import {
  getLatestLocalRemoteUpdatedAt,
  getLatestRemoteUpdatedAt,
  toTimestamp,
} from '@/services/shared/remoteRefreshCursor';
import type {
  PaymentMethod,
  PosPaymentMode,
  ProductUnit,
  ReceiptPrintStatus,
  SalesUnitCategory,
  Transaction,
  TransactionItem,
  TransactionStatus,
} from '@/types';
import {
  toCanonicalIsoTimestamp,
  toCanonicalOptionalIsoTimestamp,
} from '@/utils/timestamps';

export interface TransactionReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

const EMPTY_TRANSACTION_READ_SYNC_RESULT: TransactionReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
};

const POSTGRES_TRANSACTION_REFRESH_LIMIT = 200;

let isRefreshingTransactionsFromPostgres = false;

const optionalString = (value: string | null | undefined) => value ?? undefined;
const optionalNumber = (value: number | null | undefined) => (
  typeof value === 'number' && Number.isFinite(value) ? value : undefined
);
const optionalBoolean = (value: boolean | null | undefined) => (
  typeof value === 'boolean' ? value : undefined
);

const VALID_PAYMENT_MODES: PosPaymentMode[] = ['SINGLE', 'SPLIT'];
const VALID_PAYMENT_METHODS: PaymentMethod[] = ['TUNAI', 'NON_TUNAI'];
const VALID_TRANSACTION_STATUSES: TransactionStatus[] = ['COMPLETED', 'VOIDED'];
const VALID_RECEIPT_STATUSES: ReceiptPrintStatus[] = ['pending', 'printed', 'print_failed'];

const isPaymentMode = (mode: string | null | undefined): mode is PosPaymentMode => (
  Boolean(mode) && VALID_PAYMENT_MODES.includes(mode as PosPaymentMode)
);

const isPaymentMethod = (method: string | null | undefined): method is PaymentMethod => (
  Boolean(method) && VALID_PAYMENT_METHODS.includes(method as PaymentMethod)
);

const isTransactionStatus = (status: string | null | undefined): status is TransactionStatus => (
  Boolean(status) && VALID_TRANSACTION_STATUSES.includes(status as TransactionStatus)
);

const isReceiptStatus = (status: string | null | undefined): status is ReceiptPrintStatus => (
  Boolean(status) && VALID_RECEIPT_STATUSES.includes(status as ReceiptPrintStatus)
);

const mapRemoteTransactionToLocal = (
  remoteTransaction: RemoteTransactionDto,
  syncedAt: string,
): Transaction => ({
  id: remoteTransaction.id,
  transaction_number: remoteTransaction.transaction_number,
  business_type: remoteTransaction.business_type === 'EXPENSE' ? 'EXPENSE' : 'SALE',
  cashier_session_id: optionalString(remoteTransaction.cashier_session_id),
  cashier_session_number: optionalString(remoteTransaction.cashier_session_number),
  restaurant_session_id: optionalString(remoteTransaction.restaurant_session_id),
  restaurant_session_number: optionalString(remoteTransaction.restaurant_session_number),
  restaurant_order_id: optionalString(remoteTransaction.restaurant_order_id),
  cashier_user_id: optionalString(remoteTransaction.cashier_user_id),
  cashier_user_name: optionalString(remoteTransaction.cashier_user_name),
  member_contact_id: optionalString(remoteTransaction.member_contact_id),
  member_number: optionalString(remoteTransaction.member_number),
  member_name: optionalString(remoteTransaction.member_name),
  member_phone: optionalString(remoteTransaction.member_phone),
  membership_points_earned: optionalNumber(remoteTransaction.membership_points_earned),
  membership_points_redeemed: optionalNumber(remoteTransaction.membership_points_redeemed),
  membership_point_discount_amount: optionalNumber(remoteTransaction.membership_point_discount_amount),
  membership_points_balance_after: optionalNumber(remoteTransaction.membership_points_balance_after),
  subtotal_amount: optionalNumber(remoteTransaction.subtotal_amount),
  discount_amount: optionalNumber(remoteTransaction.discount_amount),
  discount_breakdown: remoteTransaction.discount_breakdown ?? undefined,
  applied_promos_snapshot: remoteTransaction.applied_promos_snapshot ?? undefined,
  total_amount: remoteTransaction.total_amount,
  payment_amount: remoteTransaction.payment_amount,
  change_amount: remoteTransaction.change_amount,
  payment_mode: isPaymentMode(remoteTransaction.payment_mode) ? remoteTransaction.payment_mode : undefined,
  payment_method: isPaymentMethod(remoteTransaction.payment_method) ? remoteTransaction.payment_method : 'TUNAI',
  payment_method_id: optionalString(remoteTransaction.payment_method_id),
  payment_method_code: optionalString(remoteTransaction.payment_method_code),
  payment_method_name: optionalString(remoteTransaction.payment_method_name),
  payment_method_category: remoteTransaction.payment_method_category ?? undefined,
  payment_reference: optionalString(remoteTransaction.payment_reference),
  payment_posting_account_id: optionalString(remoteTransaction.payment_posting_account_id),
  payment_posting_account_code: optionalString(remoteTransaction.payment_posting_account_code),
  payment_posting_account_name: optionalString(remoteTransaction.payment_posting_account_name),
  status: isTransactionStatus(remoteTransaction.status) ? remoteTransaction.status : undefined,
  voided_at: toCanonicalOptionalIsoTimestamp(remoteTransaction.voided_at),
  void_reason: optionalString(remoteTransaction.void_reason),
  receipt_status: isReceiptStatus(remoteTransaction.receipt_status) ? remoteTransaction.receipt_status : undefined,
  receipt_printed_at: toCanonicalOptionalIsoTimestamp(remoteTransaction.receipt_printed_at),
  receipt_print_error: optionalString(remoteTransaction.receipt_print_error),
  created_at: toCanonicalIsoTimestamp(remoteTransaction.created_at),
  updated_at: toCanonicalIsoTimestamp(remoteTransaction.updated_at),
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: toCanonicalIsoTimestamp(remoteTransaction.updated_at),
});

const mapRemoteTransactionItemToLocal = (
  remoteItem: RemoteTransactionItemDto,
): TransactionItem => ({
  id: remoteItem.id,
  transaction_id: remoteItem.transaction_id,
  product_id: remoteItem.product_id,
  product_name: remoteItem.product_name,
  price: remoteItem.price,
  selling_price: optionalNumber(remoteItem.selling_price),
  original_price: optionalNumber(remoteItem.original_price),
  is_price_edited: optionalBoolean(remoteItem.is_price_edited),
  price_edited_by: optionalString(remoteItem.price_edited_by),
  price_edited_at: toCanonicalOptionalIsoTimestamp(remoteItem.price_edited_at),
  purchase_price: remoteItem.purchase_price,
  quantity: remoteItem.quantity,
  unit: remoteItem.unit as ProductUnit,
  unit_id: (remoteItem.unit_id as ProductUnit | null) ?? undefined,
  unit_label: optionalString(remoteItem.unit_label),
  unit_category: (remoteItem.unit_category as SalesUnitCategory | null) ?? undefined,
  conversion_value: optionalNumber(remoteItem.conversion_value),
  base_unit: (remoteItem.base_unit as ProductUnit | null) ?? undefined,
  price_before_discount: optionalNumber(remoteItem.price_before_discount),
  subtotal_before_discount: optionalNumber(remoteItem.subtotal_before_discount),
  discount_amount: optionalNumber(remoteItem.discount_amount),
  subtotal: remoteItem.subtotal,
  profit: remoteItem.profit,
  hpp_status: remoteItem.hpp_status ?? undefined,
  hpp_reconciled_at: toCanonicalOptionalIsoTimestamp(remoteItem.hpp_reconciled_at),
  hpp_variance_amount: optionalNumber(remoteItem.hpp_variance_amount),
  profit_status: remoteItem.profit_status as TransactionItem['profit_status'],
  created_at: toCanonicalIsoTimestamp(remoteItem.created_at),
});

const hasLocalUnsyncedChanges = (transaction: Transaction) => (
  transaction.sync_status === 'pending' || transaction.sync_status === 'failed'
);

const shouldApplyRemoteTransaction = (
  localTransaction: Transaction | undefined,
  remoteTransaction: RemoteTransactionDto,
) => {
  if (!localTransaction) return true;
  if (hasLocalUnsyncedChanges(localTransaction)) return false;

  const localRemoteUpdatedAt = localTransaction.remote_updated_at ?? localTransaction.updated_at;
  const remoteTimestamp = toTimestamp(remoteTransaction.updated_at);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteTransaction.updated_at >= localRemoteUpdatedAt;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

const addTransactionReadSyncResult = (
  aggregate: TransactionReadSyncResult,
  next: TransactionReadSyncResult,
) => {
  aggregate.fetched += next.fetched;
  aggregate.inserted += next.inserted;
  aggregate.updated += next.updated;
  aggregate.skipped += next.skipped;
};

export const mergeRemoteTransactionBundlesIntoDexie = async (
  remoteBundles: RemoteTransactionBundleDto[],
  syncedAt = new Date().toISOString(),
): Promise<TransactionReadSyncResult> => {
  const result: TransactionReadSyncResult = {
    ...EMPTY_TRANSACTION_READ_SYNC_RESULT,
    fetched: remoteBundles.length,
  };
  if (remoteBundles.length === 0) return result;

  await db.transaction('rw', db.transactions, db.transactionItems, async () => {
    for (const remoteBundle of remoteBundles) {
      const localTransaction = await db.transactions.get(remoteBundle.transaction.id);
      if (!shouldApplyRemoteTransaction(localTransaction, remoteBundle.transaction)) {
        result.skipped += 1;
        continue;
      }

      await db.transactions.put(mapRemoteTransactionToLocal(remoteBundle.transaction, syncedAt));
      await db.transactionItems.where('transaction_id').equals(remoteBundle.transaction.id).delete();
      const localItems = remoteBundle.items.map(mapRemoteTransactionItemToLocal);
      if (localItems.length > 0) {
        await db.transactionItems.bulkPut(localItems);
      }

      if (localTransaction) {
        result.updated += 1;
      } else {
        result.inserted += 1;
      }
    }
  });

  return result;
};

const getLatestLocalTransactionUpdatedAt = async () => {
  const transactions = await db.transactions.toArray();
  return getLatestLocalRemoteUpdatedAt(
    transactions,
    (transaction) => transaction.remote_updated_at
      ?? (transaction.sync_status === 'synced' ? transaction.updated_at : undefined),
  );
};

const getLatestRemoteBundleUpdatedAt = (remoteBundles: RemoteTransactionBundleDto[]) => (
  getLatestRemoteUpdatedAt(remoteBundles, (bundle) => bundle.transaction.updated_at)
);

export const refreshTransactionsFromPostgres = async (): Promise<TransactionReadSyncResult> => {
  if (isRefreshingTransactionsFromPostgres || !canReadFromPostgres()) {
    return { ...EMPTY_TRANSACTION_READ_SYNC_RESULT };
  }

  isRefreshingTransactionsFromPostgres = true;
  try {
    const aggregate = { ...EMPTY_TRANSACTION_READ_SYNC_RESULT };
    let updatedAfter = await getLatestLocalTransactionUpdatedAt();

    while (true) {
      const remoteBundles = await transactionPostgresAdapter.list({
        updatedAfter,
        limit: POSTGRES_TRANSACTION_REFRESH_LIMIT,
      });
      const result = await mergeRemoteTransactionBundlesIntoDexie(remoteBundles);
      addTransactionReadSyncResult(aggregate, result);

      if (remoteBundles.length < POSTGRES_TRANSACTION_REFRESH_LIMIT) {
        break;
      }

      const nextUpdatedAfter = getLatestRemoteBundleUpdatedAt(remoteBundles);
      if (!nextUpdatedAfter || nextUpdatedAfter === updatedAfter) {
        break;
      }

      updatedAfter = nextUpdatedAfter;
    }

    return aggregate;
  } catch (error) {
    if (isPostgresUnavailableError(error)) {
      return { ...EMPTY_TRANSACTION_READ_SYNC_RESULT };
    }

    throw error;
  } finally {
    isRefreshingTransactionsFromPostgres = false;
  }
};
