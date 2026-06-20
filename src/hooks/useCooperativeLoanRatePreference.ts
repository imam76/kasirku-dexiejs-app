import { useCallback, useState } from 'react';

export interface CooperativeLoanRatePreference {
  loan_service_rate: number;
  admin_fee_rate: number;
  mandatory_saving_rate: number;
}

type CooperativeLoanRatePreferenceInput = Partial<CooperativeLoanRatePreference>;

const COOPERATIVE_LOAN_RATE_PREFERENCE_STORAGE_KEY = 'cooperativeLoanRatePreference:totalPercent';

const normalizeRate = (value: unknown) => {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : undefined;
};

const normalizeLoanRatePreference = (
  input: CooperativeLoanRatePreferenceInput,
): CooperativeLoanRatePreference | undefined => {
  const loanServiceRate = normalizeRate(input.loan_service_rate);
  const adminFeeRate = normalizeRate(input.admin_fee_rate);
  const mandatorySavingRate = normalizeRate(input.mandatory_saving_rate);

  if (loanServiceRate === undefined || adminFeeRate === undefined || mandatorySavingRate === undefined) {
    return undefined;
  }

  return {
    loan_service_rate: loanServiceRate,
    admin_fee_rate: adminFeeRate,
    mandatory_saving_rate: mandatorySavingRate,
  };
};

const getStoredLoanRatePreference = () => {
  if (typeof window === 'undefined') return undefined;

  const storedValue = window.localStorage.getItem(COOPERATIVE_LOAN_RATE_PREFERENCE_STORAGE_KEY);
  if (!storedValue) return undefined;

  try {
    const parsedValue = JSON.parse(storedValue) as unknown;
    if (!parsedValue || typeof parsedValue !== 'object') return undefined;

    return normalizeLoanRatePreference(parsedValue as CooperativeLoanRatePreferenceInput);
  } catch {
    return undefined;
  }
};

export const useCooperativeLoanRatePreference = () => {
  const [loanRatePreference, setLoanRatePreference] = useState<CooperativeLoanRatePreference | undefined>(
    getStoredLoanRatePreference,
  );

  const rememberLoanRates = useCallback((input?: CooperativeLoanRatePreferenceInput) => {
    const nextPreference = input ? normalizeLoanRatePreference(input) : undefined;
    setLoanRatePreference(nextPreference);

    if (typeof window === 'undefined') return;

    if (nextPreference) {
      window.localStorage.setItem(
        COOPERATIVE_LOAN_RATE_PREFERENCE_STORAGE_KEY,
        JSON.stringify(nextPreference),
      );
    } else {
      window.localStorage.removeItem(COOPERATIVE_LOAN_RATE_PREFERENCE_STORAGE_KEY);
    }
  }, []);

  return {
    loanRatePreference,
    rememberLoanRates,
  };
};
