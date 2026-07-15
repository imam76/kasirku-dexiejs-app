import { Alert, DatePicker, Form, Select, Tag, Typography } from 'antd';
import { Building2, CalendarDays, Check, CircleDollarSign } from 'lucide-react';
import dayjs from 'dayjs';
import { ACCOUNTING_BUSINESS_TEMPLATES } from '@/constants/accounting';
import { BASE_CURRENCY_CODE } from '@/constants/currencies';
import type { AccountingBusinessTemplateCode, AccountingInitialSetupSetting } from '@/types';
import {
  DATE_FORMAT,
  normalizeCurrencyCode,
  type AccountingDraft,
  type AccountingValidationErrors,
} from './ownerAccountingSetupModel';

const { Text } = Typography;

const BASE_CURRENCY_OPTIONS = [
  { value: 'IDR', label: 'IDR - Rupiah Indonesia' },
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'SGD', label: 'SGD - Singapore Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'AUD', label: 'AUD - Australian Dollar' },
  { value: 'JPY', label: 'JPY - Japanese Yen' },
];

const getDatePickerValue = (value: string) => {
  if (!value) return null;

  const parsedValue = dayjs(value);
  return parsedValue.isValid() ? parsedValue : null;
};

const DateField = ({
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
  <Form.Item
    className="!mb-0"
    label={label}
    validateStatus={error ? 'error' : undefined}
    help={error}
  >
    <DatePicker
      allowClear={false}
      className="w-full"
      data-testid={testId}
      format={DATE_FORMAT}
      size="large"
      value={getDatePickerValue(value)}
      onChange={(date) => onChange(date ? date.format(DATE_FORMAT) : '')}
    />
  </Form.Item>
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
      <DateField
        label="Cutoff"
        value={draft.cutoffDate}
        error={errors.cutoff_date}
        testId="owner-accounting-cutoff-date"
        onChange={(cutoffDate) => onChange({ cutoffDate })}
      />
      <div />
      <DateField
        label="Awal Periode Fiskal"
        value={draft.fiscalPeriodStart}
        error={errors.fiscal_period_start}
        testId="owner-accounting-fiscal-period-start"
        onChange={(fiscalPeriodStart) => onChange({ fiscalPeriodStart })}
      />
      <DateField
        label="Akhir Periode Fiskal"
        value={draft.fiscalPeriodEnd}
        error={errors.fiscal_period_end}
        testId="owner-accounting-fiscal-period-end"
        onChange={(fiscalPeriodEnd) => onChange({ fiscalPeriodEnd })}
      />
      <DateField
        label="Awal Periode Berjalan"
        value={draft.currentPeriodStart}
        error={errors.current_period_start}
        testId="owner-accounting-current-period-start"
        onChange={(currentPeriodStart) => onChange({ currentPeriodStart })}
      />
      <DateField
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

    <Form.Item
      className="!mb-0"
      label="Base Currency"
      validateStatus={error ? 'error' : undefined}
      help={error}
    >
      <Select
        data-testid="owner-accounting-base-currency"
        showSearch
        value={baseCurrencyCode}
        className="w-full"
        size="large"
        options={BASE_CURRENCY_OPTIONS.map((option) => ({
          ...option,
          disabled: hasOperationalSignal && option.value !== (lockedBaseCurrencyCode ?? BASE_CURRENCY_CODE),
        }))}
        onChange={(value) => onChange(normalizeCurrencyCode(value))}
      />
    </Form.Item>
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
