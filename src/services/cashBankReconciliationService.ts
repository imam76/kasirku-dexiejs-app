import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import {
  FINANCE_CATEGORIES,
  getFinanceTransactionBusinessType,
  isProfitAffectingFinanceTransaction,
} from '@/constants/finance';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import { cashBankReconciliationSchema } from '@/lib/validations/cashBankReconciliation';
import { enqueueCashBankReconciliationSync } from '@/services/syncQueueService';
import {
  enqueueFinanceTransactionsSync,
  withDeletedFinanceTransactionSync,
  withPendingFinanceTransactionSync,
  withUpdatedFinanceTransactionSync,
} from '@/services/financeTransactionSyncService';
import {
  postCashBankReconciliationAdjustmentJournal,
  reverseCashBankReconciliationAdjustmentJournal,
} from '@/services/generalLedgerService';
import type {
  AuthUser,
  CashBankReconciliation,
  CashBankReconciliationStatus,
  ChartOfAccount,
  FinanceTransaction,
} from '@/types';

const RECONCILIATION_TOLERANCE = 0.01;

type CashBankReconciliationActor = Pick<AuthUser, 'id' | 'name'> | null | undefined;

export interface CashBankReconciliationCandidateRow {
  transaction: FinanceTransaction;
  signed_amount: number;
}

export interface CashBankReconciliationCandidatesResult {
  account?: ChartOfAccount;
  rows: CashBankReconciliationCandidateRow[];
  book_balance_amount: number;
  existing_cleared_balance_amount: number;
}

export interface CreateCashBankReconciliationInput {
  cash_account_id: string;
  statement_date: string;
  statement_reference?: string;
  statement_ending_balance: number;
  selected_transaction_ids: string[];
  adjustment_account_id?: string;
  notes?: string;
}

const roundCurrency = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const getTransactionSignedAmount = (transaction: FinanceTransaction) => {
  const businessType = getFinanceTransactionBusinessType(transaction);
  const amount = Number(transaction.amount || 0);

  return businessType === 'EXPENSE' ? -amount : amount;
};

const getStatementCutoffTimestamp = (statementDate: string) => {
  const cutoff = dayjs(statementDate).endOf('day').valueOf();
  if (!Number.isFinite(cutoff)) {
    throw new Error('Tanggal statement tidak valid.');
  }

  return cutoff;
};

const isOnOrBeforeStatementDate = (transaction: FinanceTransaction, statementDate: string) => {
  const transactionTime = Date.parse(transaction.created_at);
  if (Number.isNaN(transactionTime)) return transaction.created_at.slice(0, 10) <= statementDate.slice(0, 10);

  return transactionTime <= getStatementCutoffTimestamp(statementDate);
};

const assertCashBankAccount = (account: ChartOfAccount | undefined) => {
  if (!account) {
    throw new Error('Akun kas/bank tidak ditemukan.');
  }

  if (account.type !== 'ASSET' || !account.is_active || !account.is_postable) {
    throw new Error('Akun rekonsiliasi harus bertipe aset, aktif, dan postable.');
  }

  return account;
};

const assertAdjustmentAccount = (
  account: ChartOfAccount | undefined,
  cashAccount: ChartOfAccount,
  differenceAmount: number,
) => {
  if (Math.abs(differenceAmount) <= RECONCILIATION_TOLERANCE) return undefined;

  if (!account) {
    throw new Error('Akun penyesuaian selisih rekonsiliasi wajib dipilih.');
  }

  if (!account.is_active || !account.is_postable) {
    throw new Error('Akun penyesuaian harus aktif dan postable.');
  }

  if (account.id === cashAccount.id) {
    throw new Error('Akun penyesuaian tidak boleh sama dengan akun kas/bank yang direkonsiliasi.');
  }

  return account;
};

const getAdjustmentCategory = (differenceAmount: number) => (
  differenceAmount > 0
    ? FINANCE_CATEGORIES.CASH_BANK_RECONCILIATION_GAIN
    : FINANCE_CATEGORIES.CASH_BANK_RECONCILIATION_LOSS
);

const getFinanceTransactionSignedAmount = (transaction: FinanceTransaction) => {
  const businessType = getFinanceTransactionBusinessType(transaction);
  const amount = Number(transaction.amount || 0);

  if (businessType === 'EXPENSE') return -amount;
  return amount;
};

