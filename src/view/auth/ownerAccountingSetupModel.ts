import dayjs from 'dayjs';
import { ACCOUNTING_BUSINESS_TEMPLATE_BY_CODE } from '@/constants/accounting';
import { BASE_CURRENCY_CODE } from '@/constants/currencies';
import type { AccountingBusinessTemplateCode } from '@/types';

export type AccountingValidationField =
  | 'business_template_code'
  | 'cutoff_date'
  | 'fiscal_period_start'
  | 'fiscal_period_end'
  | 'current_period_start'
  | 'current_period_end'
  | 'base_currency_code';

export type AccountingValidationErrors = Partial<Record<AccountingValidationField, string>>;

export interface AccountingDraft {
  businessTemplateCode: AccountingBusinessTemplateCode;
  cutoffDate: string;
  fiscalPeriodStart: string;
  fiscalPeriodEnd: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  baseCurrencyCode: string;
}

export const DATE_FORMAT = 'YYYY-MM-DD';

export const createDefaultAccountingDraft = (): AccountingDraft => {
  const today = dayjs();
  return {
    businessTemplateCode: 'RETAIL',
    cutoffDate: today.format(DATE_FORMAT),
    fiscalPeriodStart: today.startOf('year').format(DATE_FORMAT),
    fiscalPeriodEnd: today.endOf('year').format(DATE_FORMAT),
    currentPeriodStart: today.startOf('month').format(DATE_FORMAT),
    currentPeriodEnd: today.endOf('month').format(DATE_FORMAT),
    baseCurrencyCode: BASE_CURRENCY_CODE,
  };
};

export const normalizeCurrencyCode = (value: string) => value.trim().toUpperCase();

export const getFirstValidationError = (errors: AccountingValidationErrors) => (
  Object.values(errors).find(Boolean)
);

export const validateAccountingDraft = (
  draft: AccountingDraft,
  hasOperationalSignal: boolean,
  lockedBaseCurrencyCode?: string,
): AccountingValidationErrors => {
  const errors: AccountingValidationErrors = {};
  const baseCurrencyCode = normalizeCurrencyCode(draft.baseCurrencyCode);

  const template = ACCOUNTING_BUSINESS_TEMPLATE_BY_CODE[draft.businessTemplateCode];
  if (!template || template.status !== 'ENABLED') {
    errors.business_template_code = 'Pilih jenis usaha yang tersedia.';
  }

  const fiscalStart = dayjs(draft.fiscalPeriodStart);
  const fiscalEnd = dayjs(draft.fiscalPeriodEnd);
  const currentStart = dayjs(draft.currentPeriodStart);
  const currentEnd = dayjs(draft.currentPeriodEnd);
  const cutoff = dayjs(draft.cutoffDate);

  if (!cutoff.isValid()) {
    errors.cutoff_date = 'Tanggal mulai pembukuan wajib diisi.';
  }
  if (!fiscalStart.isValid()) {
    errors.fiscal_period_start = 'Awal tahun buku wajib diisi.';
  }
  if (!fiscalEnd.isValid()) {
    errors.fiscal_period_end = 'Akhir tahun buku wajib diisi.';
  }
  if (!currentStart.isValid()) {
    errors.current_period_start = 'Awal periode aktif wajib diisi.';
  }
  if (!currentEnd.isValid()) {
    errors.current_period_end = 'Akhir periode aktif wajib diisi.';
  }

  if (fiscalStart.isValid() && fiscalEnd.isValid() && fiscalEnd.isBefore(fiscalStart, 'day')) {
    errors.fiscal_period_end = 'Akhir tahun buku tidak boleh sebelum tanggal awal.';
  }

  if (currentStart.isValid() && currentEnd.isValid() && currentEnd.isBefore(currentStart, 'day')) {
    errors.current_period_end = 'Akhir periode aktif tidak boleh sebelum tanggal awal.';
  }

  if (
    fiscalStart.isValid() &&
    fiscalEnd.isValid() &&
    currentStart.isValid() &&
    currentEnd.isValid() &&
    (currentStart.isBefore(fiscalStart, 'day') || currentEnd.isAfter(fiscalEnd, 'day'))
  ) {
    errors.current_period_start = 'Periode aktif harus berada di dalam tahun buku.';
    errors.current_period_end = 'Periode aktif harus berada di dalam tahun buku.';
  }

  if (cutoff.isValid() && currentEnd.isValid() && cutoff.isAfter(currentEnd, 'day')) {
    errors.cutoff_date = 'Mulai pembukuan tidak boleh setelah akhir periode aktif.';
  }

  if (!/^[A-Z]{3}$/.test(baseCurrencyCode)) {
    errors.base_currency_code = 'Pilih mata uang utama yang valid.';
  }

  if (hasOperationalSignal && baseCurrencyCode !== (lockedBaseCurrencyCode ?? BASE_CURRENCY_CODE)) {
    errors.base_currency_code = 'Mata uang utama tidak dapat diubah setelah transaksi atau saldo awal dibuat.';
  }

  return errors;
};
