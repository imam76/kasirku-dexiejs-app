import {
  ACCOUNTING_MODULE_ACTIVATION_RULES,
  DEFAULT_ACCOUNTING_PROFILE_SETTING,
  DEFAULT_ENABLED_MODULES,
  DEFAULT_GENERAL_LEDGER_SETTING,
} from '@/constants/accounting';
import {
  DEFAULT_CHART_OF_ACCOUNTS,
  DEFAULT_FINANCE_ACCOUNT_MAPPINGS,
  CONSTRUCTION_EXTENSION_TEMPLATE_LINES,
  CONSTRUCTION_EXTENSION_TEMPLATE_PREVIEW,
  MANUFACTURING_EXTENSION_TEMPLATE_LINES,
  MANUFACTURING_EXTENSION_TEMPLATE_PREVIEW,
  PSAP_TEMPLATE_LINES,
  PSAP_TEMPLATE_PREVIEW,
  SAK_EMKM_RETAIL_TEMPLATE,
  SAK_EMKM_RETAIL_TEMPLATE_LINES,
  SAK_ETAP_KOPERASI_TEMPLATE,
  SAK_ETAP_KOPERASI_TEMPLATE_LINES,
} from '@/constants/chartOfAccounts';
import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import { chartOfAccountSchema } from '@/lib/validations/chartOfAccount';
import { enqueueFinanceTransactionsSync, withPendingFinanceTransactionSync } from '@/services/financeTransactionSyncService';
import { getGeneralLedgerReadiness } from '@/utils/accounting/getGeneralLedgerReadiness';
import type {
  AccountingModuleCode,
  AccountingProfileCode,
  AccountingProfileSetting,
  ChartOfAccount,
  ChartOfAccountTemplateLine,
  EnabledModule,
  FinanceAccountMapping,
  FinanceTransaction,
  GeneralLedgerSetting,
  IndustryExtensionCode,
} from '@/types';

export interface ChartOfAccountUpsertInput {
  code: string;
  name: string;
  type: ChartOfAccount['type'];
  parent_id?: string;
  is_postable?: boolean;
  is_active?: boolean;
  description?: string;
}

export type ChartOfAccountApplyTemplateMode =
  | 'MERGE_MISSING_ONLY'
  | 'UPDATE_MAPPING_ONLY'
  | 'UPDATE_PROFILE_ONLY'
  | 'ACTIVATE_MODULES_ONLY';

export interface ApplyChartOfAccountTemplateInput {
  accounting_profile: AccountingProfileCode;
  industry_extension: IndustryExtensionCode;
  template_id?: string;
  mode: ChartOfAccountApplyTemplateMode;
  update_mappings?: boolean;
  update_modules?: boolean;
}

export interface ChartOfAccountTemplatePreview {
  templateId: string;
  templateName: string;
  missingAccounts: ChartOfAccountTemplateLine[];
  existingAccountCount: number;
  mappingChangeCount: number;
  moduleChangeCount: number;
  transactionSnapshotCount: number;
  unmappedTransactionCount: number;
  canApply: boolean;
  warningMessages: string[];
  requiredDomainFeatures: string[];
}

const normalizeText = (value: string | undefined) => value?.trim() || undefined;
const normalizeCode = (value: string) => value.trim().toUpperCase();

const toTimestampedAccounts = (now: string): ChartOfAccount[] =>
  DEFAULT_CHART_OF_ACCOUNTS.map((account) => ({
    ...account,
    created_at: now,
    updated_at: now,
  }));

const toTimestampedModules = (now: string): EnabledModule[] =>
  DEFAULT_ENABLED_MODULES.map((module) => ({
    ...module,
    created_at: now,
    updated_at: now,
  }));

const buildMappingFromAccount = (
  key: string,
  account: ChartOfAccount,
  now: string,
  isSystem = true,
): FinanceAccountMapping => ({
  id: key,
  key,
  category: key,
  account_id: account.id,
  account_code: account.code,
  account_name: account.name,
  account_type: account.type,
  is_system: isSystem,
  created_at: now,
  updated_at: now,
});

