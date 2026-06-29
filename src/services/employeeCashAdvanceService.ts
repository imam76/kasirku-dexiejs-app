import { FINANCE_CATEGORIES } from '@/constants/finance';
import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import { employeeCashAdvanceSchema, employeeCashAdvanceVoidSchema } from '@/lib/validations/employeeCashAdvance';
import {
  enqueueFinanceTransactionsSync,
  withDeletedFinanceTransactionSync,
  withPendingFinanceTransactionSync,
} from '@/services/financeTransactionSyncService';
import {
  getCashOrBankAccountForPayment,
  postEmployeeCashAdvanceDisbursementJournal,
  reverseEmployeeCashAdvanceDisbursementJournal,
} from '@/services/generalLedgerService';
import { getFinanceAccountSnapshotForCategory } from '@/utils/chartOfAccounts/getFinanceAccountSnapshotForCategory';
import type {
  EmployeeCashAdvance,
  EmployeeCashAdvanceRepayment,
  FinanceTransaction,
  PayrollRunItem,
} from '@/types';

export interface CreateEmployeeCashAdvanceInput {
  employee_id: string;
  amount: number;
  disbursed_at?: string;
  payment_method?: 'TUNAI' | 'NON_TUNAI';
  payment_channel?: string;
  cash_account_id: string;
  notes?: string;
}

export interface VoidEmployeeCashAdvanceInput {
  id: string;
  reason: string;
}

interface BuildPayrollCashAdvanceAllocationsInput {
  payrollRunId: string;
  payrollNumber: string;
  items: PayrollRunItem[];
  now: string;
}

const roundCurrency = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const requireCashAdvanceActor = async () => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'FINANCE_ACCESS');
  return currentUser;
};

const normalizeDateOnly = (value: string) => value.slice(0, 10);

const createNextCashAdvanceNumber = async (disbursedAt: string) => {
  const periodKey = normalizeDateOnly(disbursedAt).slice(0, 7).replace('-', '');
  const prefix = `KSB-${periodKey}-`;
  let sequence = await db.employeeCashAdvances
    .where('advance_number')
    .startsWith(prefix)
    .count() + 1;
  let candidate = `${prefix}${String(sequence).padStart(3, '0')}`;

  while (await db.employeeCashAdvances.where('advance_number').equals(candidate).first()) {
    sequence += 1;
    candidate = `${prefix}${String(sequence).padStart(3, '0')}`;
  }

  return candidate;
};

const getReservedAmountByAdvance = async (excludePayrollRunId?: string) => {
  const reservedRepayments = await db.employeeCashAdvanceRepayments
    .where('status')
    .equals('RESERVED')
    .filter((repayment) => repayment.payroll_run_id !== excludePayrollRunId)
    .toArray();

  return reservedRepayments.reduce<Map<string, number>>((acc, repayment) => {
    acc.set(repayment.cash_advance_id, roundCurrency((acc.get(repayment.cash_advance_id) ?? 0) + repayment.amount));
    return acc;
  }, new Map<string, number>());
};

const getAvailableAmount = (
  advance: EmployeeCashAdvance,
  reservedAmountByAdvance: Map<string, number>,
) => roundCurrency(advance.outstanding_amount - (reservedAmountByAdvance.get(advance.id) ?? 0));

const updateFinanceBalanceForCashAdvance = async (amountDelta: number, now: string) => {
  const currentBalance = await db.financeBalance.get('current');
  await db.financeBalance.put({
    id: 'current',
    amount: roundCurrency((currentBalance?.amount ?? 0) + amountDelta),
    updated_at: now,
  });
};

