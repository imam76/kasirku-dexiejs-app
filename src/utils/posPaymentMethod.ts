import type {
  PaymentMethod,
  PaymentMethodCategory,
  PaymentMethodMaster,
  Transaction,
} from '@/types';

export const toLegacyPaymentMethod = (category: PaymentMethodCategory): PaymentMethod => (
  category === 'CASH' ? 'TUNAI' : 'NON_TUNAI'
);

export const getTransactionPaymentMethodCode = (transaction: Transaction) => (
  transaction.payment_method_code ?? transaction.payment_method ?? 'TUNAI'
);

export const getTransactionPaymentMethodName = (transaction: Transaction) => (
  transaction.payment_method_name ?? (
    transaction.payment_method === 'NON_TUNAI' ? 'Non Tunai' : 'Tunai'
  )
);

export const isTransactionCashPayment = (transaction: Transaction) => (
  transaction.payment_method_category
    ? transaction.payment_method_category === 'CASH'
    : transaction.payment_method === 'TUNAI'
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