const toTimestampedMappings = (accounts: ChartOfAccount[], now: string): FinanceAccountMapping[] => {
  const accountById = new Map(accounts.map((account) => [account.id, account]));

  return DEFAULT_FINANCE_ACCOUNT_MAPPINGS
    .map((mapping) => {
      const account = accountById.get(mapping.account_id);
      if (!account) return undefined;

      return {
        ...mapping,
        id: mapping.key,
        account_code: account.code,
        account_name: account.name,
        account_type: account.type,
        created_at: now,
        updated_at: now,
      };
    })
    .filter((mapping): mapping is FinanceAccountMapping => Boolean(mapping));
};

export const buildDefaultAccountingSeed = (now: string) => {
  const accounts = toTimestampedAccounts(now);

  return {
    accounts,
    mappings: toTimestampedMappings(accounts, now),
    profileSetting: {
      ...DEFAULT_ACCOUNTING_PROFILE_SETTING,
      created_at: now,
      updated_at: now,
    },
    generalLedgerSetting: {
      ...DEFAULT_GENERAL_LEDGER_SETTING,
      created_at: now,
      updated_at: now,
    } satisfies GeneralLedgerSetting,
    enabledModules: toTimestampedModules(now),
  };
};

export const ensureAccountingDefaults = async () => {
  const now = new Date().toISOString();
  const seed = buildDefaultAccountingSeed(now);

  await db.transaction('rw', [
    db.chartOfAccounts,
    db.financeAccountMappings,
    db.accountingProfileSetting,
    db.enabledModules,
    db.generalLedgerSetting,
  ], async () => {
    if (await db.chartOfAccounts.count() === 0) {
      await db.chartOfAccounts.bulkPut(seed.accounts);
    } else {
      const accounts = await db.chartOfAccounts.toArray();
      const accountCodes = new Set(accounts.map((account) => account.code));
      const accountIds = new Set(accounts.map((account) => account.id));
      const missingAccounts = seed.accounts.filter((account) => {
        return !accountCodes.has(account.code) && !accountIds.has(account.id);
      });

      if (missingAccounts.length > 0) {
        await db.chartOfAccounts.bulkPut(missingAccounts);
      }
    }

    if (await db.financeAccountMappings.count() === 0) {
      await db.financeAccountMappings.bulkPut(seed.mappings);
    }

    if (!await db.accountingProfileSetting.get('default')) {
      await db.accountingProfileSetting.put(seed.profileSetting);
    }

    if (await db.enabledModules.count() === 0) {
      await db.enabledModules.bulkPut(seed.enabledModules);
    }

    if (!await db.generalLedgerSetting.get('default')) {
      await db.generalLedgerSetting.put(seed.generalLedgerSetting);
    }
  });
};

const sanitizeChartOfAccountInput = async (
  input: ChartOfAccountUpsertInput,
  accountId?: string,
) => {
  const parsed = chartOfAccountSchema.parse(input);
  const code = normalizeCode(parsed.code);
  const parent = parsed.parent_id ? await db.chartOfAccounts.get(parsed.parent_id) : undefined;

  if (parsed.parent_id === accountId) {
    throw new Error('Parent akun tidak boleh akun yang sama.');
  }

  if (parsed.parent_id && !parent) {
    throw new Error('Parent akun tidak ditemukan.');
  }

  if (parent && !parent.is_active) {
    throw new Error('Parent akun harus aktif.');
  }

  if (parent && parent.type !== parsed.type) {
    throw new Error('Parent akun harus memiliki tipe akun yang sama.');
  }

  return {
    code,
    name: parsed.name.trim(),
    type: parsed.type,
    normal_balance: parsed.normal_balance,
    parent_id: parent?.id,
    parent_code: parent?.code,
    parent_name: parent?.name,
    is_postable: parsed.is_postable ?? true,
    is_active: parsed.is_active ?? true,
    description: normalizeText(parsed.description),
  };
};

const assertAccountCodeAvailable = async (code: string, excludeAccountId?: string) => {
  const existingAccount = await db.chartOfAccounts
    .where('code')
    .equals(code)
    .and((account) => account.id !== excludeAccountId && account.is_active)
    .first();

  if (existingAccount) {
    throw new Error('Kode akun sudah dipakai akun aktif lain.');
  }
};