export const createEmployeeCashAdvance = async (
  input: CreateEmployeeCashAdvanceInput,
): Promise<EmployeeCashAdvance> => {
  const currentUser = await requireCashAdvanceActor();
  const parsed = employeeCashAdvanceSchema.parse(input);
  const now = new Date().toISOString();
  const disbursedAt = parsed.disbursed_at ?? now;
  const cashAdvanceId = crypto.randomUUID();
  const financeTransactionId = crypto.randomUUID();
  let savedCashAdvance: EmployeeCashAdvance | undefined;
  let financeTransaction: FinanceTransaction | undefined;

  await db.transaction('rw', [
    db.employees,
    db.employeeCashAdvances,
    db.financeTransactions,
    db.financeBalance,
    db.chartOfAccounts,
    db.financeAccountMappings,
    db.enabledModules,
    db.generalLedgerSetting,
    db.journalEntries,
    db.journalEntryLines,
    db.activityLogs,
  ], async () => {
    const employee = await db.employees.get(parsed.employee_id);
    if (!employee || !employee.is_active) {
      throw new Error('Kasbon hanya bisa dibuat untuk karyawan aktif.');
    }

    const amount = roundCurrency(parsed.amount);
    const cashAccount = await getCashOrBankAccountForPayment(parsed.payment_method, parsed.cash_account_id);
    const accountSnapshot = await getFinanceAccountSnapshotForCategory(FINANCE_CATEGORIES.EMPLOYEE_CASH_ADVANCE);
    const advanceNumber = await createNextCashAdvanceNumber(disbursedAt);

    savedCashAdvance = {
      id: cashAdvanceId,
      advance_number: advanceNumber,
      employee_id: employee.id,
      employee_name: employee.name,
      employee_position: employee.position,
      amount,
      outstanding_amount: amount,
      status: 'ACTIVE',
      disbursed_at: disbursedAt,
      payment_method: parsed.payment_method,
      payment_channel: parsed.payment_channel,
      cash_account_id: cashAccount.id,
      cash_account_code: cashAccount.code,
      cash_account_name: cashAccount.name,
      finance_transaction_id: financeTransactionId,
      notes: parsed.notes,
      created_by: currentUser?.id,
      created_by_name: currentUser?.name,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
      created_at: now,
      updated_at: now,
    };

    financeTransaction = withPendingFinanceTransactionSync({
      id: financeTransactionId,
      type: 'EXPENSE',
      category: FINANCE_CATEGORIES.EMPLOYEE_CASH_ADVANCE,
      amount,
      description: `Pencairan kasbon ${advanceNumber} ${employee.name}`,
      created_at: disbursedAt,
      reference_id: cashAdvanceId,
      payment_method: parsed.payment_method,
      payment_channel: parsed.payment_channel,
      cash_account_id: cashAccount.id,
      cash_account_code: cashAccount.code,
      cash_account_name: cashAccount.name,
      ...accountSnapshot,
    }, currentUser, now);

    await updateFinanceBalanceForCashAdvance(-amount, now);
    await db.employeeCashAdvances.add(savedCashAdvance);
    await db.financeTransactions.add(financeTransaction);
    await postEmployeeCashAdvanceDisbursementJournal(savedCashAdvance, currentUser);
    await writeActivityLog({
      user: currentUser,
      action: 'EMPLOYEE_CASH_ADVANCE_CREATED',
      entity: 'employeeCashAdvances',
      entity_id: savedCashAdvance.id,
      description: `${currentUser?.name ?? 'User'} mencairkan kasbon ${advanceNumber} untuk ${employee.name} sebesar ${amount}.`,
    });
  });

  if (!savedCashAdvance || !financeTransaction) {
    throw new Error('Kasbon gagal disimpan.');
  }

  await enqueueFinanceTransactionsSync([financeTransaction], 'create');
  return savedCashAdvance;
};

export const voidEmployeeCashAdvance = async (
  input: VoidEmployeeCashAdvanceInput,
): Promise<EmployeeCashAdvance> => {
  const currentUser = await requireCashAdvanceActor();
  const parsed = employeeCashAdvanceVoidSchema.parse(input);
  const now = new Date().toISOString();
  let voidedCashAdvance: EmployeeCashAdvance | undefined;
  let deletedFinanceTransaction: FinanceTransaction | undefined;

  await db.transaction('rw', [
    db.employeeCashAdvances,
    db.employeeCashAdvanceRepayments,
    db.financeTransactions,
    db.financeBalance,
    db.chartOfAccounts,
    db.enabledModules,
    db.generalLedgerSetting,
    db.journalEntries,
    db.journalEntryLines,
    db.activityLogs,
  ], async () => {
    const cashAdvance = await db.employeeCashAdvances.get(parsed.id);
    if (!cashAdvance) {
      throw new Error('Kasbon tidak ditemukan.');
    }
    if (cashAdvance.status === 'VOIDED') {
      throw new Error('Kasbon sudah dibatalkan.');
    }

    const lockedRepayment = await db.employeeCashAdvanceRepayments
      .where('cash_advance_id')
      .equals(cashAdvance.id)
      .filter((repayment) => repayment.status === 'RESERVED' || repayment.status === 'POSTED')
      .first();
    if (lockedRepayment) {
      throw new Error('Kasbon yang sudah masuk payroll approved atau paid tidak bisa dibatalkan.');
    }

    const draftRepayments = await db.employeeCashAdvanceRepayments
      .where('cash_advance_id')
      .equals(cashAdvance.id)
      .filter((repayment) => repayment.status === 'DRAFT')
      .toArray();

    if (draftRepayments.length > 0) {
      await db.employeeCashAdvanceRepayments.bulkPut(draftRepayments.map((repayment) => ({
        ...repayment,
        status: 'VOIDED' as const,
        voided_at: now,
        updated_at: now,
      })));
    }

    const financeTransaction = cashAdvance.finance_transaction_id
      ? await db.financeTransactions.get(cashAdvance.finance_transaction_id)
      : undefined;
    if (financeTransaction) {
      deletedFinanceTransaction = withDeletedFinanceTransactionSync(financeTransaction, currentUser, now);
      await db.financeTransactions.delete(financeTransaction.id);
    }

    await updateFinanceBalanceForCashAdvance(cashAdvance.amount, now);
    voidedCashAdvance = {
      ...cashAdvance,
      status: 'VOIDED',
      outstanding_amount: 0,
      voided_at: now,
      void_reason: parsed.reason,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
      updated_at: now,
    };

    await db.employeeCashAdvances.put(voidedCashAdvance);
    await reverseEmployeeCashAdvanceDisbursementJournal(
      voidedCashAdvance,
      `Pembatalan kasbon: ${parsed.reason}`,
      currentUser,
      now,
    );
    await writeActivityLog({
      user: currentUser,
      action: 'EMPLOYEE_CASH_ADVANCE_VOIDED',
      entity: 'employeeCashAdvances',
      entity_id: voidedCashAdvance.id,
      description: `${currentUser?.name ?? 'User'} membatalkan kasbon ${voidedCashAdvance.advance_number}. Alasan: ${parsed.reason}`,
    });
  });

  if (!voidedCashAdvance) {
    throw new Error('Pembatalan kasbon gagal disimpan.');
  }

  if (deletedFinanceTransaction) {
    await enqueueFinanceTransactionsSync([deletedFinanceTransaction], 'delete');
  }

  return voidedCashAdvance;
};

