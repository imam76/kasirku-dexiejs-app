import { getCurrentSessionUser, hasUserPermission, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import {
  recordCashBankTransfer,
  type RecordCashBankTransferResult,
} from '@/services/cashBankTransferService';
import type {
  AuthUser,
  ChartOfAccount,
  CooperativeFieldCashMovementKind,
  CooperativeFieldCashSession,
  Employee,
  FinanceTransaction,
} from '@/types';

export interface OpenCooperativeFieldCashSessionInput {
  employee_id: string;
  opening_cash_amount: number;
  opening_note?: string;
}

export interface CloseCooperativeFieldCashSessionInput {
  session_id: string;
  closing_cash_amount: number;
  closing_note?: string;
}

export interface RecordFieldCashTransferInput {
  employee_id: string;
  cash_account_id: string;
  finance_cash_account_id: string;
  amount: number;
  transfer_date?: string;
  notes?: string;
}

export type CloseFieldCashBookInput = Omit<RecordFieldCashTransferInput, 'amount'>;

export interface CooperativeFieldCashContext {
  employee: Employee;
  session?: CooperativeFieldCashSession;
}

export interface CooperativeFieldCashReconciliation {
  session: CooperativeFieldCashSession;
  transactions: FinanceTransaction[];
  dropping_from_finance_amount: number;
  storting_loan_payment_amount: number;
  storting_saving_deposit_amount: number;
  loan_disbursement_amount: number;
  saving_withdrawal_amount: number;
  iptw_payout_amount: number;
  deposit_to_finance_amount: number;
  total_storting_amount: number;
  expected_closing_cash_amount: number;
}

export interface CooperativeFieldCashAccessScope {
  currentUser: AuthUser;
  canViewAll: boolean;
  employeeId?: string;
}

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const formatAmount = (value: number) => value.toLocaleString('id-ID');

const isPositiveAmount = (amount: number) => Number.isFinite(amount) && amount > 0;

const requireFieldCashManage = async () => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'COOPERATIVE_FIELD_CASH_MANAGE');
  return currentUser;
};

export const requireFieldCashView = async () => {
  const currentUser = await getCurrentSessionUser();
  const canViewFieldCash = await hasUserPermission(currentUser, 'COOPERATIVE_FIELD_CASH_VIEW');
  const canViewReport = await hasUserPermission(currentUser, 'COOPERATIVE_CASH_REPORT_VIEW');

  if (!canViewFieldCash && !canViewReport) {
    throw new Error('Anda tidak memiliki akses untuk aksi ini.');
  }

  return currentUser;
};

const getEmployeeIdForFieldCashUser = async (user: AuthUser) => {
  if (user.employee_id) return user.employee_id;

  const employee = await db.employees.get(user.id);
  return employee?.id;
};

export const getFieldCashAccessScope = async (): Promise<CooperativeFieldCashAccessScope> => {
  const currentUser = await requireFieldCashView();
  if (!currentUser) {
    throw new Error('Session user tidak ditemukan.');
  }

  const role = currentUser.role_id ? await db.roles.get(currentUser.role_id) : undefined;
  const canManageFieldCash = await hasUserPermission(currentUser, 'COOPERATIVE_FIELD_CASH_MANAGE');
  const canViewAll = Boolean(
    role?.is_owner ||
    currentUser.role === 'OWNER' ||
    currentUser.role === 'ADMIN' ||
    canManageFieldCash
  );

  return {
    currentUser,
    canViewAll,
    employeeId: canViewAll ? undefined : await getEmployeeIdForFieldCashUser(currentUser),
  };
};

const assertFieldCashAccount = (account: ChartOfAccount | undefined, label = 'Akun kas petugas') => {
  if (!account) {
    throw new Error(`${label} tidak ditemukan.`);
  }

  if (account.type !== 'ASSET' || !account.is_active || !account.is_postable) {
    throw new Error(`${label} harus bertipe aset, aktif, dan postable.`);
  }

  return account;
};

