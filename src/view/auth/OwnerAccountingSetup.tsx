import { Alert, Input, Select, Tag, Typography } from 'antd';
import { Building2, CalendarDays, Check, CircleDollarSign } from 'lucide-react';
import dayjs from 'dayjs';
import {
  ACCOUNTING_BUSINESS_TEMPLATE_BY_CODE,
  ACCOUNTING_BUSINESS_TEMPLATES,
} from '@/constants/accounting';
import { BASE_CURRENCY_CODE } from '@/constants/currencies';
import type { AccountingBusinessTemplateCode, AccountingInitialSetupSetting } from '@/types';

const { Text } = Typography;

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

const BASE_CURRENCY_OPTIONS = [
  { value: 'IDR', label: 'IDR - Rupiah Indonesia' },
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'SGD', label: 'SGD - Singapore Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'AUD', label: 'AUD - Australian Dollar' },
  { value: 'JPY', label: 'JPY - Japanese Yen' },
];

const DATE_FORMAT = 'YYYY-MM-DD';

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
  requiresAccountingBaseline: boolean,
  hasOperationalSignal: boolean,
  lockedBaseCurrencyCode?: string,
): AccountingValidationErrors => {
  const errors: AccountingValidationErrors = {};
  const baseCurrencyCode = normalizeCurrencyCode(draft.baseCurrencyCode);

  if (requiresAccountingBaseline) {
    const template = ACCOUNTING_BUSINESS_TEMPLATE_BY_CODE[draft.businessTemplateCode];
    if (!template || template.status !== 'ENABLED') {
      errors.business_template_code = 'Pilih jenis bisnis yang sudah aktif untuk wizard v1.';
    }

    const fiscalStart = dayjs(draft.fiscalPeriodStart);
    const fiscalEnd = dayjs(draft.fiscalPeriodEnd);
    const currentStart = dayjs(draft.currentPeriodStart);
    const currentEnd = dayjs(draft.currentPeriodEnd);
    const cutoff = dayjs(draft.cutoffDate);

    if (!cutoff.isValid()) {
      errors.cutoff_date = 'Cutoff wajib diisi dengan tanggal valid.';
    }
    if (!fiscalStart.isValid()) {
      errors.fiscal_period_start = 'Awal periode fiskal wajib diisi.';
    }
    if (!fiscalEnd.isValid()) {
      errors.fiscal_period_end = 'Akhir periode fiskal wajib diisi.';
    }
    if (!currentStart.isValid()) {
      errors.current_period_start = 'Awal periode berjalan wajib diisi.';
    }
    if (!currentEnd.isValid()) {
      errors.current_period_end = 'Akhir periode berjalan wajib diisi.';
    }

    if (fiscalStart.isValid() && fiscalEnd.isValid() && fiscalEnd.isBefore(fiscalStart, 'day')) {
      errors.fiscal_period_end = 'Akhir periode fiskal harus sama atau setelah awal periode fiskal.';
    }

    if (currentStart.isValid() && currentEnd.isValid() && currentEnd.isBefore(currentStart, 'day')) {
      errors.current_period_end = 'Akhir periode berjalan harus sama atau setelah awal periode berjalan.';
    }

    if (
      fiscalStart.isValid() &&
      fiscalEnd.isValid() &&
      currentStart.isValid() &&
      currentEnd.isValid() &&
      (currentStart.isBefore(fiscalStart, 'day') || currentEnd.isAfter(fiscalEnd, 'day'))
    ) {
      errors.current_period_start = 'Periode berjalan harus berada di dalam periode fiskal.';
      errors.current_period_end = 'Periode berjalan harus berada di dalam periode fiskal.';
    }

    if (cutoff.isValid() && currentEnd.isValid() && cutoff.isAfter(currentEnd, 'day')) {
      errors.cutoff_date = 'Cutoff tidak boleh setelah akhir periode berjalan.';
    }
  }

  if (!/^[A-Z]{3}$/.test(baseCurrencyCode)) {
    errors.base_currency_code = 'Kode base currency harus 3 huruf uppercase.';
  }

  if (hasOperationalSignal && baseCurrencyCode !== (lockedBaseCurrencyCode ?? BASE_CURRENCY_CODE)) {
    errors.base_currency_code = 'Base currency sudah terkunci setelah transaksi, dokumen, jurnal, payroll, koperasi, atau opening balance pertama.';
  }

  return errors;
};

