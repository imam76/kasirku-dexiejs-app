import { BASE_CURRENCY_CODE, BASE_CURRENCY_NAME, DEFAULT_EXCHANGE_RATE } from '@/constants/currencies';
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

export const normalizeCurrencyCode = (value?: string | null) => (
  value?.trim().toUpperCase().match(/^[A-Z]{3}$/) ? value.trim().toUpperCase() : BASE_CURRENCY_CODE
);

export const normalizeExchangeRate = (value?: number | null) => {
  const numericValue = Number(value || 0);
  return numericValue > 0 ? numericValue : DEFAULT_EXCHANGE_RATE;
};

export const isBaseCurrency = (currencyCode?: string | null) => (
  normalizeCurrencyCode(currencyCode) === BASE_CURRENCY_CODE
);

export const toBaseAmount = (foreignAmount?: number | null, exchangeRate?: number | null) => (
  roundCurrency(Number(foreignAmount || 0) * normalizeExchangeRate(exchangeRate))
);

export const toForeignAmount = (baseAmount?: number | null, exchangeRate?: number | null) => (
  roundCurrency(Number(baseAmount || 0) / normalizeExchangeRate(exchangeRate))
);

export const toBaseCurrencyAmount = (
  documentCurrencyAmount?: number | null,
  snapshot?: { currency_code?: string | null; exchange_rate?: number | null },
) => (
  isBaseCurrency(snapshot?.currency_code)
    ? roundCurrency(Number(documentCurrencyAmount || 0))
    : toBaseAmount(documentCurrencyAmount, snapshot?.exchange_rate)
);

export const toDocumentCurrencyAmount = (
  baseAmount?: number | null,
  snapshot?: { currency_code?: string | null; exchange_rate?: number | null },
) => (
  isBaseCurrency(snapshot?.currency_code)
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
): DocumentCurrencySnapshot => {
  const currencyCode = normalizeCurrencyCode(currency?.code ?? rate?.currency_code);
  const rateDate = rate?.rate_date ?? fallbackDate;

  if (currencyCode === BASE_CURRENCY_CODE) {
    return {
      currency_code: BASE_CURRENCY_CODE,
      currency_name: currency?.name ?? BASE_CURRENCY_NAME,
      currency_symbol: currency?.symbol ?? 'Rp',
      base_currency_code: BASE_CURRENCY_CODE,
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
    base_currency_code: BASE_CURRENCY_CODE,
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
): DocumentCurrencySnapshot => {
  const currencyCode = normalizeCurrencyCode(input.currency_code ?? currency?.code);

  if (currencyCode === BASE_CURRENCY_CODE) {
    return buildDocumentCurrencySnapshot(currency, undefined, input.exchange_rate_date ?? fallbackDate);
  }

  return {
    currency_code: currencyCode,
    currency_name: currency?.name ?? input.currency_name ?? currencyCode,
    currency_symbol: currency?.symbol ?? input.currency_symbol,
    base_currency_code: BASE_CURRENCY_CODE,
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
  const currencyCode = normalizeCurrencyCode(snapshot.currency_code);
  const foreignPrice = options.preferForeignPrice && item.foreign_price !== undefined
    ? Number(item.foreign_price || 0)
    : toForeignAmount(item.price, exchangeRate);
  const price = options.preferForeignPrice
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
    currency_code: normalizeCurrencyCode(snapshot.currency_code),
    exchange_rate: exchangeRate,
    exchange_rate_source: snapshot.exchange_rate_source,
    exchange_rate_basis: snapshot.exchange_rate_basis,
    exchange_rate_date: snapshot.exchange_rate_date,
    foreign_price: item.foreign_price ?? toForeignAmount(item.price, exchangeRate),
    foreign_discount_amount: toForeignAmount(item.discount_amount, exchangeRate),
    foreign_tax_base_amount: toForeignAmount(item.tax_base_amount, exchangeRate),
    foreign_tax_amount: toForeignAmount(item.tax_amount, exchangeRate),
    foreign_subtotal: toForeignAmount(item.subtotal, exchangeRate),
    foreign_total_amount: toForeignAmount(item.total_amount, exchangeRate),
  };
};

export const getForeignDocumentTotals = (
  total: DocumentCurrencyTotalLike,
  snapshot: DocumentCurrencySnapshot,
) => ({
  foreign_subtotal_amount: toForeignAmount(total.subtotal_amount, snapshot.exchange_rate),
  foreign_discount_amount: toForeignAmount(total.discount_amount, snapshot.exchange_rate),
  foreign_tax_amount: toForeignAmount(total.tax_amount, snapshot.exchange_rate),
  foreign_total_amount: toForeignAmount(total.total_amount, snapshot.exchange_rate),
});
