import { getCurrentSessionUser, writeActivityLog } from '@/auth/authService';
import {
  ACCOUNTING_BUSINESS_TEMPLATE_BY_CODE,
  ACCOUNTING_MODULE_ACTIVATION_RULES,
} from '@/constants/accounting';
import {
  BASE_CURRENCY_CODE,
  buildBaseCurrencyForCode,
  buildBaseCurrencyRateForCode,
} from '@/constants/currencies';
import {
  SAK_EMKM_GENERAL_SERVICE_TEMPLATE,
  SAK_EMKM_GENERAL_SERVICE_TEMPLATE_LINES,
  SAK_EMKM_RETAIL_TEMPLATE,
  SAK_EMKM_RETAIL_TEMPLATE_LINES,
  SAK_ETAP_KOPERASI_TEMPLATE,
  SAK_ETAP_KOPERASI_TEMPLATE_LINES,
} from '@/constants/chartOfAccounts';
import dayjs from '@/lib/dayjs';
import { db } from '@/lib/db';
import { getBaseCurrencyLockSignals } from '@/services/baseCurrencyService';
import { findOrCreateAccountingFiscalYear } from '@/services/accountingFiscalYearService';
import { saveSetupConfig, saveSetupConfigToRemote } from '@/services/setupKeyService';
import {
  enqueueAccountingInitialSetupSettingSync,
  enqueueAccountingFiscalYearSync,
  enqueueAccountingPeriodSync,
  enqueueAccountingProfileSettingSync,
  enqueueChartOfAccountSync,
  enqueueCurrencyRateSync,
  enqueueCurrencySync,
  enqueueEnabledModuleSync,
  enqueueFinanceAccountMappingSync,
  enqueueGeneralLedgerSettingSync,
} from '@/services/syncQueueService';
import type {
  AccountingBusinessTemplateCode,
  AccountingFiscalYear,
  AccountingInitialSetupSetting,
  AccountingPeriod,
  AccountingProfileSetting,
  ChartOfAccount,
  ChartOfAccountTemplate,
  ChartOfAccountTemplateLine,
  Currency,
  CurrencyRate,
  EnabledModule,
  FinanceAccountMapping,
  GeneralLedgerSetting,
  InventoryAccountingPolicy,
} from '@/types';
import { isTauriRuntime } from '@/utils/export/platform';

export interface SaveInitialAccountingSetupInput {
  enabledModules: string[];
  configuredBy: string;
  configuredByName?: string;
  business_template_code: AccountingBusinessTemplateCode;
  cutoff_date: string;
  fiscal_period_start: string;
  fiscal_period_end: string;
  current_period_start: string;
  current_period_end: string;
  base_currency_code: string;
  persistSetupConfig?: boolean;
}

export interface SaveInitialAccountingSetupResult {
  setupSnapshot: AccountingInitialSetupSetting;
  accountingProfileSetting?: AccountingProfileSetting;
  generalLedgerSetting?: GeneralLedgerSetting;
  accountingPeriod?: AccountingPeriod;
  accountingFiscalYear?: AccountingFiscalYear;
  createdAccounts: ChartOfAccount[];
  updatedMappings: FinanceAccountMapping[];
  updatedModules: EnabledModule[];
  updatedCurrencies: Currency[];
  updatedCurrencyRates: CurrencyRate[];
}

interface TemplateBundle {
  template: ChartOfAccountTemplate;
  lines: ChartOfAccountTemplateLine[];
}

interface OperationalSignalResult {
  hasSignal: boolean;
  labels: string[];
}

type SyncOperation = 'create' | 'update';

interface ChangedRecord<T> {
  record: T;
  operation: SyncOperation;
}

const ACCOUNTING_TRIGGER_MODULES = new Set([
  'CHART_OF_ACCOUNTS',
  'GENERAL_LEDGER',
  'CASH_FLOW',
  'RECEIVABLES',
  'PAYABLES',
  'TAX',
  'CURRENCY',
  'REPORT_INCOME',
  'REPORT_EXPENSE',
  'REPORT_CASH_FLOW',
  'REPORT_PAYROLL',
  'REPORT_AGING',
  'REPORT_PROFIT',
  'REPORT_BALANCE_SHEET',
  'REPORT_PURCHASE',
  'REPORT_POS_SALES',
  'REPORT_DEPOSIT',
  'REPORT_TRANSACTION_DETAIL',
]);

const toDateOnly = (value: string) => value.slice(0, 10);
const toStartOfDay = (value: string) => `${toDateOnly(value)}T00:00:00.000`;
const normalizeCurrencyCode = (value: string) => value.trim().toUpperCase();

