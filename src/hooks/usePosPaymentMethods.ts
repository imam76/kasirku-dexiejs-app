import { useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { isValidPosPostingAccount } from '@/services/posPaymentMethodService';
import type { PaymentMethodMaster } from '@/types';

export interface PosPaymentMethodOption {
  method: PaymentMethodMaster;
  isValid: boolean;
  disabledReason?: string;
}

export const usePosPaymentMethods = () => {
  const methods = useLiveQuery(() => db.paymentMethods.toArray(), [], []);
  const accounts = useLiveQuery(() => db.chartOfAccounts.toArray(), [], []);

  const options = useMemo<PosPaymentMethodOption[]>(() => {
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    return methods
      .filter((method) => method.is_active)
      .sort((left, right) => left.sort_order - right.sort_order || left.name.localeCompare(right.name))
      .map((method) => {
        const account = method.posting_account_id
          ? accountById.get(method.posting_account_id)
          : undefined;
        const isValid = isValidPosPostingAccount(account);
        return {
          method,
          isValid,
          disabledReason: isValid ? undefined : 'Konfigurasi akun belum valid',
        };
      });
  }, [accounts, methods]);

  return {
    options,
    validMethods: options.filter((option) => option.isValid).map((option) => option.method),
    isLoading: methods.length === 0 && accounts.length === 0,
  };
};
