import {
  FINANCE_CATEGORIES,
  getFinanceTransactionBusinessType,
} from '@/constants/finance';
import type {
  AuthUser,
  ChartOfAccount,
  FinanceTransaction,
  JournalEntry,
  JournalEntryLine,
  OpeningBalanceBatch,
  OpeningBalanceLine,
  PaymentMethod,
} from '@/types';

type BridgeActor = Partial<Pick<AuthUser, 'id' | 'name'>> | null | undefined;

const CASH_BANK_ACCOUNT_IDS = new Set([
  'cash-and-bank',
  'cash',
  'bank',
  'template-cash',
  'template-bank',
]);
const CASH_BANK_ACCOUNT_CODES = new Set(['1010', '1020']);
const FIELD_CASH_CODE_PATTERN = /^1011(?:\.|$)/;
const ROUNDING_TOLERANCE = 0.01;

const roundCurrency = (value: number) => Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

const normalizeStartOfDay = (value: string) => (
  value.includes('T') ? value : `${value.slice(0, 10)}T00:00:00.000`
);

const toDateOnly = (value?: string) => (value ? value.slice(0, 10) : '');

const hasCashBankLabel = (value?: string) => {
  const normalized = value?.toLowerCase() ?? '';
  return (
    (normalized.includes('kas') && normalized.includes('bank')) ||
    (normalized.includes('cash') && normalized.includes('bank'))
  );
};

export const getAccountOpeningBalanceFinanceTransactionId = (openingBalanceLineId: string) => (
  `opening-balance-finance-${openingBalanceLineId}`
);

export const getAccountOpeningBalanceAdjustmentFinanceTransactionId = (journalEntryLineId: string) => (
  `opening-balance-adjustment-finance-${journalEntryLineId}`
);

export const isAccountOpeningBalanceCashBankAccount = (
  account: ChartOfAccount | undefined,
): account is ChartOfAccount => {
  if (!account || account.type !== 'ASSET' || !account.is_active || !account.is_postable) return false;
  if (CASH_BANK_ACCOUNT_IDS.has(account.id) || CASH_BANK_ACCOUNT_CODES.has(account.code)) return true;
  if (FIELD_CASH_CODE_PATTERN.test(account.code)) return true;
  if (account.parent_id === 'cash-and-bank') return true;
  if (hasCashBankLabel(account.parent_name)) return true;

  return false;
};

export const getAccountOpeningBalanceSignedAmount = (line: Pick<OpeningBalanceLine, 'debit' | 'credit'>) => (
  roundCurrency(Number(line.debit || 0) - Number(line.credit || 0))
);

export const inferAccountOpeningBalancePaymentMethod = (account: ChartOfAccount): PaymentMethod => {
  const name = account.name.toLowerCase();
  if (account.id === 'bank' || account.id === 'template-bank' || account.code === '1020' || name.includes('bank')) {
    return 'NON_TUNAI';
  }

  return 'TUNAI';
};

export const buildAccountOpeningBalanceFinanceTransaction = ({
  batch,
  line,
  account,
  actor,
  now,
}: {
  batch: OpeningBalanceBatch;
  line: OpeningBalanceLine;
  account: ChartOfAccount;
  actor?: BridgeActor;
  now: string;
}): FinanceTransaction | undefined => {
  const amount = getAccountOpeningBalanceSignedAmount(line);
  if (Math.abs(amount) <= ROUNDING_TOLERANCE) return undefined;

  const openingDate = normalizeStartOfDay(batch.cutoff_date);
  return {
    id: getAccountOpeningBalanceFinanceTransactionId(line.id),
    type: 'OPENING_BALANCE',
    category: FINANCE_CATEGORIES.OPENING_BALANCE,
    amount,
    description: line.notes?.trim() || `Saldo awal ${account.code} - ${account.name} per ${toDateOnly(openingDate)}`,
    created_at: openingDate,
    reference_id: line.id,
    account_id: account.id,
    account_code: account.code,
    account_name: account.name,
    account_type: account.type,
    payment_method: inferAccountOpeningBalancePaymentMethod(account),
    cash_account_id: account.id,
    cash_account_code: account.code,
    cash_account_name: account.name,
    version: 1,
    created_by: actor?.id,
    created_by_name: actor?.name,
    updated_by: actor?.id,
    updated_by_name: actor?.name,
    updated_at: now,
    sync_status: 'pending',
    sync_error: undefined,
  };
};

export const buildAccountOpeningBalanceAdjustmentFinanceTransaction = ({
  journalEntry,
  line,
  account,
  actor,
  now,
}: {
  journalEntry: JournalEntry;
  line: JournalEntryLine;
  account: ChartOfAccount;
  actor?: BridgeActor;
  now: string;
}): FinanceTransaction | undefined => {
  const amount = roundCurrency(Number(line.debit || 0) - Number(line.credit || 0));
  if (Math.abs(amount) <= ROUNDING_TOLERANCE) return undefined;

  return {
    id: getAccountOpeningBalanceAdjustmentFinanceTransactionId(line.id),
    type: 'OPENING_BALANCE',
    category: FINANCE_CATEGORIES.OPENING_BALANCE,
    amount,
    description: line.description?.trim() || journalEntry.description,
    created_at: normalizeStartOfDay(journalEntry.entry_date),
    reference_id: line.id,
    account_id: account.id,
    account_code: account.code,
    account_name: account.name,
    account_type: account.type,
    payment_method: inferAccountOpeningBalancePaymentMethod(account),
    cash_account_id: account.id,
    cash_account_code: account.code,
    cash_account_name: account.name,
    version: 1,
    created_by: actor?.id,
    created_by_name: actor?.name,
    updated_by: actor?.id,
    updated_by_name: actor?.name,
    updated_at: now,
    sync_status: 'pending',
    sync_error: undefined,
  };
};

export const hasEquivalentAccountOpeningBalanceFinanceTransaction = (
  transactions: FinanceTransaction[],
  candidate: FinanceTransaction,
) => transactions.some((transaction) => {
  if (transaction.deleted_at) return false;
  if (transaction.id === candidate.id || transaction.reference_id === candidate.reference_id) return true;
  if (transaction.cash_account_id !== candidate.cash_account_id) return false;
  if (getFinanceTransactionBusinessType(transaction) !== 'OPENING_BALANCE') return false;
  if (toDateOnly(transaction.created_at) !== toDateOnly(candidate.created_at)) return false;

  return Math.abs(Number(transaction.amount || 0) - Number(candidate.amount || 0)) <= ROUNDING_TOLERANCE;
});

export const calculateFinanceBalanceFromTransactions = (transactions: FinanceTransaction[]) => (
  roundCurrency(transactions.reduce((sum, transaction) => {
    if (transaction.deleted_at) return sum;

    const businessType = getFinanceTransactionBusinessType(transaction);
    if (businessType === 'EXPENSE') {
      return sum - Number(transaction.amount || 0);
    }

    if (businessType === 'INCOME' || businessType === 'OPENING_BALANCE') {
      return sum + Number(transaction.amount || 0);
    }

    return sum;
  }, 0))
);