const assertEmployeeFieldCashAccount = async (
  employee: Employee,
  cashAccountId = employee.field_cash_account_id,
) => {
  if (!employee.is_active) {
    throw new Error(`Karyawan ${employee.name} sudah nonaktif.`);
  }

  if (!employee.field_cash_account_id) {
    throw new Error(`Karyawan ${employee.name} belum memiliki akun kas petugas.`);
  }

  if (cashAccountId !== employee.field_cash_account_id) {
    throw new Error(`Akun kas petugas tidak sesuai dengan karyawan ${employee.name}.`);
  }

  const account = assertFieldCashAccount(
    await db.chartOfAccounts.get(employee.field_cash_account_id),
  );

  return account;
};

const createFieldCashSessionNumber = async (date = new Date()) => {
  const prefix = 'KSP-KP';
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, '');
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const count = await db.cooperativeFieldCashSessions
    .where('opened_at')
    .between(dayStart.toISOString(), dayEnd.toISOString(), true, true)
    .and((session) => session.session_number.startsWith(`${prefix}-${datePart}`))
    .count();

  return `${prefix}-${datePart}-${String(count + 1).padStart(4, '0')}`;
};

const sumFinanceTransactionsForCashAccount = (
  transactions: FinanceTransaction[],
  cashAccountId: string,
) => transactions
  .filter((transaction) => transaction.cash_account_id === cashAccountId && !transaction.deleted_at)
  .reduce((sum, transaction) => {
    if (transaction.type === 'INCOME' || transaction.type === 'OPENING_BALANCE') {
      return roundCurrency(sum + Number(transaction.amount || 0));
    }
    if (transaction.type === 'EXPENSE') {
      return roundCurrency(sum - Number(transaction.amount || 0));
    }
    return sum;
  }, 0);

export const getCashAccountBalance = async (
  cashAccountId: string,
  untilDate?: string,
) => {
  const transactions = await db.financeTransactions
    .where('cash_account_id')
    .equals(cashAccountId)
    .filter((transaction) => (
      !transaction.deleted_at &&
      (!untilDate || transaction.created_at <= untilDate)
    ))
    .toArray();

  return roundCurrency(sumFinanceTransactionsForCashAccount(transactions, cashAccountId));
};

export const getFieldCashEmployeeForCashAccount = async (cashAccountId?: string) => {
  if (!cashAccountId) return undefined;

  return db.employees
    .where('field_cash_account_id')
    .equals(cashAccountId)
    .and((employee) => employee.is_active)
    .first();
};

export const assertSufficientCashAccountBalance = async (
  cashAccountId: string,
  amount: number,
  options: { actionLabel?: string } = {},
) => {
  const balance = await getCashAccountBalance(cashAccountId);
  const neededAmount = roundCurrency(amount);

  if (balance + 0.01 >= neededAmount) {
    return balance;
  }

  const employee = await getFieldCashEmployeeForCashAccount(cashAccountId);
  const shortage = roundCurrency(neededAmount - balance);
  const employeeName = employee?.name ? ` ${employee.name}` : '';
  if (options.actionLabel) {
    throw new Error(
      `Saldo Kas Petugas${employeeName} tidak cukup untuk ${options.actionLabel}. Kekurangan Rp ${formatAmount(shortage)}.`,
    );
  }

  throw new Error(
    `Saldo Kas Petugas${employeeName} tidak cukup. Butuh tambahan Rp ${formatAmount(shortage)} dari finance sebelum pencairan.`,
  );
};

export const getOpenFieldCashSessionForEmployee = async (employeeId: string) => (
  db.cooperativeFieldCashSessions
    .where('employee_id')
    .equals(employeeId)
    .and((session) => session.status === 'OPEN')
    .first()
);

export const getOpenFieldCashSessionForCashAccount = async (cashAccountId: string) => (
  db.cooperativeFieldCashSessions
    .where('cash_account_id')
    .equals(cashAccountId)
    .and((session) => session.status === 'OPEN')
    .first()
);

export const getFieldCashContextForCashAccount = async (
  cashAccountId?: string,
): Promise<CooperativeFieldCashContext | undefined> => {
  const employee = await getFieldCashEmployeeForCashAccount(cashAccountId);
  if (!employee || !cashAccountId) return undefined;

  const session = await getOpenFieldCashSessionForCashAccount(cashAccountId);

  return {
    employee,
    session: session?.employee_id === employee.id ? session : undefined,
  };
};

