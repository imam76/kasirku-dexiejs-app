import type { PaymentMethodCategory, PaymentMethodMaster, PosTransactionPayment, Transaction } from '@/types';
import { getTransactionPaymentSnapshot, normalizePaymentMethodCode } from '@/utils/posPaymentMethod';

export interface PaymentMethodFilterOption {
  value: string;
  label: string;
  category: PaymentMethodCategory;
  is_active: boolean;
  is_historical_only: boolean;
}

interface SortablePaymentMethodFilterOption extends PaymentMethodFilterOption {
  sortOrder: number;
  sourceOrder: number;
}

export const buildPosPaymentMethodFilterOptions = (
  methods: PaymentMethodMaster[],
  transactions: Transaction[],
  payments: PosTransactionPayment[] = [],
): PaymentMethodFilterOption[] => {
  const optionByCode = new Map<string, SortablePaymentMethodFilterOption>();

  [...methods]
    .sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name))
    .forEach((method, index) => {
      const value = normalizePaymentMethodCode(method.code);
      if (!value || optionByCode.has(value)) return;
      optionByCode.set(value, {
        value,
        label: method.is_active ? method.name : `${method.name} (Tidak Aktif)`,
        category: method.category,
        is_active: method.is_active,
        is_historical_only: false,
        sortOrder: method.sort_order,
        sourceOrder: index,
      });
    });

  transactions.forEach((transaction, index) => {
    const snapshot = getTransactionPaymentSnapshot(transaction);
    const value = normalizePaymentMethodCode(snapshot.code);
    if (!value || optionByCode.has(value)) return;
    optionByCode.set(value, {
      value,
      label: snapshot.name,
      category: snapshot.category,
      is_active: false,
      is_historical_only: true,
      sortOrder: Number.MAX_SAFE_INTEGER,
      sourceOrder: methods.length + index,
    });
  });

  payments.forEach((payment, index) => {
    const value = normalizePaymentMethodCode(payment.payment_method_code);
    if (!value || optionByCode.has(value)) return;
    optionByCode.set(value, {
      value,
      label: payment.payment_method_name,
      category: payment.payment_method_category,
      is_active: false,
      is_historical_only: true,
      sortOrder: Number.MAX_SAFE_INTEGER,
      sourceOrder: methods.length + transactions.length + index,
    });
  });

  return [...optionByCode.values()]
    .sort((left, right) => (
      left.sortOrder - right.sortOrder
      || left.sourceOrder - right.sourceOrder
      || left.label.localeCompare(right.label)
    ))
    .map((option) => ({
      value: option.value,
      label: option.label,
      category: option.category,
      is_active: option.is_active,
      is_historical_only: option.is_historical_only,
    }));
};
