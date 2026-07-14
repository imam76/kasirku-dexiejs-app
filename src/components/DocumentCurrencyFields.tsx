import { useMemo, useState } from 'react';
import { App, Button, InputNumber, Select, Tag, Tooltip } from 'antd';
import { RefreshCw } from 'lucide-react';
import { Controller, useWatch } from 'react-hook-form';
import type { Control, FieldValues, Path, UseFormSetValue } from 'react-hook-form';
import dayjs from '@/lib/dayjs';
import { BASE_CURRENCY_CODE, DEFAULT_EXCHANGE_RATE } from '@/constants/currencies';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import { useI18n } from '@/hooks/useI18n';
import { fetchAndCacheBiCurrencyRate } from '@/services/currencyService';
import type { Currency, CurrencyRate } from '@/types';
import {
  buildDocumentCurrencySnapshot,
  isBaseCurrency,
  normalizeCurrencyCode,
  normalizeExchangeRate,
  type DocumentCurrencySnapshot,
} from '@/utils/documentCurrency';
import { formatCurrency } from '@/utils/formatters';

interface DocumentCurrencyFieldsProps<TFieldValues extends FieldValues> {
  control: Control<TFieldValues>;
  setValue: UseFormSetValue<TFieldValues>;
  currencies: Currency[];
  latestRateByCurrency: Record<string, CurrencyRate>;
  documentDate?: unknown;
  onSnapshotChange?: (snapshot: DocumentCurrencySnapshot, previousCurrencyCode?: string) => void;
}

const fieldContainerClassName = 'mb-4';
const labelClassName = 'mb-1.5 flex items-center gap-1 text-sm font-medium text-gray-700';

const getDocumentDate = (value: unknown) => {
  if (!value) return dayjs().format('YYYY-MM-DD');
  if (dayjs.isDayjs(value)) return value.format('YYYY-MM-DD');
  return String(value).slice(0, 10);
};

