import { useEffect, useMemo } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  getCachedBaseCurrency,
  getCurrencySymbol,
  resolveBaseCurrencyFromState,
  setCachedBaseCurrency,
} from '@/services/baseCurrencyService';

export const useBaseCurrency = () => {
  const baseCurrency = useLiveQuery(
    async () => {
      const [currencies, setup] = await Promise.all([
        db.currencies.toArray(),
        db.accountingInitialSetupSetting.get('default'),
      ]);
      return resolveBaseCurrencyFromState(currencies, setup);
    },
    [],
    undefined,
  );

  useEffect(() => {
    if (baseCurrency) {
      setCachedBaseCurrency(baseCurrency);
    }
  }, [baseCurrency]);

  return useMemo(() => {
    const resolvedCurrency = baseCurrency ?? getCachedBaseCurrency();
    const symbol = resolvedCurrency.symbol || getCurrencySymbol(resolvedCurrency.code);

    return {
      baseCurrency: resolvedCurrency,
      baseCurrencyCode: resolvedCurrency.code,
      baseCurrencySymbol: symbol,
      isLoading: baseCurrency === undefined,
    };
  }, [baseCurrency]);
};