const DateInput = ({
  error,
  label,
  onChange,
  testId,
  value,
}: {
  error?: string;
  label: string;
  onChange: (value: string) => void;
  testId: string;
  value: string;
}) => (
  <div>
    <label className="mb-1.5 block text-xs font-semibold uppercase text-gray-500">
      {label}
    </label>
    <Input
      data-testid={testId}
      type="date"
      value={value}
      status={error ? 'error' : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
    {error && <div className="mt-1 text-xs text-red-500">{error}</div>}
  </div>
);

const BusinessTemplatePicker = ({
  selectedCode,
  validationError,
  onSelect,
}: {
  selectedCode: AccountingBusinessTemplateCode;
  validationError?: string;
  onSelect: (code: AccountingBusinessTemplateCode) => void;
}) => (
  <div className="space-y-3">
    <div className="flex items-center gap-2">
      <Building2 size={15} className="text-blue-500" />
      <Text strong>Jenis Bisnis</Text>
    </div>

    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {ACCOUNTING_BUSINESS_TEMPLATES.map((template) => {
        const selected = template.code === selectedCode;
        const enabled = template.status === 'ENABLED';
        return (
          <button
            key={template.code}
            type="button"
            data-testid={`owner-accounting-business-template-${template.code}`}
            disabled={!enabled}
            onClick={() => enabled && onSelect(template.code)}
            className="w-full rounded-lg border bg-white p-3 text-left transition"
            style={{
              borderColor: selected ? '#2563eb' : '#e2e8f0',
              boxShadow: selected ? '0 0 0 2px rgba(37, 99, 235, 0.12)' : 'none',
              cursor: enabled ? 'pointer' : 'not-allowed',
              opacity: enabled ? 1 : 0.58,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Text strong style={{ color: selected ? '#1d4ed8' : '#0f172a' }}>
                    {template.label}
                  </Text>
                  <Tag color={template.status === 'ENABLED' ? 'blue' : 'default'}>
                    {template.standard_label}
                  </Tag>
                </div>
                {template.description && (
                  <div className="mt-1 text-xs leading-relaxed text-slate-500">
                    {template.description}
                  </div>
                )}
                {(template.warning || template.disabled_reason) && (
                  <div className="mt-1 text-xs leading-relaxed text-amber-600">
                    {template.warning ?? template.disabled_reason}
                  </div>
                )}
              </div>
              {selected && <Check size={16} className="mt-1 shrink-0 text-blue-600" />}
            </div>
          </button>
        );
      })}
    </div>

    {validationError && <Text type="danger" className="text-xs">{validationError}</Text>}
  </div>
);

const AccountingPeriodFields = ({
  draft,
  errors,
  onChange,
}: {
  draft: AccountingDraft;
  errors: AccountingValidationErrors;
  onChange: (patch: Partial<AccountingDraft>) => void;
}) => (
  <div className="space-y-3">
    <div className="flex items-center gap-2">
      <CalendarDays size={15} className="text-blue-500" />
      <Text strong>Cutoff & Periode</Text>
    </div>

    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
      <DateInput
        label="Cutoff"
        value={draft.cutoffDate}
        error={errors.cutoff_date}
        testId="owner-accounting-cutoff-date"
        onChange={(cutoffDate) => onChange({ cutoffDate })}
      />
      <div />
      <DateInput
        label="Awal Periode Fiskal"
        value={draft.fiscalPeriodStart}
        error={errors.fiscal_period_start}
        testId="owner-accounting-fiscal-period-start"
        onChange={(fiscalPeriodStart) => onChange({ fiscalPeriodStart })}
      />
      <DateInput
        label="Akhir Periode Fiskal"
        value={draft.fiscalPeriodEnd}
        error={errors.fiscal_period_end}
        testId="owner-accounting-fiscal-period-end"
        onChange={(fiscalPeriodEnd) => onChange({ fiscalPeriodEnd })}
      />
      <DateInput
        label="Awal Periode Berjalan"
        value={draft.currentPeriodStart}
        error={errors.current_period_start}
        testId="owner-accounting-current-period-start"
        onChange={(currentPeriodStart) => onChange({ currentPeriodStart })}
      />
      <DateInput
        label="Akhir Periode Berjalan"
        value={draft.currentPeriodEnd}
        error={errors.current_period_end}
        testId="owner-accounting-current-period-end"
        onChange={(currentPeriodEnd) => onChange({ currentPeriodEnd })}
      />
    </div>
  </div>
);

const BaseCurrencyField = ({
  baseCurrencyCode,
  error,
  hasOperationalSignal,
  lockedBaseCurrencyCode,
  onChange,
}: {
  baseCurrencyCode: string;
  error?: string;
  hasOperationalSignal: boolean;
  lockedBaseCurrencyCode?: string;
  onChange: (value: string) => void;
}) => (
  <div className="space-y-3">
    <div className="flex items-center gap-2">
      <CircleDollarSign size={15} className="text-blue-500" />
      <Text strong>Base Currency</Text>
    </div>

    <Select
      data-testid="owner-accounting-base-currency"
      showSearch
      value={baseCurrencyCode}
      status={error ? 'error' : undefined}
      className="w-full"
      options={BASE_CURRENCY_OPTIONS.map((option) => ({
        ...option,
        disabled: hasOperationalSignal && option.value !== (lockedBaseCurrencyCode ?? BASE_CURRENCY_CODE),
      }))}
      onChange={(value) => onChange(normalizeCurrencyCode(value))}
    />
    {error && <div className="text-xs text-red-500">{error}</div>}
    <div className="text-xs leading-relaxed text-slate-500">
      Default fresh install tetap IDR. Non-IDR hanya aman sebelum transaksi, dokumen,
      jurnal, atau opening balance pertama.
    </div>
  </div>
);

export const OwnerAccountingSetup = ({
  draft,
  errors,
  existingAccountingSetup,
  hasOperationalSignal,
  moduleCount,
  onChange,
  onSelectBusinessTemplate,
  requiresAccountingBaseline,
}: {
  draft: AccountingDraft;
  errors: AccountingValidationErrors;
  existingAccountingSetup?: AccountingInitialSetupSetting | null;
  hasOperationalSignal: boolean;
  moduleCount: number;
  onChange: (patch: Partial<AccountingDraft>) => void;
  onSelectBusinessTemplate: (code: AccountingBusinessTemplateCode) => void;
  requiresAccountingBaseline: boolean;
}) => (
  <div className="mb-6 rounded-lg border border-slate-200 bg-slate-50 p-4">
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <div>
        <h2 className="text-base font-semibold text-gray-900">Setup Akuntansi Awal</h2>
        <Text type="secondary" className="text-xs">
          Baseline ini disimpan bersama registrasi Owner pertama.
        </Text>
      </div>
      <Tag color={requiresAccountingBaseline ? 'processing' : 'default'}>
        {moduleCount} module aktif
      </Tag>
    </div>

    <div className="space-y-5">
      {requiresAccountingBaseline ? (
        <>
          <Alert
            type="info"
            showIcon
            message="Setup akuntansi diperlukan"
            description="Module aktif membutuhkan baseline akun, periode, cutoff, dan base currency sebelum dipakai operasional."
          />
          <BusinessTemplatePicker
            selectedCode={draft.businessTemplateCode}
            validationError={errors.business_template_code}
            onSelect={onSelectBusinessTemplate}
          />
          <AccountingPeriodFields
            draft={draft}
            errors={errors}
            onChange={onChange}
          />
        </>
      ) : (
        <Alert
          type="warning"
          showIcon
          message="Mode ringkas"
          description="Module aktif belum membutuhkan baseline lengkap. Sistem tetap menyimpan base currency dan default minimum saat Owner dibuat."
        />
      )}

      <BaseCurrencyField
        baseCurrencyCode={draft.baseCurrencyCode}
        error={errors.base_currency_code}
        hasOperationalSignal={hasOperationalSignal}
        lockedBaseCurrencyCode={existingAccountingSetup?.base_currency_code}
        onChange={(baseCurrencyCode) => onChange({ baseCurrencyCode })}
      />
    </div>
  </div>
);
