import { FINANCE_CATEGORIES } from '@/constants/finance';
import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import dayjs from '@/lib/dayjs';
import {
  cooperativeLoanApplicationSchema,
  cooperativeLoanApprovalSchema,
  cooperativeLoanDisbursementSchema,
  cooperativeLoanInstallmentCollectionSchema,
  cooperativeLoanPaymentReversalSchema,
  cooperativeLoanPaymentSchema,
  cooperativeLoanRejectionSchema,
} from '@/lib/validations/cooperativeLoan';
import {
  getCashOrBankAccountForPayment,
  postCooperativeLoanDisbursementJournal,
  postCooperativeLoanPaymentJournal,
  reverseCooperativeLoanPaymentJournal,
} from '@/services/generalLedgerService';
import { enqueueFinanceTransactionsSync, withPendingFinanceTransactionSync } from '@/services/financeTransactionSyncService';
import {
  enqueueCooperativeLoanInstallmentsSync,
  enqueueCooperativeLoanPaymentsSync,
  enqueueCooperativeLoansSync,
  withPendingCooperativeSync,
} from '@/services/cooperativeSyncService';
import type {
  CooperativeLoan,
  CooperativeLoanInstallment,
  CooperativeLoanInstallmentCollectionStatus,
  CooperativeLoanPayment,
  CooperativeMember,
  FinanceTransaction,
  PaymentMethod,
} from '@/types';
import { getFinanceAccountSnapshotForCategory } from '@/utils/chartOfAccounts/getFinanceAccountSnapshotForCategory';
import {
  allocateLoanPaymentToInstallment,
  getInstallmentRemainingAmounts,
} from '@/utils/koperasi/loanPaymentAllocation';
import {
  buildFlatLoanInstallmentAmounts,
  calculateFlatLoanSummary,
  roundCurrency,
} from '@/utils/koperasi/loanSchedule';

export interface CreateCooperativeLoanApplicationInput {
  member_id: string;
  principal_amount: number;
  interest_rate_per_month: number;
  tenor_months: number;
  application_date?: string;
  notes?: string;
}

export interface ApproveCooperativeLoanInput {
  loan_id: string;
  approval_date?: string;
  notes?: string;
}

export interface RejectCooperativeLoanInput {
  loan_id: string;
  reason: string;
}

export interface DisburseCooperativeLoanInput {
  loan_id: string;
  disbursement_date?: string;
  first_due_date?: string;
  payment_method?: PaymentMethod;
  cash_account_id?: string;
  payment_channel?: string;
  notes?: string;
}

export interface DisburseCooperativeLoanResult {
  loan: CooperativeLoan;
  installments: CooperativeLoanInstallment[];
}

export interface RecordCooperativeLoanPaymentInput {
  installment_id: string;
  amount: number;
  payment_date?: string;
  payment_method?: PaymentMethod;
  cash_account_id?: string;
  payment_channel?: string;
  notes?: string;
}

export interface RecordCooperativeLoanInstallmentCollectionInput {
  installment_id: string;
  collection_status: Exclude<CooperativeLoanInstallmentCollectionStatus, 'NONE'>;
  follow_up_date?: string;
  collection_notes: string;
}

export interface ReverseCooperativeLoanPaymentInput {
  payment_id: string;
  reason: string;
}

export interface RecordCooperativeLoanPaymentResult {
  payment: CooperativeLoanPayment;
  installment: CooperativeLoanInstallment;
  loan: CooperativeLoan;
}

export interface RecordCooperativeLoanInstallmentCollectionResult {
  installment: CooperativeLoanInstallment;
}

const cooperativeLoanTables = [
  db.cooperativeMembers,
  db.cooperativeLoans,
  db.cooperativeLoanInstallments,
  db.cooperativeLoanPayments,
  db.financeTransactions,
  db.financeBalance,
  db.chartOfAccounts,
  db.financeAccountMappings,
  db.enabledModules,
  db.generalLedgerSetting,
  db.journalEntries,
  db.journalEntryLines,
  db.activityLogs,
];

const assertActiveMember = (member: CooperativeMember | undefined) => {
  if (!member) {
    throw new Error('Anggota koperasi tidak ditemukan.');
  }
  if (member.status !== 'ACTIVE') {
    throw new Error('Hanya anggota aktif yang boleh mengajukan pinjaman.');
  }

  return member;
};

const createCooperativeLoanNumber = async (date = new Date()) => {
  const prefix = 'KSP-PJ';
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, '');
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const count = await db.cooperativeLoans
    .where('created_at')
    .between(dayStart.toISOString(), dayEnd.toISOString(), true, true)
    .and((loan) => loan.loan_number.startsWith(`${prefix}-${datePart}`))
    .count();

  return `${prefix}-${datePart}-${String(count + 1).padStart(4, '0')}`;
};