const requireFinanceActor = async () => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'FINANCE_ACCESS');
  return currentUser;
};

const isManufacturingProfile = (accountingProfile: AccountingProfileCode) => {
  return accountingProfile === 'SAK_EP' || accountingProfile === 'PSAK_FULL';
};

const isConstructionProfile = (accountingProfile: AccountingProfileCode) => {
  return accountingProfile === 'SAK_EP' || accountingProfile === 'PSAK_FULL';
};

const assertAccountingProfileCombination = (
  accountingProfile: AccountingProfileCode,
  industryExtension: IndustryExtensionCode,
) => {
  if (accountingProfile === 'PSAP' && industryExtension !== 'NONE') {
    throw new Error('PSAP harus memakai industry extension NONE.');
  }

  if (industryExtension === 'MANUFACTURING' && !isManufacturingProfile(accountingProfile)) {
    throw new Error('Manufaktur hanya didukung untuk SAK EP atau PSAK Full.');
  }

  if (industryExtension === 'CONSTRUCTION' && !isConstructionProfile(accountingProfile)) {
    throw new Error('Konstruksi hanya didukung untuk SAK EP atau PSAK Full.');
  }

  if (industryExtension === 'RETAIL' && accountingProfile === 'PSAP') {
    throw new Error('Profile PSAP tidak memakai extension retail.');
  }

  if (accountingProfile === 'SAK_ETAP' && industryExtension !== 'COOPERATIVE') {
    throw new Error('SAK ETAP saat ini hanya didukung untuk extension Koperasi.');
  }
};

export const createChartOfAccount = async (input: ChartOfAccountUpsertInput): Promise<ChartOfAccount> => {
  const currentUser = await requireFinanceActor();
  const sanitizedInput = await sanitizeChartOfAccountInput(input);
  await assertAccountCodeAvailable(sanitizedInput.code);

  const now = new Date().toISOString();
  const account: ChartOfAccount = {
    id: crypto.randomUUID(),
    ...sanitizedInput,
    is_system: false,
    created_at: now,
    updated_at: now,
  };

  await db.chartOfAccounts.add(account);
  await writeActivityLog({
    user: currentUser,
    action: 'CHART_OF_ACCOUNT_CREATED',
    entity: 'chartOfAccounts',
    entity_id: account.id,
    description: `${currentUser?.name ?? 'User'} membuat akun ${account.code} ${account.name}.`,
  });

  return account;
};

export const updateChartOfAccount = async (
  id: string,
  input: ChartOfAccountUpsertInput,
): Promise<ChartOfAccount> => {
  const currentUser = await requireFinanceActor();
  const existingAccount = await db.chartOfAccounts.get(id);
  if (!existingAccount) {
    throw new Error('Akun tidak ditemukan.');
  }

  const sanitizedInput = await sanitizeChartOfAccountInput(input, id);
  await assertAccountCodeAvailable(sanitizedInput.code, id);

  const updatedAccount: ChartOfAccount = {
    ...existingAccount,
    ...sanitizedInput,
    updated_at: new Date().toISOString(),
  };

  await db.chartOfAccounts.put(updatedAccount);
  await writeActivityLog({
    user: currentUser,
    action: 'CHART_OF_ACCOUNT_UPDATED',
    entity: 'chartOfAccounts',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} memperbarui akun ${updatedAccount.code} ${updatedAccount.name}.`,
  });

  return updatedAccount;
};

export const archiveChartOfAccount = async (id: string): Promise<ChartOfAccount> => {
  const currentUser = await requireFinanceActor();
  const account = await db.chartOfAccounts.get(id);
  if (!account) {
    throw new Error('Akun tidak ditemukan.');
  }

  const activeMapping = await db.financeAccountMappings
    .where('account_id')
    .equals(id)
    .first();

  if (activeMapping) {
    throw new Error('Akun masih dipakai mapping finance. Pindahkan mapping dulu sebelum arsip.');
  }

  const archivedAccount: ChartOfAccount = {
    ...account,
    is_active: false,
    updated_at: new Date().toISOString(),
  };

  await db.chartOfAccounts.put(archivedAccount);
  await writeActivityLog({
    user: currentUser,
    action: 'CHART_OF_ACCOUNT_ARCHIVED',
    entity: 'chartOfAccounts',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} mengarsipkan akun ${account.code} ${account.name}.`,
  });

  return archivedAccount;
};