export function DocumentCurrencyFields<TFieldValues extends FieldValues>({
  control,
  setValue,
  currencies,
  latestRateByCurrency,
  documentDate,
  onSnapshotChange,
}: DocumentCurrencyFieldsProps<TFieldValues>) {
  const { t } = useI18n();
  const { message } = App.useApp();
  const { baseCurrency, baseCurrencyCode, baseCurrencySymbol } = useBaseCurrency();
  const [fetching, setFetching] = useState(false);
  const currencyCode = normalizeCurrencyCode(useWatch({
    control,
    name: 'currency_code' as Path<TFieldValues>,
  }) as string | undefined, baseCurrencyCode);
  const exchangeRate = normalizeExchangeRate(useWatch({
    control,
    name: 'exchange_rate' as Path<TFieldValues>,
  }) as number | undefined);
  const exchangeRateSource = useWatch({
    control,
    name: 'exchange_rate_source' as Path<TFieldValues>,
  }) as string | undefined;
  const exchangeRateDate = useWatch({
    control,
    name: 'exchange_rate_date' as Path<TFieldValues>,
  }) as string | undefined;
  const setFormValue = setValue as unknown as (
    name: string,
    value: unknown,
    options?: { shouldDirty?: boolean; shouldValidate?: boolean },
  ) => void;

  const activeCurrencies = useMemo(() => {
    const nextCurrencies = currencies.filter((currency) => currency.is_active || currency.code === baseCurrencyCode);
    if (nextCurrencies.some((currency) => currency.code === baseCurrencyCode)) return nextCurrencies;
    return [baseCurrency, ...nextCurrencies];
  }, [baseCurrency, baseCurrencyCode, currencies]);

  const selectedCurrency = activeCurrencies.find((currency) => currency.code === currencyCode);
  const selectedLatestRate = latestRateByCurrency[currencyCode];
  const selectedIsBaseCurrency = isBaseCurrency(currencyCode, baseCurrencyCode);
  const canFetchBiRate = !selectedIsBaseCurrency && baseCurrencyCode === BASE_CURRENCY_CODE;

  const applySnapshot = (snapshot: DocumentCurrencySnapshot, previousCurrencyCode?: string) => {
    setFormValue('currency_code', snapshot.currency_code, { shouldDirty: true, shouldValidate: true });
    setFormValue('currency_name', snapshot.currency_name, { shouldDirty: true });
    setFormValue('currency_symbol', snapshot.currency_symbol, { shouldDirty: true });
    setFormValue('base_currency_code', snapshot.base_currency_code, { shouldDirty: true });
    setFormValue('exchange_rate', snapshot.exchange_rate, { shouldDirty: true, shouldValidate: true });
    setFormValue('exchange_rate_source', snapshot.exchange_rate_source, { shouldDirty: true });
    setFormValue('exchange_rate_basis', snapshot.exchange_rate_basis, { shouldDirty: true });
    setFormValue('exchange_rate_date', snapshot.exchange_rate_date, { shouldDirty: true });
    onSnapshotChange?.(snapshot, previousCurrencyCode);
  };

  const handleCurrencyChange = (nextCurrencyCode: string) => {
    const previousCurrencyCode = currencyCode;
    const nextCurrency = activeCurrencies.find((currency) => currency.code === nextCurrencyCode);
    const latestRate = latestRateByCurrency[nextCurrencyCode];
    const snapshot = buildDocumentCurrencySnapshot(nextCurrency, latestRate, getDocumentDate(documentDate), baseCurrency);
    applySnapshot(snapshot, previousCurrencyCode);
  };

  const handleManualRateChange = (value?: number | null) => {
    const snapshot = buildDocumentCurrencySnapshot(selectedCurrency, undefined, getDocumentDate(documentDate), baseCurrency);
    applySnapshot({
      ...snapshot,
      exchange_rate: selectedIsBaseCurrency ? DEFAULT_EXCHANGE_RATE : normalizeExchangeRate(value),
      exchange_rate_source: selectedIsBaseCurrency ? 'SYSTEM' : 'MANUAL',
      exchange_rate_date: getDocumentDate(documentDate),
    }, currencyCode);
  };

  const handleFetchBi = async () => {
    if (!canFetchBiRate) return;

    setFetching(true);
    try {
      const rate = await fetchAndCacheBiCurrencyRate(currencyCode, getDocumentDate(documentDate));
      const snapshot = buildDocumentCurrencySnapshot(selectedCurrency, rate, rate.rate_date, baseCurrency);
      applySnapshot(snapshot, currencyCode);
      message.success(t('documents.biFetchSuccess'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('documents.biFetchFailed'));
    } finally {
      setFetching(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-x-4 md:grid-cols-[minmax(0,1fr)_180px_120px]">
      <div className={fieldContainerClassName}>
        <label className={labelClassName}>{t('documents.currency')}</label>
        <Controller
          name={'currency_code' as Path<TFieldValues>}
          control={control}
          render={({ field }) => (
            <Select
              showSearch={{ optionFilterProp: 'label' }}
              className="w-full"
              value={field.value ?? baseCurrencyCode}
              options={activeCurrencies.map((currency) => ({
                value: currency.code,
                label: `${currency.code} - ${currency.name}`,
              }))}
              onBlur={field.onBlur}
              onChange={handleCurrencyChange}
            />
          )}
        />
      </div>
      <div className={fieldContainerClassName}>
        <label className={labelClassName}>{t('documents.exchangeRate')}</label>
        <InputNumber
          min={selectedIsBaseCurrency ? 1 : 0.000001}
          disabled={selectedIsBaseCurrency}
          className="w-full"
          value={exchangeRate}
          formatter={(value) => formatCurrency(Number(value || 0))}
          onChange={(value) => handleManualRateChange(Number(value || DEFAULT_EXCHANGE_RATE))}
        />
      </div>
      <div className={fieldContainerClassName}>
        <label className={labelClassName}>{t('documents.rateSource')}</label>
        <Tooltip title={selectedIsBaseCurrency ? t('documents.baseCurrency') : t('documents.fetchBiRate')}>
          <Button
            block
            icon={<RefreshCw size={16} />}
            disabled={!canFetchBiRate}
            loading={fetching}
            onClick={handleFetchBi}
          >
            {t('documents.fetchBi')}
          </Button>
        </Tooltip>
      </div>
      <div className="md:col-span-3 -mt-2 mb-3 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <Tag color={exchangeRateSource === 'BI_KURS_TRANSAKSI' ? 'blue' : 'default'}>
          {exchangeRateSource === 'BI_KURS_TRANSAKSI' ? t('documents.biRate') : t('documents.manualRate')}
        </Tag>
        <span>{t('documents.rateDate')}: {exchangeRateDate || selectedLatestRate?.rate_date || getDocumentDate(documentDate)}</span>
        {!selectedIsBaseCurrency && (
          <span>{currencyCode}/{baseCurrencyCode}: {baseCurrencySymbol} {formatCurrency(exchangeRate)}</span>
        )}
      </div>
    </div>
  );
}