export const buildFieldCashFinanceTransactionFields = (
  context: CooperativeFieldCashContext,
  movementKind: CooperativeFieldCashMovementKind,
): Pick<
  FinanceTransaction,
  | 'field_cash_session_id'
  | 'field_cash_session_number'
  | 'field_employee_id'
  | 'field_employee_name'
  | 'field_cash_movement_kind'
> => ({
  field_employee_id: context.employee.id,
  field_employee_name: context.employee.name,
  field_cash_movement_kind: movementKind,
  ...(context.session
    ? {
        field_cash_session_id: context.session.id,
        field_cash_session_number: context.session.session_number,
      }
    : {}),
});

const getSessionFinanceTransactions = async (session: CooperativeFieldCashSession) => (
  db.financeTransactions
    .where('field_cash_session_id')
    .equals(session.id)
    .filter((transaction) => !transaction.deleted_at)
    .toArray()
);

const buildReconciliation = (
  session: CooperativeFieldCashSession,
  transactions: FinanceTransaction[],
): CooperativeFieldCashReconciliation => {
  const sumByKind = (
    kind: CooperativeFieldCashMovementKind,
    normalType: FinanceTransaction['type'],
  ) => roundCurrency(
    transactions
      .filter((transaction) => transaction.field_cash_movement_kind === kind)
      .reduce((sum, transaction) => (
        sum + (transaction.type === normalType ? 1 : -1) * Number(transaction.amount || 0)
      ), 0),
  );
  const droppingFromFinance = sumByKind('DROPPING_FROM_FINANCE', 'INCOME');
  const stortingLoanPayment = sumByKind('STORTING_LOAN_PAYMENT', 'INCOME');
  const stortingSavingDeposit = sumByKind('STORTING_SAVING_DEPOSIT', 'INCOME');
  const loanDisbursement = sumByKind('LOAN_DISBURSEMENT', 'EXPENSE');
  const savingWithdrawal = sumByKind('SAVING_WITHDRAWAL', 'EXPENSE');
  const iptwPayout = sumByKind('IPTW_PAYOUT', 'EXPENSE');
  const depositToFinance = sumByKind('DEPOSIT_TO_FINANCE', 'EXPENSE');
  const expectedClosingCashAmount = roundCurrency(
    Number(session.opening_cash_amount || 0) +
    droppingFromFinance +
    stortingLoanPayment +
    stortingSavingDeposit -
    loanDisbursement -
    savingWithdrawal -
    iptwPayout -
    depositToFinance,
  );

  return {
    session,
    transactions,
    dropping_from_finance_amount: droppingFromFinance,
    storting_loan_payment_amount: stortingLoanPayment,
    storting_saving_deposit_amount: stortingSavingDeposit,
    loan_disbursement_amount: loanDisbursement,
    saving_withdrawal_amount: savingWithdrawal,
    iptw_payout_amount: iptwPayout,
    deposit_to_finance_amount: depositToFinance,
    total_storting_amount: roundCurrency(stortingLoanPayment + stortingSavingDeposit),
    expected_closing_cash_amount: expectedClosingCashAmount,
  };
};

export const buildFieldCashSessionReconciliation = async (
  sessionId: string,
): Promise<CooperativeFieldCashReconciliation> => {
  const session = await db.cooperativeFieldCashSessions.get(sessionId);
  if (!session) {
    throw new Error('Sesi kas petugas tidak ditemukan.');
  }

  return buildReconciliation(session, await getSessionFinanceTransactions(session));
};

