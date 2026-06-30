import { FINANCE_CATEGORIES, isProfitAffectingFinanceTransaction } from '@/constants/finance';
import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import { payrollPaymentSchema, payrollRunSchema } from '@/lib/validations/payroll';
import {
  buildPayrollCashAdvanceAllocations,
  postPayrollCashAdvanceRepayments,
  reservePayrollCashAdvanceRepayments,
  voidPayrollCashAdvanceRepayments,
} from '@/services/employeeCashAdvanceService';
import { enqueueFinanceTransactionsSync, withPendingFinanceTransactionSync } from '@/services/financeTransactionSyncService';
import { getCashOrBankAccountForPayment, postPayrollRunPaidJournal } from '@/services/generalLedgerService';
import { enqueueEmployeeCashAdvanceBundleSync, enqueuePayrollRunBundleSync } from '@/services/syncQueueService';
import { getFinanceAccountSnapshotForCategory } from '@/utils/chartOfAccounts/getFinanceAccountSnapshotForCategory';
import type {
  AuthUser,
  Employee,
  EmployeeCashAdvance,
  FinanceTransaction,
  PayrollRun,
  PayrollRunItem,
} from '@/types';

export interface PayrollRunItemInput {
  id?: string;
  employee_id: string;
  base_salary: number;
  allowance_amount?: number;
  bonus_amount?: number;
  other_deduction_amount?: number;
  deduction_amount?: number;
  notes?: string;
}

export interface PayrollRunUpsertInput {
  period_start: string;
  period_end: string;
  notes?: string;
  items: PayrollRunItemInput[];
}

export interface PayrollPaymentInput {
  paid_at?: string;
  payment_method?: 'TUNAI' | 'NON_TUNAI';
  payment_channel?: string;
  cash_account_id: string;
}

const roundCurrency = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const requirePayrollActor = async () => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'FINANCE_ACCESS');
  return currentUser;
};

const withPendingPayrollRunSync = (run: PayrollRun): PayrollRun => ({
  ...run,
  sync_status: 'pending',
  sync_error: undefined,
});

const enqueuePayrollRunWithCurrentDetails = async (
  run: PayrollRun,
  operation: 'create' | 'update',
) => {
  const [items, repayments] = await Promise.all([
    db.payrollRunItems.where('payroll_run_id').equals(run.id).toArray(),
    db.employeeCashAdvanceRepayments.where('payroll_run_id').equals(run.id).toArray(),
  ]);

  await enqueuePayrollRunBundleSync(run, items, repayments, operation);
};

const enqueueCashAdvanceBundlesWithCurrentRepayments = async (
  cashAdvances: EmployeeCashAdvance[],
) => {
  const uniqueCashAdvances = Array.from(new Map(cashAdvances.map((cashAdvance) => [
    cashAdvance.id,
    cashAdvance,
  ])).values());

  for (const cashAdvance of uniqueCashAdvances) {
    const repayments = await db.employeeCashAdvanceRepayments
      .where('cash_advance_id')
      .equals(cashAdvance.id)
      .toArray();

    await enqueueEmployeeCashAdvanceBundleSync(cashAdvance, repayments, 'update');
  }
};

const normalizeDateOnly = (value: string) => value.slice(0, 10);

const createNextPayrollNumber = async (periodStart: string) => {
  const periodKey = normalizeDateOnly(periodStart).slice(0, 7).replace('-', '');
  const prefix = `PYR-${periodKey}-`;
  let sequence = await db.payrollRuns
    .where('payroll_number')
    .startsWith(prefix)
    .count() + 1;
  let candidate = `${prefix}${String(sequence).padStart(3, '0')}`;

  while (await db.payrollRuns.where('payroll_number').equals(candidate).first()) {
    sequence += 1;
    candidate = `${prefix}${String(sequence).padStart(3, '0')}`;
  }

  return candidate;
};

const getEmployeeSnapshots = async (employeeIds: string[]) => {
  const uniqueIds = Array.from(new Set(employeeIds));
  const employees = await db.employees.bulkGet(uniqueIds);
  const missingIndex = employees.findIndex((employee) => !employee);

  if (missingIndex >= 0) {
    throw new Error('Salah satu karyawan payroll tidak ditemukan.');
  }

  return new Map((employees as Employee[]).map((employee) => [employee.id, employee]));
};

