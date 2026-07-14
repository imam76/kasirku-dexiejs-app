import type { Currency, CurrencyRate } from '@/types';

export const BASE_CURRENCY_CODE = 'IDR';
export const BASE_CURRENCY_NAME = 'Rupiah Indonesia';
export const DEFAULT_EXCHANGE_RATE = 1;

export interface CurrencyPreset {
  name: string;
  symbol: string;
  decimal_places: number;
}

export const CURRENCY_PRESETS: Record<string, CurrencyPreset> = {
  IDR: { name: BASE_CURRENCY_NAME, symbol: 'Rp', decimal_places: 2 },
  USD: { name: 'US Dollar', symbol: '$', decimal_places: 2 },
  SGD: { name: 'Singapore Dollar', symbol: 'S$', decimal_places: 2 },
  EUR: { name: 'Euro', symbol: '€', decimal_places: 2 },
  AUD: { name: 'Australian Dollar', symbol: 'A$', decimal_places: 2 },
  JPY: { name: 'Japanese Yen', symbol: '¥', decimal_places: 0 },
};

export const normalizeIsoCurrencyCode = (
  value?: string | null,
  fallback = BASE_CURRENCY_CODE,
) => (
  value?.trim().toUpperCase().match(/^[A-Z]{3}$/)
    ? value.trim().toUpperCase()
    : fallback
);

export const getCurrencyPreset = (currencyCode?: string | null): CurrencyPreset => {
  const normalizedCode = normalizeIsoCurrencyCode(currencyCode);

  return CURRENCY_PRESETS[normalizedCode] ?? {
    name: normalizedCode,
    symbol: normalizedCode,
    decimal_places: 2,
  };
};

export const buildCurrencyForCode = (
  currencyCode: string,
  now: string,
  options: Partial<Pick<Currency, 'is_base' | 'is_active' | 'sync_status'>> = {},
): Currency => {
  const code = normalizeIsoCurrencyCode(currencyCode);
  const preset = getCurrencyPreset(code);

  return {
    id: code,
    code,
    name: preset.name,
    symbol: preset.symbol,
    decimal_places: preset.decimal_places,
    is_base: options.is_base ?? false,
    is_active: options.is_active ?? true,
    created_at: now,
    updated_at: now,
    sync_status: options.sync_status ?? 'synced',
  };
};

export const buildBaseCurrencyForCode = (
  currencyCode: string,
  now: string,
  options: Partial<Pick<Currency, 'sync_status'>> = {},
): Currency => buildCurrencyForCode(currencyCode, now, {
  is_base: true,
  is_active: true,
  sync_status: options.sync_status,
});

export const buildBaseCurrency = (now: string): Currency => ({
  ...buildBaseCurrencyForCode(BASE_CURRENCY_CODE, now),
  decimal_places: 2,
  sync_status: 'synced',
});

export const buildBaseCurrencyRateForCode = (
  currencyCode: string,
  now: string,
  options: Partial<Pick<CurrencyRate, 'sync_status'>> = {},
): CurrencyRate => {
  const code = normalizeIsoCurrencyCode(currencyCode);

  return {
    id: `${code}-${now.slice(0, 10)}-SYSTEM`,
    currency_code: code,
    base_currency_code: code,
    rate_date: now.slice(0, 10),
    source: 'SYSTEM',
    unit_amount: 1,
    bi_buy_rate: 1,
    bi_sell_rate: 1,
    middle_rate: DEFAULT_EXCHANGE_RATE,
    fetched_at: now,
    created_at: now,
    updated_at: now,
    sync_status: options.sync_status ?? 'synced',
  };
};

export const buildBaseCurrencyRate = (now: string): CurrencyRate => ({
  ...buildBaseCurrencyRateForCode(BASE_CURRENCY_CODE, now),
  rate_date: now.slice(0, 10),
  sync_status: 'synced',
});