export const buildPayrollCashAdvanceAllocations = async ({
  payrollRunId,
  payrollNumber,
  items,
  now,
}: BuildPayrollCashAdvanceAllocationsInput) => {
  const employeeIds = Array.from(new Set(items.map((item) => item.employee_id)));
  const reservedAmountByAdvance = await getReservedAmountByAdvance(payrollRunId);
  const advances = employeeIds.length > 0
    ? await db.employeeCashAdvances
        .where('employee_id')
        .anyOf(employeeIds)
        .filter((advance) => advance.status === 'ACTIVE' && advance.outstanding_amount > 0.01)
        .toArray()
    : [];
  const advancesByEmployee = advances.reduce<Map<string, EmployeeCashAdvance[]>>((acc, advance) => {
    const employeeAdvances = acc.get(advance.employee_id) ?? [];
    employeeAdvances.push(advance);
    acc.set(advance.employee_id, employeeAdvances);
    return acc;
  }, new Map<string, EmployeeCashAdvance[]>());

  advancesByEmployee.forEach((employeeAdvances) => {
    employeeAdvances.sort((left, right) => (
      left.disbursed_at.localeCompare(right.disbursed_at) ||
      left.advance_number.localeCompare(right.advance_number)
    ));
  });

  const repayments: EmployeeCashAdvanceRepayment[] = [];
  const updatedItems = items.map((item): PayrollRunItem => {
    const grossAmount = roundCurrency(item.base_salary + item.allowance_amount + item.bonus_amount);
    const otherDeductionAmount = roundCurrency(item.other_deduction_amount ?? item.deduction_amount ?? 0);
    let remainingLimit = Math.max(0, roundCurrency(grossAmount - otherDeductionAmount));
    let cashAdvanceDeductionAmount = 0;

    for (const advance of advancesByEmployee.get(item.employee_id) ?? []) {
      if (remainingLimit <= 0.01) break;

      const availableAmount = getAvailableAmount(advance, reservedAmountByAdvance);
      if (availableAmount <= 0.01) continue;

      const repaymentAmount = roundCurrency(Math.min(remainingLimit, availableAmount));
      if (repaymentAmount <= 0) continue;

      repayments.push({
        id: `${payrollRunId}:${advance.id}`,
        cash_advance_id: advance.id,
        cash_advance_number: advance.advance_number,
        payroll_run_id: payrollRunId,
        payroll_run_item_id: item.id,
        payroll_number: payrollNumber,
        employee_id: item.employee_id,
        employee_name: item.employee_name,
        amount: repaymentAmount,
        status: 'DRAFT',
        allocated_at: now,
        created_at: now,
        updated_at: now,
      });

      remainingLimit = roundCurrency(remainingLimit - repaymentAmount);
      cashAdvanceDeductionAmount = roundCurrency(cashAdvanceDeductionAmount + repaymentAmount);
      reservedAmountByAdvance.set(
        advance.id,
        roundCurrency((reservedAmountByAdvance.get(advance.id) ?? 0) + repaymentAmount),
      );
    }

    const deductionAmount = roundCurrency(otherDeductionAmount + cashAdvanceDeductionAmount);

    return {
      ...item,
      gross_amount: grossAmount,
      other_deduction_amount: otherDeductionAmount,
      cash_advance_deduction_amount: cashAdvanceDeductionAmount,
      deduction_amount: deductionAmount,
      net_amount: roundCurrency(grossAmount - deductionAmount),
      updated_at: now,
    };
  });

  return { items: updatedItems, repayments };
};