export const restoreChartOfAccount = async (id: string): Promise<ChartOfAccount> => {
  const currentUser = await requireFinanceActor();
  const account = await db.chartOfAccounts.get(id);
  if (!account) {
    throw new Error('Akun tidak ditemukan.');
  }

  await assertAccountCodeAvailable(account.code, id);

  const restoredAccount: ChartOfAccount = {
    ...account,
    is_active: true,
    updated_at: new Date().toISOString(),
  };

  await db.chartOfAccounts.put(restoredAccount);
  await writeActivityLog({
    user: currentUser,
    action: 'CHART_OF_ACCOUNT_RESTORED',
    entity: 'chartOfAccounts',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} memulihkan akun ${account.code} ${account.name}.`,
  });

  return restoredAccount;
};

export const updateFinanceAccountMapping = async (
  key: string,
  accountId: string,
): Promise<FinanceAccountMapping> => {
  const currentUser = await requireFinanceActor();
  const account = await db.chartOfAccounts.get(accountId);
  if (!account || !account.is_active || !account.is_postable) {
    throw new Error('Mapping hanya bisa diarahkan ke akun aktif dan postable.');
  }

  const now = new Date().toISOString();
  const existingMapping = await db.financeAccountMappings.get(key);
  const mapping: FinanceAccountMapping = {
    id: key,
    key,
    category: key,
    account_id: account.id,
    account_code: account.code,
    account_name: account.name,
    account_type: account.type,
    is_system: existingMapping?.is_system ?? false,
    created_at: existingMapping?.created_at ?? now,
    updated_at: now,
  };

  await db.financeAccountMappings.put(mapping);
  await writeActivityLog({
    user: currentUser,
    action: 'FINANCE_ACCOUNT_MAPPING_UPDATED',
    entity: 'financeAccountMappings',
    entity_id: key,
    description: `${currentUser?.name ?? 'User'} memperbarui mapping ${key} ke akun ${account.code} ${account.name}.`,
  });

  return mapping;
};

export const getAccountingProfileSetting = async (): Promise<AccountingProfileSetting> => {
  await ensureAccountingDefaults();
  const profile = await db.accountingProfileSetting.get('default');
  if (!profile) {
    throw new Error('Accounting profile default tidak tersedia.');
  }

  return profile;
};

export const isAccountingModuleEnabled = async (code: AccountingModuleCode): Promise<boolean> => {
  await ensureAccountingDefaults();
  const module = await db.enabledModules.where('code').equals(code).first();
  return Boolean(module?.is_enabled);
};

export const updateEnabledModule = async (
  code: AccountingModuleCode,
  isEnabled: boolean,
): Promise<EnabledModule> => {
  const currentUser = await requireFinanceActor();
  const profile = await getAccountingProfileSetting();

  if (isEnabled && profile.accounting_profile === 'PSAP' && code === 'GENERAL_LEDGER') {
    throw new Error('General Ledger retail belum diaktifkan untuk profile PSAP.');
  }

  if (isEnabled && ['MANUFACTURING', 'CONSTRUCTION', 'PSAP_REPORTING'].includes(code)) {
    throw new Error('Module domain ini masih preview. Aktifkan setelah flow domain dan report khusus tersedia.');
  }

  if (isEnabled && code === 'GENERAL_LEDGER') {
    const readiness = await getGeneralLedgerReadiness();
    if (!readiness.isReady) {
      const failedChecks = readiness.checks
        .filter((check) => !check.passed)
        .map((check) => check.message)
        .join(' ');

      throw new Error(`General Ledger belum siap production. ${failedChecks}`);
    }
  }

  const existingModule = await db.enabledModules.get(code);
  const now = new Date().toISOString();
  const module: EnabledModule = {
    id: code,
    code,
    is_enabled: isEnabled,
    source: 'USER',
    requires_profile: existingModule?.requires_profile,
    requires_extension: existingModule?.requires_extension,
    created_at: existingModule?.created_at ?? now,
    updated_at: now,
  };

  await db.transaction('rw', [db.enabledModules, db.generalLedgerSetting], async () => {
    await db.enabledModules.put(module);

    if (code === 'GENERAL_LEDGER') {
      const setting = await db.generalLedgerSetting.get('default');
      await db.generalLedgerSetting.put({
        id: 'default',
        is_ready: isEnabled ? true : setting?.is_ready ?? false,
        cutoff_date: setting?.cutoff_date,
        inventory_policy: setting?.inventory_policy ?? 'PERPETUAL_INVENTORY',
        opening_balance_journal_id: setting?.opening_balance_journal_id,
        activated_at: isEnabled ? (setting?.activated_at ?? now) : setting?.activated_at,
        created_at: setting?.created_at ?? now,
        updated_at: now,
      });
    }
  });
  await writeActivityLog({
    user: currentUser,
    action: isEnabled ? 'ACCOUNTING_MODULE_ENABLED' : 'ACCOUNTING_MODULE_DISABLED',
    entity: 'enabledModules',
    entity_id: code,
    description: `${currentUser?.name ?? 'User'} ${isEnabled ? 'mengaktifkan' : 'menonaktifkan'} module ${code}.`,
  });

  return module;
};

export const updateAccountingProfileSetting = async (
  accountingProfile: AccountingProfileCode,
  industryExtension: IndustryExtensionCode,
  templateId?: string,
): Promise<AccountingProfileSetting> => {
  const currentUser = await requireFinanceActor();
  assertAccountingProfileCombination(accountingProfile, industryExtension);
  const existingProfile = await db.accountingProfileSetting.get('default');
  const now = new Date().toISOString();
  const profile: AccountingProfileSetting = {
    id: 'default',
    accounting_profile: accountingProfile,
    industry_extension: industryExtension,
    template_id: templateId,
    locked_after_transaction: existingProfile?.locked_after_transaction ?? false,
    created_at: existingProfile?.created_at ?? now,
    updated_at: now,
  };

  await db.accountingProfileSetting.put(profile);
  await writeActivityLog({
    user: currentUser,
    action: 'ACCOUNTING_PROFILE_SETTING_UPDATED',
    entity: 'accountingProfileSetting',
    entity_id: 'default',
    description: `${currentUser?.name ?? 'User'} memperbarui accounting profile menjadi ${accountingProfile} + ${industryExtension}.`,
  });

  return profile;
};

const createUnsupportedTemplatePreview = (
  accountingProfile: AccountingProfileCode,
  industryExtension: IndustryExtensionCode,
) => ({
  template: {
    id: `preview-unsupported-${accountingProfile}-${industryExtension}`,
    code: 'UNSUPPORTED_PREVIEW',
    name: 'Template belum tersedia',
    accounting_profile: accountingProfile,
    industry_extension: industryExtension,
    description: 'Kombinasi profile dan extension ini belum memiliki template akun.',
    account_count_hint: 0,
    is_system: true,
    is_active: false,
    created_at: '',
    updated_at: '',
  },
  lines: [] as ChartOfAccountTemplateLine[],
  canApply: false,
  warningMessages: ['Kombinasi profile dan extension ini belum siap diterapkan.'],
  requiredDomainFeatures: [] as string[],
});

const getTemplateForInput = (
  accountingProfile: AccountingProfileCode,
  industryExtension: IndustryExtensionCode,
  templateId?: string,
) => {
  if (
    templateId === SAK_EMKM_RETAIL_TEMPLATE.id ||
    (!templateId && accountingProfile === 'SAK_EMKM' && industryExtension === 'RETAIL')
  ) {
    return {
      template: SAK_EMKM_RETAIL_TEMPLATE,
      lines: SAK_EMKM_RETAIL_TEMPLATE_LINES,
      canApply: true,
      warningMessages: [] as string[],
      requiredDomainFeatures: [] as string[],
    };
  }

  if (
    templateId === MANUFACTURING_EXTENSION_TEMPLATE_PREVIEW.id ||
    (!templateId && industryExtension === 'MANUFACTURING' && isManufacturingProfile(accountingProfile))
  ) {
    return {
      template: {
        ...MANUFACTURING_EXTENSION_TEMPLATE_PREVIEW,
        accounting_profile: accountingProfile,
      },
      lines: MANUFACTURING_EXTENSION_TEMPLATE_LINES,
      canApply: false,
      warningMessages: [
        'Preview akun manufaktur tidak diterapkan otomatis agar user tidak mengira produksi dan costing sudah lengkap.',
      ],
      requiredDomainFeatures: [
        'BOM',
        'Production order',
        'Material issue',
        'Labor cost allocation',
        'Factory overhead allocation',
        'Finished goods receipt',
        'Inventory costing policy',
        'WIP movement',
      ],
    };
  }

  if (
    templateId === CONSTRUCTION_EXTENSION_TEMPLATE_PREVIEW.id ||
    (!templateId && industryExtension === 'CONSTRUCTION' && isConstructionProfile(accountingProfile))
  ) {
    return {
      template: {
        ...CONSTRUCTION_EXTENSION_TEMPLATE_PREVIEW,
        accounting_profile: accountingProfile,
      },
      lines: CONSTRUCTION_EXTENSION_TEMPLATE_LINES,
      canApply: false,
      warningMessages: [
        'Preview akun konstruksi tidak diterapkan otomatis sebelum contract, progress, retensi, dan revenue recognition tersedia.',
      ],
      requiredDomainFeatures: [
        'Contract master',
        'Project phase/progress',
        'Progress billing',
        'Retention',
        'Subcontractor billing',
        'Cost to complete',
        'Revenue recognition rule',
        'Project margin report',
      ],
    };
  }

  if (
    templateId === PSAP_TEMPLATE_PREVIEW.id ||
    (!templateId && accountingProfile === 'PSAP' && industryExtension === 'NONE')
  ) {
    return {
      template: PSAP_TEMPLATE_PREVIEW,
      lines: PSAP_TEMPLATE_LINES,
      canApply: false,
      warningMessages: [
        'PSAP membutuhkan mode dan report pemerintahan khusus. Jangan dicampur ke UX retail.',
      ],
      requiredDomainFeatures: [
        'Laporan Realisasi Anggaran',
        'Laporan Operasional',
        'Neraca PSAP',
        'Laporan Perubahan Ekuitas',
        'Struktur anggaran dan realisasi',
      ],
    };
  }

  if (
    templateId === SAK_ETAP_KOPERASI_TEMPLATE.id ||
    (!templateId && accountingProfile === 'SAK_ETAP' && industryExtension === 'COOPERATIVE')
  ) {
    return {
      template: SAK_ETAP_KOPERASI_TEMPLATE,
      lines: SAK_ETAP_KOPERASI_TEMPLATE_LINES,
      canApply: true,
      warningMessages: [] as string[],
      requiredDomainFeatures: [] as string[],
    };
  }

  return createUnsupportedTemplatePreview(accountingProfile, industryExtension);
};

const countMappingChanges = async (lines: ChartOfAccountTemplateLine[]) => {
  const currentMappings = await db.financeAccountMappings.toArray();
  const mappingByKey = new Map(currentMappings.map((mapping) => [mapping.key, mapping.account_code]));

  return lines.filter((line) => {
    if (!line.mapping_keys || line.mapping_keys.length === 0) return false;
    return line.mapping_keys.some((key) => {
      const mappedCode = mappingByKey.get(key);
      return mappedCode !== undefined && mappedCode !== line.code;
    });
  }).length;
};

const countModuleChanges = async (
  accountingProfile: AccountingProfileCode,
  industryExtension: IndustryExtensionCode,
) => {
  const modules = await db.enabledModules.toArray();
  const moduleByCode = new Map(modules.map((module) => [module.code, module.is_enabled]));

  return ACCOUNTING_MODULE_ACTIVATION_RULES.filter((rule) => {
    return (
      rule.accounting_profile === accountingProfile &&
      rule.industry_extension === industryExtension &&
      moduleByCode.get(rule.module_code) !== rule.default_enabled
    );
  }).length;
};

export const getChartOfAccountTemplatePreview = async (
  input: Pick<ApplyChartOfAccountTemplateInput, 'accounting_profile' | 'industry_extension' | 'template_id'>,
): Promise<ChartOfAccountTemplatePreview> => {
  await ensureAccountingDefaults();
  const {
    template,
    lines,
    canApply,
    warningMessages,
    requiredDomainFeatures,
  } = getTemplateForInput(input.accounting_profile, input.industry_extension, input.template_id);
  const existingAccounts = await db.chartOfAccounts.toArray();
  const existingCodes = new Set(existingAccounts.map((account) => account.code));
  const transactions = await db.financeTransactions.toArray();

  return {
    templateId: template.id,
    templateName: template.name,
    missingAccounts: lines.filter((line) => !existingCodes.has(line.code)),
    existingAccountCount: existingAccounts.length,
    mappingChangeCount: await countMappingChanges(lines),
    moduleChangeCount: await countModuleChanges(input.accounting_profile, input.industry_extension),
    transactionSnapshotCount: transactions.filter((transaction) => transaction.account_id).length,
    unmappedTransactionCount: transactions.filter((transaction) => !transaction.account_id).length,
    canApply,
    warningMessages,
    requiredDomainFeatures,
  };
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
});

const mergeMissingTemplateAccounts = async (lines: ChartOfAccountTemplateLine[], now: string) => {
  const accountByCode = new Map((await db.chartOfAccounts.toArray()).map((account) => [account.code, account]));
  const accountByTemplateId = new Map<string, ChartOfAccount>();
  const newAccounts: ChartOfAccount[] = [];

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
    while (await db.chartOfAccounts.get(nextId) || newAccounts.some((item) => item.id === nextId)) {
      suffix += 1;
      nextId = `${account.id}-${suffix}`;
    }

    const nextAccount = { ...account, id: nextId };
    newAccounts.push(nextAccount);
    accountByCode.set(nextAccount.code, nextAccount);
    accountByTemplateId.set(line.template_account_id, nextAccount);
  }

  if (newAccounts.length > 0) {
    await db.chartOfAccounts.bulkAdd(newAccounts);
  }

  return newAccounts;
};

const updateMappingsFromTemplate = async (lines: ChartOfAccountTemplateLine[], now: string) => {
  const accounts = await db.chartOfAccounts.toArray();
  const accountByCode = new Map(accounts.map((account) => [account.code, account]));
  const mappings: FinanceAccountMapping[] = [];

  for (const line of lines) {
    if (!line.mapping_keys || line.mapping_keys.length === 0) continue;
    const account = accountByCode.get(line.code);
    if (!account || !account.is_active || !account.is_postable) continue;
    
    for (const key of line.mapping_keys) {
      const existingMapping = await db.financeAccountMappings.get(key);
      mappings.push({
        ...buildMappingFromAccount(key, account, now, true),
        created_at: existingMapping?.created_at ?? now,
      });
    }
  }

  if (mappings.length > 0) {
    await db.financeAccountMappings.bulkPut(mappings);
  }

  return mappings;
};

const updateModulesFromRules = async (
  accountingProfile: AccountingProfileCode,
  industryExtension: IndustryExtensionCode,
  now: string,
) => {
  const rules = ACCOUNTING_MODULE_ACTIVATION_RULES.filter((rule) => {
    return rule.accounting_profile === accountingProfile && rule.industry_extension === industryExtension;
  });
  const modules: EnabledModule[] = [];

  for (const rule of rules) {
    const existingModule = await db.enabledModules.get(rule.module_code);
    modules.push({
      id: rule.module_code,
      code: rule.module_code,
      is_enabled: rule.default_enabled,
      source: 'PROFILE',
      requires_profile: rule.accounting_profile,
      requires_extension: rule.industry_extension,
      created_at: existingModule?.created_at ?? now,
      updated_at: now,
    });
  }

  if (modules.length > 0) {
    await db.enabledModules.bulkPut(modules);
  }

  return modules;
};

export const applyChartOfAccountTemplate = async (input: ApplyChartOfAccountTemplateInput) => {
  const currentUser = await requireFinanceActor();
  assertAccountingProfileCombination(input.accounting_profile, input.industry_extension);
  const { template, lines, canApply } = getTemplateForInput(
    input.accounting_profile,
    input.industry_extension,
    input.template_id,
  );
  if (!canApply) {
    throw new Error('Template ini masih preview dan belum boleh diterapkan otomatis.');
  }
  const now = new Date().toISOString();
  let addedAccounts: ChartOfAccount[] = [];
  let updatedMappings: FinanceAccountMapping[] = [];
  let updatedModules: EnabledModule[] = [];

  await db.transaction('rw', [
    db.chartOfAccounts,
    db.financeAccountMappings,
    db.accountingProfileSetting,
    db.enabledModules,
  ], async () => {
    if (input.mode === 'MERGE_MISSING_ONLY') {
      addedAccounts = await mergeMissingTemplateAccounts(lines, now);
    }

    if (input.mode === 'MERGE_MISSING_ONLY' || input.mode === 'UPDATE_MAPPING_ONLY') {
      if (input.update_mappings ?? true) {
        updatedMappings = await updateMappingsFromTemplate(lines, now);
      }
    }

    if (input.mode !== 'ACTIVATE_MODULES_ONLY') {
      const existingProfile = await db.accountingProfileSetting.get('default');
      await db.accountingProfileSetting.put({
        id: 'default',
        accounting_profile: input.accounting_profile,
        industry_extension: input.industry_extension,
        template_id: template.id,
        locked_after_transaction: existingProfile?.locked_after_transaction ?? false,
        created_at: existingProfile?.created_at ?? now,
        updated_at: now,
      });
    }

    if (input.mode === 'ACTIVATE_MODULES_ONLY' || input.update_modules) {
      updatedModules = await updateModulesFromRules(input.accounting_profile, input.industry_extension, now);
    }
  });

  await writeActivityLog({
    user: currentUser,
    action: 'ACCOUNTING_TEMPLATE_APPLIED',
    entity: 'chartOfAccounts',
    entity_id: template.id,
    description: `${currentUser?.name ?? 'User'} menerapkan template ${template.name}. Akun baru: ${addedAccounts.length}, mapping: ${updatedMappings.length}, module: ${updatedModules.length}.`,
  });

  return {
    addedAccounts,
    updatedMappings,
    updatedModules,
  };
};

export const backfillFinanceTransactionAccountSnapshots = async () => {
  const currentUser = await requireFinanceActor();
  const transactions = await db.financeTransactions.toArray();
  const mappings = await db.financeAccountMappings.toArray();
  const accounts = await db.chartOfAccounts.toArray();
  const mappingByKey = new Map(mappings.map((mapping) => [mapping.key, mapping]));
  const accountById = new Map(accounts.map((account) => [account.id, account]));
  const now = new Date().toISOString();
  let updatedCount = 0;
  const updatedFinanceTransactions: FinanceTransaction[] = [];

  await db.transaction('rw', [db.financeTransactions], async () => {
    for (const transaction of transactions) {
      if (transaction.account_id) continue;
      const mapping = mappingByKey.get(transaction.category);
      if (!mapping) continue;
      const account = accountById.get(mapping.account_id);
      if (!account || !account.is_active || !account.is_postable) continue;

      const updatedTransaction = withPendingFinanceTransactionSync({
        ...transaction,
        account_id: account.id,
        account_code: account.code,
        account_name: account.name,
        account_type: account.type,
        version: Math.max(1, Number(transaction.version ?? 1)) + 1,
      }, currentUser, now);

      await db.financeTransactions.put(updatedTransaction);
      updatedFinanceTransactions.push(updatedTransaction);
      updatedCount += 1;
    }
  });

  if (updatedFinanceTransactions.length > 0) {
    await enqueueFinanceTransactionsSync(updatedFinanceTransactions, 'update');
  }

  await writeActivityLog({
    user: currentUser,
    action: 'FINANCE_ACCOUNT_SNAPSHOT_BACKFILLED',
    entity: 'financeTransactions',
    description: `${currentUser?.name ?? 'User'} mengisi snapshot akun untuk ${updatedCount} transaksi finance pada ${now}.`,
  });

  return updatedCount;
};