const sanitizePayrollRunInput = async (input: PayrollRunUpsertInput) => {
  const parsed = payrollRunSchema.parse(input);
  const employeeIds = parsed.items.map((item) => item.employee_id);
  const uniqueEmployeeIds = new Set(employeeIds);

  if (uniqueEmployeeIds.size !== employeeIds.length) {
    throw new Error('Satu karyawan hanya boleh muncul satu kali dalam payroll.');
  }

  const employeeById = await getEmployeeSnapshots(employeeIds);

  return {
    period_start: normalizeDateOnly(parsed.period_start),
    period_end: normalizeDateOnly(parsed.period_end),
    notes: parsed.notes,
    items: parsed.items.map((item) => {
      const employee = employeeById.get(item.employee_id);
      if (!employee) {
        throw new Error('Karyawan payroll tidak ditemukan.');
      }

      return {
        ...item,
        employee,
        base_salary: roundCurrency(item.base_salary),
        allowance_amount: roundCurrency(item.allowance_amount),
        bonus_amount: roundCurrency(item.bonus_amount),
        other_deduction_amount: roundCurrency(item.other_deduction_amount ?? item.deduction_amount ?? 0),
      };
    }),
  };
};

const buildPayrollItems = (
  payrollRunId: string,
  inputItems: Awaited<ReturnType<typeof sanitizePayrollRunInput>>['items'],
  now: string,
): PayrollRunItem[] => inputItems.map((item) => {
  const grossAmount = roundCurrency(item.base_salary + item.allowance_amount + item.bonus_amount);
  const cashAdvanceDeductionAmount = 0;
  const deductionAmount = roundCurrency(item.other_deduction_amount + cashAdvanceDeductionAmount);
  const netAmount = roundCurrency(grossAmount - deductionAmount);

  return {
    id: `${payrollRunId}:${item.employee.id}`,
    payroll_run_id: payrollRunId,
    employee_id: item.employee.id,
    employee_name: item.employee.name,
    employee_position: item.employee.position,
    base_salary: item.base_salary,
    allowance_amount: item.allowance_amount,
    bonus_amount: item.bonus_amount,
    other_deduction_amount: item.other_deduction_amount,
    cash_advance_deduction_amount: cashAdvanceDeductionAmount,
    deduction_amount: deductionAmount,
    gross_amount: grossAmount,
    net_amount: netAmount,
    notes: item.notes,
    created_at: now,
    updated_at: now,
  };
});

const summarizePayrollItems = (items: PayrollRunItem[]) => items.reduce((acc, item) => ({
  employee_count: acc.employee_count + 1,
  gross_amount: roundCurrency(acc.gross_amount + item.gross_amount),
  allowance_amount: roundCurrency(acc.allowance_amount + item.allowance_amount),
  bonus_amount: roundCurrency(acc.bonus_amount + item.bonus_amount),
  other_deduction_amount: roundCurrency(acc.other_deduction_amount + item.other_deduction_amount),
  cash_advance_deduction_amount: roundCurrency(acc.cash_advance_deduction_amount + item.cash_advance_deduction_amount),
  deduction_amount: roundCurrency(acc.deduction_amount + item.deduction_amount),
  net_amount: roundCurrency(acc.net_amount + item.net_amount),
}), {
  employee_count: 0,
  gross_amount: 0,
  allowance_amount: 0,
  bonus_amount: 0,
  other_deduction_amount: 0,
  cash_advance_deduction_amount: 0,
  deduction_amount: 0,
  net_amount: 0,
});

const assertPayrollCanBePaid = async (run: PayrollRun) => {
  if (run.status !== 'APPROVED') {
    throw new Error('Payroll harus di-approve sebelum dibayar.');
  }
  if (run.finance_transaction_id) {
    throw new Error('Payroll ini sudah memiliki transaksi pembayaran.');
  }
  if (run.net_amount <= 0 && Number(run.cash_advance_deduction_amount || 0) <= 0) {
    throw new Error('Total net payroll harus lebih dari 0.');
  }
};

