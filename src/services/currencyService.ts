import dayjs from '@/lib/dayjs';
import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import { BASE_CURRENCY_CODE, buildBaseCurrency, buildBaseCurrencyRate } from '@/constants/currencies';
import { db } from '@/lib/db';
import { currencyRateSchema, currencySchema } from '@/lib/validations/currency';
import { biKursAdapter, isTauriRuntime, type BiKursTransaksiRateDto } from '@/services/postgresAdapter';
import { enqueueCurrencyRateSync, enqueueCurrencySync } from '@/services/syncQueueService';
import type { Currency, CurrencyRate, CurrencyRateSource, Permission } from '@/types';

export interface CurrencyUpsertInput {
  code: string;
  name: string;
  symbol?: string;
  decimal_places?: number;
  is_active?: boolean;
}

export interface CurrencyRateUpsertInput {
  currency_code: string;
  base_currency_code?: string;
  rate_date: string;
  unit_amount: number;
  bi_buy_rate?: number;
  bi_sell_rate?: number;
  middle_rate: number;
  source?: CurrencyRateSource;
  fetched_at?: string;
}

const BI_LOOKBACK_DAYS = 14;

const normalizeCurrencyInput = (input: CurrencyUpsertInput) => ({
  ...currencySchema.parse(input),
});

const normalizeRateInput = (input: CurrencyRateUpsertInput) => ({
  ...currencyRateSchema.parse({
    ...input,
    base_currency_code: input.base_currency_code ?? BASE_CURRENCY_CODE,
  }),
  source: (input.source ?? 'MANUAL') as CurrencyRateSource,
  fetched_at: input.fetched_at,
});

const withPendingCurrencySync = (currency: Currency): Currency => ({
  ...currency,
  sync_status: currency.is_base ? 'synced' : 'pending',
  sync_error: undefined,
});

const withPendingCurrencyRateSync = (rate: CurrencyRate): CurrencyRate => ({
  ...rate,
  sync_status: rate.source === 'SYSTEM' ? 'synced' : 'pending',
  sync_error: undefined,
});

const createCurrencyRateId = (currencyCode: string, rateDate: string, source: CurrencyRateSource) => (
  `${currencyCode}-${rateDate}-${source}`
);

export const ensureBaseCurrency = async () => {
  const now = new Date().toISOString();
  const baseCurrency = await db.currencies.get(BASE_CURRENCY_CODE);
  if (!baseCurrency) {
    await db.currencies.put(buildBaseCurrency(now));
  }

  const baseRateCount = await db.currencyRates
    .where('currency_code')
    .equals(BASE_CURRENCY_CODE)
    .count();

  if (baseRateCount === 0) {
    await db.currencyRates.put(buildBaseCurrencyRate(now));
  }
};

export const createCurrency = async (input: CurrencyUpsertInput): Promise<Currency> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'SETTINGS_ACCESS');

  const parsed = normalizeCurrencyInput(input);
  const existing = await db.currencies.get(parsed.code);
  if (existing) {
    throw new Error('Kode mata uang sudah dipakai.');
  }

  const now = new Date().toISOString();
  const currency = withPendingCurrencySync({
    id: parsed.code,
    code: parsed.code,
    name: parsed.name,
    symbol: parsed.symbol,
    decimal_places: parsed.decimal_places,
    is_base: parsed.code === BASE_CURRENCY_CODE,
    is_active: parsed.code === BASE_CURRENCY_CODE ? true : parsed.is_active ?? true,
    created_at: now,
    updated_at: now,
  });

  await db.currencies.add(currency);
  await writeActivityLog({
    user: currentUser,
    action: 'CURRENCY_CREATED',
    entity: 'currencies',
    entity_id: currency.id,
    description: `${currentUser?.name ?? 'User'} membuat mata uang ${currency.code}.`,
  });
  await enqueueCurrencySync(currency, 'create');

  return currency;
};

export const updateCurrency = async (id: string, input: CurrencyUpsertInput): Promise<Currency> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'SETTINGS_ACCESS');

  const existing = await db.currencies.get(id);
  if (!existing) {
    throw new Error('Mata uang tidak ditemukan.');
  }

  const parsed = normalizeCurrencyInput({ ...input, code: existing.code });
  const updatedCurrency = withPendingCurrencySync({
    ...existing,
    name: parsed.name,
    symbol: parsed.symbol,
    decimal_places: parsed.decimal_places,
    is_active: existing.is_base ? true : parsed.is_active ?? true,
    updated_at: new Date().toISOString(),
  });

  await db.currencies.put(updatedCurrency);
  await writeActivityLog({
    user: currentUser,
    action: 'CURRENCY_UPDATED',
    entity: 'currencies',
    entity_id: updatedCurrency.id,
    description: `${currentUser?.name ?? 'User'} memperbarui mata uang ${updatedCurrency.code}.`,
  });
  await enqueueCurrencySync(updatedCurrency, 'update');

  return updatedCurrency;
};

export const archiveCurrency = async (id: string): Promise<Currency> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'SETTINGS_ACCESS');

  const currency = await db.currencies.get(id);
  if (!currency) {
    throw new Error('Mata uang tidak ditemukan.');
  }
  if (currency.is_base || currency.code === BASE_CURRENCY_CODE) {
    throw new Error('Mata uang dasar IDR tidak bisa diarsipkan.');
  }

  const archivedCurrency = withPendingCurrencySync({
    ...currency,
    is_active: false,
    updated_at: new Date().toISOString(),
  });

  await db.currencies.put(archivedCurrency);
  await writeActivityLog({
    user: currentUser,
    action: 'CURRENCY_ARCHIVED',
    entity: 'currencies',
    entity_id: archivedCurrency.id,
    description: `${currentUser?.name ?? 'User'} mengarsipkan mata uang ${archivedCurrency.code}.`,
  });
  await enqueueCurrencySync(archivedCurrency, 'delete');

  return archivedCurrency;
};

