import {
  DEFAULT_EXCHANGE_RATE,
  getCurrencyPreset,
  normalizeIsoCurrencyCode,
} from '@/constants/currencies';
import {
  getCachedBaseCurrency,
  getCachedBaseCurrencyCode,
  getCurrencySymbol,
} from '@/services/baseCurrencyService';
import type { Currency, CurrencyRate, CurrencyRateBasis, CurrencyRateSource } from '@/types';
import { formatCurrency } from '@/utils/formatters';

export interface DocumentCurrencySnapshot {
  currency_code: string;
  currency_name?: string;
  currency_symbol?: string;
  base_currency_code: string;
  exchange_rate: number;
  exchange_rate_source: CurrencyRateSource;
  exchange_rate_basis: CurrencyRateBasis;
  exchange_rate_date?: string;
}

export interface DocumentCurrencyLineLike {
  currency_code?: string;
  exchange_rate?: number;
  exchange_rate_source?: CurrencyRateSource;
  exchange_rate_basis?: CurrencyRateBasis;
  exchange_rate_date?: string;
  price?: number;
  discount_amount?: number;
  tax_base_amount?: number;
  tax_amount?: number;
  subtotal?: number;
  total_amount?: number;
  foreign_price?: number;
  foreign_discount_amount?: number;
  foreign_tax_base_amount?: number;
  foreign_tax_amount?: number;
  foreign_subtotal?: number;
  foreign_total_amount?: number;
}

export interface DocumentCurrencyTotalLike {
  subtotal_amount?: number;
  discount_amount?: number;
  tax_amount?: number;
  total_amount?: number;
}

export const roundCurrency = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export const normalizeCurrencyCode = (
  value?: string | null,
  fallback = getCachedBaseCurrencyCode(),
) => (
  normalizeIsoCurrencyCode(value, fallback)
);

export const normalizeExchangeRate = (value?: number | null) => {
  const numericValue = Number(value || 0);
  return numericValue > 0 ? numericValue : DEFAULT_EXCHANGE_RATE;
};

export const isBaseCurrency = (
  currencyCode?: string | null,
  baseCurrencyCode?: string | null,
) => {
  const normalizedBaseCode = normalizeCurrencyCode(baseCurrencyCode);
  return normalizeCurrencyCode(currencyCode, normalizedBaseCode) === normalizedBaseCode;
};

const getSnapshotBaseCurrencyCode = (
  snapshot?: { base_currency_code?: string | null },
) => normalizeCurrencyCode(snapshot?.base_currency_code);

export const formatBaseCurrencyAmount = (
  amount?: number | null,
  snapshot?: { base_currency_code?: string | null },
) => {
  const baseCurrencyCode = getSnapshotBaseCurrencyCode(snapshot);
  const cachedBaseCurrency = getCachedBaseCurrency();
  const prefix = cachedBaseCurrency.code === baseCurrencyCode
    ? cachedBaseCurrency.symbol || getCurrencySymbol(baseCurrencyCode)
    : getCurrencySymbol(baseCurrencyCode);

  return `${prefix} ${formatCurrency(Number(amount || 0))}`;
};

const resolveBaseCurrency = (baseCurrency?: Currency) => (
  baseCurrency ?? getCachedBaseCurrency()
);

export const toBaseAmount = (foreignAmount?: number | null, exchangeRate?: number | null) => (
  roundCurrency(Number(foreignAmount || 0) * normalizeExchangeRate(exchangeRate))
);

export const toForeignAmount = (baseAmount?: number | null, exchangeRate?: number | null) => (
  roundCurrency(Number(baseAmount || 0) / normalizeExchangeRate(exchangeRate))
);

export const toBaseCurrencyAmount = (
  documentCurrencyAmount?: number | null,
  snapshot?: { currency_code?: string | null; base_currency_code?: string | null; exchange_rate?: number | null },
) => (
  isBaseCurrency(snapshot?.currency_code, snapshot?.base_currency_code)
    ? roundCurrency(Number(documentCurrencyAmount || 0))
    : toBaseAmount(documentCurrencyAmount, snapshot?.exchange_rate)
);

export const toDocumentCurrencyAmount = (
  baseAmount?: number | null,
  snapshot?: { currency_code?: string | null; base_currency_code?: string | null; exchange_rate?: number | null },
) => (
  isBaseCurrency(snapshot?.currency_code, snapshot?.base_currency_code)
    ? roundCurrency(Number(baseAmount || 0))
    : toForeignAmount(baseAmount, snapshot?.exchange_rate)
);

export const formatDocumentCurrencyAmount = (
  amount?: number | null,
  snapshot?: { currency_code?: string | null; currency_symbol?: string | null },
) => {
  const currencyCode = normalizeCurrencyCode(snapshot?.currency_code);
  const prefix = snapshot?.currency_symbol || currencyCode;

  return `${prefix} ${formatCurrency(Number(amount || 0))}`;
};

