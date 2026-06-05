import type { Currency, CurrencyRate } from '@/types';

export const BASE_CURRENCY_CODE = 'IDR';
export const BASE_CURRENCY_NAME = 'Rupiah Indonesia';
export const DEFAULT_EXCHANGE_RATE = 1;

export const buildBaseCurrency = (now: string): Currency => ({
  id: BASE_CURRENCY_CODE,
  code: BASE_CURRENCY_CODE,
  name: BASE_CURRENCY_NAME,
  symbol: 'Rp',
  decimal_places: 2,
  is_base: true,
  is_active: true,
  created_at: now,
  updated_at: now,
  sync_status: 'synced',
});

export const buildBaseCurrencyRate = (now: string): CurrencyRate => ({
  id: `${BASE_CURRENCY_CODE}-${now.slice(0, 10)}-SYSTEM`,
  currency_code: BASE_CURRENCY_CODE,
  base_currency_code: BASE_CURRENCY_CODE,
  rate_date: now.slice(0, 10),
  source: 'SYSTEM',
  unit_amount: 1,
  bi_buy_rate: 1,
  bi_sell_rate: 1,
  middle_rate: DEFAULT_EXCHANGE_RATE,
  fetched_at: now,
  created_at: now,
  updated_at: now,
  sync_status: 'synced',
});
