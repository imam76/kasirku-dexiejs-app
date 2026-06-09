import { FINANCE_CATEGORIES } from '@/constants/finance';
import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import {
  cooperativeSavingReversalSchema,
  cooperativeSavingTransactionSchema,
} from '@/lib/validations/cooperativeSaving';
import {
  getCashOrBankAccountForPayment,
  postCooperativeSavingTransactionJournal,
  reverseCooperativeSavingTransactionJournal,
} from '@/services/generalLedgerService';
import { enqueueFinanceTransactionsSync, withPendingFinanceTransactionSync } from '@/services/financeTransactionSyncService';
import {
  enqueueCooperativeMemberSavingBalancesSync,
  enqueueCooperativeSavingTransactionsSync,
  withPendingCooperativeSync,
} from '@/services/cooperativeSyncService';
import type {
  CooperativeMember,
  CooperativeMemberSavingBalance,
  CooperativeSavingTransaction,
  CooperativeSavingTransactionType,
  CooperativeSavingType,
  FinanceTransaction,
  PaymentMethod,
} from '@/types';
import { getFinanceAccountSnapshotForCategory } from '@/utils/chartOfAccounts/getFinanceAccountSnapshotForCategory';

export interface RecordCooperativeSavingInput {
  member_id: string;
  saving_type: CooperativeSavingType;
  transaction_type: Extract<CooperativeSavingTransactionType, 'DEPOSIT' | 'WITHDRAWAL'>;
  amount: number;
  transaction_date?: string;
  payment_method?: PaymentMethod;
  cash_account_id?: string;
  payment_channel?: string;
  notes?: string;
}

export interface ReverseCooperativeSavingInput {
  transaction_id: string;
  reason: string;
}

export interface RecordCooperativeSavingResult {
  transaction: CooperativeSavingTransaction;
  balance: CooperativeMemberSavingBalance;
}

