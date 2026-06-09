import { useCallback, useState } from 'react';
import type { ChartOfAccount } from '@/types';

export interface CooperativeCashPreference {
  cash_account_id?: string;
}

type CooperativeCashPreferenceInput = Partial<CooperativeCashPreference>;
export type CooperativeCashPreferenceScope = 'savings' | 'loanDisbursement' | 'loanPayment';

const LEGACY_COOPERATIVE_CASH_PREFERENCE_STORAGE_KEY = 'cooperativeCashPreference';
const COOPERATIVE_CASH_PREFERENCE_STORAGE_KEYS: Record<CooperativeCashPreferenceScope, string> = {
  savings: 'cooperativeCashPreference:savings',
  loanDisbursement: 'cooperativeCashPreference:loanDisbursement',
  loanPayment: 'cooperativeCashPreference:loanPayment',
};
const DEFAULT_COOPERATIVE_CASH_PREFERENCE: CooperativeCashPreference = {};

const normalizeOptionalString = (value: unknown) => {
  if (typeof value !== 'string') return undefined;

  const trimmedValue = value.trim();
  return trimmedValue || undefined;
};

const normalizeCashPreference = (input: CooperativeCashPreferenceInput): CooperativeCashPreference => {
  const cashAccountId = normalizeOptionalString(input.cash_account_id);

  return {
    ...(cashAccountId ? { cash_account_id: cashAccountId } : {}),
  };
};

const parseStoredCashPreference = (storedValue: string | null): CooperativeCashPreference | undefined => {
  if (!storedValue) return undefined;

  try {
    const parsedValue = JSON.parse(storedValue) as unknown;
    if (!parsedValue || typeof parsedValue !== 'object') return undefined;

    return normalizeCashPreference(parsedValue as CooperativeCashPreferenceInput);
  } catch {
    return undefined;
  }
};

const getStoredCashPreference = (storageKey: string): CooperativeCashPreference => {
  if (typeof window === 'undefined') return DEFAULT_COOPERATIVE_CASH_PREFERENCE;

  return parseStoredCashPreference(window.localStorage.getItem(storageKey))
    ?? parseStoredCashPreference(window.localStorage.getItem(LEGACY_COOPERATIVE_CASH_PREFERENCE_STORAGE_KEY))
    ?? DEFAULT_COOPERATIVE_CASH_PREFERENCE;
};

const resolveCashPreferenceFields = (
  preference: CooperativeCashPreference,
  paymentAccounts: Pick<ChartOfAccount, 'id'>[],
): CooperativeCashPreference => {
  const hasMatchingAccount = preference.cash_account_id
    ? paymentAccounts.some((account) => account.id === preference.cash_account_id)
    : false;

  return {
    cash_account_id: preference.cash_account_id && (paymentAccounts.length === 0 || hasMatchingAccount)
      ? preference.cash_account_id
      : undefined,
  };
};

export const useCooperativeCashPreference = (scope: CooperativeCashPreferenceScope) => {
  const storageKey = COOPERATIVE_CASH_PREFERENCE_STORAGE_KEYS[scope];
  const [cashPreference, setCashPreference] = useState<CooperativeCashPreference>(() => getStoredCashPreference(storageKey));

  const rememberCashAccount = useCallback((input: CooperativeCashPreferenceInput) => {
    const nextPreference = normalizeCashPreference(input);
    setCashPreference(nextPreference);

    if (typeof window !== 'undefined') {
      if (nextPreference.cash_account_id) {
        window.localStorage.setItem(storageKey, JSON.stringify(nextPreference));
      } else {
        window.localStorage.removeItem(storageKey);
      }
    }
  }, [storageKey]);

  const getRememberedCashAccountFields = useCallback((paymentAccounts: Pick<ChartOfAccount, 'id'>[]) => (
    resolveCashPreferenceFields(cashPreference, paymentAccounts)
  ), [cashPreference]);

  return {
    cashPreference,
    getRememberedCashAccountFields,
    rememberCashAccount,
  };
};