export const reservePayrollCashAdvanceRepayments = async (
  payrollRunId: string,
  now: string,
) => {
  const repayments = await db.employeeCashAdvanceRepayments
    .where('payroll_run_id')
    .equals(payrollRunId)
    .filter((repayment) => repayment.status === 'DRAFT')
    .toArray();

  if (repayments.length === 0) return [];

  const reservedAmountByAdvance = await getReservedAmountByAdvance(payrollRunId);
  const requestedAmountByAdvance = repayments.reduce<Map<string, number>>((acc, repayment) => {
    acc.set(repayment.cash_advance_id, roundCurrency((acc.get(repayment.cash_advance_id) ?? 0) + repayment.amount));
    return acc;
  }, new Map<string, number>());
  const advances = await db.employeeCashAdvances.bulkGet(Array.from(requestedAmountByAdvance.keys()));
  const advanceById = new Map((advances.filter(Boolean) as EmployeeCashAdvance[]).map((advance) => [advance.id, advance]));

  for (const [cashAdvanceId, requestedAmount] of requestedAmountByAdvance.entries()) {
    const advance = advanceById.get(cashAdvanceId);
    const availableAmount = advance && advance.status === 'ACTIVE'
      ? getAvailableAmount(advance, reservedAmountByAdvance)
      : 0;

    if (requestedAmount > availableAmount + 0.01) {
      throw new Error('Saldo kasbon tersedia tidak cukup untuk approve payroll. Perbarui draft payroll terlebih dahulu.');
    }
  }

  const reservedRepayments = repayments.map((repayment): EmployeeCashAdvanceRepayment => ({
    ...repayment,
    status: 'RESERVED',
    updated_at: now,
  }));

  await db.employeeCashAdvanceRepayments.bulkPut(reservedRepayments);
  return reservedRepayments;
};

export const postPayrollCashAdvanceRepayments = async (
  payrollRunId: string,
  postedAt: string,
  now: string,
) => {
  const repayments = await db.employeeCashAdvanceRepayments
    .where('payroll_run_id')
    .equals(payrollRunId)
    .filter((repayment) => repayment.status === 'RESERVED')
    .toArray();

  if (repayments.length === 0) return [];

  const amountByAdvance = repayments.reduce<Map<string, number>>((acc, repayment) => {
    acc.set(repayment.cash_advance_id, roundCurrency((acc.get(repayment.cash_advance_id) ?? 0) + repayment.amount));
    return acc;
  }, new Map<string, number>());
  const advances = await db.employeeCashAdvances.bulkGet(Array.from(amountByAdvance.keys()));
  const advanceById = new Map((advances.filter(Boolean) as EmployeeCashAdvance[]).map((advance) => [advance.id, advance]));

  for (const [cashAdvanceId, repaymentAmount] of amountByAdvance.entries()) {
    const advance = advanceById.get(cashAdvanceId);
    if (!advance || advance.status === 'VOIDED') {
      throw new Error('Kasbon payroll tidak valid atau sudah dibatalkan.');
    }
    if (advance.outstanding_amount + 0.01 < repaymentAmount) {
      throw new Error('Potongan payroll melebihi saldo kasbon.');
    }

    const nextOutstandingAmount = Math.max(0, roundCurrency(advance.outstanding_amount - repaymentAmount));
    await db.employeeCashAdvances.put({
      ...advance,
      outstanding_amount: nextOutstandingAmount,
      status: nextOutstandingAmount <= 0.01 ? 'PAID' : 'ACTIVE',
      updated_at: now,
    });
  }

  const postedRepayments = repayments.map((repayment): EmployeeCashAdvanceRepayment => ({
    ...repayment,
    status: 'POSTED',
    posted_at: postedAt,
    updated_at: now,
  }));

  await db.employeeCashAdvanceRepayments.bulkPut(postedRepayments);
  return postedRepayments;
};

export const voidPayrollCashAdvanceRepayments = async (
  payrollRunId: string,
  now: string,
) => {
  const repayments = await db.employeeCashAdvanceRepayments
    .where('payroll_run_id')
    .equals(payrollRunId)
    .filter((repayment) => repayment.status === 'DRAFT' || repayment.status === 'RESERVED')
    .toArray();

  if (repayments.length === 0) return [];

  const voidedRepayments = repayments.map((repayment): EmployeeCashAdvanceRepayment => ({
    ...repayment,
    status: 'VOIDED',
    voided_at: now,
    updated_at: now,
  }));

  await db.employeeCashAdvanceRepayments.bulkPut(voidedRepayments);
  return voidedRepayments;
};