const cooperativeSavingTables = [
  db.cooperativeMembers,
  db.cooperativeSavingTransactions,
  db.cooperativeMemberSavingBalances,
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

const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

const getSavingBalanceId = (memberId: string, savingType: CooperativeSavingType) => `${memberId}:${savingType}`;

const getFinanceCategoryForSaving = (transactionType: CooperativeSavingTransactionType) => (
  transactionType === 'WITHDRAWAL'
    ? FINANCE_CATEGORIES.KSP_SAVING_WITHDRAWAL
    : FINANCE_CATEGORIES.KSP_SAVING_DEPOSIT
);

const getFinanceTypeForSaving = (transactionType: CooperativeSavingTransactionType) => (
  transactionType === 'WITHDRAWAL' ? 'EXPENSE' as const : 'INCOME' as const
);

const getBalanceDelta = (
  transactionType: CooperativeSavingTransactionType,
  amount: number,
  isReversal = false,
) => {
  const direction = transactionType === 'WITHDRAWAL' ? -1 : 1;
  return roundCurrency((isReversal ? -direction : direction) * amount);
};

const assertActiveMember = (member: CooperativeMember | undefined) => {
  if (!member) {
    throw new Error('Anggota koperasi tidak ditemukan.');
  }
  if (member.status !== 'ACTIVE') {
    throw new Error('Hanya anggota aktif yang boleh transaksi simpanan.');
  }

  return member;
};

const assertSavingBusinessRules = async (
  member: CooperativeMember,
  savingType: CooperativeSavingType,
  transactionType: CooperativeSavingTransactionType,
  amount: number,
) => {
  if (transactionType === 'WITHDRAWAL' && savingType !== 'SUKARELA') {
    throw new Error('Penarikan hanya boleh dari simpanan sukarela.');
  }

  if (transactionType === 'DEPOSIT' && savingType === 'POKOK') {
    const existingPokokDeposit = await db.cooperativeSavingTransactions
      .where('member_id')
      .equals(member.id)
      .filter((transaction) => (
        transaction.saving_type === 'POKOK' &&
        transaction.transaction_type === 'DEPOSIT' &&
        transaction.status === 'POSTED'
      ))
      .first();

    if (existingPokokDeposit) {
      throw new Error('Simpanan pokok hanya boleh disetor satu kali per anggota.');
    }
  }

  if (transactionType === 'WITHDRAWAL') {
    const balance = await db.cooperativeMemberSavingBalances.get(getSavingBalanceId(member.id, savingType));
    if (roundCurrency(Number(balance?.balance || 0)) < amount) {
      throw new Error('Penarikan tidak boleh melebihi saldo simpanan sukarela.');
    }
  }
};

const buildBalance = async (
  member: Pick<CooperativeMember, 'id' | 'member_number' | 'name'>,
  savingType: CooperativeSavingType,
  delta: number,
  now: string,
) => {
  const balanceId = getSavingBalanceId(member.id, savingType);
  const existingBalance = await db.cooperativeMemberSavingBalances.get(balanceId);
  const nextBalance = roundCurrency(Number(existingBalance?.balance || 0) + delta);

  if (nextBalance < -0.01) {
    throw new Error('Saldo simpanan tidak boleh negatif.');
  }

  const balance: CooperativeMemberSavingBalance = withPendingCooperativeSync({
    id: balanceId,
    member_id: member.id,
    member_number: member.member_number,
    member_name: member.name,
    saving_type: savingType,
    balance: Math.max(0, nextBalance),
    updated_at: now,
  });

  await db.cooperativeMemberSavingBalances.put(balance);
  return balance;
};

const updateFinanceBalance = async (
  transactionType: CooperativeSavingTransactionType,
  amount: number,
  now: string,
  isReversal = false,
) => {
  const currentFinanceBalance = await db.financeBalance.get('current');
  const nextFinanceBalance = roundCurrency(
    Number(currentFinanceBalance?.amount || 0) + getBalanceDelta(transactionType, amount, isReversal),
  );

  await db.financeBalance.put({
    id: 'current',
    amount: nextFinanceBalance,
    updated_at: now,
  });
};

export const recordCooperativeSaving = async (
  input: RecordCooperativeSavingInput,
): Promise<RecordCooperativeSavingResult> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');

  const parsedInput = cooperativeSavingTransactionSchema.parse(input);
  const amount = roundCurrency(parsedInput.amount);
  const now = new Date().toISOString();
  const transactionDate = parsedInput.transaction_date ?? now;
  const paymentMethod = parsedInput.payment_method ?? 'TUNAI';
  const financeCategory = getFinanceCategoryForSaving(parsedInput.transaction_type);
  const savingTransactionId = crypto.randomUUID();
  const financeTransactionId = crypto.randomUUID();
  let savedTransaction: CooperativeSavingTransaction | undefined;
  let savedBalance: CooperativeMemberSavingBalance | undefined;
  let financeTransaction: FinanceTransaction | undefined;

  await db.transaction('rw', cooperativeSavingTables, async () => {
    const member = assertActiveMember(await db.cooperativeMembers.get(parsedInput.member_id));
    await assertSavingBusinessRules(member, parsedInput.saving_type, parsedInput.transaction_type, amount);

    const cashAccount = await getCashOrBankAccountForPayment(paymentMethod, parsedInput.cash_account_id);
    const accountSnapshot = await getFinanceAccountSnapshotForCategory(financeCategory);
    const savingTransaction: CooperativeSavingTransaction = withPendingCooperativeSync({
      id: savingTransactionId,
      member_id: member.id,
      member_number: member.member_number,
      member_name: member.name,
      saving_type: parsedInput.saving_type,
      transaction_type: parsedInput.transaction_type,
      amount,
      transaction_date: transactionDate,
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

    await updateFinanceBalance(parsedInput.transaction_type, amount, now);
    savedBalance = await buildBalance(
      member,
      parsedInput.saving_type,
      getBalanceDelta(parsedInput.transaction_type, amount),
      now,
    );

    financeTransaction = withPendingFinanceTransactionSync({
      id: financeTransactionId,
      type: getFinanceTypeForSaving(parsedInput.transaction_type),
      category: financeCategory,
      amount,
      description: `${parsedInput.transaction_type === 'DEPOSIT' ? 'Setoran' : 'Penarikan'} simpanan ${parsedInput.saving_type} ${member.member_number} - ${member.name}`,
      created_at: transactionDate,
      reference_id: savingTransaction.id,
      payment_method: paymentMethod,
      payment_channel: parsedInput.payment_channel,
      cash_account_id: cashAccount.id,
      cash_account_code: cashAccount.code,
      cash_account_name: cashAccount.name,
      ...accountSnapshot,
    }, currentUser, now);

    await db.financeTransactions.add(financeTransaction);
    await db.cooperativeSavingTransactions.add(savingTransaction);

    const journalEntry = await postCooperativeSavingTransactionJournal(savingTransaction, currentUser);
    savedTransaction = journalEntry
      ? {
          ...savingTransaction,
          journal_entry_id: journalEntry.id,
          updated_at: now,
          sync_status: 'pending',
          sync_error: undefined,
        }
      : savingTransaction;

    if (journalEntry) {
      await db.cooperativeSavingTransactions.update(savingTransaction.id, {
        journal_entry_id: journalEntry.id,
        updated_at: now,
        sync_status: 'pending',
        sync_error: undefined,
      });
    }

    await writeActivityLog({
      user: currentUser,
      action: parsedInput.transaction_type === 'DEPOSIT'
        ? 'COOPERATIVE_SAVING_DEPOSIT_RECORDED'
        : 'COOPERATIVE_SAVING_WITHDRAWAL_RECORDED',
      entity: 'cooperativeSavingTransactions',
      entity_id: savingTransaction.id,
      description: `${currentUser?.name ?? 'User'} mencatat ${parsedInput.transaction_type === 'DEPOSIT' ? 'setoran' : 'penarikan'} simpanan ${parsedInput.saving_type} ${member.member_number} sebesar ${amount}.`,
    });
  });

  if (!savedTransaction || !savedBalance) {
    throw new Error('Transaksi simpanan gagal disimpan.');
  }

  if (financeTransaction) {
    await enqueueFinanceTransactionsSync([financeTransaction], 'create');
  }
  await enqueueCooperativeSavingTransactionsSync([savedTransaction], 'create');
  await enqueueCooperativeMemberSavingBalancesSync([savedBalance], 'update');

  return {
    transaction: savedTransaction,
    balance: savedBalance,
  };
};

export const reverseCooperativeSaving = async (
  input: ReverseCooperativeSavingInput,
): Promise<CooperativeSavingTransaction> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');

  const parsedInput = cooperativeSavingReversalSchema.parse({ reason: input.reason });
  const now = new Date().toISOString();
  const reversalTransactionId = crypto.randomUUID();
  const reversalFinanceTransactionId = crypto.randomUUID();
  let reversalTransaction: CooperativeSavingTransaction | undefined;
  let reversalFinanceTransaction: FinanceTransaction | undefined;
  let reversalBalance: CooperativeMemberSavingBalance | undefined;
  let updatedOriginalTransaction: CooperativeSavingTransaction | undefined;

  await db.transaction('rw', cooperativeSavingTables, async () => {
    const originalTransaction = await db.cooperativeSavingTransactions.get(input.transaction_id);
    if (!originalTransaction) {
      throw new Error('Transaksi simpanan tidak ditemukan.');
    }
    if (originalTransaction.status !== 'POSTED') {
      throw new Error('Transaksi simpanan sudah pernah direversal.');
    }
    if (originalTransaction.transaction_type === 'REVERSAL') {
      throw new Error('Transaksi reversal tidak bisa direversal lagi.');
    }

    const existingReversal = await db.cooperativeSavingTransactions
      .where('reversal_of_transaction_id')
      .equals(originalTransaction.id)
      .first();
    if (existingReversal) {
      throw new Error('Transaksi simpanan sudah memiliki reversal.');
    }

    await updateFinanceBalance(originalTransaction.transaction_type, originalTransaction.amount, now, true);
    reversalBalance = await buildBalance(
      {
        id: originalTransaction.member_id,
        member_number: originalTransaction.member_number,
        name: originalTransaction.member_name,
      },
      originalTransaction.saving_type,
      getBalanceDelta(originalTransaction.transaction_type, originalTransaction.amount, true),
      now,
    );

    const reversalType = originalTransaction.transaction_type === 'WITHDRAWAL' ? 'INCOME' : 'EXPENSE';
    const financeCategory = getFinanceCategoryForSaving(originalTransaction.transaction_type);
    const accountSnapshot = await getFinanceAccountSnapshotForCategory(financeCategory);
    reversalFinanceTransaction = withPendingFinanceTransactionSync({
      id: reversalFinanceTransactionId,
      type: reversalType,
      category: financeCategory,
      amount: originalTransaction.amount,
      description: `Reversal ${originalTransaction.transaction_type === 'DEPOSIT' ? 'setoran' : 'penarikan'} simpanan ${originalTransaction.saving_type} ${originalTransaction.member_number}. ${parsedInput.reason}`,
      created_at: now,
      reference_id: reversalTransactionId,
      payment_method: originalTransaction.payment_method,
      payment_channel: originalTransaction.payment_channel,
      cash_account_id: originalTransaction.cash_account_id,
      cash_account_code: originalTransaction.cash_account_code,
      cash_account_name: originalTransaction.cash_account_name,
      ...accountSnapshot,
    }, currentUser, now);

    const nextReversalTransaction: CooperativeSavingTransaction = withPendingCooperativeSync({
      id: reversalTransactionId,
      member_id: originalTransaction.member_id,
      member_number: originalTransaction.member_number,
      member_name: originalTransaction.member_name,
      saving_type: originalTransaction.saving_type,
      transaction_type: 'REVERSAL',
      amount: originalTransaction.amount,
      transaction_date: now,
      status: 'POSTED',
      cash_account_id: originalTransaction.cash_account_id,
      cash_account_code: originalTransaction.cash_account_code,
      cash_account_name: originalTransaction.cash_account_name,
      payment_method: originalTransaction.payment_method,
      payment_channel: originalTransaction.payment_channel,
      finance_transaction_id: reversalFinanceTransactionId,
      reversal_of_transaction_id: originalTransaction.id,
      notes: parsedInput.reason,
      created_at: now,
      updated_at: now,
      created_by: currentUser?.id,
      created_by_name: currentUser?.name,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
    });
    reversalTransaction = nextReversalTransaction;

    await db.financeTransactions.add(reversalFinanceTransaction);
    await db.cooperativeSavingTransactions.add(nextReversalTransaction);

    const reversalEntries = originalTransaction.journal_entry_id
      ? await reverseCooperativeSavingTransactionJournal(
          originalTransaction,
          `Reversal transaksi simpanan ${originalTransaction.member_number}: ${parsedInput.reason}`,
          currentUser,
          now,
        )
      : [];
    const reversalJournalEntryId = reversalEntries[0]?.id;

    const nextOriginalTransaction: CooperativeSavingTransaction = withPendingCooperativeSync({
      ...originalTransaction,
      status: 'REVERSED' as const,
      reversal_transaction_id: nextReversalTransaction.id,
      reversal_finance_transaction_id: reversalFinanceTransactionId,
      reversal_journal_entry_id: reversalJournalEntryId,
      reversed_at: now,
      reversal_reason: parsedInput.reason,
      updated_at: now,
      updated_by: currentUser?.id,
      updated_by_name: currentUser?.name,
    });
    updatedOriginalTransaction = nextOriginalTransaction;
    await db.cooperativeSavingTransactions.put(nextOriginalTransaction);

    if (reversalJournalEntryId) {
      const reversalTransactionWithJournal: CooperativeSavingTransaction = {
        ...nextReversalTransaction,
        journal_entry_id: reversalJournalEntryId,
        updated_at: now,
        sync_status: 'pending',
        sync_error: undefined,
      };
      reversalTransaction = reversalTransactionWithJournal;
      await db.cooperativeSavingTransactions.update(nextReversalTransaction.id, {
        journal_entry_id: reversalJournalEntryId,
        updated_at: now,
        sync_status: 'pending',
        sync_error: undefined,
      });
    }

    await writeActivityLog({
      user: currentUser,
      action: 'COOPERATIVE_SAVING_TRANSACTION_REVERSED',
      entity: 'cooperativeSavingTransactions',
      entity_id: originalTransaction.id,
      description: `${currentUser?.name ?? 'User'} reversal transaksi simpanan ${originalTransaction.member_number} sebesar ${originalTransaction.amount}. Alasan: ${parsedInput.reason}`,
    });
  });

  if (!reversalTransaction) {
    throw new Error('Reversal transaksi simpanan gagal disimpan.');
  }
  if (!reversalBalance || !updatedOriginalTransaction) {
    throw new Error('Reversal transaksi simpanan gagal memperbarui saldo.');
  }

  if (reversalFinanceTransaction) {
    await enqueueFinanceTransactionsSync([reversalFinanceTransaction], 'create');
  }
  await enqueueCooperativeSavingTransactionsSync([reversalTransaction], 'create');
  await enqueueCooperativeSavingTransactionsSync([updatedOriginalTransaction], 'update');
  await enqueueCooperativeMemberSavingBalancesSync([reversalBalance], 'update');

  return reversalTransaction;
};
