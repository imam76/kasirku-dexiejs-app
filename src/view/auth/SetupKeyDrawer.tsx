import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  App,
  Badge,
  Button,
  Checkbox,
  Collapse,
  Divider,
  Drawer,
  Input,
  Select,
  Space,
  Steps,
  Tag,
  Tooltip,
  Typography,
} from 'antd';
import dayjs from 'dayjs';
import {
  Banknote,
  BarChart3,
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Database,
  FileText,
  KeyRound,
  Landmark,
  ListChecks,
  Lock,
  ServerCog,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  Unlock,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  ACCOUNTING_BUSINESS_TEMPLATE_BY_CODE,
  ACCOUNTING_BUSINESS_TEMPLATES,
  type AccountingBusinessTemplateDefinition,
} from '@/constants/accounting';
import { BASE_CURRENCY_CODE } from '@/constants/currencies';
import { DEFAULT_SELECTED_MODULES, SETUP_MODULE_GROUPS } from '@/constants/setupModules';
import { db } from '@/lib/db';
import {
  getLicenseFingerprint,
  getSetupConfig,
  verifyLicenseKey,
} from '@/services/setupKeyService';
import {
  getSuggestedAccountingBusinessTemplate,
  requiresAccountingBaselineForModules,
  saveInitialAccountingSetup,
} from '@/services/accountingInitialSetupService';
import { getBaseCurrencyLockSignals } from '@/services/baseCurrencyService';
import type { AccountingBusinessTemplateCode, AccountingInitialSetupSetting } from '@/types';

const { Text, Title, Paragraph } = Typography;

type WizardStep = 0 | 1 | 2 | 3;

type AccountingValidationField =
  | 'business_template_code'
  | 'cutoff_date'
  | 'fiscal_period_start'
  | 'fiscal_period_end'
  | 'current_period_start'
  | 'current_period_end'
  | 'base_currency_code';

type AccountingValidationErrors = Partial<Record<AccountingValidationField, string>>;

interface AccountingDraft {
  businessTemplateCode: AccountingBusinessTemplateCode;
  cutoffDate: string;
  fiscalPeriodStart: string;
  fiscalPeriodEnd: string;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  baseCurrencyCode: string;
}

interface SetupKeyDrawerProps {
  open: boolean;
  onClose: () => void;
  forceMode?: boolean;
}

const GROUP_ICONS: Record<string, LucideIcon> = {
  Database,
  ShoppingCart,
  FileText,
  ShoppingBag,
  Banknote,
  BarChart3,
  Landmark,
};

const BASE_CURRENCY_OPTIONS = [
  { value: 'IDR', label: 'IDR - Rupiah Indonesia' },
  { value: 'USD', label: 'USD - US Dollar' },
  { value: 'SGD', label: 'SGD - Singapore Dollar' },
  { value: 'EUR', label: 'EUR - Euro' },
  { value: 'AUD', label: 'AUD - Australian Dollar' },
  { value: 'JPY', label: 'JPY - Japanese Yen' },
];

const DATE_FORMAT = 'YYYY-MM-DD';
const WIZARD_BODY_HEIGHT = 'calc(100vh - 182px)';