const buildPayrollPaymentDescription = (run: PayrollRun) => (
  `Pembayaran gaji ${run.payroll_number} periode ${run.period_start} s/d ${run.period_end}`
);

const addPayrollFinanceEffect = async (
  run: PayrollRun,
  payment: ReturnType<typeof payrollPaymentSchema.parse>,
  currentUser: AuthUser | null,
  now: string,
) => {
  const paidAt = payment.paid_at ?? now;
  const cashAccount = await getCashOrBankAccountForPayment(payment.payment_method, payment.cash_account_id);
  const accountSnapshot = await getFinanceAccountSnapshotForCategory(FINANCE_CATEGORIES.PAYROLL);
  const financeTransaction = withPendingFinanceTransactionSync({
    id: crypto.randomUUID(),
    type: 'EXPENSE',
    category: FINANCE_CATEGORIES.PAYROLL,
    amount: run.net_amount,
    description: buildPayrollPaymentDescription(run),
    created_at: paidAt,
    reference_id: run.id,
    payment_method: payment.payment_method,
    payment_channel: payment.payment_channel,
    cash_account_id: cashAccount.id,
    cash_account_code: cashAccount.code,
    cash_account_name: cashAccount.name,
    ...accountSnapshot,
  }, currentUser, now);

  const currentBalance = await db.financeBalance.get('current');
  await db.financeBalance.put({
    id: 'current',
    amount: roundCurrency((currentBalance?.amount ?? 0) - run.net_amount),
    updated_at: now,
  });

  if (isProfitAffectingFinanceTransaction(financeTransaction.type, financeTransaction.category)) {
    const currentProfitBalance = await db.profitBalance.get('current');
    const nextProfitBalance = roundCurrency((currentProfitBalance?.amount ?? 0) - run.net_amount);

    await db.profitBalance.put({
      id: 'current',
      amount: nextProfitBalance,
      updated_at: now,
    });

    await db.profitLogs.add({
      id: crypto.randomUUID(),
      amount: run.net_amount,
      type: 'OUT',
      category: 'OPERATIONAL',
      description: `Payroll: ${run.payroll_number}`,
      created_at: paidAt,
      balance_after: nextProfitBalance,
    });
  }

  await db.financeTransactions.add(financeTransaction);
  return financeTransaction;
};

export const createPayrollRun = async (input: PayrollRunUpsertInput): Promise<PayrollRun> => {
  const currentUser = await requirePayrollActor();
  const sanitized = await sanitizePayrollRunInput(input);
  const now = new Date().toISOString();
  const payrollRunId = crypto.randomUUID();
  const payrollNumber = await createNextPayrollNumber(sanitized.period_start);
  const draftItems = buildPayrollItems(payrollRunId, sanitized.items, now);
  const { items, repayments } = await buildPayrollCashAdvanceAllocations({
    payrollRunId,
    payrollNumber,
    items: draftItems,
    now,
  });
  const totals = summarizePayrollItems(items);
  const payrollRun: PayrollRun = withPendingPayrollRunSync({
    id: payrollRunId,
    payroll_number: payrollNumber,
    period_start: sanitized.period_start,
    period_end: sanitized.period_end,
    status: 'DRAFT',
    ...totals,
    notes: sanitized.notes,
    created_by: currentUser?.id,
    created_by_name: currentUser?.name,
    updated_by: currentUser?.id,
    updated_by_name: currentUser?.name,
    created_at: now,
    updated_at: now,
  });

  await db.transaction('rw', [db.payrollRuns, db.payrollRunItems, db.employeeCashAdvanceRepayments, db.activityLogs], async () => {
    await db.payrollRuns.add(payrollRun);
    await db.payrollRunItems.bulkAdd(items);
    if (repayments.length > 0) {
      await db.employeeCashAdvanceRepayments.bulkAdd(repayments);
    }
    await writeActivityLog({
      user: currentUser,
      action: 'PAYROLL_RUN_CREATED',
      entity: 'payrollRuns',
      entity_id: payrollRun.id,
      description: `${currentUser?.name ?? 'User'} membuat payroll ${payrollRun.payroll_number}.`,
    });
  });

  await enqueuePayrollRunBundleSync(payrollRun, items, repayments, 'create');
  return payrollRun;
};