export const requiresAccountingBaselineForModules = (enabledModules: string[]) => (
  enabledModules.some((moduleCode) => (
    ACCOUNTING_TRIGGER_MODULES.has(moduleCode) ||
    moduleCode.startsWith('SALES_') ||
    moduleCode.startsWith('PURCHASE_') ||
    moduleCode.startsWith('KOPERASI_')
  ))
);

export const getSuggestedAccountingBusinessTemplate = (
  enabledModules: string[],
): AccountingBusinessTemplateCode => (
  enabledModules.some((moduleCode) => moduleCode.startsWith('KOPERASI_'))
    ? 'COOPERATIVE'
    : 'RETAIL'
);

const normalizeDateOnly = (value: string, label: string) => {
  const date = dayjs(toDateOnly(value));
  if (!date.isValid()) {
    throw new Error(`${label} tidak valid.`);
  }
  return date.format('YYYY-MM-DD');
};

const rangesOverlap = (
  aStart: string,
  aEnd: string,
  bStart: string,
  bEnd: string,
) => aStart <= bEnd && bStart <= aEnd;

const resolveTemplateBundle = (templateId: string): TemplateBundle => {
  if (templateId === SAK_EMKM_RETAIL_TEMPLATE.id) {
    return {
      template: SAK_EMKM_RETAIL_TEMPLATE,
      lines: SAK_EMKM_RETAIL_TEMPLATE_LINES,
    };
  }

  if (templateId === SAK_ETAP_KOPERASI_TEMPLATE.id) {
    return {
      template: SAK_ETAP_KOPERASI_TEMPLATE,
      lines: SAK_ETAP_KOPERASI_TEMPLATE_LINES,
    };
  }

  if (templateId === SAK_EMKM_GENERAL_SERVICE_TEMPLATE.id) {
    return {
      template: SAK_EMKM_GENERAL_SERVICE_TEMPLATE,
      lines: SAK_EMKM_GENERAL_SERVICE_TEMPLATE_LINES,
    };
  }

  throw new Error('Template COA belum tersedia untuk jenis bisnis ini.');
};

const getOperationalSignals = async (): Promise<OperationalSignalResult> => getBaseCurrencyLockSignals();

const validateDateInput = (input: SaveInitialAccountingSetupInput, requiresAccountingBaseline: boolean) => {
  const fiscalStart = normalizeDateOnly(input.fiscal_period_start, 'Awal periode fiskal');
  const fiscalEnd = normalizeDateOnly(input.fiscal_period_end, 'Akhir periode fiskal');
  const currentStart = normalizeDateOnly(input.current_period_start, 'Awal periode berjalan');
  const currentEnd = normalizeDateOnly(input.current_period_end, 'Akhir periode berjalan');
  const cutoffDate = normalizeDateOnly(input.cutoff_date, 'Cutoff');

  if (!requiresAccountingBaseline) {
    return {
      cutoffDate,
      fiscalStart,
      fiscalEnd,
      currentStart,
      currentEnd,
    };
  }

  if (fiscalEnd < fiscalStart) {
    throw new Error('Akhir periode fiskal harus sama atau setelah awal periode fiskal.');
  }
  if (currentEnd < currentStart) {
    throw new Error('Akhir periode berjalan harus sama atau setelah awal periode berjalan.');
  }
  if (currentStart < fiscalStart || currentEnd > fiscalEnd) {
    throw new Error('Periode berjalan harus berada di dalam periode fiskal.');
  }
  if (cutoffDate > currentEnd) {
    throw new Error('Cutoff tidak boleh setelah akhir periode berjalan.');
  }

  return {
    cutoffDate,
    fiscalStart,
    fiscalEnd,
    currentStart,
    currentEnd,
  };
};

const validateBusinessTemplate = (
  businessTemplateCode: AccountingBusinessTemplateCode,
  requiresAccountingBaseline: boolean,
) => {
  const template = ACCOUNTING_BUSINESS_TEMPLATE_BY_CODE[businessTemplateCode];
  if (!template) {
    throw new Error('Jenis bisnis tidak dikenal.');
  }
  if (requiresAccountingBaseline && template.status !== 'ENABLED') {
    throw new Error('Jenis bisnis ini belum aktif untuk setup awal.');
  }
  return template;
};

