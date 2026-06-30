import {
  enqueueCooperativeAreaSync,
  enqueueCooperativeLoanCollectionEventSync,
  enqueueCooperativeLoanInstallmentSync,
  enqueueCooperativeLoanPaymentSync,
  enqueueCooperativeLoanSync,
  enqueueCooperativeMemberSavingBalanceSync,
  enqueueCooperativeMemberSync,
  enqueueCooperativeSavingTransactionSync,
} from '@/services/syncQueueService';
import type {
  CooperativeArea,
  CooperativeLoan,
  CooperativeLoanCollectionEvent,
  CooperativeLoanInstallment,
  CooperativeLoanPayment,
  CooperativeMember,
  CooperativeMemberSavingBalance,
  CooperativeSavingTransaction,
  SyncQueueOperation,
} from '@/types';

export const withPendingCooperativeSync = <T extends object>(
  item: T,
): T & { sync_status: 'pending'; sync_error: undefined } => ({
  ...item,
  sync_status: 'pending',
  sync_error: undefined,
});

export const enqueueCooperativeMembersSync = async (
  members: CooperativeMember[],
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  for (const member of members) {
    await enqueueCooperativeMemberSync(member, operation);
  }
};

export const enqueueCooperativeAreasSync = async (
  areas: CooperativeArea[],
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  for (const area of areas) {
    await enqueueCooperativeAreaSync(area, operation);
  }
};

export const enqueueCooperativeSavingTransactionsSync = async (
  transactions: CooperativeSavingTransaction[],
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  for (const transaction of transactions) {
    await enqueueCooperativeSavingTransactionSync(transaction, operation);
  }
};

export const enqueueCooperativeMemberSavingBalancesSync = async (
  balances: CooperativeMemberSavingBalance[],
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  for (const balance of balances) {
    await enqueueCooperativeMemberSavingBalanceSync(balance, operation);
  }
};

export const enqueueCooperativeLoansSync = async (
  loans: CooperativeLoan[],
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  for (const loan of loans) {
    await enqueueCooperativeLoanSync(loan, operation);
  }
};

export const enqueueCooperativeLoanInstallmentsSync = async (
  installments: CooperativeLoanInstallment[],
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  for (const installment of installments) {
    await enqueueCooperativeLoanInstallmentSync(installment, operation);
  }
};

export const enqueueCooperativeLoanCollectionEventsSync = async (
  events: CooperativeLoanCollectionEvent[],
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  for (const event of events) {
    await enqueueCooperativeLoanCollectionEventSync(event, operation);
  }
};

export const enqueueCooperativeLoanPaymentsSync = async (
  payments: CooperativeLoanPayment[],
  operation: Extract<SyncQueueOperation, 'create' | 'update'>,
) => {
  for (const payment of payments) {
    await enqueueCooperativeLoanPaymentSync(payment, operation);
  }
};
