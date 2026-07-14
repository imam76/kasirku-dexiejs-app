import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import {
  archiveCurrency,
  createCurrency,
  ensureBaseCurrency,
  fetchAndCacheBiCurrencyRate,
  restoreCurrency,
  updateCurrency,
  upsertCurrencyRate,
  type CurrencyRateUpsertInput,
  type CurrencyUpsertInput,
} from '@/services/currencyService';
import type { Currency, CurrencyRate } from '@/types';

export type CurrencyStatusFilter = 'active' | 'inactive' | 'all';

export const useCurrencies = () => {
  const queryClient = useQueryClient();
  const { baseCurrencyCode, baseCurrencySymbol } = useBaseCurrency();
  const [editingCurrency, setEditingCurrency] = useState<Currency | null>(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<CurrencyStatusFilter>('active');

  useEffect(() => {
    void ensureBaseCurrency();
  }, []);

  const currencies = useLiveQuery(
    () => db.currencies.orderBy('code').toArray(),
    [],
    [],
  );

  const currencyRates = useLiveQuery(
    () => db.currencyRates.orderBy('rate_date').reverse().toArray(),
    [],
    [],
  );

  const latestRateByCurrency = useMemo(() => {
    return currencyRates.reduce<Record<string, CurrencyRate>>((acc, rate) => {
      if (rate.base_currency_code !== baseCurrencyCode) return acc;
      const existing = acc[rate.currency_code];
      if (!existing || rate.rate_date > existing.rate_date || (
        rate.rate_date === existing.rate_date && rate.updated_at > existing.updated_at
      )) {
        acc[rate.currency_code] = rate;
      }
      return acc;
    }, {});
  }, [baseCurrencyCode, currencyRates]);

  const filteredCurrencies = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return currencies.filter((currency) => {
      const matchesSearch = !query || [
        currency.code,
        currency.name,
        currency.symbol,
      ].some((value) => value?.toLowerCase().includes(query));
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? currency.is_active : !currency.is_active);

      return matchesSearch && matchesStatus;
    });
  }, [currencies, searchText, statusFilter]);

  const invalidateCurrencies = () => {
    queryClient.invalidateQueries({ queryKey: ['currencies'] });
    queryClient.invalidateQueries({ queryKey: ['currencyRates'] });
  };

  const createMutation = useMutation({
    mutationFn: createCurrency,
    onSuccess: invalidateCurrencies,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: CurrencyUpsertInput }) => updateCurrency(id, input),
    onSuccess: invalidateCurrencies,
  });
  const archiveMutation = useMutation({
    mutationFn: archiveCurrency,
    onSuccess: invalidateCurrencies,
  });
  const restoreMutation = useMutation({
    mutationFn: restoreCurrency,
    onSuccess: invalidateCurrencies,
  });
  const upsertRateMutation = useMutation({
    mutationFn: (input: CurrencyRateUpsertInput) => upsertCurrencyRate(input),
    onSuccess: invalidateCurrencies,
  });
  const fetchBiRateMutation = useMutation({
    mutationFn: ({ currencyCode, targetDate }: { currencyCode: string; targetDate: string }) => (
      fetchAndCacheBiCurrencyRate(currencyCode, targetDate)
    ),
    onSuccess: invalidateCurrencies,
  });

  const resetForm = () => setEditingCurrency(null);
  const handleEdit = (currency: Currency) => setEditingCurrency(currency);
  const submitForm = async (input: CurrencyUpsertInput) => {
    if (editingCurrency) {
      return updateMutation.mutateAsync({ id: editingCurrency.id, input });
    }

    return createMutation.mutateAsync(input);
  };
  const submitRate = async (input: CurrencyRateUpsertInput) => upsertRateMutation.mutateAsync(input);
  const fetchBiRate = async (currencyCode: string, targetDate: string) => (
    fetchBiRateMutation.mutateAsync({ currencyCode, targetDate })
  );

  return {
    currencies,
    currencyRates,
    filteredCurrencies,
    latestRateByCurrency,
    baseCurrencyCode,
    baseCurrencySymbol,
    editingCurrency,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    handleEdit,
    resetForm,
    submitForm,
    submitRate,
    fetchBiRate,
    archiveCurrency: archiveMutation.mutateAsync,
    restoreCurrency: restoreMutation.mutateAsync,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
    isSavingRate: upsertRateMutation.isPending,
    isFetchingBiRate: fetchBiRateMutation.isPending,
    isArchiving: archiveMutation.isPending,
    isRestoring: restoreMutation.isPending,
  };
};