const buildTemplateAccount = (
  line: ChartOfAccountTemplateLine,
  parent: ChartOfAccount | undefined,
  now: string,
): ChartOfAccount => ({
  id: `template-${line.template_account_id}`,
  code: line.code,
  name: line.name,
  type: line.type,
  normal_balance: line.normal_balance,
  parent_id: parent?.id,
  parent_code: parent?.code,
  parent_name: parent?.name,
  is_postable: line.is_postable,
  is_system: true,
  is_active: true,
  description: line.description,
  created_at: now,
  updated_at: now,
  sync_status: 'pending',
  sync_error: undefined,
});

const mergeTemplateAccounts = async (
  lines: ChartOfAccountTemplateLine[],
  now: string,
) => {
  const accountByCode = new Map((await db.chartOfAccounts.toArray()).map((account) => [account.code, account]));
  const accountByTemplateId = new Map<string, ChartOfAccount>();
  const createdAccounts: ChartOfAccount[] = [];

  for (const line of lines) {
    const existingAccount = accountByCode.get(line.code);
    if (existingAccount) {
      accountByTemplateId.set(line.template_account_id, existingAccount);
      continue;
    }

    const parent = line.parent_template_account_id
      ? accountByTemplateId.get(line.parent_template_account_id)
      : undefined;
    const account = buildTemplateAccount(line, parent, now);
    let nextId = account.id;
    let suffix = 1;
    while (await db.chartOfAccounts.get(nextId) || createdAccounts.some((item) => item.id === nextId)) {
      suffix += 1;
      nextId = `${account.id}-${suffix}`;
    }

    const nextAccount = { ...account, id: nextId };
    createdAccounts.push(nextAccount);
    accountByCode.set(nextAccount.code, nextAccount);
    accountByTemplateId.set(line.template_account_id, nextAccount);
  }

  if (createdAccounts.length > 0) {
    await db.chartOfAccounts.bulkAdd(createdAccounts);
  }

  return createdAccounts;
};

const buildMappingFromAccount = (
  key: string,
  account: ChartOfAccount,
  now: string,
  existingMapping?: FinanceAccountMapping,
): FinanceAccountMapping => ({
  id: key,
  key,
  category: key,
  account_id: account.id,
  account_code: account.code,
  account_name: account.name,
  account_type: account.type,
  is_system: true,
  created_at: existingMapping?.created_at ?? now,
  updated_at: now,
  sync_status: 'pending',
  sync_error: undefined,
});

const mappingNeedsUpdate = (
  existing: FinanceAccountMapping | undefined,
  next: FinanceAccountMapping,
) => (
  !existing ||
  existing.account_id !== next.account_id ||
  existing.account_code !== next.account_code ||
  existing.account_name !== next.account_name ||
  existing.account_type !== next.account_type ||
  existing.category !== next.category ||
  existing.is_system !== next.is_system
);

const updateTemplateMappings = async (
  lines: ChartOfAccountTemplateLine[],
  now: string,
) => {
  const accounts = await db.chartOfAccounts.toArray();
  const accountByCode = new Map(accounts.map((account) => [account.code, account]));
  const updatedMappings: FinanceAccountMapping[] = [];

  for (const line of lines) {
    if (!line.mapping_keys || line.mapping_keys.length === 0) continue;
    const account = accountByCode.get(line.code);
    if (!account || !account.is_active || !account.is_postable) continue;

    for (const key of line.mapping_keys) {
      const existingMapping = await db.financeAccountMappings.get(key);
      const nextMapping = buildMappingFromAccount(key, account, now, existingMapping);
      if (mappingNeedsUpdate(existingMapping, nextMapping)) {
        updatedMappings.push(nextMapping);
      }
    }
  }

  if (updatedMappings.length > 0) {
    await db.financeAccountMappings.bulkPut(updatedMappings);
  }

  return updatedMappings;
};