const createCooperativeLoanPaymentNumber = async (date = new Date()) => {
  const prefix = 'KSP-ANG';
  const datePart = date.toISOString().slice(0, 10).replace(/-/g, '');
  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  const count = await db.cooperativeLoanPayments
    .where('created_at')
    .between(dayStart.toISOString(), dayEnd.toISOString(), true, true)
    .and((payment) => payment.payment_number.startsWith(`${prefix}-${datePart}`))
    .count();

  return `${prefix}-${datePart}-${String(count + 1).padStart(4, '0')}`;
};

const updateFinanceBalanceForDisbursement = async (amount: number, now: string) => {
  const currentFinanceBalance = await db.financeBalance.get('current');
  const nextFinanceBalance = roundCurrency(Number(currentFinanceBalance?.amount || 0) - amount);

  await db.financeBalance.put({
    id: 'current',
    amount: nextFinanceBalance,
    updated_at: now,
  });
};

const updateFinanceBalanceForPayment = async (
  amount: number,
  now: string,
  isReversal = false,
) => {
  const currentFinanceBalance = await db.financeBalance.get('current');
  const nextFinanceBalance = roundCurrency(
    Number(currentFinanceBalance?.amount || 0) + (isReversal ? -amount : amount),
  );

  await db.financeBalance.put({
    id: 'current',
    amount: nextFinanceBalance,
    updated_at: now,
  });
};

const buildInstallments = (
  loan: CooperativeLoan,
  firstDueDate: string,
  now: string,
): CooperativeLoanInstallment[] => {
  const baseDueDate = dayjs(firstDueDate);
  const amounts = buildFlatLoanInstallmentAmounts({
    principalAmount: loan.principal_amount,
    totalInterestAmount: loan.total_interest_amount,
    tenorMonths: loan.tenor_months,
  });

  return amounts.map((amount) => withPendingCooperativeSync({
    id: crypto.randomUUID(),
    loan_id: loan.id,
    loan_number: loan.loan_number,
    member_id: loan.member_id,
    member_number: loan.member_number,
    member_name: loan.member_name,
    installment_number: amount.installment_number,
    due_date: baseDueDate.add(amount.installment_number - 1, 'month').toISOString(),
    principal_amount: amount.principal_amount,
    interest_amount: amount.interest_amount,
    penalty_amount: 0,
    paid_principal_amount: 0,
    paid_interest_amount: 0,
    paid_penalty_amount: 0,
    status: 'UNPAID',
    collection_status: 'NONE',
    created_at: now,
    updated_at: now,
  }));
};

const getInstallmentNextStatus = (installment: CooperativeLoanInstallment) => {
  const remaining = getInstallmentRemainingAmounts(installment);
  const paidAmount = roundCurrency(
    Number(installment.paid_penalty_amount || 0) +
    Number(installment.paid_interest_amount || 0) +
    Number(installment.paid_principal_amount || 0),
  );

  if (remaining.total_amount <= 0.01) return 'PAID' as const;
  if (paidAmount > 0) return 'PARTIAL' as const;
  return 'UNPAID' as const;
};

const assertOutstandingNotNegative = (loan: CooperativeLoan) => {
  if (
    loan.outstanding_principal_amount < -0.01 ||
    loan.outstanding_interest_amount < -0.01 ||
    loan.outstanding_penalty_amount < -0.01
  ) {
    throw new Error('Outstanding pinjaman tidak boleh negatif.');
  }
};

const getLoanNextStatus = (
  loan: CooperativeLoan,
  installments: CooperativeLoanInstallment[],
) => {
  const isOutstandingSettled = (
    loan.outstanding_principal_amount <= 0.01 &&
    loan.outstanding_interest_amount <= 0.01 &&
    loan.outstanding_penalty_amount <= 0.01
  );
  const areInstallmentsPaid = installments.length > 0 && installments.every((installment) => installment.status === 'PAID');

  return isOutstandingSettled && areInstallmentsPaid ? 'PAID_OFF' as const : 'DISBURSED' as const;
};