const applyFinanceBalanceDelta = async (deltaAmount: number, now: string) => {
  const currentFinanceBalance = await db.financeBalance.get('current');
  await db.financeBalance.put({
    id: 'current',
    amount: roundCurrency(Number(currentFinanceBalance?.amount || 0) + deltaAmount),
    updated_at: now,
  });
};

const applyProfitBalanceDelta = async (
  deltaAmount: number,
  category: string,
  description: string,
  now: string,
) => {
  const currentProfitBalance = await db.profitBalance.get('current');
  const nextProfitBalance = roundCurrency(Number(currentProfitBalance?.amount || 0) + deltaAmount);

  await db.profitBalance.put({
    id: 'current',
    amount: nextProfitBalance,
    updated_at: now,
  });

  await db.profitLogs.add({
    id: crypto.randomUUID(),
    amount: Math.abs(deltaAmount),
    type: deltaAmount >= 0 ? 'IN' : 'OUT',
    category: 'OPERATIONAL',
    description: `${description} (${category})`,
    created_at: now,
    balance_after: nextProfitBalance,
  });
};

const createReconciliationNumber = async (statementDate: string) => {
  const dateKey = dayjs(statementDate).format('YYYYMMDD');
  const prefix = `CBR-${dateKey}-`;
  const count = await db.cashBankReconciliations
    .where('reconciliation_number')
    .startsWith(prefix)
    .count();

  return `${prefix}${String(count + 1).padStart(4, '0')}`;
};

const withPendingCashBankReconciliationSync = (
  reconciliation: CashBankReconciliation,
  actor?: CashBankReconciliationActor,
  updatedAt = reconciliation.updated_at,
): CashBankReconciliation => ({
  ...reconciliation,
  version: reconciliation.version ?? 1,
  created_by: reconciliation.created_by ?? actor?.id,
  created_by_name: reconciliation.created_by_name ?? actor?.name,
  updated_by: actor?.id ?? reconciliation.updated_by,
  updated_by_name: actor?.name ?? reconciliation.updated_by_name,
  updated_at: updatedAt,
  sync_status: 'pending',
  sync_error: undefined,
});

const withUpdatedCashBankReconciliationSync = (
  reconciliation: CashBankReconciliation,
  actor?: CashBankReconciliationActor,
  updatedAt = new Date().toISOString(),
): CashBankReconciliation => ({
  ...reconciliation,
  version: Math.max(1, Number(reconciliation.version || 1)) + 1,
  updated_by: actor?.id ?? reconciliation.updated_by,
  updated_by_name: actor?.name ?? reconciliation.updated_by_name,
  updated_at: updatedAt,
  sync_status: 'pending',
  sync_error: undefined,
});

const listActiveCashAccountTransactions = async (cashAccountId: string, statementDate: string) => {
  return db.financeTransactions
    .where('cash_account_id')
    .equals(cashAccountId)
    .filter((transaction) => (
      !transaction.deleted_at &&
      isOnOrBeforeStatementDate(transaction, statementDate)
    ))
    .toArray();
};

export const listCashBankReconciliationCandidates = async ({
  cashAccountId,
  statementDate,
}: {
  cashAccountId?: string;
  statementDate?: string;
}): Promise<CashBankReconciliationCandidatesResult> => {
  if (!cashAccountId || !statementDate) {
    return {
      rows: [],
      book_balance_amount: 0,
      existing_cleared_balance_amount: 0,
    };
  }

  const account = assertCashBankAccount(await db.chartOfAccounts.get(cashAccountId));
  const transactions = await listActiveCashAccountTransactions(cashAccountId, statementDate);
  const bookBalance = roundCurrency(
    transactions.reduce((sum, transaction) => sum + getTransactionSignedAmount(transaction), 0),
  );
  const existingClearedBalance = roundCurrency(
    transactions
      .filter((transaction) => Boolean(transaction.cash_bank_reconciliation_id))
      .reduce((sum, transaction) => sum + getTransactionSignedAmount(transaction), 0),
  );
  const rows = transactions
    .filter((transaction) => !transaction.cash_bank_reconciliation_id)
    .map((transaction) => ({
      transaction,
      signed_amount: roundCurrency(getTransactionSignedAmount(transaction)),
    }))
    .sort((left, right) => right.transaction.created_at.localeCompare(left.transaction.created_at));

  return {
    account,
    rows,
    book_balance_amount: bookBalance,
    existing_cleared_balance_amount: existingClearedBalance,
  };
};