export const openCooperativeFieldCashSession = async (
  input: OpenCooperativeFieldCashSessionInput,
) => {
  const currentUser = await requireFieldCashManage();
  const openingCashAmount = roundCurrency(Number(input.opening_cash_amount || 0));
  if (openingCashAmount < 0) {
    throw new Error('Uang fisik awal tidak boleh negatif.');
  }

  const now = new Date().toISOString();
  let session: CooperativeFieldCashSession | undefined;

  await db.transaction('rw', [
    db.cooperativeFieldCashSessions,
    db.employees,
    db.chartOfAccounts,
    db.financeTransactions,
    db.activityLogs,
  ], async () => {
    const employee = await db.employees.get(input.employee_id);
    if (!employee) {
      throw new Error('Karyawan tidak ditemukan.');
    }

    const account = await assertEmployeeFieldCashAccount(employee);
    const existingOpenSession = await getOpenFieldCashSessionForEmployee(employee.id)
      ?? await getOpenFieldCashSessionForCashAccount(account.id);
    if (existingOpenSession) {
      throw new Error(`Karyawan ${employee.name} sudah memiliki sesi kas petugas OPEN.`);
    }

    const expectedOpeningCashAmount = await getCashAccountBalance(account.id, now);
    const openingDifferenceAmount = roundCurrency(openingCashAmount - expectedOpeningCashAmount);
    if (Math.abs(openingDifferenceAmount) > 0.01 && !input.opening_note?.trim()) {
      throw new Error('Catatan wajib diisi jika uang fisik awal berbeda dari saldo sistem.');
    }

    session = {
      id: crypto.randomUUID(),
      session_number: await createFieldCashSessionNumber(new Date(now)),
      status: 'OPEN',
      employee_id: employee.id,
      employee_name: employee.name,
      employee_position: employee.position,
      cash_account_id: account.id,
      cash_account_code: account.code,
      cash_account_name: account.name,
      opened_at: now,
      opening_cash_amount: openingCashAmount,
      expected_opening_cash_amount: expectedOpeningCashAmount,
      opening_difference_amount: openingDifferenceAmount,
      opening_note: input.opening_note?.trim() || undefined,
      created_at: now,
      updated_at: now,
      created_by: currentUser?.id,
      created_by_name: currentUser?.name,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
    };

    await db.cooperativeFieldCashSessions.add(session);
    await writeActivityLog({
      user: currentUser,
      action: 'COOPERATIVE_FIELD_CASH_SESSION_OPENED',
      entity: 'cooperativeFieldCashSessions',
      entity_id: session.id,
      description: `${currentUser?.name ?? 'User'} membuka sesi kas petugas ${session.session_number} untuk ${employee.name}.`,
    });
  });

  if (!session) {
    throw new Error('Sesi kas petugas gagal dibuka.');
  }

  return session;
};

export const closeCooperativeFieldCashSession = async (
  input: CloseCooperativeFieldCashSessionInput,
) => {
  const currentUser = await requireFieldCashManage();
  const closingCashAmount = roundCurrency(Number(input.closing_cash_amount || 0));
  if (closingCashAmount < 0) {
    throw new Error('Uang fisik akhir tidak boleh negatif.');
  }

  const now = new Date().toISOString();
  let closedSession: CooperativeFieldCashSession | undefined;

  await db.transaction('rw', [
    db.cooperativeFieldCashSessions,
    db.financeTransactions,
    db.activityLogs,
  ], async () => {
    const session = await db.cooperativeFieldCashSessions.get(input.session_id);
    if (!session) {
      throw new Error('Sesi kas petugas tidak ditemukan.');
    }
    if (session.status !== 'OPEN') {
      throw new Error('Sesi kas petugas sudah ditutup.');
    }

    const reconciliation = buildReconciliation(session, await getSessionFinanceTransactions(session));
    const closingDifferenceAmount = roundCurrency(closingCashAmount - reconciliation.expected_closing_cash_amount);
    if (Math.abs(closingDifferenceAmount) > 0.01 && !input.closing_note?.trim()) {
      throw new Error('Catatan wajib diisi jika uang fisik akhir berbeda dari saldo akhir sistem.');
    }

    closedSession = {
      ...session,
      status: 'CLOSED',
      closed_at: now,
      closing_cash_amount: closingCashAmount,
      expected_closing_cash_amount: reconciliation.expected_closing_cash_amount,
      closing_difference_amount: closingDifferenceAmount,
      closing_note: input.closing_note?.trim() || undefined,
      balance_status: Math.abs(closingDifferenceAmount) <= 0.01 ? 'BALANCED' : 'NON_BALANCED',
      dropping_from_finance_amount: reconciliation.dropping_from_finance_amount,
      storting_loan_payment_amount: reconciliation.storting_loan_payment_amount,
      storting_saving_deposit_amount: reconciliation.storting_saving_deposit_amount,
      loan_disbursement_amount: reconciliation.loan_disbursement_amount,
      saving_withdrawal_amount: reconciliation.saving_withdrawal_amount,
      iptw_payout_amount: reconciliation.iptw_payout_amount,
      deposit_to_finance_amount: reconciliation.deposit_to_finance_amount,
      updated_at: now,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
    };

    await db.cooperativeFieldCashSessions.put(closedSession);
    await writeActivityLog({
      user: currentUser,
      action: 'COOPERATIVE_FIELD_CASH_SESSION_CLOSED',
      entity: 'cooperativeFieldCashSessions',
      entity_id: session.id,
      description: `${currentUser?.name ?? 'User'} menutup sesi kas petugas ${session.session_number} untuk ${session.employee_name}.`,
    });
  });

  if (!closedSession) {
    throw new Error('Sesi kas petugas gagal ditutup.');
  }

  return closedSession;
};