const updateAccountingModules = async (
  templateDefinition: typeof ACCOUNTING_BUSINESS_TEMPLATE_BY_CODE[AccountingBusinessTemplateCode],
  selectedSetupModules: string[],
  now: string,
) => {
  const selectedInternalModules = new Set(templateDefinition.default_enabled_modules);
  if (selectedSetupModules.includes('GENERAL_LEDGER')) {
    selectedInternalModules.add('GENERAL_LEDGER');
  }

  const relevantRules = ACCOUNTING_MODULE_ACTIVATION_RULES.filter((rule) => (
    rule.accounting_profile === templateDefinition.accounting_profile &&
    rule.industry_extension === templateDefinition.industry_extension
  ));
  const nextModules: EnabledModule[] = [];

  for (const rule of relevantRules) {
    const existingModule = await db.enabledModules.get(rule.module_code);
    const nextModule: EnabledModule = {
      id: rule.module_code,
      code: rule.module_code,
      is_enabled: selectedInternalModules.has(rule.module_code),
      source: 'PROFILE',
      requires_profile: rule.accounting_profile,
      requires_extension: rule.industry_extension,
      created_at: existingModule?.created_at ?? now,
      updated_at: now,
      sync_status: 'pending',
      sync_error: undefined,
    };

    if (
      !existingModule ||
      existingModule.is_enabled !== nextModule.is_enabled ||
      existingModule.source !== nextModule.source ||
      existingModule.requires_profile !== nextModule.requires_profile ||
      existingModule.requires_extension !== nextModule.requires_extension
    ) {
      nextModules.push(nextModule);
    }
  }

  if (nextModules.length > 0) {
    await db.enabledModules.bulkPut(nextModules);
  }

  return nextModules;
};

const upsertAccountingProfileSetting = async (
  templateDefinition: typeof ACCOUNTING_BUSINESS_TEMPLATE_BY_CODE[AccountingBusinessTemplateCode],
  now: string,
) => {
  const existingProfile = await db.accountingProfileSetting.get('default');
  const nextProfile: AccountingProfileSetting = {
    id: 'default',
    accounting_profile: templateDefinition.accounting_profile,
    industry_extension: templateDefinition.industry_extension,
    template_id: templateDefinition.template_id,
    locked_after_transaction: existingProfile?.locked_after_transaction ?? false,
    created_at: existingProfile?.created_at ?? now,
    updated_at: now,
    sync_status: 'pending',
    sync_error: undefined,
  };

  if (
    !existingProfile ||
    existingProfile.accounting_profile !== nextProfile.accounting_profile ||
    existingProfile.industry_extension !== nextProfile.industry_extension ||
    existingProfile.template_id !== nextProfile.template_id
  ) {
    await db.accountingProfileSetting.put(nextProfile);
    return nextProfile;
  }

  return undefined;
};

const upsertGeneralLedgerSetting = async (
  input: {
    cutoffDate: string;
    inventoryPolicy: InventoryAccountingPolicy;
    selectedSetupModules: string[];
    now: string;
  },
) => {
  const existingSetting = await db.generalLedgerSetting.get('default');
  const nextSetting: GeneralLedgerSetting = {
    id: 'default',
    is_ready: input.selectedSetupModules.includes('GENERAL_LEDGER')
      ? true
      : existingSetting?.is_ready ?? false,
    cutoff_date: toStartOfDay(input.cutoffDate),
    inventory_policy: input.inventoryPolicy,
    opening_balance_journal_id: existingSetting?.opening_balance_journal_id,
    activated_at: input.selectedSetupModules.includes('GENERAL_LEDGER')
      ? existingSetting?.activated_at ?? input.now
      : existingSetting?.activated_at,
    created_at: existingSetting?.created_at ?? input.now,
    updated_at: input.now,
    sync_status: 'pending',
    sync_error: undefined,
  };

  if (
    !existingSetting ||
    existingSetting.is_ready !== nextSetting.is_ready ||
    toDateOnly(existingSetting.cutoff_date ?? '') !== input.cutoffDate ||
    existingSetting.inventory_policy !== nextSetting.inventory_policy ||
    existingSetting.activated_at !== nextSetting.activated_at
  ) {
    await db.generalLedgerSetting.put(nextSetting);
    return nextSetting;
  }

  return undefined;
};

const buildPeriodName = (
  startDate: string,
  endDate: string,
  periodType: AccountingPeriod['period_type'],
) => {
  if (periodType === 'MONTHLY') {
    return `Periode ${dayjs(startDate).format('MMM YYYY')}`;
  }

  const startYear = startDate.slice(0, 4);
  const endYear = endDate.slice(0, 4);
  return startYear === endYear
    ? `Tahun Buku ${startYear}`
    : `Tahun Buku ${startYear}-${endYear}`;
};