export const listCashBankReconciliations = async (cashAccountId?: string) => {
  const reconciliations = await db.cashBankReconciliations.orderBy('created_at').reverse().toArray();

  return cashAccountId
    ? reconciliations.filter((reconciliation) => reconciliation.cash_account_id === cashAccountId)
    : reconciliations;
};

export const createCashBankReconciliation = async (input: CreateCashBankReconciliationInput) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');
  const parsedInput = cashBankReconciliationSchema.parse(input);
  const uniqueTransactionIds = Array.from(new Set(parsedInput.selected_transaction_ids));
  const now = new Date().toISOString();
  let reconciliation: CashBankReconciliation | undefined;
  let updatedTransactions: FinanceTransaction[] = [];
  let createdAdjustmentTransaction: FinanceTransaction | undefined;

  await db.transaction('rw', [
    db.cashBankReconciliations,
    db.financeTransactions,
    db.financeBalance,
    db.profitBalance,
    db.profitLogs,
    db.chartOfAccounts,
    db.enabledModules,
    db.generalLedgerSetting,
    db.accountingPeriods,
    db.journalEntries,
    db.journalEntryLines,
    db.activityLogs,
  ], async () => {
    const account = assertCashBankAccount(await db.chartOfAccounts.get(parsedInput.cash_account_id));
    const allTransactions = await listActiveCashAccountTransactions(account.id, parsedInput.statement_date);
    const transactionById = new Map(allTransactions.map((transaction) => [transaction.id, transaction]));
    const selectedTransactions = uniqueTransactionIds.map((transactionId) => {
      const transaction = transactionById.get(transactionId);
      if (!transaction) {
        throw new Error('Transaksi rekonsiliasi tidak ditemukan atau berada di luar periode statement.');
      }
      if (transaction.cash_account_id !== account.id) {
        throw new Error('Semua transaksi rekonsiliasi harus berasal dari akun kas/bank yang sama.');
      }
      if (transaction.cash_bank_reconciliation_id) {
        throw new Error('Ada transaksi yang sudah pernah direkonsiliasi.');
      }

      return transaction;
    });

    const bookBalance = roundCurrency(
      allTransactions.reduce((sum, transaction) => sum + getTransactionSignedAmount(transaction), 0),
    );
    const existingClearedBalance = roundCurrency(
      allTransactions
        .filter((transaction) => Boolean(transaction.cash_bank_reconciliation_id))
        .reduce((sum, transaction) => sum + getTransactionSignedAmount(transaction), 0),
    );
    const selectedTotal = roundCurrency(
      selectedTransactions.reduce((sum, transaction) => sum + getTransactionSignedAmount(transaction), 0),
    );
    const clearedBalance = roundCurrency(existingClearedBalance + selectedTotal);
    const differenceAmount = roundCurrency(parsedInput.statement_ending_balance - clearedBalance);
    const adjustmentAccount = assertAdjustmentAccount(
      parsedInput.adjustment_account_id
        ? await db.chartOfAccounts.get(parsedInput.adjustment_account_id)
        : undefined,
      account,
      differenceAmount,
    );
    const adjustmentAmount = roundCurrency(Math.abs(differenceAmount));
    const adjustmentCategory = adjustmentAccount ? getAdjustmentCategory(differenceAmount) : undefined;
    const adjustmentTransactionId = adjustmentAccount ? crypto.randomUUID() : undefined;
    const status: CashBankReconciliationStatus =
      Math.abs(differenceAmount) <= RECONCILIATION_TOLERANCE ? 'BALANCED' : 'DIFFERENCE';
    const reconciliationId = crypto.randomUUID();
    const reconciliationNumber = await createReconciliationNumber(parsedInput.statement_date);
    const adjustedClearedBalance = adjustmentAccount
      ? roundCurrency(clearedBalance + differenceAmount)
      : clearedBalance;

    if (adjustmentAccount && adjustmentCategory && adjustmentTransactionId) {
      createdAdjustmentTransaction = withPendingFinanceTransactionSync({
        id: adjustmentTransactionId,
        type: differenceAmount > 0 ? 'INCOME' : 'EXPENSE',
        category: adjustmentCategory,
        amount: adjustmentAmount,
        description: `Penyesuaian selisih rekonsiliasi ${reconciliationNumber}`,
        created_at: parsedInput.statement_date,
        reference_id: reconciliationId,
        cash_account_id: account.id,
        cash_account_code: account.code,
        cash_account_name: account.name,
        account_id: adjustmentAccount.id,
        account_code: adjustmentAccount.code,
        account_name: adjustmentAccount.name,
        account_type: adjustmentAccount.type,
        cash_bank_reconciliation_id: reconciliationId,
        cash_bank_reconciled_at: now,
        cash_bank_reconciled_by: currentUser?.id,
        cash_bank_reconciled_by_name: currentUser?.name,
      }, currentUser, now);
    }

    reconciliation = withPendingCashBankReconciliationSync({
      id: reconciliationId,
      reconciliation_number: reconciliationNumber,
      cash_account_id: account.id,
      cash_account_code: account.code,
      cash_account_name: account.name,
      statement_date: parsedInput.statement_date,
      statement_reference: parsedInput.statement_reference,
      statement_ending_balance: roundCurrency(parsedInput.statement_ending_balance),
      book_balance_amount: bookBalance,
      cleared_balance_amount: adjustedClearedBalance,
      selected_transaction_total_amount: selectedTotal,
      selected_transaction_count: selectedTransactions.length,
      selected_transaction_ids: selectedTransactions.map((transaction) => transaction.id),
      difference_amount: differenceAmount,
      adjustment_account_id: adjustmentAccount?.id,
      adjustment_account_code: adjustmentAccount?.code,
      adjustment_account_name: adjustmentAccount?.name,
      adjustment_account_type: adjustmentAccount?.type,
      adjustment_transaction_id: adjustmentTransactionId,
      status,
      notes: parsedInput.notes,
      created_at: now,
      updated_at: now,
    }, currentUser, now);

    updatedTransactions = selectedTransactions.map((transaction) => withUpdatedFinanceTransactionSync({
      ...transaction,
      cash_bank_reconciliation_id: reconciliationId,
      cash_bank_reconciled_at: now,
      cash_bank_reconciled_by: currentUser?.id,
      cash_bank_reconciled_by_name: currentUser?.name,
    }, currentUser, now));

    await db.cashBankReconciliations.add(reconciliation);
    await db.financeTransactions.bulkPut(updatedTransactions);
    if (createdAdjustmentTransaction && adjustmentAccount) {
      await db.financeTransactions.add(createdAdjustmentTransaction);
      await applyFinanceBalanceDelta(differenceAmount, now);
      if (isProfitAffectingFinanceTransaction(createdAdjustmentTransaction.type, createdAdjustmentTransaction.category)) {
        await applyProfitBalanceDelta(
          differenceAmount,
          createdAdjustmentTransaction.category,
          createdAdjustmentTransaction.description,
          now,
        );
      }
      await postCashBankReconciliationAdjustmentJournal({
        reconciliationId,
        reconciliationNumber,
        statementDate: parsedInput.statement_date,
        cashAccount: account,
        adjustmentAccount,
        differenceAmount,
        actor: currentUser,
      });
    }
    await writeActivityLog({
      user: currentUser,
      action: 'CASH_BANK_RECONCILIATION_CREATED',
      entity: 'cashBankReconciliations',
      entity_id: reconciliation.id,
      description: `${currentUser?.name ?? 'User'} membuat rekonsiliasi kas/bank ${reconciliation.reconciliation_number}.`,
    });
  });

  if (!reconciliation) {
    throw new Error('Rekonsiliasi kas/bank gagal disimpan.');
  }

  await enqueueCashBankReconciliationSync(reconciliation, 'create');
  if (updatedTransactions.length > 0) {
    await enqueueFinanceTransactionsSync(updatedTransactions, 'update');
  }
  if (createdAdjustmentTransaction) {
    await enqueueFinanceTransactionsSync([createdAdjustmentTransaction], 'create');
  }

  return reconciliation;
};