export const createCooperativeLoanApplication = async (
  input: CreateCooperativeLoanApplicationInput,
): Promise<CooperativeLoan> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'COOPERATIVE_PAYMENT_CREATE');

  const parsedInput = cooperativeLoanApplicationSchema.parse(input);
  const summary = calculateFlatLoanSummary({
    principalAmount: parsedInput.principal_amount,
    interestRatePerMonth: parsedInput.interest_rate_per_month,
    tenorMonths: parsedInput.tenor_months,
  });
  const now = new Date().toISOString();
  const applicationDate = parsedInput.application_date ?? now;
  let savedLoan: CooperativeLoan | undefined;

  await db.transaction('rw', cooperativeLoanTables, async () => {
    const member = assertActiveMember(await db.cooperativeMembers.get(parsedInput.member_id));
    const loan: CooperativeLoan = withPendingCooperativeSync({
      id: crypto.randomUUID(),
      loan_number: await createCooperativeLoanNumber(new Date(now)),
      member_id: member.id,
      member_number: member.member_number,
      member_name: member.name,
      principal_amount: summary.principal_amount,
      interest_rate_per_month: summary.interest_rate_per_month,
      tenor_months: summary.tenor_months,
      total_interest_amount: summary.total_interest_amount,
      total_payable_amount: summary.total_payable_amount,
      outstanding_principal_amount: summary.principal_amount,
      outstanding_interest_amount: summary.total_interest_amount,
      outstanding_penalty_amount: 0,
      status: 'SUBMITTED',
      application_date: applicationDate,
      notes: parsedInput.notes,
      created_at: now,
      updated_at: now,
      created_by: currentUser?.id,
      created_by_name: currentUser?.name,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
    });

    await db.cooperativeLoans.add(loan);
    savedLoan = loan;

    await writeActivityLog({
      user: currentUser,
      action: 'COOPERATIVE_LOAN_SUBMITTED',
      entity: 'cooperativeLoans',
      entity_id: loan.id,
      description: `${currentUser?.name ?? 'User'} mengajukan pinjaman ${loan.loan_number} untuk ${member.member_number} sebesar ${loan.principal_amount}.`,
    });
  });

  if (!savedLoan) {
    throw new Error('Pengajuan pinjaman gagal disimpan.');
  }

  await enqueueCooperativeLoansSync([savedLoan], 'create');

  return savedLoan;
};

export const approveCooperativeLoan = async (
  input: ApproveCooperativeLoanInput,
): Promise<CooperativeLoan> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'COOPERATIVE_PAYMENT_CREATE');

  const parsedInput = cooperativeLoanApprovalSchema.parse({
    approval_date: input.approval_date,
    notes: input.notes,
  });
  const now = new Date().toISOString();
  const approvalDate = parsedInput.approval_date ?? now;
  let approvedLoan: CooperativeLoan | undefined;

  await db.transaction('rw', cooperativeLoanTables, async () => {
    const loan = await db.cooperativeLoans.get(input.loan_id);
    if (!loan) {
      throw new Error('Pinjaman koperasi tidak ditemukan.');
    }
    if (loan.status !== 'SUBMITTED') {
      throw new Error('Hanya pinjaman berstatus submitted yang bisa di-approve.');
    }

    const nextApprovedLoan: CooperativeLoan = withPendingCooperativeSync({
      ...loan,
      status: 'APPROVED' as const,
      approved_at: approvalDate,
      approved_by: currentUser?.id,
      approved_by_name: currentUser?.name,
      approval_notes: parsedInput.notes,
      updated_at: now,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
    });
    approvedLoan = nextApprovedLoan;

    await db.cooperativeLoans.put(nextApprovedLoan);

    await writeActivityLog({
      user: currentUser,
      action: 'COOPERATIVE_LOAN_APPROVED',
      entity: 'cooperativeLoans',
      entity_id: loan.id,
      description: `${currentUser?.name ?? 'User'} menyetujui pinjaman ${loan.loan_number}.`,
    });
  });

  if (!approvedLoan) {
    throw new Error('Approval pinjaman gagal disimpan.');
  }

  await enqueueCooperativeLoansSync([approvedLoan], 'update');

  return approvedLoan;
};

export const rejectCooperativeLoan = async (
  input: RejectCooperativeLoanInput,
): Promise<CooperativeLoan> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'COOPERATIVE_LOAN_MANAGE');

  const parsedInput = cooperativeLoanRejectionSchema.parse({ reason: input.reason });
  const now = new Date().toISOString();
  let rejectedLoan: CooperativeLoan | undefined;

  await db.transaction('rw', cooperativeLoanTables, async () => {
    const loan = await db.cooperativeLoans.get(input.loan_id);
    if (!loan) {
      throw new Error('Pinjaman koperasi tidak ditemukan.');
    }
    if (loan.status !== 'SUBMITTED') {
      throw new Error('Hanya pinjaman berstatus submitted yang bisa di-reject.');
    }

    const nextRejectedLoan: CooperativeLoan = withPendingCooperativeSync({
      ...loan,
      status: 'REJECTED' as const,
      rejected_at: now,
      rejected_by: currentUser?.id,
      rejected_by_name: currentUser?.name,
      rejection_reason: parsedInput.reason,
      updated_at: now,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
    });
    rejectedLoan = nextRejectedLoan;

    await db.cooperativeLoans.put(nextRejectedLoan);

    await writeActivityLog({
      user: currentUser,
      action: 'COOPERATIVE_LOAN_REJECTED',
      entity: 'cooperativeLoans',
      entity_id: loan.id,
      description: `${currentUser?.name ?? 'User'} menolak pinjaman ${loan.loan_number}. Alasan: ${parsedInput.reason}`,
    });
  });

  if (!rejectedLoan) {
    throw new Error('Reject pinjaman gagal disimpan.');
  }

  await enqueueCooperativeLoansSync([rejectedLoan], 'update');

  return rejectedLoan;
};