const findOrCreateCurrentPeriod = async (
  input: {
    currentStart: string;
    currentEnd: string;
    fiscalStart: string;
    fiscalEnd: string;
    now: string;
    actorId?: string;
    actorName?: string;
  },
) => {
  const periods = await db.accountingPeriods.toArray();
  const activePeriods = periods.filter((period) => !period.deleted_at);
  const exactPeriod = activePeriods.find((period) => (
    toDateOnly(period.start_date) === input.currentStart &&
    toDateOnly(period.end_date) === input.currentEnd
  ));
  const overlappingPeriod = activePeriods.find((period) => (
    period.id !== exactPeriod?.id &&
    rangesOverlap(
      input.currentStart,
      input.currentEnd,
      toDateOnly(period.start_date),
      toDateOnly(period.end_date),
    )
  ));

  if (overlappingPeriod) {
    throw new Error(
      `Periode berjalan tumpang tindih dengan "${overlappingPeriod.name}" (${toDateOnly(overlappingPeriod.start_date)} s/d ${toDateOnly(overlappingPeriod.end_date)}).`,
    );
  }

  if (exactPeriod) {
    return {
      period: exactPeriod,
      operation: undefined,
    };
  }

  const periodType: AccountingPeriod['period_type'] = (
    input.currentStart === input.fiscalStart &&
    input.currentEnd === input.fiscalEnd
  ) ? 'YEARLY' : 'MONTHLY';
  const period: AccountingPeriod = {
    id: crypto.randomUUID(),
    name: buildPeriodName(input.currentStart, input.currentEnd, periodType),
    period_type: periodType,
    start_date: input.currentStart,
    end_date: input.currentEnd,
    status: 'OPEN',
    notes: 'Periode berjalan dibuat dari setup akuntansi awal.',
    version: 1,
    created_by: input.actorId,
    created_by_name: input.actorName,
    updated_by: input.actorId,
    updated_by_name: input.actorName,
    created_at: input.now,
    updated_at: input.now,
    sync_status: 'pending',
    sync_error: undefined,
  };

  await db.accountingPeriods.add(period);
  return {
    period,
    operation: 'create' as const,
  };
};

const upsertBaseCurrency = async (baseCurrencyCode: string, now: string) => {
  const currencyCode = normalizeCurrencyCode(baseCurrencyCode);
  const currencies = await db.currencies.toArray();
  const changedCurrencies: ChangedRecord<Currency>[] = [];

  for (const currency of currencies) {
    const shouldBeBase = currency.code === currencyCode;
    if (currency.is_base !== shouldBeBase || (shouldBeBase && !currency.is_active)) {
      const updatedCurrency: Currency = {
        ...currency,
        is_base: shouldBeBase,
        is_active: shouldBeBase ? true : currency.is_active,
        updated_at: now,
        sync_status: 'pending',
        sync_error: undefined,
      };
      await db.currencies.put(updatedCurrency);
      changedCurrencies.push({ record: updatedCurrency, operation: 'update' });
    }
  }

  if (!currencies.some((currency) => currency.code === currencyCode)) {
    const createdCurrency: Currency = {
      ...buildBaseCurrencyForCode(currencyCode, now, { sync_status: 'pending' }),
      sync_error: undefined,
    };
    await db.currencies.add(createdCurrency);
    changedCurrencies.push({ record: createdCurrency, operation: 'create' });
  }

  const rateDate = toDateOnly(now);
  const rateId = `${currencyCode}-${rateDate}-SYSTEM`;
  const existingRate = await db.currencyRates.get(rateId);
  const nextRate: CurrencyRate = {
    ...buildBaseCurrencyRateForCode(currencyCode, now, { sync_status: 'pending' }),
    id: rateId,
    rate_date: rateDate,
    created_at: existingRate?.created_at ?? now,
    updated_at: now,
    sync_error: undefined,
  };
  const changedRates: ChangedRecord<CurrencyRate>[] = [];

  if (
    !existingRate ||
    existingRate.currency_code !== nextRate.currency_code ||
    existingRate.base_currency_code !== nextRate.base_currency_code ||
    existingRate.middle_rate !== nextRate.middle_rate
  ) {
    await db.currencyRates.put(nextRate);
    changedRates.push({ record: nextRate, operation: existingRate ? 'update' : 'create' });
  }

  return {
    currencies: changedCurrencies,
    rates: changedRates,
  };
};