export const voidCashBankReconciliation = async (reconciliationId: string, reason: string) => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');

  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new Error('Alasan void rekonsiliasi wajib diisi.');
  }

  const now = new Date().toISOString();
  let updatedReconciliation: CashBankReconciliation | undefined;
  let updatedTransactions: FinanceTransaction[] = [];
  let deletedAdjustmentTransactions: FinanceTransaction[] = [];

  await db.transaction('rw', [
    db.cashBankReconciliations,
    db.financeTransactions,
    db.financeBalance,
    db.profitBalance,
    db.profitLogs,
    db.enabledModules,
    db.generalLedgerSetting,
    db.accountingPeriods,
    db.journalEntries,
    db.journalEntryLines,
    db.activityLogs,
  ], async () => {
    const reconciliation = await db.cashBankReconciliations.get(reconciliationId);
    if (!reconciliation) {
      throw new Error('Rekonsiliasi kas/bank tidak ditemukan.');
    }
    if (reconciliation.status === 'VOIDED') {
      throw new Error('Rekonsiliasi kas/bank sudah di-void.');
    }

    const reconciledTransactions = await db.financeTransactions
      .where('cash_bank_reconciliation_id')
      .equals(reconciliation.id)
      .toArray();
    const adjustmentTransactions = reconciledTransactions.filter((transaction) => (
      transaction.id === reconciliation.adjustment_transaction_id ||
      (
        transaction.reference_id === reconciliation.id &&
        (
          transaction.category === FINANCE_CATEGORIES.CASH_BANK_RECONCILIATION_GAIN ||
          transaction.category === FINANCE_CATEGORIES.CASH_BANK_RECONCILIATION_LOSS
        )
      )
    ));
    const adjustmentTransactionIds = new Set(adjustmentTransactions.map((transaction) => transaction.id));
    const selectedTransactions = reconciledTransactions.filter((transaction) => !adjustmentTransactionIds.has(transaction.id));

    updatedReconciliation = withUpdatedCashBankReconciliationSync({
      ...reconciliation,
      status: 'VOIDED',
      voided_at: now,
      void_reason: cleanReason,
    }, currentUser, now);
    updatedTransactions = selectedTransactions.map((transaction) => withUpdatedFinanceTransactionSync({
      ...transaction,
      cash_bank_reconciliation_id: undefined,
      cash_bank_reconciled_at: undefined,
      cash_bank_reconciled_by: undefined,
      cash_bank_reconciled_by_name: undefined,
    }, currentUser, now));
    deletedAdjustmentTransactions = adjustmentTransactions.map((transaction) => (
      withDeletedFinanceTransactionSync(transaction, currentUser, now)
    ));

    await db.cashBankReconciliations.put(updatedReconciliation);
    if (updatedTransactions.length > 0) {
      await db.financeTransactions.bulkPut(updatedTransactions);
    }
    if (deletedAdjustmentTransactions.length > 0) {
      await db.financeTransactions.bulkPut(deletedAdjustmentTransactions);

      const financeDelta = roundCurrency(
        deletedAdjustmentTransactions.reduce((sum, transaction) => (
          sum - getFinanceTransactionSignedAmount(transaction)
        ), 0),
      );
      if (Math.abs(financeDelta) > RECONCILIATION_TOLERANCE) {
        await applyFinanceBalanceDelta(financeDelta, now);
      }

      for (const transaction of deletedAdjustmentTransactions) {
        if (!isProfitAffectingFinanceTransaction(transaction.type, transaction.category)) continue;
        await applyProfitBalanceDelta(
          -getFinanceTransactionSignedAmount(transaction),
          transaction.category,
          `Void ${transaction.description}`,
          now,
        );
      }

      await reverseCashBankReconciliationAdjustmentJournal(
        reconciliation,
        `Void rekonsiliasi kas/bank ${reconciliation.reconciliation_number}: ${cleanReason}`,
        currentUser,
        now,
      );
    }
    await writeActivityLog({
      user: currentUser,
      action: 'CASH_BANK_RECONCILIATION_VOIDED',
      entity: 'cashBankReconciliations',
      entity_id: reconciliation.id,
      description: `${currentUser?.name ?? 'User'} void rekonsiliasi kas/bank ${reconciliation.reconciliation_number}. Alasan: ${cleanReason}`,
    });
  });

  if (!updatedReconciliation) {
    throw new Error('Void rekonsiliasi kas/bank gagal disimpan.');
  }

  await enqueueCashBankReconciliationSync(updatedReconciliation, 'update');
  if (updatedTransactions.length > 0) {
    await enqueueFinanceTransactionsSync(updatedTransactions, 'update');
  }
  if (deletedAdjustmentTransactions.length > 0) {
    await enqueueFinanceTransactionsSync(deletedAdjustmentTransactions, 'delete');
  }

  return updatedReconciliation;
};
