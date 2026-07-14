import {
  BASE_CURRENCY_CODE,
  buildBaseCurrencyForCode,
  getCurrencyPreset,
  normalizeIsoCurrencyCode,
} from '@/constants/currencies';
import { db } from '@/lib/db';
import type { AccountingInitialSetupSetting, Currency } from '@/types';
export {
  getAccountingSetupLockSignals as getBaseCurrencyLockSignals,
  type AccountingSetupLockSignalResult as BaseCurrencyLockSignalResult,
} from '@/services/accountingSetupLockService';

const getFallbackBaseCurrency = (): Currency => (
  buildBaseCurrencyForCode(BASE_CURRENCY_CODE, new Date().toISOString())
);

let cachedBaseCurrency: Currency = getFallbackBaseCurrency();

export const setCachedBaseCurrency = (currency: Currency) => {
  cachedBaseCurrency = currency;
};

export const getCachedBaseCurrency = () => cachedBaseCurrency;

export const getCachedBaseCurrencyCode = () => cachedBaseCurrency.code;

export const getCachedBaseCurrencySymbol = () => (
  cachedBaseCurrency.symbol || getCurrencyPreset(cachedBaseCurrency.code).symbol || cachedBaseCurrency.code
);

const createCurrencyFallback = (currencyCode?: string | null): Currency => {
  const code = normalizeIsoCurrencyCode(currencyCode);
  return buildBaseCurrencyForCode(code, new Date().toISOString());
};

export const resolveBaseCurrencyFromState = (
  currencies: Currency[],
  setup?: Pick<AccountingInitialSetupSetting, 'base_currency_code'>,
): Currency => {
  const setupBaseCode = setup?.base_currency_code
    ? normalizeIsoCurrencyCode(setup.base_currency_code)
    : undefined;
  if (setupBaseCode) {
    const setupCurrency = currencies.find((currency) => currency.code === setupBaseCode);
    return {
      ...createCurrencyFallback(setupBaseCode),
      ...setupCurrency,
      code: setupBaseCode,
      id: setupCurrency?.id ?? setupBaseCode,
      is_base: true,
      is_active: true,
    };
  }

  const markedBaseCurrency = currencies.find((currency) => currency.is_base);
  if (markedBaseCurrency) {
    return {
      ...markedBaseCurrency,
      is_base: true,
      is_active: true,
    };
  }

  const idrCurrency = currencies.find((currency) => currency.code === BASE_CURRENCY_CODE);
  if (idrCurrency) {
    return {
      ...idrCurrency,
      is_base: true,
      is_active: true,
    };
  }

  return getFallbackBaseCurrency();
};

export const getBaseCurrency = async (): Promise<Currency> => {
  const [currencies, setup] = await Promise.all([
    db.currencies.toArray(),
    db.accountingInitialSetupSetting.get('default'),
  ]);
  const baseCurrency = resolveBaseCurrencyFromState(currencies, setup);
  setCachedBaseCurrency(baseCurrency);
  return baseCurrency;
};

export const getBaseCurrencyCode = async () => (
  (await getBaseCurrency()).code
);

export const getBaseCurrencySymbol = async () => {
  const baseCurrency = await getBaseCurrency();
  return baseCurrency.symbol || getCurrencyPreset(baseCurrency.code).symbol || baseCurrency.code;
};

export const getCurrencySymbol = (currencyCode?: string | null) => (
  getCurrencyPreset(currencyCode).symbol || normalizeIsoCurrencyCode(currencyCode)
);