export const disburseCooperativeLoan = async (
  input: DisburseCooperativeLoanInput,
): Promise<DisburseCooperativeLoanResult> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'COOPERATIVE_LOAN_MANAGE');

  const parsedInput = cooperativeLoanDisbursementSchema.parse(input);
  const now = new Date().toISOString();
  const disbursementDate = parsedInput.disbursement_date ?? now;
  const firstDueDate = parsedInput.first_due_date ?? dayjs(disbursementDate).add(1, 'month').toISOString();
  const paymentMethod = parsedInput.payment_method ?? 'TUNAI';
  const financeTransactionId = crypto.randomUUID();
  let disbursedLoan: CooperativeLoan | undefined;
  let installments: CooperativeLoanInstallment[] = [];
  let financeTransaction: FinanceTransaction | undefined;

  await db.transaction('rw', cooperativeLoanTables, async () => {
    const loan = await db.cooperativeLoans.get(input.loan_id);
    if (!loan) {
      throw new Error('Pinjaman koperasi tidak ditemukan.');
    }
    if (loan.status !== 'APPROVED') {
      throw new Error('Pinjaman hanya bisa dicairkan setelah approved.');
    }

    const existingInstallment = await db.cooperativeLoanInstallments
      .where('loan_id')
      .equals(loan.id)
      .first();
    if (existingInstallment) {
      throw new Error('Jadwal angsuran pinjaman ini sudah pernah dibuat.');
    }

    const cashAccount = await getCashOrBankAccountForPayment(paymentMethod, parsedInput.cash_account_id);
    const accountSnapshot = await getFinanceAccountSnapshotForCategory(FINANCE_CATEGORIES.KSP_LOAN_DISBURSEMENT);
    await updateFinanceBalanceForDisbursement(loan.principal_amount, now);

    const nextDisbursedLoan: CooperativeLoan = withPendingCooperativeSync({
      ...loan,
      status: 'DISBURSED' as const,
      disbursed_at: disbursementDate,
      cash_account_id: cashAccount.id,
      cash_account_code: cashAccount.code,
      cash_account_name: cashAccount.name,
      payment_method: paymentMethod,
      payment_channel: parsedInput.payment_channel,
      finance_transaction_id: financeTransactionId,
      disbursement_notes: parsedInput.notes,
      outstanding_principal_amount: loan.principal_amount,
      outstanding_interest_amount: loan.total_interest_amount,
      outstanding_penalty_amount: 0,
      updated_at: now,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
    });
    disbursedLoan = nextDisbursedLoan;

    installments = buildInstallments(nextDisbursedLoan, firstDueDate, now);
    financeTransaction = withPendingFinanceTransactionSync({
      id: financeTransactionId,
      type: 'EXPENSE',
      category: FINANCE_CATEGORIES.KSP_LOAN_DISBURSEMENT,
      amount: loan.principal_amount,
      description: `Pencairan pinjaman ${loan.loan_number} ${loan.member_number} - ${loan.member_name}`,
      created_at: disbursementDate,
      reference_id: loan.id,
      payment_method: paymentMethod,
      payment_channel: parsedInput.payment_channel,
      cash_account_id: cashAccount.id,
      cash_account_code: cashAccount.code,
      cash_account_name: cashAccount.name,
      ...accountSnapshot,
    }, currentUser, now);

    await db.financeTransactions.add(financeTransaction);
    await db.cooperativeLoanInstallments.bulkAdd(installments);
    await db.cooperativeLoans.put(nextDisbursedLoan);

    const journalEntry = await postCooperativeLoanDisbursementJournal(nextDisbursedLoan, currentUser);
    if (journalEntry) {
      disbursedLoan = {
        ...nextDisbursedLoan,
        journal_entry_id: journalEntry.id,
        updated_at: now,
        sync_status: 'pending',
        sync_error: undefined,
      };
      await db.cooperativeLoans.update(loan.id, {
        journal_entry_id: journalEntry.id,
        updated_at: now,
        sync_status: 'pending',
        sync_error: undefined,
      });
    }

    await writeActivityLog({
      user: currentUser,
      action: 'COOPERATIVE_LOAN_DISBURSED',
      entity: 'cooperativeLoans',
      entity_id: loan.id,
      description: `${currentUser?.name ?? 'User'} mencairkan pinjaman ${loan.loan_number} sebesar ${loan.principal_amount}.`,
    });
  });

  if (!disbursedLoan) {
    throw new Error('Pencairan pinjaman gagal disimpan.');
  }

  if (financeTransaction) {
    await enqueueFinanceTransactionsSync([financeTransaction], 'create');
  }
  await enqueueCooperativeLoansSync([disbursedLoan], 'update');
  await enqueueCooperativeLoanInstallmentsSync(installments, 'create');

  return {
    loan: disbursedLoan,
    installments,
  };
};

