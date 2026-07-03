import { FINANCE_CATEGORIES } from '@/constants/finance';
import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import { cashBankTransferSchema } from '@/lib/validations/cashBankTransfer';
import { postCashBankTransferJournal } from '@/services/generalLedgerService';
import { enqueueFinanceTransactionsSync, withPendingFinanceTransactionSync } from '@/services/financeTransactionSyncService';
import type {
  AuthUser,
  ChartOfAccount,
  CooperativeFieldCashMovementKind,
  CooperativeFieldCashSession,
  Employee,
  FinanceTransaction,
} from '@/types';

export interface RecordCashBankTransferInput {
  from_cash_account_id: string;
  to_cash_account_id: string;
  amount: number;
  transfer_date?: string;
  payment_channel?: string;
  reference_id?: string;
  notes?: string;
}

export interface RecordCashBankTransferResult {
  transferGroupId: string;
  outTransaction: FinanceTransaction;
  inTransaction: FinanceTransaction;
}

export interface VoidCashBankTransferResult {
  transferGroupId: string;
  reversalGroupId: string;
  outReversal: FinanceTransaction;
  inReversal: FinanceTransaction;
}

type CashBankTransferActor = AuthUser | null | undefined;

const assertCashBankAccount = (account: ChartOfAccount | undefined, label: string) => {
  if (!account) {
    throw new Error(`${label} tidak ditemukan.`);
  }

  if (account.type !== 'ASSET' || !account.is_active || !account.is_postable) {
    throw new Error(`${label} harus bertipe aset, aktif, dan postable.`);
  }

  return account;
};

const createTransferDescription = (
  fromAccount: ChartOfAccount,
  toAccount: ChartOfAccount,
  notes?: string,
) => {
  const base = `Transfer kas/bank dari ${fromAccount.code} - ${fromAccount.name} ke ${toAccount.code} - ${toAccount.name}`;
  return notes ? `${base}. ${notes}` : base;
};

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const formatAmount = (value: number) => value.toLocaleString('id-ID');

const getActiveFieldCashEmployeeByCashAccount = async (cashAccountId: string) => (
  db.employees
    .where('field_cash_account_id')
    .equals(cashAccountId)
    .and((employee) => employee.is_active)
    .first()
);

const getOpenFieldCashSessionForEmployee = async (employee: Employee, cashAccountId: string) => (
  db.cooperativeFieldCashSessions
    .where('employee_id')
    .equals(employee.id)
    .and((session) => session.status === 'OPEN' && session.cash_account_id === cashAccountId)
    .first()
);

const getCashAccountBalance = async (cashAccountId: string) => {
  const transactions = await db.financeTransactions
    .where('cash_account_id')
    .equals(cashAccountId)
    .filter((transaction) => !transaction.deleted_at)
    .toArray();

  return roundCurrency(transactions.reduce((sum, transaction) => {
    if (transaction.type === 'INCOME' || transaction.type === 'OPENING_BALANCE') {
      return sum + Number(transaction.amount || 0);
    }
    if (transaction.type === 'EXPENSE') {
      return sum - Number(transaction.amount || 0);
    }
    return sum;
  }, 0));
};

const assertFieldCashBalanceForTransferOut = async (
  employee: Employee,
  cashAccountId: string,
  amount: number,
) => {
  const balance = await getCashAccountBalance(cashAccountId);
  if (balance + 0.01 >= amount) return;

  const shortage = roundCurrency(amount - balance);
  throw new Error(
    `Saldo Kas Petugas ${employee.name} tidak cukup untuk transfer keluar. Kekurangan Rp ${formatAmount(shortage)}.`,
  );
};

const buildFieldCashFinanceFields = (
  employee: Employee,
  session: CooperativeFieldCashSession | undefined,
  movementKind: CooperativeFieldCashMovementKind,
): Pick<
  FinanceTransaction,
  | 'field_cash_session_id'
  | 'field_cash_session_number'
  | 'field_employee_id'
  | 'field_employee_name'
  | 'field_cash_movement_kind'
> => ({
  field_employee_id: employee.id,
  field_employee_name: employee.name,
  field_cash_movement_kind: movementKind,
  ...(session
    ? {
        field_cash_session_id: session.id,
        field_cash_session_number: session.session_number,
      }
    : {}),
});

