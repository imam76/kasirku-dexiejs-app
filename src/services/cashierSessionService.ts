import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import { enqueueCashierSessionSync } from '@/services/syncQueueService';
import type { CashierSession, CashierSessionBalanceStatus, PaymentMethodCategory, Transaction } from '@/types';
import { isTransactionActive, isTransactionVoided } from '@/utils/transactions';
import { getTransactionPaymentSnapshot } from '@/utils/posPaymentMethod';

export interface OpenCashierSessionInput {
  opening_cash_amount: number;
  opening_note?: string;
}

export interface CloseCashierSessionInput {
  session_id: string;
  closing_cash_amount: number;
  closing_note?: string;
}

export interface CashierSessionReconciliation {
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
  balance_status: CashierSessionBalanceStatus;
  payment_method_breakdown: CashierSessionPaymentBreakdown[];
}

export interface CashierSessionPaymentBreakdown {
  code: string;
  name: string;
  category: PaymentMethodCategory;
  amount: number;
  transaction_count: number;
}

const normalizeAmount = (value: number, fieldName: string) => {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${fieldName} tidak valid.`);
  }

  return amount;
};

const buildSessionNumber = (date = new Date()) => {
  const pad = (value: number) => String(value).padStart(2, '0');
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hour = pad(date.getHours());
  const minute = pad(date.getMinutes());
  const second = pad(date.getSeconds());

  return `KS-${year}${month}${day}-${hour}${minute}${second}`;
};

export const getOpenCashierSessionForCurrentUser = async () => {
  const currentUser = await getCurrentSessionUser();
  if (!currentUser) return null;

  return (await db.cashierSessions
    .where('cashier_user_id')
    .equals(currentUser.id)
    .and((session) => session.status === 'OPEN')
    .first()) ?? null;
};

export const openCashierSession = async (input: OpenCashierSessionInput): Promise<CashierSession> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'CASHIER_ACCESS');

  if (!currentUser) {
    throw new Error('Sesi user tidak ditemukan.');
  }

  const openingCashAmount = normalizeAmount(input.opening_cash_amount, 'Saldo awal kas');
  const existingSession = await getOpenCashierSessionForCurrentUser();
  if (existingSession) {
    throw new Error('Masih ada sesi kasir yang terbuka untuk user ini.');
  }

  const now = new Date().toISOString();
  const session: CashierSession = {
    id: crypto.randomUUID(),
    session_number: buildSessionNumber(),
    status: 'OPEN',
    cashier_user_id: currentUser.id,
    cashier_user_name: currentUser.name,
    opened_at: now,
    opening_cash_amount: openingCashAmount,
    opening_note: input.opening_note?.trim() || undefined,
    created_at: now,
    updated_at: now,
    sync_status: 'pending',
    sync_error: undefined,
  };

  await db.cashierSessions.add(session);
  await writeActivityLog({
    user: currentUser,
    action: 'CASHIER_SESSION_OPENED',
    entity: 'cashierSessions',
    entity_id: session.id,
    description: `${currentUser.name} membuka sesi kasir ${session.session_number}.`,
  });
  await enqueueCashierSessionSync(session, 'create');

  return session;
};

export const summarizeSessionTransactions = (transactions: Transaction[]) => {
  const activeTransactions = transactions.filter(isTransactionActive);
  const voidedTransactions = transactions.filter(isTransactionVoided);
  const paymentBreakdownMap = new Map<string, CashierSessionPaymentBreakdown>();
  activeTransactions.forEach((transaction) => {
    const payment = getTransactionPaymentSnapshot(transaction);
    const existing = paymentBreakdownMap.get(payment.code) ?? {
      code: payment.code,
      name: payment.name,
      category: payment.category,
      amount: 0,
      transaction_count: 0,
    };
    existing.amount += Number(transaction.total_amount || 0);
    existing.transaction_count += 1;
    paymentBreakdownMap.set(payment.code, existing);
  });
  const cashSalesAmount = activeTransactions
    .filter((transaction) => getTransactionPaymentSnapshot(transaction).isCash)
    .reduce((sum, transaction) => sum + Number(transaction.total_amount || 0), 0);
  const nonCashSalesAmount = activeTransactions
    .filter((transaction) => !getTransactionPaymentSnapshot(transaction).isCash)
    .reduce((sum, transaction) => sum + Number(transaction.total_amount || 0), 0);
  const voidedSalesAmount = voidedTransactions
    .reduce((sum, transaction) => sum + Number(transaction.total_amount || 0), 0);

  return {
    cashSalesAmount,
    nonCashSalesAmount,
    totalSalesAmount: cashSalesAmount + nonCashSalesAmount,
    voidedSalesAmount,
    transactionCount: activeTransactions.length,
    voidedTransactionCount: voidedTransactions.length,
    paymentMethodBreakdown: [...paymentBreakdownMap.values()].sort((left, right) => (
      Number(right.category === 'CASH') - Number(left.category === 'CASH')
      || left.name.localeCompare(right.name)
    )),
  };
};

export const calculateCashierSessionReconciliation = async (
  sessionId: string,
  closingCashAmount = 0,
): Promise<CashierSessionReconciliation> => {
  const session = await db.cashierSessions.get(sessionId);
  if (!session) {
    throw new Error('Sesi kasir tidak ditemukan.');
  }

  const normalizedClosingCashAmount = normalizeAmount(closingCashAmount, 'Uang fisik');
  const transactions = await db.transactions
    .where('cashier_session_id')
    .equals(session.id)
    .toArray();
  const summary = summarizeSessionTransactions(transactions);
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

export const closeCashierSession = async (input: CloseCashierSessionInput): Promise<CashierSession> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'CASHIER_ACCESS');

  if (!currentUser) {
    throw new Error('Sesi user tidak ditemukan.');
  }

  const closingCashAmount = normalizeAmount(input.closing_cash_amount, 'Uang fisik');
  const closingNote = input.closing_note?.trim() || undefined;
  const session = await db.cashierSessions.get(input.session_id);
  if (!session) {
    throw new Error('Sesi kasir tidak ditemukan.');
  }

  if (session.status !== 'OPEN') {
    throw new Error('Sesi kasir sudah ditutup.');
  }

  if (session.cashier_user_id !== currentUser.id) {
    throw new Error('Sesi kasir ini bukan milik user yang sedang login.');
  }

  const reconciliation = await calculateCashierSessionReconciliation(session.id, closingCashAmount);
  if (reconciliation.cash_difference_amount !== 0 && !closingNote) {
    throw new Error('Catatan wajib diisi jika selisih kas tidak nol.');
  }

  const now = new Date().toISOString();
  await db.cashierSessions.update(session.id, {
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
    sync_status: 'pending',
    sync_error: undefined,
  });

  const closedSession = await db.cashierSessions.get(session.id);
  if (!closedSession) {
    throw new Error('Sesi kasir tidak ditemukan setelah ditutup.');
  }

  await writeActivityLog({
    user: currentUser,
    action: reconciliation.balance_status === 'BALANCED'
      ? 'CASHIER_SESSION_CLOSED'
      : 'CASHIER_SESSION_CLOSED_NON_BALANCED',
    entity: 'cashierSessions',
    entity_id: closedSession.id,
    description: `${currentUser.name} menutup sesi kasir ${closedSession.session_number} dengan selisih ${reconciliation.cash_difference_amount}.`,
  });
  await enqueueCashierSessionSync(closedSession, 'update');

  return closedSession;
};