export const restoreCurrency = async (id: string): Promise<Currency> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'SETTINGS_ACCESS');

  const currency = await db.currencies.get(id);
  if (!currency) {
    throw new Error('Mata uang tidak ditemukan.');
  }

  const restoredCurrency = withPendingCurrencySync({
    ...currency,
    is_active: true,
    updated_at: new Date().toISOString(),
  });

  await db.currencies.put(restoredCurrency);
  await writeActivityLog({
    user: currentUser,
    action: 'CURRENCY_RESTORED',
    entity: 'currencies',
    entity_id: restoredCurrency.id,
    description: `${currentUser?.name ?? 'User'} memulihkan mata uang ${restoredCurrency.code}.`,
  });
  await enqueueCurrencySync(restoredCurrency, 'update');

  return restoredCurrency;
};

export const upsertCurrencyRate = async (
  input: CurrencyRateUpsertInput,
  permission: Permission = 'SETTINGS_ACCESS',
): Promise<CurrencyRate> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, permission);

  const parsed = normalizeRateInput(input);
  const currency = await db.currencies.get(parsed.currency_code);
  if (!currency) {
    throw new Error('Mata uang tidak ditemukan.');
  }

  const now = new Date().toISOString();
  const id = createCurrencyRateId(parsed.currency_code, parsed.rate_date, parsed.source);
  const existing = await db.currencyRates.get(id);
  const rate = withPendingCurrencyRateSync({
    id,
    currency_code: parsed.currency_code,
    base_currency_code: parsed.base_currency_code,
    rate_date: parsed.rate_date,
    source: parsed.source,
    unit_amount: parsed.unit_amount,
    bi_buy_rate: parsed.bi_buy_rate,
    bi_sell_rate: parsed.bi_sell_rate,
    middle_rate: parsed.middle_rate,
    fetched_at: parsed.fetched_at ?? now,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  });

  await db.currencyRates.put(rate);
  await writeActivityLog({
    user: currentUser,
    action: existing ? 'CURRENCY_RATE_UPDATED' : 'CURRENCY_RATE_CREATED',
    entity: 'currencyRates',
    entity_id: rate.id,
    description: `${currentUser?.name ?? 'User'} menyimpan kurs ${rate.currency_code} tanggal ${rate.rate_date}.`,
  });
  await enqueueCurrencyRateSync(rate, existing ? 'update' : 'create');

  return rate;
};

const mapBiRateToCurrencyRateInput = (rate: BiKursTransaksiRateDto): CurrencyRateUpsertInput => ({
  currency_code: rate.currency_code,
  base_currency_code: BASE_CURRENCY_CODE,
  rate_date: rate.rate_date,
  source: 'BI_KURS_TRANSAKSI',
  unit_amount: rate.unit_amount,
  bi_buy_rate: rate.bi_buy_rate,
  bi_sell_rate: rate.bi_sell_rate,
  middle_rate: rate.middle_rate,
  fetched_at: new Date().toISOString(),
});

export const fetchAndCacheBiCurrencyRate = async (
  currencyCode: string,
  targetDate: string,
): Promise<CurrencyRate> => {
  const normalizedCode = currencyCode.trim().toUpperCase();
  const normalizedDate = dayjs(targetDate).format('YYYY-MM-DD');

  if (normalizedCode === BASE_CURRENCY_CODE) {
    await ensureBaseCurrency();
    const baseRate = (await db.currencyRates
      .where('currency_code')
      .equals(BASE_CURRENCY_CODE)
      .first()) ?? buildBaseCurrencyRate(new Date().toISOString());
    return baseRate;
  }

  if (!isTauriRuntime()) {
    throw new Error('Fetch Kurs BI hanya tersedia di runtime Tauri. Gunakan input manual untuk browser.');
  }

  const startDate = dayjs(normalizedDate).subtract(BI_LOOKBACK_DAYS, 'day').format('YYYY-MM-DD');
  const rates = await biKursAdapter.fetchKursTransaksi({
    currencyCode: normalizedCode,
    startDate,
    endDate: normalizedDate,
  });

  const selectedRate = rates
    .filter((rate) => rate.currency_code === normalizedCode && rate.rate_date <= normalizedDate)
    .sort((left, right) => right.rate_date.localeCompare(left.rate_date))[0];

  if (!selectedRate) {
    throw new Error('Kurs BI tidak ditemukan untuk tanggal tersebut atau rentang fallback.');
  }

  return upsertCurrencyRate(mapBiRateToCurrencyRateInput(selectedRate), 'FINANCE_ACCESS');
};

export const getLatestCurrencyRate = async (
  currencyCode: string,
  targetDate: string,
) => {
  const normalizedCode = currencyCode.trim().toUpperCase();
  const normalizedDate = dayjs(targetDate).format('YYYY-MM-DD');

  if (normalizedCode === BASE_CURRENCY_CODE) {
    await ensureBaseCurrency();
  }

  const rates = await db.currencyRates
    .where('currency_code')
    .equals(normalizedCode)
    .toArray();

  return rates
    .filter((rate) => rate.rate_date <= normalizedDate)
    .sort((left, right) => right.rate_date.localeCompare(left.rate_date) || right.updated_at.localeCompare(left.updated_at))[0];
};