export const updatePayrollRun = async (
  payrollRunId: string,
  input: PayrollRunUpsertInput,
): Promise<PayrollRun> => {
  const currentUser = await requirePayrollActor();
  const existingRun = await db.payrollRuns.get(payrollRunId);
  if (!existingRun) {
    throw new Error('Payroll tidak ditemukan.');
  }
  if (existingRun.status !== 'DRAFT') {
    throw new Error('Hanya payroll draft yang bisa diedit.');
  }

  const sanitized = await sanitizePayrollRunInput(input);
  const now = new Date().toISOString();
  const draftItems = buildPayrollItems(existingRun.id, sanitized.items, now);
  const { items, repayments } = await buildPayrollCashAdvanceAllocations({
    payrollRunId: existingRun.id,
    payrollNumber: existingRun.payroll_number,
    items: draftItems,
    now,
  });
  const totals = summarizePayrollItems(items);
  const updatedRun: PayrollRun = withPendingPayrollRunSync({
    ...existingRun,
    period_start: sanitized.period_start,
    period_end: sanitized.period_end,
    ...totals,
    notes: sanitized.notes,
    updated_by: currentUser?.id,
    updated_by_name: currentUser?.name,
    updated_at: now,
  });

  await db.transaction('rw', [db.payrollRuns, db.payrollRunItems, db.employeeCashAdvanceRepayments, db.activityLogs], async () => {
    await db.payrollRuns.put(updatedRun);
    await db.payrollRunItems.where('payroll_run_id').equals(existingRun.id).delete();
    await db.employeeCashAdvanceRepayments
      .where('payroll_run_id')
      .equals(existingRun.id)
      .filter((repayment) => repayment.status === 'DRAFT')
      .delete();
    await db.payrollRunItems.bulkAdd(items);
    if (repayments.length > 0) {
      await db.employeeCashAdvanceRepayments.bulkAdd(repayments);
    }
    await writeActivityLog({
      user: currentUser,
      action: 'PAYROLL_RUN_UPDATED',
      entity: 'payrollRuns',
      entity_id: updatedRun.id,
      description: `${currentUser?.name ?? 'User'} mengubah payroll ${updatedRun.payroll_number}.`,
    });
  });

  await enqueuePayrollRunBundleSync(updatedRun, items, repayments, 'update');
  return updatedRun;
};

export const approvePayrollRun = async (payrollRunId: string): Promise<PayrollRun> => {
  const currentUser = await requirePayrollActor();
  const run = await db.payrollRuns.get(payrollRunId);
  if (!run) {
    throw new Error('Payroll tidak ditemukan.');
  }
  if (run.status !== 'DRAFT') {
    throw new Error('Hanya payroll draft yang bisa di-approve.');
  }
  if (run.employee_count < 1 || run.net_amount <= 0) {
    throw new Error('Payroll harus memiliki minimal satu slip dengan total net lebih dari 0.');
  }

  const now = new Date().toISOString();
  const approvedRun: PayrollRun = withPendingPayrollRunSync({
    ...run,
    status: 'APPROVED',
    approved_at: now,
    updated_by: currentUser?.id,
    updated_by_name: currentUser?.name,
    updated_at: now,
  });

  await db.transaction('rw', [
    db.payrollRuns,
    db.employeeCashAdvances,
    db.employeeCashAdvanceRepayments,
    db.activityLogs,
  ], async () => {
    await reservePayrollCashAdvanceRepayments(approvedRun.id, now);
    await db.payrollRuns.put(approvedRun);
    await writeActivityLog({
      user: currentUser,
      action: 'PAYROLL_RUN_APPROVED',
      entity: 'payrollRuns',
      entity_id: approvedRun.id,
      description: `${currentUser?.name ?? 'User'} meng-approve payroll ${approvedRun.payroll_number}.`,
    });
  });

  await enqueuePayrollRunWithCurrentDetails(approvedRun, 'update');
  return approvedRun;
};