export const recordCooperativeLoanPayment = async (
  input: RecordCooperativeLoanPaymentInput,
): Promise<RecordCooperativeLoanPaymentResult> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'COOPERATIVE_PAYMENT_CREATE');

  const parsedInput = cooperativeLoanPaymentSchema.parse(input);
  const amount = roundCurrency(parsedInput.amount);
  const now = new Date().toISOString();
  const paymentDate = parsedInput.payment_date ?? now;
  const paymentMethod = parsedInput.payment_method ?? 'TUNAI';
  const paymentId = crypto.randomUUID();
  const financeTransactionId = crypto.randomUUID();
  let savedPayment: CooperativeLoanPayment | undefined;
  let savedInstallment: CooperativeLoanInstallment | undefined;
  let savedLoan: CooperativeLoan | undefined;
  let financeTransaction: FinanceTransaction | undefined;

  await db.transaction('rw', cooperativeLoanTables, async () => {
    const installment = await db.cooperativeLoanInstallments.get(parsedInput.installment_id);
    if (!installment) {
      throw new Error('Jadwal angsuran tidak ditemukan.');
    }
    if (installment.status === 'PAID') {
      throw new Error('Angsuran ini sudah lunas.');
    }

    const loan = await db.cooperativeLoans.get(installment.loan_id);
    if (!loan) {
      throw new Error('Pinjaman koperasi tidak ditemukan.');
    }
    if (loan.status !== 'DISBURSED') {
      throw new Error('Pembayaran hanya bisa dicatat untuk pinjaman yang sudah dicairkan dan belum lunas.');
    }

    const allocation = allocateLoanPaymentToInstallment(installment, amount);
    const cashAccount = await getCashOrBankAccountForPayment(paymentMethod, parsedInput.cash_account_id);
    await updateFinanceBalanceForPayment(allocation.total_amount, now);

    const nextInstallment: CooperativeLoanInstallment = withPendingCooperativeSync({
      ...installment,
      paid_principal_amount: roundCurrency(installment.paid_principal_amount + allocation.principal_amount),
      paid_interest_amount: roundCurrency(installment.paid_interest_amount + allocation.interest_amount),
      paid_penalty_amount: roundCurrency(installment.paid_penalty_amount + allocation.penalty_amount),
      updated_at: now,
    });
    const nextInstallmentStatus = getInstallmentNextStatus(nextInstallment);
    nextInstallment.status = nextInstallmentStatus;
    nextInstallment.paid_at = nextInstallmentStatus === 'PAID' ? paymentDate : undefined;
    if (nextInstallmentStatus === 'PAID') {
      nextInstallment.collection_status = 'NONE';
      nextInstallment.follow_up_date = undefined;
      nextInstallment.collection_notes = undefined;
      nextInstallment.last_contacted_at = undefined;
    }

    const payment: CooperativeLoanPayment = withPendingCooperativeSync({
      id: paymentId,
      payment_number: await createCooperativeLoanPaymentNumber(new Date(now)),
      payment_type: 'PAYMENT',
      loan_id: loan.id,
      loan_number: loan.loan_number,
      installment_id: installment.id,
      member_id: loan.member_id,
      member_number: loan.member_number,
      member_name: loan.member_name,
      amount: allocation.total_amount,
      principal_amount: allocation.principal_amount,
      interest_amount: allocation.interest_amount,
      penalty_amount: allocation.penalty_amount,
      payment_date: paymentDate,
      status: 'POSTED',
      cash_account_id: cashAccount.id,
      cash_account_code: cashAccount.code,
      cash_account_name: cashAccount.name,
      payment_method: paymentMethod,
      payment_channel: parsedInput.payment_channel,
      finance_transaction_id: financeTransactionId,
      notes: parsedInput.notes,
      created_at: now,
      updated_at: now,
      created_by: currentUser?.id,
      created_by_name: currentUser?.name,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
    });

    financeTransaction = withPendingFinanceTransactionSync({
      id: financeTransactionId,
      type: 'INCOME',
      category: FINANCE_CATEGORIES.KSP_LOAN_PAYMENT,
      amount: allocation.total_amount,
      description: `Pembayaran angsuran ${loan.loan_number} ${loan.member_number} - ${loan.member_name}`,
      created_at: paymentDate,
      reference_id: payment.id,
      payment_method: paymentMethod,
      payment_channel: parsedInput.payment_channel,
      cash_account_id: cashAccount.id,
      cash_account_code: cashAccount.code,
      cash_account_name: cashAccount.name,
      account_id: cashAccount.id,
      account_code: cashAccount.code,
      account_name: cashAccount.name,
      account_type: cashAccount.type,
    }, currentUser, now);

    const nextLoanDraft: CooperativeLoan = {
      ...loan,
      outstanding_principal_amount: roundCurrency(loan.outstanding_principal_amount - allocation.principal_amount),
      outstanding_interest_amount: roundCurrency(loan.outstanding_interest_amount - allocation.interest_amount),
      outstanding_penalty_amount: roundCurrency(loan.outstanding_penalty_amount - allocation.penalty_amount),
      updated_at: now,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
    };
    assertOutstandingNotNegative(nextLoanDraft);

    const loanInstallments = await db.cooperativeLoanInstallments
      .where('loan_id')
      .equals(loan.id)
      .toArray();
    const nextInstallments = loanInstallments.map((item) => (
      item.id === nextInstallment.id ? nextInstallment : item
    ));
    const nextLoan: CooperativeLoan = withPendingCooperativeSync({
      ...nextLoanDraft,
      outstanding_principal_amount: Math.max(0, nextLoanDraft.outstanding_principal_amount),
      outstanding_interest_amount: Math.max(0, nextLoanDraft.outstanding_interest_amount),
      outstanding_penalty_amount: Math.max(0, nextLoanDraft.outstanding_penalty_amount),
      status: getLoanNextStatus(nextLoanDraft, nextInstallments),
    });

    await db.financeTransactions.add(financeTransaction);
    await db.cooperativeLoanPayments.add(payment);
    await db.cooperativeLoanInstallments.put(nextInstallment);
    await db.cooperativeLoans.put(nextLoan);

    const journalEntry = await postCooperativeLoanPaymentJournal(payment, currentUser);
    savedPayment = journalEntry
      ? {
          ...payment,
          journal_entry_id: journalEntry.id,
          updated_at: now,
          sync_status: 'pending',
          sync_error: undefined,
        }
      : payment;

    if (journalEntry) {
      await db.cooperativeLoanPayments.update(payment.id, {
        journal_entry_id: journalEntry.id,
        updated_at: now,
        sync_status: 'pending',
        sync_error: undefined,
      });
    }

    savedInstallment = nextInstallment;
    savedLoan = nextLoan;

    await writeActivityLog({
      user: currentUser,
      action: 'COOPERATIVE_LOAN_PAYMENT_RECORDED',
      entity: 'cooperativeLoanPayments',
      entity_id: payment.id,
      description: `${currentUser?.name ?? 'User'} mencatat pembayaran angsuran ${payment.payment_number} untuk ${loan.loan_number} sebesar ${payment.amount}.`,
    });
  });

  if (!savedPayment || !savedInstallment || !savedLoan) {
    throw new Error('Pembayaran angsuran gagal disimpan.');
  }

  if (financeTransaction) {
    await enqueueFinanceTransactionsSync([financeTransaction], 'create');
  }
  await enqueueCooperativeLoanPaymentsSync([savedPayment], 'create');
  await enqueueCooperativeLoanInstallmentsSync([savedInstallment], 'update');
  await enqueueCooperativeLoansSync([savedLoan], 'update');

  return {
    payment: savedPayment,
    installment: savedInstallment,
    loan: savedLoan,
  };
};