const assertFieldCashTransferInput = async (input: RecordFieldCashTransferInput) => {
  if (!isPositiveAmount(input.amount)) {
    throw new Error('Nominal transfer kas petugas harus lebih dari 0.');
  }

  const employee = await db.employees.get(input.employee_id);
  if (!employee) {
    throw new Error('Karyawan tidak ditemukan.');
  }
  const cashAccount = await assertEmployeeFieldCashAccount(employee, input.cash_account_id);
  const financeAccount = assertFieldCashAccount(
    await db.chartOfAccounts.get(input.finance_cash_account_id),
    'Akun kas/bank finance',
  );
  if (cashAccount.id === financeAccount.id) {
    throw new Error('Akun kas petugas dan akun finance harus berbeda.');
  }

  return { employee, cashAccount, financeAccount };
};

export const recordDroppingFromFinanceToPetugas = async (
  input: RecordFieldCashTransferInput,
): Promise<RecordCashBankTransferResult> => {
  await requireFieldCashManage();
  const { employee } = await assertFieldCashTransferInput(input);

  return recordCashBankTransfer({
    from_cash_account_id: input.finance_cash_account_id,
    to_cash_account_id: input.cash_account_id,
    amount: input.amount,
    transfer_date: input.transfer_date,
    notes: input.notes ?? `Dropping kas dari finance ke ${employee.name}.`,
  });
};

export const recordDepositFromPetugasToFinance = async (
  input: RecordFieldCashTransferInput,
): Promise<RecordCashBankTransferResult> => {
  await requireFieldCashManage();
  const { employee } = await assertFieldCashTransferInput(input);
  await assertSufficientCashAccountBalance(input.cash_account_id, input.amount, {
    actionLabel: 'setor ke finance',
  });

  return recordCashBankTransfer({
    from_cash_account_id: input.cash_account_id,
    to_cash_account_id: input.finance_cash_account_id,
    amount: input.amount,
    transfer_date: input.transfer_date,
    notes: input.notes ?? `Setor kas petugas ${employee.name} ke finance.`,
  });
};

export const closeFieldCashBookToFinance = async (
  input: CloseFieldCashBookInput,
): Promise<RecordCashBankTransferResult> => {
  await requireFieldCashManage();

  const employee = await db.employees.get(input.employee_id);
  if (!employee) {
    throw new Error('Karyawan tidak ditemukan.');
  }

  await assertEmployeeFieldCashAccount(employee, input.cash_account_id);
  const financeAccount = assertFieldCashAccount(
    await db.chartOfAccounts.get(input.finance_cash_account_id),
    'Akun kas/bank finance',
  );
  if (input.cash_account_id === financeAccount.id) {
    throw new Error('Akun kas petugas dan akun finance harus berbeda.');
  }

  const closingAmount = roundCurrency(await getCashAccountBalance(input.cash_account_id));
  if (!isPositiveAmount(closingAmount)) {
    throw new Error('Saldo kolektor sudah 0, tidak perlu tutup buku.');
  }

  return recordCashBankTransfer({
    from_cash_account_id: input.cash_account_id,
    to_cash_account_id: input.finance_cash_account_id,
    amount: closingAmount,
    transfer_date: input.transfer_date,
    notes: input.notes ?? `Tutup buku setoran kolektor ${employee.name} ke finance.`,
  });
};
