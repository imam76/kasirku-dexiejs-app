import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import type {
  RestaurantSession,
  RestaurantSessionBalanceStatus,
  Transaction,
  PosTransactionPayment,
} from '@/types';
import { summarizeSessionTransactions, type CashierSessionPaymentBreakdown } from '@/services/cashierSessionService';

export interface OpenRestaurantSessionInput {
  opening_cash_amount: number;
  opening_note?: string;
}

export interface CloseRestaurantSessionInput {
  session_id: string;
  closing_cash_amount: number;
  closing_note?: string;
}

export interface RestaurantSessionReconciliation {
  opening_cash_amount: number;
  cash_sales_amount: number;
  non_cash_sales_amount: number;
  total_sales_amount: number;
  voided_sales_amount: number;
  transaction_count: number;
  voided_transaction_count: number;
  expected_cash_amount: number;
  closing_cash_amount: number;
  cash_difference_amount: number;
  balance_status: RestaurantSessionBalanceStatus;
  payment_method_breakdown: CashierSessionPaymentBreakdown[];
}

const normalizeAmount = (value: number, fieldName: string) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${fieldName} tidak valid.`);
  }
  return amount;
};

const buildRestaurantSessionNumber = (date = new Date()) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  const suffix = crypto.randomUUID().slice(0, 4).toUpperCase();
  return `RS-${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}-${suffix}`;
};

export const getOpenRestaurantSessionForCurrentUser = async (expectedUserId?: string) => {
  const currentUser = await getCurrentSessionUser();
  if (!currentUser) return null;
  if (expectedUserId && currentUser.id !== expectedUserId) return null;

  return (await db.restaurantSessions
    .where('operator_user_id')
    .equals(currentUser.id)
    .and((session) => session.status === 'OPEN')
    .first()) ?? null;
};

export const openRestaurantSession = async (
  input: OpenRestaurantSessionInput,
): Promise<RestaurantSession> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'CASHIER_ACCESS');
  if (!currentUser) throw new Error('Sesi user tidak ditemukan.');

  const existingSession = await getOpenRestaurantSessionForCurrentUser(currentUser.id);
  if (existingSession) {
    throw new Error('Masih ada sesi Resto yang terbuka untuk user ini.');
  }

  const now = new Date().toISOString();
  const session: RestaurantSession = {
    id: crypto.randomUUID(),
    session_number: buildRestaurantSessionNumber(),
    status: 'OPEN',
    operator_user_id: currentUser.id,
    operator_user_name: currentUser.name,
    opened_at: now,
    opening_cash_amount: normalizeAmount(input.opening_cash_amount, 'Saldo awal kas'),
    opening_note: input.opening_note?.trim() || undefined,
    created_at: now,
    updated_at: now,
  };

  await db.restaurantSessions.add(session);
  await writeActivityLog({
    user: currentUser,
    action: 'RESTAURANT_SESSION_OPENED',
    entity: 'restaurantSessions',
    entity_id: session.id,
    description: `${currentUser.name} membuka sesi Resto ${session.session_number}.`,
  });
  return session;
};

export const summarizeRestaurantSessionTransactions = (
  transactions: Transaction[],
  payments: PosTransactionPayment[] = [],
) => summarizeSessionTransactions(transactions, payments);

export const calculateRestaurantSessionReconciliation = async (
  sessionId: string,
  closingCashAmount = 0,
): Promise<RestaurantSessionReconciliation> => {
  const session = await db.restaurantSessions.get(sessionId);
  if (!session) throw new Error('Sesi Resto tidak ditemukan.');

  const transactions = await db.transactions
    .where('restaurant_session_id')
    .equals(session.id)
    .toArray();
  const transactionIds = transactions.map((transaction) => transaction.id);
  const payments = transactionIds.length > 0
    ? await db.posTransactionPayments.where('transaction_id').anyOf(transactionIds).toArray()
    : [];
  const summary = summarizeRestaurantSessionTransactions(transactions, payments);
  const normalizedClosingCashAmount = normalizeAmount(closingCashAmount, 'Uang fisik');
  const expectedCashAmount = Number(session.opening_cash_amount || 0) + summary.cashSalesAmount;
  const cashDifferenceAmount = normalizedClosingCashAmount - expectedCashAmount;

  return {
    opening_cash_amount: Number(session.opening_cash_amount || 0),
    cash_sales_amount: summary.cashSalesAmount,
    non_cash_sales_amount: summary.nonCashSalesAmount,
    total_sales_amount: summary.totalSalesAmount,
    voided_sales_amount: summary.voidedSalesAmount,
    transaction_count: summary.transactionCount,
    voided_transaction_count: summary.voidedTransactionCount,
    expected_cash_amount: expectedCashAmount,
    closing_cash_amount: normalizedClosingCashAmount,
    cash_difference_amount: cashDifferenceAmount,
    balance_status: cashDifferenceAmount === 0 ? 'BALANCED' : 'NON_BALANCED',
    payment_method_breakdown: summary.paymentMethodBreakdown,
  };
};

export const closeRestaurantSession = async (
  input: CloseRestaurantSessionInput,
): Promise<RestaurantSession> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'CASHIER_ACCESS');
  if (!currentUser) throw new Error('Sesi user tidak ditemukan.');

  const session = await db.restaurantSessions.get(input.session_id);
  if (!session) throw new Error('Sesi Resto tidak ditemukan.');
  if (session.status !== 'OPEN') throw new Error('Sesi Resto sudah ditutup.');
  if (session.operator_user_id !== currentUser.id) {
    throw new Error('Sesi Resto ini bukan milik user yang sedang login.');
  }

  const openOrders = await db.restaurantOrders
    .where('restaurant_session_id')
    .equals(session.id)
    .and((order) => order.status !== 'PAID' && order.status !== 'CANCELLED')
    .toArray();
  const unpaidOrders = openOrders.filter((order) => order.lines.length > 0);
  if (unpaidOrders.length > 0) {
    const orderNumbers = unpaidOrders.slice(0, 5).map((order) => order.order_number).join(', ');
    throw new Error(`Selesaikan pesanan aktif sebelum menutup Resto: ${orderNumbers}.`);
  }
  const emptyDrafts = openOrders.filter((order) => order.status === 'DRAFT' && order.lines.length === 0);

  const closingCashAmount = normalizeAmount(input.closing_cash_amount, 'Uang fisik');
  const closingNote = input.closing_note?.trim() || undefined;
  const reconciliation = await calculateRestaurantSessionReconciliation(session.id, closingCashAmount);
  if (reconciliation.cash_difference_amount !== 0 && !closingNote) {
    throw new Error('Catatan wajib diisi jika selisih kas tidak nol.');
  }

  const now = new Date().toISOString();
  const updated: RestaurantSession = {
    ...session,
    status: 'CLOSED',
    closed_at: now,
    closed_by_user_id: currentUser.id,
    closed_by_user_name: currentUser.name,
    closing_cash_amount: reconciliation.closing_cash_amount,
    closing_note: closingNote,
    expected_cash_amount: reconciliation.expected_cash_amount,
    cash_sales_amount: reconciliation.cash_sales_amount,
    non_cash_sales_amount: reconciliation.non_cash_sales_amount,
    total_sales_amount: reconciliation.total_sales_amount,
    voided_sales_amount: reconciliation.voided_sales_amount,
    transaction_count: reconciliation.transaction_count,
    voided_transaction_count: reconciliation.voided_transaction_count,
    cash_difference_amount: reconciliation.cash_difference_amount,
    balance_status: reconciliation.balance_status,
    updated_at: now,
  };

  await db.transaction(
    'rw',
    [db.restaurantSessions, db.restaurantOrders, db.restaurantTables],
    async () => {
      await db.restaurantSessions.put(updated);
      if (emptyDrafts.length > 0) {
        await db.restaurantOrders.bulkDelete(emptyDrafts.map((order) => order.id));
      }
      for (const order of emptyDrafts) {
        if (!order.table_id) continue;
        const table = await db.restaurantTables.get(order.table_id);
        if (table?.active_order_id !== order.id) continue;
        await db.restaurantTables.update(table.id, {
          status: 'AVAILABLE',
          active_order_id: undefined,
          occupied_since: undefined,
          updated_at: now,
        });
      }
    },
  );
  await writeActivityLog({
    user: currentUser,
    action: 'RESTAURANT_SESSION_CLOSED',
    entity: 'restaurantSessions',
    entity_id: session.id,
    description: `${currentUser.name} menutup sesi Resto ${session.session_number}.`,
  });
  return updated;
};