export const recordCooperativeLoanInstallmentCollection = async (
  input: RecordCooperativeLoanInstallmentCollectionInput,
): Promise<RecordCooperativeLoanInstallmentCollectionResult> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'COOPERATIVE_PAYMENT_CREATE');

  const parsedInput = cooperativeLoanInstallmentCollectionSchema.parse(input);
  const now = new Date().toISOString();
  let savedInstallment: CooperativeLoanInstallment | undefined;

  await db.transaction('rw', cooperativeLoanTables, async () => {
    const installment = await db.cooperativeLoanInstallments.get(parsedInput.installment_id);
    if (!installment) {
      throw new Error('Jadwal angsuran tidak ditemukan.');
    }
    if (installment.status === 'PAID') {
      throw new Error('Angsuran yang sudah lunas tidak perlu tindak lanjut penagihan.');
    }

    const loan = await db.cooperativeLoans.get(installment.loan_id);
    if (!loan) {
      throw new Error('Pinjaman koperasi tidak ditemukan.');
    }
    if (loan.status !== 'DISBURSED') {
      throw new Error('Tindak lanjut penagihan hanya bisa dicatat untuk pinjaman aktif.');
    }

    const nextInstallment: CooperativeLoanInstallment = withPendingCooperativeSync({
      ...installment,
      collection_status: parsedInput.collection_status,
      follow_up_date: parsedInput.follow_up_date,
      collection_notes: parsedInput.collection_notes,
      last_contacted_at: now,
      updated_at: now,
    });

    await db.cooperativeLoanInstallments.put(nextInstallment);
    savedInstallment = nextInstallment;

    await writeActivityLog({
      user: currentUser,
      action: 'COOPERATIVE_LOAN_INSTALLMENT_COLLECTION_RECORDED',
      entity: 'cooperativeLoanInstallments',
      entity_id: installment.id,
      description: `${currentUser?.name ?? 'User'} mencatat tindak lanjut penagihan ${installment.loan_number} angsuran ${installment.installment_number}.`,
    });
  });

  if (!savedInstallment) {
    throw new Error('Tindak lanjut penagihan gagal disimpan.');
  }

  await enqueueCooperativeLoanInstallmentsSync([savedInstallment], 'update');

  return {
    installment: savedInstallment,
  };
};