export const buildDocumentCurrencySnapshot = (
  currency?: Currency,
  rate?: CurrencyRate,
  fallbackDate?: string,
  baseCurrency?: Currency,
): DocumentCurrencySnapshot => {
  const resolvedBaseCurrency = resolveBaseCurrency(baseCurrency);
  const baseCurrencyCode = normalizeCurrencyCode(resolvedBaseCurrency.code);
  const currencyCode = normalizeCurrencyCode(currency?.code ?? rate?.currency_code, baseCurrencyCode);
  const rateDate = rate?.rate_date ?? fallbackDate;

  if (currencyCode === baseCurrencyCode) {
    const preset = getCurrencyPreset(baseCurrencyCode);
    return {
      currency_code: baseCurrencyCode,
      currency_name: currency?.name ?? resolvedBaseCurrency.name ?? preset.name,
      currency_symbol: currency?.symbol ?? resolvedBaseCurrency.symbol ?? preset.symbol,
      base_currency_code: baseCurrencyCode,
      exchange_rate: DEFAULT_EXCHANGE_RATE,
      exchange_rate_source: 'SYSTEM',
      exchange_rate_basis: 'MID',
      exchange_rate_date: rateDate,
    };
  }

  return {
    currency_code: currencyCode,
    currency_name: currency?.name ?? currencyCode,
    currency_symbol: currency?.symbol,
    base_currency_code: baseCurrencyCode,
    exchange_rate: normalizeExchangeRate(rate?.middle_rate),
    exchange_rate_source: rate?.source ?? 'MANUAL',
    exchange_rate_basis: 'MID',
    exchange_rate_date: rateDate,
  };
};

export const snapshotFromDocumentInput = <T extends Partial<DocumentCurrencySnapshot>>(
  input: T,
  currency?: Currency,
  fallbackDate?: string,
  baseCurrency?: Currency,
): DocumentCurrencySnapshot => {
  const resolvedBaseCurrency = resolveBaseCurrency(baseCurrency);
  const baseCurrencyCode = normalizeCurrencyCode(input.base_currency_code, resolvedBaseCurrency.code);
  const currencyCode = normalizeCurrencyCode(input.currency_code ?? currency?.code, baseCurrencyCode);

  if (currencyCode === baseCurrencyCode) {
    const preset = getCurrencyPreset(baseCurrencyCode);
    const snapshotBaseCurrency: Currency = currency?.code === baseCurrencyCode
      ? currency
      : {
        id: baseCurrencyCode,
        code: baseCurrencyCode,
        name: input.currency_name ?? preset.name,
        symbol: input.currency_symbol ?? preset.symbol,
        decimal_places: preset.decimal_places,
        is_base: true,
        is_active: true,
        created_at: '',
        updated_at: '',
      };
    return buildDocumentCurrencySnapshot(
      snapshotBaseCurrency,
      undefined,
      input.exchange_rate_date ?? fallbackDate,
      snapshotBaseCurrency,
    );
  }

  return {
    currency_code: currencyCode,
    currency_name: currency?.name ?? input.currency_name ?? currencyCode,
    currency_symbol: currency?.symbol ?? input.currency_symbol,
    base_currency_code: baseCurrencyCode,
    exchange_rate: normalizeExchangeRate(input.exchange_rate),
    exchange_rate_source: input.exchange_rate_source ?? 'MANUAL',
    exchange_rate_basis: input.exchange_rate_basis ?? 'MID',
    exchange_rate_date: input.exchange_rate_date ?? fallbackDate,
  };
};

export const applyCurrencySnapshotToLineItem = <TItem extends DocumentCurrencyLineLike>(
  item: TItem,
  snapshot: DocumentCurrencySnapshot,
  options: { preferForeignPrice?: boolean } = {},
): TItem => {
  const exchangeRate = normalizeExchangeRate(snapshot.exchange_rate);
  const currencyCode = normalizeCurrencyCode(snapshot.currency_code, snapshot.base_currency_code);
  const foreignPrice = options.preferForeignPrice && item.foreign_price !== undefined
    ? Number(item.foreign_price || 0)
    : toDocumentCurrencyAmount(item.price, snapshot);
  const price = options.preferForeignPrice && !isBaseCurrency(currencyCode, snapshot.base_currency_code)
    ? toBaseAmount(foreignPrice, exchangeRate)
    : item.price;

  return {
    ...item,
    currency_code: currencyCode,
    exchange_rate: exchangeRate,
    exchange_rate_source: snapshot.exchange_rate_source,
    exchange_rate_basis: snapshot.exchange_rate_basis,
    exchange_rate_date: snapshot.exchange_rate_date,
    price,
    foreign_price: roundCurrency(foreignPrice),
  };
};

export const applyForeignAmountsToLineItem = <TItem extends DocumentCurrencyLineLike>(
  item: TItem,
  snapshot: DocumentCurrencySnapshot,
): TItem => {
  const exchangeRate = normalizeExchangeRate(snapshot.exchange_rate);

  return {
    ...item,
    currency_code: normalizeCurrencyCode(snapshot.currency_code, snapshot.base_currency_code),
    exchange_rate: exchangeRate,
    exchange_rate_source: snapshot.exchange_rate_source,
    exchange_rate_basis: snapshot.exchange_rate_basis,
    exchange_rate_date: snapshot.exchange_rate_date,
    foreign_price: item.foreign_price ?? toDocumentCurrencyAmount(item.price, snapshot),
    foreign_discount_amount: toDocumentCurrencyAmount(item.discount_amount, snapshot),
    foreign_tax_base_amount: toDocumentCurrencyAmount(item.tax_base_amount, snapshot),
    foreign_tax_amount: toDocumentCurrencyAmount(item.tax_amount, snapshot),
    foreign_subtotal: toDocumentCurrencyAmount(item.subtotal, snapshot),
    foreign_total_amount: toDocumentCurrencyAmount(item.total_amount, snapshot),
  };
};

export const getForeignDocumentTotals = (
  total: DocumentCurrencyTotalLike,
  snapshot: DocumentCurrencySnapshot,
) => ({
  foreign_subtotal_amount: toDocumentCurrencyAmount(total.subtotal_amount, snapshot),
  foreign_discount_amount: toDocumentCurrencyAmount(total.discount_amount, snapshot),
  foreign_tax_amount: toDocumentCurrencyAmount(total.tax_amount, snapshot),
  foreign_total_amount: toDocumentCurrencyAmount(total.total_amount, snapshot),
});