const buildSetupSnapshot = ({
  baseCurrencyCode,
  businessTemplateCode,
  cutoffDate,
  currentEnd,
  currentPeriodId,
  currentStart,
  existingSetup,
  fiscalEnd,
  fiscalStart,
  requiresAccountingBaseline,
  templateDefinition,
  configuredBy,
  configuredByName,
  now,
}: {
  baseCurrencyCode: string;
  businessTemplateCode: AccountingBusinessTemplateCode;
  cutoffDate: string;
  currentEnd: string;
  currentPeriodId?: string;
  currentStart: string;
  existingSetup?: AccountingInitialSetupSetting;
  fiscalEnd: string;
  fiscalStart: string;
  requiresAccountingBaseline: boolean;
  templateDefinition: typeof ACCOUNTING_BUSINESS_TEMPLATE_BY_CODE[AccountingBusinessTemplateCode];
  configuredBy: string;
  configuredByName?: string;
  now: string;
}): AccountingInitialSetupSetting => ({
  id: 'default',
  business_template_code: businessTemplateCode,
  accounting_profile: templateDefinition.accounting_profile,
  industry_extension: templateDefinition.industry_extension,
  template_id: templateDefinition.template_id,
  cutoff_date: cutoffDate,
  fiscal_period_start: fiscalStart,
  fiscal_period_end: fiscalEnd,
  current_period_start: currentStart,
  current_period_end: currentEnd,
  current_period_id: currentPeriodId,
  base_currency_code: normalizeCurrencyCode(baseCurrencyCode),
  inventory_policy: templateDefinition.default_inventory_policy,
  setup_completed_at: requiresAccountingBaseline ? now : existingSetup?.setup_completed_at,
  setup_completed_by: requiresAccountingBaseline ? configuredBy : existingSetup?.setup_completed_by,
  setup_completed_by_name: requiresAccountingBaseline
    ? configuredByName ?? existingSetup?.setup_completed_by_name
    : existingSetup?.setup_completed_by_name,
  version: Math.max(0, Number(existingSetup?.version || 0)) + 1,
  created_at: existingSetup?.created_at ?? now,
  updated_at: now,
  sync_status: 'pending',
  sync_error: undefined,
  last_synced_at: existingSetup?.last_synced_at,
  remote_updated_at: existingSetup?.remote_updated_at,
});

const assertLockedFieldsCanChange = async (
  input: SaveInitialAccountingSetupInput,
  templateDefinition: typeof ACCOUNTING_BUSINESS_TEMPLATE_BY_CODE[AccountingBusinessTemplateCode],
  operationalSignals: OperationalSignalResult,
) => {
  const [existingSetup, existingLedger] = await Promise.all([
    db.accountingInitialSetupSetting.get('default'),
    db.generalLedgerSetting.get('default'),
  ]);

  if (
    existingLedger?.opening_balance_journal_id &&
    existingLedger.cutoff_date &&
    toDateOnly(existingLedger.cutoff_date) !== toDateOnly(input.cutoff_date)
  ) {
    throw new Error('Cutoff sudah dipakai opening balance. Cutoff tidak bisa diubah dari setup akuntansi awal.');
  }

  if (
    existingLedger?.opening_balance_journal_id &&
    existingLedger.inventory_policy &&
    existingLedger.inventory_policy !== templateDefinition.default_inventory_policy
  ) {
    throw new Error('Policy persediaan sudah dipakai opening balance. Jenis bisnis tidak bisa mengubah policy.');
  }

  if (!operationalSignals.hasSignal || !existingSetup) {
    return { existingSetup, existingLedger };
  }

  const signalText = operationalSignals.labels.slice(0, 4).join(', ');
  if (existingSetup.business_template_code !== input.business_template_code) {
    throw new Error(`Jenis bisnis sudah terkunci karena sudah ada ${signalText}.`);
  }
  if (existingSetup.template_id !== templateDefinition.template_id) {
    throw new Error(`Template COA sudah terkunci karena sudah ada ${signalText}.`);
  }
  if (existingSetup.base_currency_code !== normalizeCurrencyCode(input.base_currency_code)) {
    throw new Error(`Base currency sudah terkunci karena sudah ada ${signalText}.`);
  }

  return { existingSetup, existingLedger };
};