export const recordCashBankTransferInCurrentTransaction = async (
  input: RecordCashBankTransferInput,
  currentUser: CashBankTransferActor,
): Promise<RecordCashBankTransferResult> => {
  const parsedInput = cashBankTransferSchema.parse(input);
  const now = new Date().toISOString();
  const transferDate = parsedInput.transfer_date ?? now;
  const transferGroupId = crypto.randomUUID();
  const outTransactionId = crypto.randomUUID();
  const inTransactionId = crypto.randomUUID();

  const [fromAccountRecord, toAccountRecord] = await Promise.all([
    db.chartOfAccounts.get(parsedInput.from_cash_account_id),
    db.chartOfAccounts.get(parsedInput.to_cash_account_id),
  ]);
  const fromAccount = assertCashBankAccount(fromAccountRecord, 'Akun sumber');
  const toAccount = assertCashBankAccount(toAccountRecord, 'Akun tujuan');

  if (fromAccount.id === toAccount.id) {
    throw new Error('Akun tujuan harus berbeda dari akun sumber.');
  }

  const [fromFieldEmployee, toFieldEmployee] = await Promise.all([
    getActiveFieldCashEmployeeByCashAccount(fromAccount.id),
    getActiveFieldCashEmployeeByCashAccount(toAccount.id),
  ]);
  const [fromFieldSession, toFieldSession] = await Promise.all([
    fromFieldEmployee ? getOpenFieldCashSessionForEmployee(fromFieldEmployee, fromAccount.id) : undefined,
    toFieldEmployee ? getOpenFieldCashSessionForEmployee(toFieldEmployee, toAccount.id) : undefined,
  ]);

  if (fromFieldEmployee) {
    await assertFieldCashBalanceForTransferOut(fromFieldEmployee, fromAccount.id, parsedInput.amount);
  }

  const description = createTransferDescription(fromAccount, toAccount, parsedInput.notes);
  const outTransaction = withPendingFinanceTransactionSync({
    id: outTransactionId,
    type: 'EXPENSE',
    category: FINANCE_CATEGORIES.CASH_BANK_TRANSFER,
    amount: parsedInput.amount,
    description,
    created_at: transferDate,
    reference_id: parsedInput.reference_id,
    payment_channel: parsedInput.payment_channel,
    cash_account_id: fromAccount.id,
    cash_account_code: fromAccount.code,
    cash_account_name: fromAccount.name,
    account_id: fromAccount.id,
    account_code: fromAccount.code,
    account_name: fromAccount.name,
    account_type: fromAccount.type,
    transfer_group_id: transferGroupId,
    transfer_direction: 'OUT',
    ...(fromFieldEmployee
      ? buildFieldCashFinanceFields(fromFieldEmployee, fromFieldSession, 'DEPOSIT_TO_FINANCE')
      : {}),
  }, currentUser, transferDate);
  const inTransaction = withPendingFinanceTransactionSync({
    id: inTransactionId,
    type: 'INCOME',
    category: FINANCE_CATEGORIES.CASH_BANK_TRANSFER,
    amount: parsedInput.amount,
    description,
    created_at: transferDate,
    reference_id: parsedInput.reference_id,
    payment_channel: parsedInput.payment_channel,
    cash_account_id: toAccount.id,
    cash_account_code: toAccount.code,
    cash_account_name: toAccount.name,
    account_id: toAccount.id,
    account_code: toAccount.code,
    account_name: toAccount.name,
    account_type: toAccount.type,
    transfer_group_id: transferGroupId,
    transfer_direction: 'IN',
    ...(toFieldEmployee
      ? buildFieldCashFinanceFields(toFieldEmployee, toFieldSession, 'DROPPING_FROM_FINANCE')
      : {}),
  }, currentUser, transferDate);

  await db.financeTransactions.bulkAdd([outTransaction, inTransaction]);
  await postCashBankTransferJournal({
    transferGroupId,
    transferDate,
    amount: parsedInput.amount,
    fromAccount,
    toAccount,
    description,
    actor: currentUser,
  });
  await writeActivityLog({
    user: currentUser,
    action: 'CASH_BANK_TRANSFER_RECORDED',
    entity: 'financeTransactions',
    entity_id: transferGroupId,
    description: `${currentUser?.name ?? 'User'} mencatat transfer kas/bank sebesar ${parsedInput.amount} dari ${fromAccount.code} ke ${toAccount.code}.`,
  });

  return { transferGroupId, outTransaction, inTransaction };
};

export const recordCashBankTransfer = async (
  input: RecordCashBankTransferInput,
): Promise<RecordCashBankTransferResult> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');

  let result: RecordCashBankTransferResult | undefined;
  await db.transaction('rw', [
    db.financeTransactions,
    db.chartOfAccounts,
    db.employees,
    db.cooperativeFieldCashSessions,
    db.enabledModules,
    db.generalLedgerSetting,
    db.journalEntries,
    db.journalEntryLines,
    db.activityLogs,
  ], async () => {
    result = await recordCashBankTransferInCurrentTransaction(input, currentUser);
  });

  if (!result) {
    throw new Error('Transfer kas/bank gagal dicatat.');
  }

  await enqueueFinanceTransactionsSync([result.outTransaction, result.inTransaction], 'create');

  return result;
};