export const payPayrollRun = async (
  payrollRunId: string,
  input: PayrollPaymentInput,
): Promise<PayrollRun> => {
  const currentUser = await requirePayrollActor();
  const payment = payrollPaymentSchema.parse(input);
  const now = new Date().toISOString();
  let paidRun: PayrollRun | undefined;
  let financeTransaction: FinanceTransaction | undefined;
  let postedCashAdvances: EmployeeCashAdvance[] = [];

  await db.transaction('rw', [
    db.payrollRuns,
    db.employeeCashAdvances,
    db.employeeCashAdvanceRepayments,
    db.financeTransactions,
    db.financeBalance,
    db.profitBalance,
    db.profitLogs,
    db.chartOfAccounts,
    db.financeAccountMappings,
    db.enabledModules,
    db.generalLedgerSetting,
    db.journalEntries,
    db.journalEntryLines,
    db.activityLogs,
  ], async () => {
    const run = await db.payrollRuns.get(payrollRunId);
    if (!run) {
      throw new Error('Payroll tidak ditemukan.');
    }

    await assertPayrollCanBePaid(run);
    const paidAt = payment.paid_at ?? now;
    if (run.net_amount > 0) {
      financeTransaction = await addPayrollFinanceEffect(run, payment, currentUser, now);
    }
    const cashAdvancePosting = await postPayrollCashAdvanceRepayments(run.id, paidAt, now);
    postedCashAdvances = cashAdvancePosting.cashAdvances;
    paidRun = withPendingPayrollRunSync({
      ...run,
      status: 'PAID',
      paid_at: paidAt,
      payment_method: payment.payment_method,
      payment_channel: payment.payment_channel,
      cash_account_id: financeTransaction?.cash_account_id,
      cash_account_code: financeTransaction?.cash_account_code,
      cash_account_name: financeTransaction?.cash_account_name,
      finance_transaction_id: financeTransaction?.id,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
      updated_at: now,
    });

    await db.payrollRuns.put(paidRun);
    await postPayrollRunPaidJournal(paidRun, currentUser);
    await writeActivityLog({
      user: currentUser,
      action: 'PAYROLL_RUN_PAID',
      entity: 'payrollRuns',
      entity_id: paidRun.id,
      description: `${currentUser?.name ?? 'User'} membayar payroll ${paidRun.payroll_number} sebesar ${paidRun.net_amount}.`,
    });
  });

  if (!paidRun) {
    throw new Error('Pembayaran payroll gagal dicatat.');
  }

  if (financeTransaction) {
    await enqueueFinanceTransactionsSync([financeTransaction], 'create');
  }
  await enqueuePayrollRunWithCurrentDetails(paidRun, 'update');
  await enqueueCashAdvanceBundlesWithCurrentRepayments(postedCashAdvances);
  return paidRun;
};

export const voidPayrollRun = async (payrollRunId: string): Promise<PayrollRun> => {
  const currentUser = await requirePayrollActor();
  const run = await db.payrollRuns.get(payrollRunId);
  if (!run) {
    throw new Error('Payroll tidak ditemukan.');
  }
  if (run.status === 'PAID') {
    throw new Error('Payroll yang sudah dibayar tidak bisa dibatalkan dari halaman ini.');
  }
  if (run.status === 'VOIDED') {
    throw new Error('Payroll sudah dibatalkan.');
  }

  const now = new Date().toISOString();
  const voidedRun: PayrollRun = withPendingPayrollRunSync({
    ...run,
    status: 'VOIDED',
    voided_at: now,
    updated_by: currentUser?.id,
    updated_by_name: currentUser?.name,
    updated_at: now,
  });

  await db.transaction('rw', [db.payrollRuns, db.employeeCashAdvanceRepayments, db.activityLogs], async () => {
    await voidPayrollCashAdvanceRepayments(voidedRun.id, now);
    await db.payrollRuns.put(voidedRun);
    await writeActivityLog({
      user: currentUser,
      action: 'PAYROLL_RUN_VOIDED',
      entity: 'payrollRuns',
      entity_id: voidedRun.id,
      description: `${currentUser?.name ?? 'User'} membatalkan payroll ${voidedRun.payroll_number}.`,
    });
  });

  await enqueuePayrollRunWithCurrentDetails(voidedRun, 'update');
  return voidedRun;
};
