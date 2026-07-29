import { Alert, DatePicker, Form, Select, Typography } from 'antd';
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

const BUSINESS_TEMPLATE_COPY: Partial<Record<AccountingBusinessTemplateCode, {
  description: string;
  label: string;
}>> = {
  RETAIL: {
    label: 'Ritel',
    description: 'Untuk toko, kasir, stok, utang, dan piutang.',
  },
  COOPERATIVE: {
    label: 'Koperasi',
    description: 'Untuk simpan pinjam dan kegiatan operasional koperasi.',
  },
  GENERAL_TRADING: {
    label: 'Perdagangan Umum',
    description: 'Untuk usaha jual-beli barang secara umum.',
  },
  GENERAL_SERVICE: {
    label: 'Jasa Umum',
    description: 'Untuk usaha yang menjual layanan tanpa pengelolaan stok utama.',
  },
};

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
  disabled,
  error,
  label,
  onChange,
  testId,
  value,
}: {
  disabled?: boolean;
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
      disabled={disabled}
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
  disabled,
  onSelect,
}: {
  selectedCode: AccountingBusinessTemplateCode;
  validationError?: string;
  disabled?: boolean;
  onSelect: (code: AccountingBusinessTemplateCode) => void;
}) => (
  <div className="space-y-5">
    <div>
      <div className="flex items-center gap-2">
        <Building2 size={15} className="text-blue-500" />
        <Text strong>Jenis Usaha</Text>
      </div>
      <Text type="secondary" className="mt-1.5 block text-xs leading-relaxed">
        Pilih yang paling sesuai. Sistem akan menyiapkan akun secara otomatis.
      </Text>
    </div>

    <div
      role="radiogroup"
      aria-label="Jenis Usaha"
      className="grid grid-cols-1 gap-3 sm:grid-cols-2"
    >
      {ACCOUNTING_BUSINESS_TEMPLATES.filter((template) => template.status === 'ENABLED').map((template) => {
        const selected = template.code === selectedCode;
        const copy = BUSINESS_TEMPLATE_COPY[template.code];
        return (
          <button
            key={template.code}
            type="button"
            role="radio"
            aria-checked={selected}
            data-testid={`owner-accounting-business-template-${template.code}`}
            disabled={disabled}
            onClick={() => onSelect(template.code)}
            className="h-full w-full rounded-lg border bg-white p-4 text-left transition"
            style={{
              borderColor: selected ? '#2563eb' : '#e2e8f0',
              boxShadow: selected ? '0 0 0 2px rgba(37, 99, 235, 0.12)' : 'none',
              cursor: disabled ? 'not-allowed' : 'pointer',
              opacity: disabled ? 0.58 : 1,
            }}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Text strong style={{ color: selected ? '#1d4ed8' : '#0f172a' }}>
                    {copy?.label ?? template.label}
                  </Text>
                </div>
                {(copy?.description ?? template.description) && (
                  <div className="mt-1 text-xs leading-relaxed text-slate-500">
                    {copy?.description ?? template.description}
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
  disabled,
  onChange,
}: {
  draft: AccountingDraft;
  errors: AccountingValidationErrors;
  disabled?: boolean;
  onChange: (patch: Partial<AccountingDraft>) => void;
}) => (
  <div className="space-y-5">
    <div>
      <div className="flex items-center gap-2">
        <CalendarDays size={15} className="text-blue-500" />
        <Text strong>Periode Pencatatan</Text>
      </div>
      <Text type="secondary" className="mt-1.5 block text-xs leading-relaxed">
        Tentukan rentang tanggal yang akan dipakai untuk laporan pertama.
      </Text>
    </div>

    <div className="grid grid-cols-1 gap-x-5 gap-y-5 sm:grid-cols-2">
      <DateField
        label="Mulai Pembukuan"
        value={draft.cutoffDate}
        error={errors.cutoff_date}
        testId="owner-accounting-cutoff-date"
        disabled={disabled}
        onChange={(cutoffDate) => onChange({ cutoffDate })}
      />
      <DateField
        label="Awal Tahun Buku"
        value={draft.fiscalPeriodStart}
        error={errors.fiscal_period_start}
        testId="owner-accounting-fiscal-period-start"
        disabled={disabled}
        onChange={(fiscalPeriodStart) => onChange({ fiscalPeriodStart })}
      />
      <DateField
        label="Akhir Tahun Buku"
        value={draft.fiscalPeriodEnd}
        error={errors.fiscal_period_end}
        testId="owner-accounting-fiscal-period-end"
        disabled={disabled}
        onChange={(fiscalPeriodEnd) => onChange({ fiscalPeriodEnd })}
      />
      <DateField
        label="Awal Periode Aktif"
        value={draft.currentPeriodStart}
        error={errors.current_period_start}
        testId="owner-accounting-current-period-start"
        disabled={disabled}
        onChange={(currentPeriodStart) => onChange({ currentPeriodStart })}
      />
      <DateField
        label="Akhir Periode Aktif"
        value={draft.currentPeriodEnd}
        error={errors.current_period_end}
        testId="owner-accounting-current-period-end"
        disabled={disabled}
        onChange={(currentPeriodEnd) => onChange({ currentPeriodEnd })}
      />
    </div>
  </div>
);

const BaseCurrencyField = ({
  baseCurrencyCode,
  error,
  disabled,
  hasOperationalSignal,
  lockedBaseCurrencyCode,
  onChange,
}: {
  baseCurrencyCode: string;
  error?: string;
  disabled?: boolean;
  hasOperationalSignal: boolean;
  lockedBaseCurrencyCode?: string;
  onChange: (value: string) => void;
}) => (
  <div className="space-y-5">
    <div>
      <div className="flex items-center gap-2">
        <CircleDollarSign size={15} className="text-blue-500" />
        <Text strong>Mata Uang Utama</Text>
      </div>
      <Text type="secondary" className="mt-1.5 block text-xs leading-relaxed">
        Tidak dapat diubah setelah transaksi pertama dibuat.
      </Text>
    </div>

    <div className="grid grid-cols-1 gap-x-5 sm:grid-cols-2">
      <Form.Item
        className="!mb-0"
        label="Mata Uang"
        validateStatus={error ? 'error' : undefined}
        help={error}
      >
        <Select
          data-testid="owner-accounting-base-currency"
          disabled={disabled}
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
    </div>
  </div>
);

export const OwnerAccountingSetup = ({
  disabled,
  draft,
  errors,
  existingAccountingSetup,
  hasOperationalSignal,
  onChange,
  onSelectBusinessTemplate,
  requiresAccountingBaseline,
}: {
  disabled?: boolean;
  draft: AccountingDraft;
  errors: AccountingValidationErrors;
  existingAccountingSetup?: AccountingInitialSetupSetting | null;
  hasOperationalSignal: boolean;
  onChange: (patch: Partial<AccountingDraft>) => void;
  onSelectBusinessTemplate: (code: AccountingBusinessTemplateCode) => void;
  requiresAccountingBaseline: boolean;
}) => (
  <div className="divide-y divide-gray-100 [&>*+*]:mt-8 [&>*+*]:pt-8">
    {requiresAccountingBaseline ? (
      <>
        <BusinessTemplatePicker
          selectedCode={draft.businessTemplateCode}
          validationError={errors.business_template_code}
          disabled={disabled}
          onSelect={onSelectBusinessTemplate}
        />
        <AccountingPeriodFields
          draft={draft}
          errors={errors}
          disabled={disabled}
          onChange={onChange}
        />
      </>
    ) : (
      <Alert
        type="warning"
        showIcon
        title="Pengaturan sederhana"
        description="Modul yang dipilih belum memerlukan pengaturan lengkap. Sistem akan memakai pilihan awal yang aman."
      />
    )}
    <BaseCurrencyField
      baseCurrencyCode={draft.baseCurrencyCode}
      error={errors.base_currency_code}
      disabled={disabled}
      hasOperationalSignal={hasOperationalSignal}
      lockedBaseCurrencyCode={existingAccountingSetup?.base_currency_code}
      onChange={(baseCurrencyCode) => onChange({ baseCurrencyCode })}
    />
  </div>
);