const createDefaultAccountingDraft = (): AccountingDraft => {
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

const formatDateLabel = (value: string) => {
  const date = dayjs(value);
  return date.isValid() ? date.format('DD MMM YYYY') : '-';
};

const normalizeCurrencyCode = (value: string) => value.trim().toUpperCase();

const getFirstValidationError = (errors: AccountingValidationErrors) => (
  Object.values(errors).find(Boolean)
);

const validateAccountingDraft = (
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

const SetupModuleStep = ({
  allModuleCodes,
  existingConfig,
  selectedModules,
  onDeselectAll,
  onGroupToggle,
  onModuleToggle,
  onSelectAll,
}: {
  allModuleCodes: string[];
  existingConfig: ReturnType<typeof getSetupConfig>;
  selectedModules: string[];
  onDeselectAll: () => void;
  onGroupToggle: (groupKey: string, checked: boolean) => void;
  onModuleToggle: (code: string, checked: boolean) => void;
  onSelectAll: () => void;
}) => {
  const groupCounts = useMemo(() => {
    const counts: Record<string, { total: number; selected: number }> = {};
    SETUP_MODULE_GROUPS.forEach((group) => {
      const total = group.modules.length;
      const selected = group.modules.filter((module) => selectedModules.includes(module.code)).length;
      counts[group.key] = { total, selected };
    });
    return counts;
  }, [selectedModules]);

  const collapseItems = useMemo(() => (
    SETUP_MODULE_GROUPS.map((group) => {
      const IconComponent = GROUP_ICONS[group.iconName] ?? Database;
      const counts = groupCounts[group.key];
      const allSelected = counts.selected === counts.total;
      const someSelected = counts.selected > 0 && !allSelected;

      return {
        key: group.key,
        label: (
          <div className="flex w-full items-center justify-between pr-2">
            <div className="flex items-center gap-2.5">
              <div
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                style={{
                  background: allSelected
                    ? 'linear-gradient(135deg, #10b981, #059669)'
                    : someSelected
                      ? 'linear-gradient(135deg, #3b82f6, #2563eb)'
                      : '#e2e8f0',
                }}
              >
                <IconComponent size={14} style={{ color: allSelected || someSelected ? '#fff' : '#64748b' }} />
              </div>
              <span style={{ fontWeight: 600, fontSize: 14, color: '#1e293b' }}>{group.label}</span>
            </div>
            <div className="flex items-center gap-2.5" onClick={(event) => event.stopPropagation()}>
              <Badge
                count={`${counts.selected}/${counts.total}`}
                style={{
                  backgroundColor: allSelected
                    ? '#10b981'
                    : someSelected
                      ? '#3b82f6'
                      : '#cbd5e1',
                  boxShadow: 'none',
                  fontSize: 11,
                  fontWeight: 700,
                }}
              />
              <Checkbox
                checked={allSelected}
                indeterminate={someSelected}
                onChange={(event) => onGroupToggle(group.key, event.target.checked)}
              />
            </div>
          </div>
        ),
        children: (
          <div className="grid grid-cols-1 gap-0.5">
            {group.modules.map((module) => {
              const isChecked = selectedModules.includes(module.code);
              return (
                <label
                  key={module.code}
                  className="flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 transition-all duration-150"
                  style={{
                    backgroundColor: isChecked ? '#f0fdf4' : 'transparent',
                    borderLeft: isChecked ? '3px solid #10b981' : '3px solid transparent',
                  }}
                  onMouseEnter={(event) => {
                    event.currentTarget.style.backgroundColor = isChecked ? '#dcfce7' : '#f1f5f9';
                  }}
                  onMouseLeave={(event) => {
                    event.currentTarget.style.backgroundColor = isChecked ? '#f0fdf4' : 'transparent';
                  }}
                >
                  <Checkbox
                    checked={isChecked}
                    onChange={(event) => onModuleToggle(module.code, event.target.checked)}
                  />
                  <div className="min-w-0 flex-1">
                    <div
                      style={{
                        color: isChecked ? '#166534' : '#334155',
                        fontSize: 13,
                        fontWeight: isChecked ? 600 : 500,
                        lineHeight: 1.4,
                      }}
                    >
                      {module.label}
                    </div>
                    {module.description && (
                      <div
                        style={{
                          color: isChecked ? '#16a34a' : '#94a3b8',
                          fontSize: 11,
                          lineHeight: 1.3,
                          marginTop: 1,
                        }}
                      >
                        {module.description}
                      </div>
                    )}
                  </div>
                  {isChecked && <Check size={14} style={{ color: '#10b981', flexShrink: 0 }} />}
                </label>
              );
            })}
          </div>
        ),
      };
    })
  ), [groupCounts, onGroupToggle, onModuleToggle, selectedModules]);

  return (
    <>
      <div className="mx-6 mb-3 mt-4 flex items-center justify-between">
        <div>
          <Tag color="success" icon={<Unlock size={12} className="mr-1 inline align-text-bottom" />}>
            License terverifikasi
          </Tag>
          {existingConfig && (
            <Tag color="processing" className="!text-xs">
              Update konfigurasi
            </Tag>
          )}
        </div>
        <Space size={4}>
          <Tooltip title="Pilih semua">
            <Button size="small" type="text" onClick={onSelectAll}>
              All
            </Button>
          </Tooltip>
          <Tooltip title="Hapus semua">
            <Button size="small" type="text" danger onClick={onDeselectAll}>
              None
            </Button>
          </Tooltip>
        </Space>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-2">
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <ServerCog size={14} className="text-blue-500" />
            <Text strong className="text-sm">
              Module & Fitur
            </Text>
            <Tag className="!text-xs">
              {selectedModules.length}/{allModuleCodes.length} aktif
            </Tag>
          </div>

          <Collapse
            ghost
            expandIconPosition="start"
            defaultActiveKey={SETUP_MODULE_GROUPS.map((group) => group.key)}
            items={collapseItems}
            className="setup-module-collapse"
          />
        </div>
      </div>
    </>
  );
};

const AccountingBusinessTemplateStep = ({
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

    <div className="grid grid-cols-1 gap-2">
      {ACCOUNTING_BUSINESS_TEMPLATES.map((template) => {
        const selected = template.code === selectedCode;
        const enabled = template.status === 'ENABLED';
        return (
          <button
            key={template.code}
            type="button"
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
                  {template.status === 'PREVIEW_DISABLED' && <Tag>Preview</Tag>}
                  {template.status === 'DISABLED' && <Tag>Belum aktif</Tag>}
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

const DateInput = ({
  error,
  label,
  onChange,
  value,
}: {
  error?: string;
  label: string;
  onChange: (value: string) => void;
  value: string;
}) => (
  <div>
    <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
      {label}
    </label>
    <Input
      type="date"
      value={value}
      status={error ? 'error' : undefined}
      onChange={(event) => onChange(event.target.value)}
    />
    {error && <div className="mt-1 text-xs text-red-500">{error}</div>}
  </div>
);

const AccountingPeriodStep = ({
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
        onChange={(cutoffDate) => onChange({ cutoffDate })}
      />
      <div />
      <DateInput
        label="Awal Periode Fiskal"
        value={draft.fiscalPeriodStart}
        error={errors.fiscal_period_start}
        onChange={(fiscalPeriodStart) => onChange({ fiscalPeriodStart })}
      />
      <DateInput
        label="Akhir Periode Fiskal"
        value={draft.fiscalPeriodEnd}
        error={errors.fiscal_period_end}
        onChange={(fiscalPeriodEnd) => onChange({ fiscalPeriodEnd })}
      />
      <DateInput
        label="Awal Periode Berjalan"
        value={draft.currentPeriodStart}
        error={errors.current_period_start}
        onChange={(currentPeriodStart) => onChange({ currentPeriodStart })}
      />
      <DateInput
        label="Akhir Periode Berjalan"
        value={draft.currentPeriodEnd}
        error={errors.current_period_end}
        onChange={(currentPeriodEnd) => onChange({ currentPeriodEnd })}
      />
    </div>
  </div>
);

const AccountingBaseCurrencyStep = ({
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

const SetupReviewStep = ({
  draft,
  selectedModules,
  requiresAccountingBaseline,
  selectedTemplate,
}: {
  draft: AccountingDraft;
  selectedModules: string[];
  requiresAccountingBaseline: boolean;
  selectedTemplate: AccountingBusinessTemplateDefinition;
}) => {
  const moduleLabelsByCode = useMemo(() => (
    new Map(
      SETUP_MODULE_GROUPS.flatMap((group) => (
        group.modules.map((module) => [module.code, module.label] as const)
      )),
    )
  ), []);

  return (
    <div className="space-y-4">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <ListChecks size={15} className="text-blue-500" />
          <Text strong>Review Setup</Text>
        </div>
        <Alert
          type="warning"
          showIcon
          message="Periksa sebelum menyimpan"
          description="Jenis bisnis, template turunan, cutoff, periode, dan base currency akan menjadi rujukan awal. Setelah transaksi, opening balance, atau jurnal dibuat, field ini akan dikunci atau butuh flow reset."
        />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Module aktif
        </div>
        <div className="flex max-h-28 flex-wrap gap-1 overflow-y-auto">
          {selectedModules.map((moduleCode) => (
            <Tag key={moduleCode} color="processing">
              {moduleLabelsByCode.get(moduleCode) ?? moduleCode}
            </Tag>
          ))}
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
          Akuntansi
        </div>
        {requiresAccountingBaseline ? (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Jenis Bisnis</span>
              <strong className="text-right">{selectedTemplate.label}</strong>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Standard</span>
              <strong>{selectedTemplate.standard_label}</strong>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Cutoff</span>
              <strong>{formatDateLabel(draft.cutoffDate)}</strong>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Periode Fiskal</span>
              <strong className="text-right">
                {formatDateLabel(draft.fiscalPeriodStart)} - {formatDateLabel(draft.fiscalPeriodEnd)}
              </strong>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Periode Berjalan</span>
              <strong className="text-right">
                {formatDateLabel(draft.currentPeriodStart)} - {formatDateLabel(draft.currentPeriodEnd)}
              </strong>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Base Currency</span>
              <strong>{normalizeCurrencyCode(draft.baseCurrencyCode)}</strong>
            </div>
          </div>
        ) : (
          <div className="space-y-2 text-sm">
            <Alert
              type="info"
              showIcon
              message="Mode ringkas"
              description="Module yang dipilih belum membutuhkan accounting baseline. Wizard menyimpan default minimum agar setup bisa dilengkapi nanti."
            />
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Default Jenis Bisnis</span>
              <strong>Ritel (SAK EMKM)</strong>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-slate-500">Base Currency</span>
              <strong>{normalizeCurrencyCode(draft.baseCurrencyCode)}</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const SetupKeyDrawer = ({ open, onClose, forceMode = false }: SetupKeyDrawerProps) => {
  const { message } = App.useApp();
  const defaultDraft = useMemo(() => createDefaultAccountingDraft(), []);
  const existingConfig = useMemo(() => getSetupConfig(), []);
  const [currentStep, setCurrentStep] = useState<WizardStep>(0);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isVerified, setIsVerified] = useState(false);
  const [licenseKey, setLicenseKey] = useState('');
  const [licenseFingerprint, setLicenseFingerprint] = useState('');
  const [selectedModules, setSelectedModules] = useState<string[]>(
    existingConfig?.enabledModules ?? DEFAULT_SELECTED_MODULES,
  );
  const [businessTemplateCode, setBusinessTemplateCode] = useState<AccountingBusinessTemplateCode>(
    defaultDraft.businessTemplateCode,
  );
  const [hasTouchedBusinessTemplate, setHasTouchedBusinessTemplate] = useState(false);
  const [cutoffDate, setCutoffDate] = useState(defaultDraft.cutoffDate);
  const [fiscalPeriodStart, setFiscalPeriodStart] = useState(defaultDraft.fiscalPeriodStart);
  const [fiscalPeriodEnd, setFiscalPeriodEnd] = useState(defaultDraft.fiscalPeriodEnd);
  const [currentPeriodStart, setCurrentPeriodStart] = useState(defaultDraft.currentPeriodStart);
  const [currentPeriodEnd, setCurrentPeriodEnd] = useState(defaultDraft.currentPeriodEnd);
  const [baseCurrencyCode, setBaseCurrencyCode] = useState(defaultDraft.baseCurrencyCode);
  const [validationErrors, setValidationErrors] = useState<AccountingValidationErrors>({});
  const [isSaving, setIsSaving] = useState(false);
  const [hasOperationalSignal, setHasOperationalSignal] = useState(false);
  const [existingAccountingSetup, setExistingAccountingSetup] =
    useState<AccountingInitialSetupSetting | null>(null);

  const allModuleCodes = useMemo(
    () => SETUP_MODULE_GROUPS.flatMap((group) => group.modules.map((module) => module.code)),
    [],
  );

  const requiresAccountingBaseline = useMemo(
    () => requiresAccountingBaselineForModules(selectedModules),
    [selectedModules],
  );

  const selectedTemplate = ACCOUNTING_BUSINESS_TEMPLATE_BY_CODE[businessTemplateCode];

  const accountingDraft = useMemo<AccountingDraft>(() => ({
    businessTemplateCode,
    cutoffDate,
    fiscalPeriodStart,
    fiscalPeriodEnd,
    currentPeriodStart,
    currentPeriodEnd,
    baseCurrencyCode,
  }), [
    baseCurrencyCode,
    businessTemplateCode,
    cutoffDate,
    currentPeriodEnd,
    currentPeriodStart,
    fiscalPeriodEnd,
    fiscalPeriodStart,
  ]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    const loadExistingAccountingSetup = async () => {
      const [setup, lockSignals] = await Promise.all([
        db.accountingInitialSetupSetting.get('default'),
        getBaseCurrencyLockSignals(),
      ]);

      if (cancelled) return;

      setExistingAccountingSetup(setup ?? null);
      setHasOperationalSignal(lockSignals.hasSignal);

      if (setup) {
        setBusinessTemplateCode(setup.business_template_code);
        setCutoffDate(setup.cutoff_date);
        setFiscalPeriodStart(setup.fiscal_period_start);
        setFiscalPeriodEnd(setup.fiscal_period_end);
        setCurrentPeriodStart(setup.current_period_start);
        setCurrentPeriodEnd(setup.current_period_end);
        setBaseCurrencyCode(setup.base_currency_code);
      }
    };

    void loadExistingAccountingSetup();

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (hasTouchedBusinessTemplate || existingAccountingSetup) return;
    setBusinessTemplateCode(getSuggestedAccountingBusinessTemplate(selectedModules));
  }, [existingAccountingSetup, hasTouchedBusinessTemplate, selectedModules]);

  const updateAccountingDraft = useCallback((patch: Partial<AccountingDraft>) => {
    if (patch.cutoffDate !== undefined) setCutoffDate(patch.cutoffDate);
    if (patch.fiscalPeriodStart !== undefined) setFiscalPeriodStart(patch.fiscalPeriodStart);
    if (patch.fiscalPeriodEnd !== undefined) setFiscalPeriodEnd(patch.fiscalPeriodEnd);
    if (patch.currentPeriodStart !== undefined) setCurrentPeriodStart(patch.currentPeriodStart);
    if (patch.currentPeriodEnd !== undefined) setCurrentPeriodEnd(patch.currentPeriodEnd);
    if (patch.baseCurrencyCode !== undefined) setBaseCurrencyCode(normalizeCurrencyCode(patch.baseCurrencyCode));
    if (patch.businessTemplateCode !== undefined) setBusinessTemplateCode(patch.businessTemplateCode);
    setValidationErrors({});
  }, []);

  const handleVerify = useCallback(async () => {
    if (!licenseKey.trim()) {
      message.warning('License key tidak boleh kosong.');
      return;
    }

    setIsVerifying(true);
    try {
      const valid = await verifyLicenseKey(licenseKey);
      if (valid) {
        const fingerprint = await getLicenseFingerprint(licenseKey);
        setLicenseFingerprint(fingerprint);
        setIsVerified(true);
        setCurrentStep(1);
        message.success('License key terverifikasi!');
      } else {
        message.error('License key tidak valid. Periksa kembali.');
      }
    } catch {
      message.error('Gagal memverifikasi license key.');
    } finally {
      setIsVerifying(false);
    }
  }, [licenseKey, message]);

  const handleModuleToggle = useCallback((code: string, checked: boolean) => {
    setSelectedModules((prev) => (
      checked ? Array.from(new Set([...prev, code])) : prev.filter((item) => item !== code)
    ));
  }, []);

  const handleGroupToggle = useCallback((groupKey: string, checked: boolean) => {
    const group = SETUP_MODULE_GROUPS.find((item) => item.key === groupKey);
    if (!group) return;

    const groupCodes = group.modules.map((module) => module.code);
    setSelectedModules((prev) => {
      const withoutGroup = prev.filter((code) => !groupCodes.includes(code));
      return checked ? Array.from(new Set([...withoutGroup, ...groupCodes])) : withoutGroup;
    });
  }, []);

  const handleSelectAll = useCallback(() => {
    setSelectedModules(allModuleCodes);
  }, [allModuleCodes]);

  const handleDeselectAll = useCallback(() => {
    setSelectedModules([]);
  }, []);

  const handleSelectBusinessTemplate = useCallback((code: AccountingBusinessTemplateCode) => {
    setHasTouchedBusinessTemplate(true);
    setBusinessTemplateCode(code);
    setValidationErrors({});
  }, []);

  const validateCurrentAccountingStep = useCallback(() => {
    const errors = validateAccountingDraft(
      accountingDraft,
      requiresAccountingBaseline,
      hasOperationalSignal,
      existingAccountingSetup?.base_currency_code,
    );
    setValidationErrors(errors);
    return errors;
  }, [accountingDraft, existingAccountingSetup?.base_currency_code, hasOperationalSignal, requiresAccountingBaseline]);

  const handleNext = useCallback(() => {
    if (currentStep === 1 && selectedModules.length === 0) {
      message.warning('Pilih minimal satu module.');
      return;
    }

    if (currentStep === 2) {
      const errors = validateCurrentAccountingStep();
      const firstError = getFirstValidationError(errors);
      if (firstError) {
        message.warning(firstError);
        return;
      }
    }

    setCurrentStep((step) => Math.min(step + 1, 3) as WizardStep);
  }, [currentStep, message, selectedModules.length, validateCurrentAccountingStep]);

  const handlePrevious = useCallback(() => {
    setCurrentStep((step) => Math.max(step - 1, 0) as WizardStep);
  }, []);

  const handleSave = useCallback(async () => {
    if (selectedModules.length === 0) {
      message.warning('Pilih minimal satu module.');
      return;
    }

    const errors = validateCurrentAccountingStep();
    const firstError = getFirstValidationError(errors);
    if (firstError) {
      setCurrentStep(2);
      message.warning(firstError);
      return;
    }

    setIsSaving(true);
    try {
      const result = await saveInitialAccountingSetup({
        enabledModules: selectedModules,
        configuredBy: licenseFingerprint,
        business_template_code: accountingDraft.businessTemplateCode,
        cutoff_date: accountingDraft.cutoffDate,
        fiscal_period_start: accountingDraft.fiscalPeriodStart,
        fiscal_period_end: accountingDraft.fiscalPeriodEnd,
        current_period_start: accountingDraft.currentPeriodStart,
        current_period_end: accountingDraft.currentPeriodEnd,
        base_currency_code: accountingDraft.baseCurrencyCode,
      });
      setExistingAccountingSetup(result.setupSnapshot);

      message.success('Konfigurasi setup berhasil disimpan!');
      onClose();
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Gagal menyimpan konfigurasi.');
    } finally {
      setIsSaving(false);
    }
  }, [
    accountingDraft,
    existingAccountingSetup,
    licenseFingerprint,
    message,
    onClose,
    requiresAccountingBaseline,
    selectedModules,
    validateCurrentAccountingStep,
  ]);

  const handleClose = useCallback(() => {
    if (!isVerified) {
      setLicenseKey('');
    }
    onClose();
  }, [isVerified, onClose]);

  const renderWizardFooter = () => {
    if (currentStep === 0) return null;

    return (
      <div className="border-t border-gray-200 bg-white px-6 py-4 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
        <div className="mb-2 flex items-center justify-between text-xs text-gray-500">
          <span>{selectedModules.length} module aktif</span>
          {requiresAccountingBaseline ? (
            <span>Setup akuntansi diperlukan</span>
          ) : (
            <span>Mode ringkas akuntansi</span>
          )}
        </div>
        <div className="flex gap-2">
          <Button
            size="large"
            className="!h-11"
            disabled={currentStep === 1 || isSaving}
            onClick={handlePrevious}
            icon={<ChevronLeft size={16} />}
          >
            Kembali
          </Button>
          {currentStep < 3 ? (
            <Button
              type="primary"
              size="large"
              block
              onClick={handleNext}
              icon={<ChevronRight size={16} />}
              className="!h-11"
              style={{
                background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                border: 'none',
                fontWeight: 600,
              }}
            >
              Lanjut
            </Button>
          ) : (
            <Button
              type="primary"
              size="large"
              block
              loading={isSaving}
              onClick={handleSave}
              icon={<Check size={16} />}
              className="!h-11"
              style={{
                background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                border: 'none',
                fontWeight: 600,
              }}
            >
              Simpan Setup
            </Button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      width={620}
      placement="right"
      closable={!forceMode}
      maskClosable={!forceMode}
      keyboard={!forceMode}
      destroyOnClose={false}
      styles={{
        header: {
          background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 50%, #334155 100%)',
          borderBottom: '1px solid rgba(59, 130, 246, 0.3)',
          padding: '16px 24px',
        },
        body: {
          background: '#fafbfc',
          padding: 0,
        },
      }}
      title={
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-blue-500 to-cyan-400 shadow-lg shadow-blue-500/25">
            <Settings2 size={18} className="text-white" />
          </div>
          <div>
            <div className="text-base font-bold leading-tight text-white">
              Developer Setup
            </div>
            <div className="text-xs font-normal text-blue-300/80">
              Konfigurasi awal instalasi sistem
            </div>
          </div>
        </div>
      }
    >
      <div className="px-6 pb-3 pt-5">
        <Steps
          current={currentStep}
          size="small"
          items={[
            {
              title: 'License',
              icon: currentStep > 0 ? <Check size={14} /> : <KeyRound size={14} />,
            },
            {
              title: 'Module',
              icon: <ServerCog size={14} />,
            },
            {
              title: 'Akuntansi',
              icon: <CalendarDays size={14} />,
            },
            {
              title: 'Review',
              icon: <ListChecks size={14} />,
            },
          ]}
        />
      </div>

      <Divider className="!my-0" />

      {currentStep === 0 && (
        <div className="px-6 py-5">
          <div className="mb-5 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <Lock size={20} />
              </div>
              <div>
                <Title level={5} className="!mb-0">
                  Verifikasi License Key
                </Title>
                <Text type="secondary" className="text-xs">
                  Masukkan license key dari developer
                </Text>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
                  License Key
                </label>
                <Input.Password
                  size="large"
                  value={licenseKey}
                  onChange={(event) => setLicenseKey(event.target.value)}
                  placeholder="Masukkan license key..."
                  prefix={<KeyRound size={16} className="text-gray-400" />}
                  onPressEnter={handleVerify}
                  autoFocus
                />
              </div>

              <Button
                type="primary"
                size="large"
                block
                loading={isVerifying}
                onClick={handleVerify}
                icon={<ShieldCheck size={16} />}
                className="!h-11"
                style={{
                  background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)',
                  fontWeight: 600,
                }}
              >
                Verifikasi License
              </Button>
            </div>
          </div>

          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
            <Paragraph className="!mb-0 text-xs text-gray-500">
              <KeyRound size={12} className="mr-1 inline align-text-bottom" />
              License key diperlukan untuk mengakses konfigurasi setup. Hubungi developer
              jika belum memiliki license key.
            </Paragraph>
          </div>
        </div>
      )}

      {currentStep === 1 && (
        <div className="flex flex-col" style={{ height: WIZARD_BODY_HEIGHT }}>
          <SetupModuleStep
            allModuleCodes={allModuleCodes}
            existingConfig={existingConfig}
            selectedModules={selectedModules}
            onDeselectAll={handleDeselectAll}
            onGroupToggle={handleGroupToggle}
            onModuleToggle={handleModuleToggle}
            onSelectAll={handleSelectAll}
          />
          {renderWizardFooter()}
        </div>
      )}

      {currentStep === 2 && (
        <div className="flex flex-col" style={{ height: WIZARD_BODY_HEIGHT }}>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            {requiresAccountingBaseline ? (
              <div className="space-y-5">
                <Alert
                  type="info"
                  showIcon
                  message="Setup akuntansi diperlukan"
                  description="Module yang dipilih membutuhkan baseline akun, periode, cutoff, dan base currency sebelum dipakai operasional."
                />
                <AccountingBusinessTemplateStep
                  selectedCode={businessTemplateCode}
                  validationError={validationErrors.business_template_code}
                  onSelect={handleSelectBusinessTemplate}
                />
                <AccountingPeriodStep
                  draft={accountingDraft}
                  errors={validationErrors}
                  onChange={updateAccountingDraft}
                />
                <AccountingBaseCurrencyStep
                  baseCurrencyCode={baseCurrencyCode}
                  error={validationErrors.base_currency_code}
                  hasOperationalSignal={hasOperationalSignal}
                  lockedBaseCurrencyCode={existingAccountingSetup?.base_currency_code}
                  onChange={(value) => updateAccountingDraft({ baseCurrencyCode: value })}
                />
              </div>
            ) : (
              <div className="space-y-5">
                <Alert
                  type="warning"
                  showIcon
                  message="Mode ringkas"
                  description="Module yang dipilih belum membutuhkan accounting baseline. Wizard akan menyimpan default minimum dan setup akuntansi bisa dilengkapi nanti sesuai permission."
                />
                <AccountingBaseCurrencyStep
                  baseCurrencyCode={baseCurrencyCode}
                  error={validationErrors.base_currency_code}
                  hasOperationalSignal={hasOperationalSignal}
                  lockedBaseCurrencyCode={existingAccountingSetup?.base_currency_code}
                  onChange={(value) => updateAccountingDraft({ baseCurrencyCode: value })}
                />
              </div>
            )}
          </div>
          {renderWizardFooter()}
        </div>
      )}

      {currentStep === 3 && (
        <div className="flex flex-col" style={{ height: WIZARD_BODY_HEIGHT }}>
          <div className="flex-1 overflow-y-auto px-6 py-5">
            <SetupReviewStep
              draft={accountingDraft}
              selectedModules={selectedModules}
              requiresAccountingBaseline={requiresAccountingBaseline}
              selectedTemplate={selectedTemplate}
            />
          </div>
          {renderWizardFooter()}
        </div>
      )}
    </Drawer>
  );
};
