import type {
  PaymentMethod,
  PaymentMethodCategory,
  PaymentMethodMaster,
  Transaction,
} from '@/types';

export interface TransactionPaymentSnapshot {
  id?: string;
  code: string;
  name: string;
  category: PaymentMethodCategory;
  reference?: string;
  postingAccountId?: string;
  postingAccountCode?: string;
  postingAccountName?: string;
  isCash: boolean;
  isLegacyFallback: boolean;
}

export const normalizePaymentMethodCode = (value?: string) => (
  value?.trim().toUpperCase() || undefined
);

export const toLegacyPaymentMethod = (category: PaymentMethodCategory): PaymentMethod => (
  category === 'CASH' ? 'TUNAI' : 'NON_TUNAI'
);

export const getTransactionPaymentSnapshot = (
  transaction: Transaction,
): TransactionPaymentSnapshot => {
  const legacyCode = transaction.payment_method === 'NON_TUNAI' ? 'NON_TUNAI' : 'TUNAI';
  const snapshotCode = normalizePaymentMethodCode(transaction.payment_method_code);
  const code = snapshotCode ?? legacyCode;
  const legacyName = legacyCode === 'TUNAI' ? 'Tunai' : 'Non Tunai';
  const snapshotName = transaction.payment_method_name?.trim();
  const category = transaction.payment_method_category
    ?? (legacyCode === 'TUNAI' ? 'CASH' : 'OTHER');

  return {
    id: transaction.payment_method_id,
    code,
    name: snapshotName || (snapshotCode && snapshotCode !== legacyCode ? snapshotCode : legacyName),
    category,
    reference: transaction.payment_reference?.trim() || undefined,
    postingAccountId: transaction.payment_posting_account_id,
    postingAccountCode: transaction.payment_posting_account_code,
    postingAccountName: transaction.payment_posting_account_name,
    isCash: category === 'CASH',
    isLegacyFallback: !transaction.payment_method_id
      && !transaction.payment_method_code
      && !transaction.payment_method_name
      && !transaction.payment_method_category,
  };
};

export const getTransactionPaymentMethodCode = (transaction: Transaction) => (
  getTransactionPaymentSnapshot(transaction).code
);

export const getTransactionPaymentMethodName = (transaction: Transaction) => (
  getTransactionPaymentSnapshot(transaction).name
);

export const getTransactionPaymentMethodCategory = (transaction: Transaction) => (
  getTransactionPaymentSnapshot(transaction).category
);

export const isTransactionCashPayment = (transaction: Transaction) => (
  getTransactionPaymentSnapshot(transaction).isCash
);

export const buildLegacyPosPaymentSnapshot = (
  transaction: Transaction,
  methods: PaymentMethodMaster[],
): Transaction => {
  if (transaction.payment_method_id || transaction.payment_method_code) return transaction;

  const legacyCode = transaction.payment_method === 'NON_TUNAI' ? 'NON_TUNAI' : 'TUNAI';
  const master = methods.find((method) => method.code.trim().toUpperCase() === legacyCode);

  return {
    ...transaction,
    payment_method_id: master?.id,
    payment_method_code: master?.code ?? legacyCode,
    payment_method_name: master?.name ?? (legacyCode === 'TUNAI' ? 'Tunai' : 'Non Tunai'),
    payment_method_category: master?.category ?? (legacyCode === 'TUNAI' ? 'CASH' : 'OTHER'),
    payment_posting_account_id: master?.posting_account_id,
    payment_posting_account_code: master?.posting_account_code,
    payment_posting_account_name: master?.posting_account_name,
  };
};