export const saveInitialAccountingSetup = async (
  input: SaveInitialAccountingSetupInput,
): Promise<SaveInitialAccountingSetupResult> => {
  if (input.enabledModules.length === 0) {
    throw new Error('Pilih minimal satu module.');
  }

  const requiresAccountingBaseline = requiresAccountingBaselineForModules(input.enabledModules);
  const templateDefinition = validateBusinessTemplate(input.business_template_code, requiresAccountingBaseline);
  const dates = validateDateInput(input, requiresAccountingBaseline);
  const baseCurrencyCode = normalizeCurrencyCode(input.base_currency_code);
  if (!/^[A-Z]{3}$/.test(baseCurrencyCode)) {
    throw new Error('Kode base currency harus 3 huruf uppercase.');
  }

  const operationalSignals = await getOperationalSignals();
  const setupBeforeLockCheck = await db.accountingInitialSetupSetting.get('default');
  if (operationalSignals.hasSignal && !setupBeforeLockCheck && baseCurrencyCode !== BASE_CURRENCY_CODE) {
    throw new Error(`Non-IDR hanya boleh dipilih sebelum transaksi pertama. Sinyal ditemukan: ${operationalSignals.labels.slice(0, 4).join(', ')}.`);
  }

  const { existingSetup } = await assertLockedFieldsCanChange(input, templateDefinition, operationalSignals);
  const existingCurrentPeriod = existingSetup?.current_period_id
    ? await db.accountingPeriods.get(existingSetup.current_period_id)
    : undefined;
  if (
    requiresAccountingBaseline &&
    existingCurrentPeriod &&
    existingCurrentPeriod.status !== 'OPEN' &&
    (
      toDateOnly(existingCurrentPeriod.start_date) !== dates.currentStart ||
      toDateOnly(existingCurrentPeriod.end_date) !== dates.currentEnd
    )
  ) {
    throw new Error('Periode berjalan sudah terkunci/ditutup dan tidak bisa diganti dari setup akuntansi awal.');
  }

  const actor = await getCurrentSessionUser({ touchSession: false, cleanupInvalidSession: false });
  const now = new Date().toISOString();
  const result: SaveInitialAccountingSetupResult = {
    setupSnapshot: undefined as unknown as AccountingInitialSetupSetting,
    createdAccounts: [],
    updatedMappings: [],
    updatedModules: [],
    updatedCurrencies: [],
    updatedCurrencyRates: [],
  };
  let periodChange: ChangedRecord<AccountingPeriod> | undefined;
  let fiscalYearChange: ChangedRecord<AccountingFiscalYear> | undefined;
  let profileChange: ChangedRecord<AccountingProfileSetting> | undefined;
  let ledgerChange: ChangedRecord<GeneralLedgerSetting> | undefined;
  let setupOperation: SyncOperation = existingSetup ? 'update' : 'create';
  let currencyChanges: ChangedRecord<Currency>[] = [];
  let currencyRateChanges: ChangedRecord<CurrencyRate>[] = [];

  await db.transaction('rw', [
    db.chartOfAccounts,
    db.financeAccountMappings,
    db.accountingProfileSetting,
    db.enabledModules,
    db.generalLedgerSetting,
    db.accountingPeriods,
    db.accountingFiscalYears,
    db.accountingInitialSetupSetting,
    db.currencies,
    db.currencyRates,
    db.activityLogs,
  ], async () => {
    const baseCurrencyChanges = await upsertBaseCurrency(baseCurrencyCode, now);
    result.updatedCurrencies = baseCurrencyChanges.currencies.map(({ record }) => record);
    result.updatedCurrencyRates = baseCurrencyChanges.rates.map(({ record }) => record);
    currencyChanges = baseCurrencyChanges.currencies;
    currencyRateChanges = baseCurrencyChanges.rates;

    let currentPeriodId = existingSetup?.current_period_id;
    if (requiresAccountingBaseline) {
      const bundle = resolveTemplateBundle(templateDefinition.template_id);
      result.createdAccounts = await mergeTemplateAccounts(bundle.lines, now);
      result.updatedMappings = await updateTemplateMappings(bundle.lines, now);
      result.updatedModules = await updateAccountingModules(templateDefinition, input.enabledModules, now);

      const updatedProfile = await upsertAccountingProfileSetting(templateDefinition, now);
      if (updatedProfile) {
        profileChange = {
          record: updatedProfile,
          operation: existingSetup ? 'update' : 'create',
        };
        result.accountingProfileSetting = updatedProfile;
      }

      const updatedLedger = await upsertGeneralLedgerSetting({
        cutoffDate: dates.cutoffDate,
        inventoryPolicy: templateDefinition.default_inventory_policy,
        selectedSetupModules: input.enabledModules,
        now,
      });
      if (updatedLedger) {
        ledgerChange = {
          record: updatedLedger,
          operation: existingSetup ? 'update' : 'create',
        };
        result.generalLedgerSetting = updatedLedger;
      }

      const currentPeriod = await findOrCreateCurrentPeriod({
        currentStart: dates.currentStart,
        currentEnd: dates.currentEnd,
        fiscalStart: dates.fiscalStart,
        fiscalEnd: dates.fiscalEnd,
        now,
        actorId: actor?.id ?? input.configuredBy,
        actorName: actor?.name ?? input.configuredByName,
      });
      currentPeriodId = currentPeriod.period.id;
      result.accountingPeriod = currentPeriod.period;
      if (currentPeriod.operation) {
        periodChange = {
          record: currentPeriod.period,
          operation: currentPeriod.operation,
        };
      }

      const fiscalYear = await findOrCreateAccountingFiscalYear({
        fiscalStart: dates.fiscalStart,
        fiscalEnd: dates.fiscalEnd,
        now,
        actorId: actor?.id ?? input.configuredBy,
        actorName: actor?.name ?? input.configuredByName,
        notes: 'Tahun fiskal dibuat dari setup akuntansi awal.',
      });
      result.accountingFiscalYear = fiscalYear.fiscalYear;
      if (fiscalYear.operation) {
        fiscalYearChange = {
          record: fiscalYear.fiscalYear,
          operation: fiscalYear.operation,
        };
      }
    }

    const setupSnapshot = buildSetupSnapshot({
      baseCurrencyCode,
      businessTemplateCode: requiresAccountingBaseline
        ? input.business_template_code
        : existingSetup?.business_template_code ?? 'RETAIL',
      cutoffDate: requiresAccountingBaseline ? dates.cutoffDate : existingSetup?.cutoff_date ?? dates.cutoffDate,
      currentEnd: requiresAccountingBaseline ? dates.currentEnd : existingSetup?.current_period_end ?? dates.currentEnd,
      currentPeriodId: requiresAccountingBaseline ? currentPeriodId : existingSetup?.current_period_id,
      currentStart: requiresAccountingBaseline ? dates.currentStart : existingSetup?.current_period_start ?? dates.currentStart,
      existingSetup,
      fiscalEnd: requiresAccountingBaseline ? dates.fiscalEnd : existingSetup?.fiscal_period_end ?? dates.fiscalEnd,
      fiscalStart: requiresAccountingBaseline ? dates.fiscalStart : existingSetup?.fiscal_period_start ?? dates.fiscalStart,
      requiresAccountingBaseline,
      templateDefinition: requiresAccountingBaseline
        ? templateDefinition
        : ACCOUNTING_BUSINESS_TEMPLATE_BY_CODE[existingSetup?.business_template_code ?? 'RETAIL'],
      configuredBy: input.configuredBy,
      configuredByName: input.configuredByName,
      now,
    });

    await db.accountingInitialSetupSetting.put(setupSnapshot);
    result.setupSnapshot = setupSnapshot;
    setupOperation = existingSetup ? 'update' : 'create';

    await writeActivityLog({
      user: actor,
      action: existingSetup
        ? 'ACCOUNTING_INITIAL_SETUP_UPDATED'
        : 'ACCOUNTING_INITIAL_SETUP_COMPLETED',
      entity: 'accountingInitialSetupSetting',
      entity_id: 'default',
      description: `${actor?.name ?? input.configuredByName ?? 'Registrasi Owner'} menyimpan setup awal akuntansi ${setupSnapshot.business_template_code}, cutoff ${setupSnapshot.cutoff_date}, periode ${setupSnapshot.current_period_start} s/d ${setupSnapshot.current_period_end}, base currency ${setupSnapshot.base_currency_code}.`,
    });
  });

  for (const account of result.createdAccounts) {
    await enqueueChartOfAccountSync(account, 'create');
  }
  for (const mapping of result.updatedMappings) {
    await enqueueFinanceAccountMappingSync(mapping, 'update');
  }
  for (const module of result.updatedModules) {
    await enqueueEnabledModuleSync(module, 'update');
  }
  if (profileChange) {
    await enqueueAccountingProfileSettingSync(profileChange.record, profileChange.operation);
  }
  if (ledgerChange) {
    await enqueueGeneralLedgerSettingSync(ledgerChange.record, ledgerChange.operation);
  }
  if (periodChange) {
    await enqueueAccountingPeriodSync(periodChange.record, periodChange.operation);
  }
  if (fiscalYearChange) {
    await enqueueAccountingFiscalYearSync(fiscalYearChange.record, fiscalYearChange.operation);
  }
  await enqueueAccountingInitialSetupSettingSync(result.setupSnapshot, setupOperation);
  for (const { record, operation } of currencyChanges) {
    await enqueueCurrencySync(record, operation);
  }
  for (const { record, operation } of currencyRateChanges) {
    await enqueueCurrencyRateSync(record, operation);
  }

  if (input.persistSetupConfig !== false) {
    const setupConfig = {
      enabledModules: input.enabledModules,
      configuredAt: now,
      configuredBy: input.configuredBy,
    };
    if (isTauriRuntime()) {
      await saveSetupConfigToRemote(setupConfig);
    } else {
      saveSetupConfig(setupConfig);
    }
  }

  return result;
};