export const reverseCooperativeLoanPayment = async (
  input: ReverseCooperativeLoanPaymentInput,
): Promise<CooperativeLoanPayment> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'COOPERATIVE_LOAN_MANAGE');

  const parsedInput = cooperativeLoanPaymentReversalSchema.parse({ reason: input.reason });
  const now = new Date().toISOString();
  const reversalPaymentId = crypto.randomUUID();
  const reversalFinanceTransactionId = crypto.randomUUID();
  let reversalPayment: CooperativeLoanPayment | undefined;
  let reversalFinanceTransaction: FinanceTransaction | undefined;
  let updatedOriginalPayment: CooperativeLoanPayment | undefined;
  let updatedInstallment: CooperativeLoanInstallment | undefined;
  let updatedLoan: CooperativeLoan | undefined;

  await db.transaction('rw', cooperativeLoanTables, async () => {
    const payment = await db.cooperativeLoanPayments.get(input.payment_id);
    if (!payment) {
      throw new Error('Pembayaran angsuran tidak ditemukan.');
    }
    if (payment.status !== 'POSTED') {
      throw new Error('Pembayaran angsuran sudah pernah direversal.');
    }
    if (payment.payment_type === 'REVERSAL' || payment.reversal_of_payment_id) {
      throw new Error('Baris reversal pembayaran tidak bisa direversal lagi.');
    }

    const existingReversal = await db.cooperativeLoanPayments
      .where('reversal_of_payment_id')
      .equals(payment.id)
      .first();
    if (existingReversal) {
      throw new Error('Pembayaran angsuran sudah memiliki reversal.');
    }

    const loan = await db.cooperativeLoans.get(payment.loan_id);
    if (!loan) {
      throw new Error('Pinjaman koperasi tidak ditemukan.');
    }
    if (loan.status !== 'DISBURSED' && loan.status !== 'PAID_OFF') {
      throw new Error('Pembayaran hanya bisa direversal untuk pinjaman aktif atau lunas.');
    }

    const installment = payment.installment_id
      ? await db.cooperativeLoanInstallments.get(payment.installment_id)
      : undefined;
    if (!installment) {
      throw new Error('Jadwal angsuran pembayaran tidak ditemukan.');
    }

    const nextInstallment: CooperativeLoanInstallment = withPendingCooperativeSync({
      ...installment,
      paid_principal_amount: roundCurrency(installment.paid_principal_amount - payment.principal_amount),
      paid_interest_amount: roundCurrency(installment.paid_interest_amount - payment.interest_amount),
      paid_penalty_amount: roundCurrency(installment.paid_penalty_amount - payment.penalty_amount),
      updated_at: now,
    });
    if (
      nextInstallment.paid_principal_amount < -0.01 ||
      nextInstallment.paid_interest_amount < -0.01 ||
      nextInstallment.paid_penalty_amount < -0.01
    ) {
      throw new Error('Reversal pembayaran membuat paid amount angsuran negatif.');
    }
    nextInstallment.paid_principal_amount = Math.max(0, nextInstallment.paid_principal_amount);
    nextInstallment.paid_interest_amount = Math.max(0, nextInstallment.paid_interest_amount);
    nextInstallment.paid_penalty_amount = Math.max(0, nextInstallment.paid_penalty_amount);
    const nextInstallmentStatus = getInstallmentNextStatus(nextInstallment);
    nextInstallment.status = nextInstallmentStatus;
    nextInstallment.paid_at = nextInstallmentStatus === 'PAID' ? installment.paid_at : undefined;

    const nextLoanDraft: CooperativeLoan = {
      ...loan,
      status: 'DISBURSED',
      outstanding_principal_amount: roundCurrency(loan.outstanding_principal_amount + payment.principal_amount),
      outstanding_interest_amount: roundCurrency(loan.outstanding_interest_amount + payment.interest_amount),
      outstanding_penalty_amount: roundCurrency(loan.outstanding_penalty_amount + payment.penalty_amount),
      updated_at: now,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
    };
    const nextLoan: CooperativeLoan = withPendingCooperativeSync({
      ...nextLoanDraft,
      outstanding_principal_amount: Math.min(loan.principal_amount, nextLoanDraft.outstanding_principal_amount),
      outstanding_interest_amount: Math.min(loan.total_interest_amount, nextLoanDraft.outstanding_interest_amount),
      outstanding_penalty_amount: Math.max(0, nextLoanDraft.outstanding_penalty_amount),
    });

    await updateFinanceBalanceForPayment(payment.amount, now, true);
    reversalFinanceTransaction = withPendingFinanceTransactionSync({
      id: reversalFinanceTransactionId,
      type: 'EXPENSE',
      category: FINANCE_CATEGORIES.KSP_LOAN_PAYMENT,
      amount: payment.amount,
      description: `Reversal pembayaran angsuran ${payment.payment_number}. ${parsedInput.reason}`,
      created_at: now,
      reference_id: reversalPaymentId,
      payment_method: payment.payment_method,
      payment_channel: payment.payment_channel,
      cash_account_id: payment.cash_account_id,
      cash_account_code: payment.cash_account_code,
      cash_account_name: payment.cash_account_name,
      account_id: payment.cash_account_id,
      account_code: payment.cash_account_code,
      account_name: payment.cash_account_name,
      account_type: 'ASSET',
    }, currentUser, now);

    const nextReversalPayment: CooperativeLoanPayment = withPendingCooperativeSync({
      id: reversalPaymentId,
      payment_number: await createCooperativeLoanPaymentNumber(new Date(now)),
      payment_type: 'REVERSAL',
      loan_id: payment.loan_id,
      loan_number: payment.loan_number,
      installment_id: payment.installment_id,
      member_id: payment.member_id,
      member_number: payment.member_number,
      member_name: payment.member_name,
      amount: payment.amount,
      principal_amount: payment.principal_amount,
      interest_amount: payment.interest_amount,
      penalty_amount: payment.penalty_amount,
      payment_date: now,
      status: 'POSTED',
      cash_account_id: payment.cash_account_id,
      cash_account_code: payment.cash_account_code,
      cash_account_name: payment.cash_account_name,
      payment_method: payment.payment_method,
      payment_channel: payment.payment_channel,
      finance_transaction_id: reversalFinanceTransactionId,
      reversal_of_payment_id: payment.id,
      notes: parsedInput.reason,
      created_at: now,
      updated_at: now,
      created_by: currentUser?.id,
      created_by_name: currentUser?.name,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
    });
    reversalPayment = nextReversalPayment;

    await db.financeTransactions.add(reversalFinanceTransaction);
    await db.cooperativeLoanPayments.add(nextReversalPayment);
    await db.cooperativeLoanInstallments.put(nextInstallment);
    await db.cooperativeLoans.put(nextLoan);
    updatedInstallment = nextInstallment;
    updatedLoan = nextLoan;

    const reversalEntries = payment.journal_entry_id
      ? await reverseCooperativeLoanPaymentJournal(
          payment,
          `Reversal pembayaran angsuran ${payment.payment_number}: ${parsedInput.reason}`,
          currentUser,
          now,
        )
      : [];
    const reversalJournalEntryId = reversalEntries[0]?.id;

    const nextOriginalPayment: CooperativeLoanPayment = withPendingCooperativeSync({
      ...payment,
      status: 'REVERSED' as const,
      reversal_payment_id: nextReversalPayment.id,
      reversal_finance_transaction_id: reversalFinanceTransactionId,
      reversal_journal_entry_id: reversalJournalEntryId,
      reversed_at: now,
      reversal_reason: parsedInput.reason,
      updated_at: now,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
    });
    updatedOriginalPayment = nextOriginalPayment;
    await db.cooperativeLoanPayments.put(nextOriginalPayment);

    if (reversalJournalEntryId) {
      reversalPayment = {
        ...nextReversalPayment,
        journal_entry_id: reversalJournalEntryId,
        updated_at: now,
        sync_status: 'pending',
        sync_error: undefined,
      };
      await db.cooperativeLoanPayments.update(nextReversalPayment.id, {
        journal_entry_id: reversalJournalEntryId,
        updated_at: now,
        sync_status: 'pending',
        sync_error: undefined,
      });
    }

    await writeActivityLog({
      user: currentUser,
      action: 'COOPERATIVE_LOAN_PAYMENT_REVERSED',
      entity: 'cooperativeLoanPayments',
      entity_id: payment.id,
      description: `${currentUser?.name ?? 'User'} reversal pembayaran angsuran ${payment.payment_number}. Alasan: ${parsedInput.reason}`,
    });
  });

  if (!reversalPayment) {
    throw new Error('Reversal pembayaran angsuran gagal disimpan.');
  }
  if (!updatedOriginalPayment || !updatedInstallment || !updatedLoan) {
    throw new Error('Reversal pembayaran angsuran gagal memperbarui pinjaman.');
  }

  if (reversalFinanceTransaction) {
    await enqueueFinanceTransactionsSync([reversalFinanceTransaction], 'create');
  }
  await enqueueCooperativeLoanPaymentsSync([reversalPayment], 'create');
  await enqueueCooperativeLoanPaymentsSync([updatedOriginalPayment], 'update');
  await enqueueCooperativeLoanInstallmentsSync([updatedInstallment], 'update');
  await enqueueCooperativeLoansSync([updatedLoan], 'update');

  return reversalPayment;
};