export const voidCashBankTransfer = async (
  transferGroupId: string,
  reason: string,
): Promise<VoidCashBankTransferResult> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');

  const cleanReason = reason.trim();
  if (!cleanReason) {
    throw new Error('Alasan void transfer wajib diisi.');
  }

  const reversalGroupId = crypto.randomUUID();
  const now = new Date().toISOString();
  let outReversal: FinanceTransaction | undefined;
  let inReversal: FinanceTransaction | undefined;

  await db.transaction('rw', [
    db.financeTransactions,
    db.chartOfAccounts,
    db.enabledModules,
    db.generalLedgerSetting,
    db.journalEntries,
    db.journalEntryLines,
    db.activityLogs,
  ], async () => {
    const transferTransactions = await db.financeTransactions
      .filter((transaction) => transaction.transfer_group_id === transferGroupId)
      .toArray();
    const originalTransactions = transferTransactions.filter((transaction) => (
      transaction.category === FINANCE_CATEGORIES.CASH_BANK_TRANSFER &&
      !transaction.reversal_of_transfer_group_id
    ));
    const outTransaction = originalTransactions.find((transaction) => transaction.transfer_direction === 'OUT');
    const inTransaction = originalTransactions.find((transaction) => transaction.transfer_direction === 'IN');

    if (originalTransactions.length !== 2 || !outTransaction || !inTransaction) {
      throw new Error('Transfer kas/bank tidak valid atau tidak lengkap.');
    }

    const existingReversal = await db.financeTransactions
      .filter((transaction) => transaction.reversal_of_transfer_group_id === transferGroupId)
      .first();

    if (existingReversal) {
      throw new Error('Transfer kas/bank ini sudah pernah di-void.');
    }

    const [fromAccountRecord, toAccountRecord] = await Promise.all([
      db.chartOfAccounts.get(outTransaction.cash_account_id ?? outTransaction.account_id ?? ''),
      db.chartOfAccounts.get(inTransaction.cash_account_id ?? inTransaction.account_id ?? ''),
    ]);
    const fromAccount = assertCashBankAccount(fromAccountRecord, 'Akun sumber transfer asal');
    const toAccount = assertCashBankAccount(toAccountRecord, 'Akun tujuan transfer asal');
    const description = `Void transfer kas/bank ${transferGroupId}. ${cleanReason}`;

    outReversal = withPendingFinanceTransactionSync({
      id: crypto.randomUUID(),
      type: 'INCOME',
      category: FINANCE_CATEGORIES.CASH_BANK_TRANSFER,
      amount: outTransaction.amount,
      description,
      created_at: now,
      payment_channel: outTransaction.payment_channel,
      cash_account_id: fromAccount.id,
      cash_account_code: fromAccount.code,
      cash_account_name: fromAccount.name,
      account_id: fromAccount.id,
      account_code: fromAccount.code,
      account_name: fromAccount.name,
      account_type: fromAccount.type,
      transfer_group_id: reversalGroupId,
      transfer_direction: 'IN',
      reversal_of_transfer_group_id: transferGroupId,
    }, currentUser, now);
    inReversal = withPendingFinanceTransactionSync({
      id: crypto.randomUUID(),
      type: 'EXPENSE',
      category: FINANCE_CATEGORIES.CASH_BANK_TRANSFER,
      amount: inTransaction.amount,
      description,
      created_at: now,
      payment_channel: inTransaction.payment_channel,
      cash_account_id: toAccount.id,
      cash_account_code: toAccount.code,
      cash_account_name: toAccount.name,
      account_id: toAccount.id,
      account_code: toAccount.code,
      account_name: toAccount.name,
      account_type: toAccount.type,
      transfer_group_id: reversalGroupId,
      transfer_direction: 'OUT',
      reversal_of_transfer_group_id: transferGroupId,
    }, currentUser, now);

    await db.financeTransactions.bulkAdd([outReversal, inReversal]);
    await postCashBankTransferJournal({
      transferGroupId: reversalGroupId,
      transferDate: now,
      amount: outTransaction.amount,
      fromAccount: toAccount,
      toAccount: fromAccount,
      description,
      actor: currentUser,
    });
    await writeActivityLog({
      user: currentUser,
      action: 'CASH_BANK_TRANSFER_VOIDED',
      entity: 'financeTransactions',
      entity_id: transferGroupId,
      description: `${currentUser?.name ?? 'User'} void transfer kas/bank ${transferGroupId}. Alasan: ${cleanReason}`,
    });
  });

  if (!outReversal || !inReversal) {
    throw new Error('Void transfer kas/bank gagal dicatat.');
  }

  await enqueueFinanceTransactionsSync([outReversal, inReversal], 'create');

  return {
    transferGroupId,
    reversalGroupId,
    outReversal,
    inReversal,
  };
};
