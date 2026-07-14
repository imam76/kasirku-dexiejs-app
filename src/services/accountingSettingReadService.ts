import { db } from '@/lib/db';
import {
  accountingInitialSetupSettingPostgresAdapter,
  accountingProfileSettingPostgresAdapter,
  enabledModulePostgresAdapter,
  financeAccountMappingPostgresAdapter,
  generalLedgerSettingPostgresAdapter,
  isTauriRuntime,
  type RemoteAccountingInitialSetupSettingDto,
  type RemoteAccountingProfileSettingDto,
  type RemoteEnabledModuleDto,
  type RemoteFinanceAccountMappingDto,
  type RemoteGeneralLedgerSettingDto,
} from '@/services/postgresAdapter';
import type {
  AccountingBusinessTemplateCode,
  AccountingInitialSetupSetting,
  AccountingModuleCode,
  AccountingProfileCode,
  AccountingProfileSetting,
  AccountType,
  EnabledModule,
  FinanceAccountMapping,
  GeneralLedgerSetting,
  IndustryExtensionCode,
  InventoryAccountingPolicy,
} from '@/types';

export interface AccountingSettingReadSyncResult {
  fetched: number;
  inserted: number;
  updated: number;
  skipped: number;
}

const EMPTY_RESULT: AccountingSettingReadSyncResult = {
  fetched: 0,
  inserted: 0,
  updated: 0,
  skipped: 0,
};

const optionalString = (value: string | null | undefined) => value ?? undefined;
const toPositiveVersion = (version: number | null | undefined) => (
  typeof version === 'number' && Number.isFinite(version) && version > 0 ? version : 1
);

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

type LocalSyncRow = {
  sync_status?: string;
  updated_at: string;
  remote_updated_at?: string;
};

const shouldApplyRemote = (localRow: LocalSyncRow | undefined, remoteUpdatedAt: string) => {
  if (!localRow) return true;
  if (localRow.sync_status === 'pending' || localRow.sync_status === 'failed') return false;

  const localRemoteUpdatedAt = localRow.remote_updated_at ?? localRow.updated_at;
  const remoteTimestamp = toTimestamp(remoteUpdatedAt);
  const localTimestamp = toTimestamp(localRemoteUpdatedAt);

  if (remoteTimestamp !== null && localTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remoteUpdatedAt >= localRemoteUpdatedAt;
};

const canReadFromPostgres = () => (
  isTauriRuntime() &&
  (typeof navigator === 'undefined' || navigator.onLine)
);

const ACCOUNTING_BUSINESS_TEMPLATE_CODES: AccountingBusinessTemplateCode[] = [
  'RETAIL',
  'COOPERATIVE',
  'GENERAL_TRADING',
  'GENERAL_SERVICE',
  'MANUFACTURING_PREVIEW',
  'CONSTRUCTION_PREVIEW',
  'GOVERNMENT_PREVIEW',
];

const isAccountingBusinessTemplateCode = (
  code: string | null | undefined,
): code is AccountingBusinessTemplateCode => (
  Boolean(code) && ACCOUNTING_BUSINESS_TEMPLATE_CODES.includes(code as AccountingBusinessTemplateCode)
);

// ---- Finance account mappings ----

const mapRemoteFinanceAccountMappingToLocal = (
  remote: RemoteFinanceAccountMappingDto,
  syncedAt: string,
): FinanceAccountMapping => ({
  id: remote.id,
  key: remote.key,
  category: optionalString(remote.category),
  account_id: remote.account_id,
  account_code: remote.account_code,
  account_name: remote.account_name,
  account_type: remote.account_type as AccountType,
  is_system: remote.is_system,
  created_at: remote.created_at,
  updated_at: remote.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remote.updated_at,
});

export const mergeRemoteFinanceAccountMappingsIntoDexie = async (
  remoteMappings: RemoteFinanceAccountMappingDto[],
  syncedAt = new Date().toISOString(),
): Promise<AccountingSettingReadSyncResult> => {
  const result = { ...EMPTY_RESULT, fetched: remoteMappings.length };
  if (remoteMappings.length === 0) return result;

  await db.transaction('rw', db.financeAccountMappings, async () => {
    const toPut: FinanceAccountMapping[] = [];
    for (const remote of remoteMappings) {
      const local = await db.financeAccountMappings.get(remote.id);
      if (!shouldApplyRemote(local, remote.updated_at)) {
        result.skipped += 1;
        continue;
      }
      toPut.push(mapRemoteFinanceAccountMappingToLocal(remote, syncedAt));
      if (local) result.updated += 1;
      else result.inserted += 1;
    }
    if (toPut.length > 0) await db.financeAccountMappings.bulkPut(toPut);
  });

  return result;
};

export const refreshFinanceAccountMappingsFromPostgres = async (): Promise<AccountingSettingReadSyncResult> => {
  if (!canReadFromPostgres()) return { ...EMPTY_RESULT };
  return mergeRemoteFinanceAccountMappingsIntoDexie(await financeAccountMappingPostgresAdapter.list());
};

// ---- Accounting profile setting (singleton) ----

const mapRemoteAccountingProfileSettingToLocal = (
  remote: RemoteAccountingProfileSettingDto,
  syncedAt: string,
): AccountingProfileSetting => ({
  id: 'default',
  accounting_profile: remote.accounting_profile as AccountingProfileCode,
  industry_extension: remote.industry_extension as IndustryExtensionCode,
  template_id: optionalString(remote.template_id),
  locked_after_transaction: remote.locked_after_transaction ?? undefined,
  created_at: remote.created_at,
  updated_at: remote.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remote.updated_at,
});

export const mergeRemoteAccountingProfileSettingIntoDexie = async (
  remote: RemoteAccountingProfileSettingDto | null,
  syncedAt = new Date().toISOString(),
): Promise<AccountingSettingReadSyncResult> => {
  const result = { ...EMPTY_RESULT, fetched: remote ? 1 : 0 };
  if (!remote) return result;

  await db.transaction('rw', db.accountingProfileSetting, async () => {
    const local = await db.accountingProfileSetting.get('default');
    if (!shouldApplyRemote(local, remote.updated_at)) {
      result.skipped += 1;
      return;
    }
    await db.accountingProfileSetting.put(mapRemoteAccountingProfileSettingToLocal(remote, syncedAt));
    if (local) result.updated += 1;
    else result.inserted += 1;
  });

  return result;
};

export const refreshAccountingProfileSettingFromPostgres = async (): Promise<AccountingSettingReadSyncResult> => {
  if (!canReadFromPostgres()) return { ...EMPTY_RESULT };
  return mergeRemoteAccountingProfileSettingIntoDexie(await accountingProfileSettingPostgresAdapter.get());
};

// ---- Enabled modules ----

const mapRemoteEnabledModuleToLocal = (
  remote: RemoteEnabledModuleDto,
  syncedAt: string,
): EnabledModule => ({
  id: remote.id,
  code: remote.code as AccountingModuleCode,
  is_enabled: remote.is_enabled,
  source: remote.source as EnabledModule['source'],
  requires_profile: remote.requires_profile
    ? (remote.requires_profile as AccountingProfileCode)
    : undefined,
  requires_extension: remote.requires_extension
    ? (remote.requires_extension as IndustryExtensionCode)
    : undefined,
  created_at: remote.created_at,
  updated_at: remote.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remote.updated_at,
});

export const mergeRemoteEnabledModulesIntoDexie = async (
  remoteModules: RemoteEnabledModuleDto[],
  syncedAt = new Date().toISOString(),
): Promise<AccountingSettingReadSyncResult> => {
  const result = { ...EMPTY_RESULT, fetched: remoteModules.length };
  if (remoteModules.length === 0) return result;

  await db.transaction('rw', db.enabledModules, async () => {
    const toPut: EnabledModule[] = [];
    for (const remote of remoteModules) {
      const local = await db.enabledModules.get(remote.id);
      if (!shouldApplyRemote(local, remote.updated_at)) {
        result.skipped += 1;
        continue;
      }
      toPut.push(mapRemoteEnabledModuleToLocal(remote, syncedAt));
      if (local) result.updated += 1;
      else result.inserted += 1;
    }
    if (toPut.length > 0) await db.enabledModules.bulkPut(toPut);
  });

  return result;
};

export const refreshEnabledModulesFromPostgres = async (): Promise<AccountingSettingReadSyncResult> => {
  if (!canReadFromPostgres()) return { ...EMPTY_RESULT };
  return mergeRemoteEnabledModulesIntoDexie(await enabledModulePostgresAdapter.list());
};

// ---- General ledger setting (singleton) ----

const mapRemoteGeneralLedgerSettingToLocal = (
  remote: RemoteGeneralLedgerSettingDto,
  syncedAt: string,
): GeneralLedgerSetting => ({
  id: 'default',
  is_ready: remote.is_ready,
  cutoff_date: optionalString(remote.cutoff_date),
  inventory_policy: remote.inventory_policy as InventoryAccountingPolicy,
  opening_balance_journal_id: optionalString(remote.opening_balance_journal_id),
  activated_at: optionalString(remote.activated_at),
  created_at: remote.created_at,
  updated_at: remote.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remote.updated_at,
});

export const mergeRemoteGeneralLedgerSettingIntoDexie = async (
  remote: RemoteGeneralLedgerSettingDto | null,
  syncedAt = new Date().toISOString(),
): Promise<AccountingSettingReadSyncResult> => {
  const result = { ...EMPTY_RESULT, fetched: remote ? 1 : 0 };
  if (!remote) return result;

  await db.transaction('rw', db.generalLedgerSetting, async () => {
    const local = await db.generalLedgerSetting.get('default');
    if (!shouldApplyRemote(local, remote.updated_at)) {
      result.skipped += 1;
      return;
    }
    await db.generalLedgerSetting.put(mapRemoteGeneralLedgerSettingToLocal(remote, syncedAt));
    if (local) result.updated += 1;
    else result.inserted += 1;
  });

  return result;
};

export const refreshGeneralLedgerSettingFromPostgres = async (): Promise<AccountingSettingReadSyncResult> => {
  if (!canReadFromPostgres()) return { ...EMPTY_RESULT };
  return mergeRemoteGeneralLedgerSettingIntoDexie(await generalLedgerSettingPostgresAdapter.get());
};

// ---- Accounting initial setup setting (singleton) ----

const mapRemoteAccountingInitialSetupSettingToLocal = (
  remote: RemoteAccountingInitialSetupSettingDto,
  syncedAt: string,
): AccountingInitialSetupSetting => ({
  id: 'default',
  business_template_code: isAccountingBusinessTemplateCode(remote.business_template_code)
    ? remote.business_template_code
    : 'RETAIL',
  accounting_profile: remote.accounting_profile as AccountingProfileCode,
  industry_extension: remote.industry_extension as IndustryExtensionCode,
  template_id: remote.template_id,
  cutoff_date: remote.cutoff_date,
  fiscal_period_start: remote.fiscal_period_start,
  fiscal_period_end: remote.fiscal_period_end,
  current_period_start: remote.current_period_start,
  current_period_end: remote.current_period_end,
  current_period_id: optionalString(remote.current_period_id),
  base_currency_code: remote.base_currency_code,
  inventory_policy: remote.inventory_policy as InventoryAccountingPolicy,
  setup_completed_at: optionalString(remote.setup_completed_at),
  setup_completed_by: optionalString(remote.setup_completed_by),
  setup_completed_by_name: optionalString(remote.setup_completed_by_name),
  version: toPositiveVersion(remote.version),
  created_at: remote.created_at,
  updated_at: remote.updated_at,
  sync_status: 'synced',
  sync_error: undefined,
  last_synced_at: syncedAt,
  remote_updated_at: remote.updated_at,
});

export const mergeRemoteAccountingInitialSetupSettingIntoDexie = async (
  remote: RemoteAccountingInitialSetupSettingDto | null,
  syncedAt = new Date().toISOString(),
): Promise<AccountingSettingReadSyncResult> => {
  const result = { ...EMPTY_RESULT, fetched: remote ? 1 : 0 };
  if (!remote) return result;

  await db.transaction('rw', db.accountingInitialSetupSetting, async () => {
    const local = await db.accountingInitialSetupSetting.get('default');
    if (!shouldApplyRemote(local, remote.updated_at)) {
      result.skipped += 1;
      return;
    }
    await db.accountingInitialSetupSetting.put(
      mapRemoteAccountingInitialSetupSettingToLocal(remote, syncedAt),
    );
    if (local) result.updated += 1;
    else result.inserted += 1;
  });

  return result;
};

export const refreshAccountingInitialSetupSettingFromPostgres =
  async (): Promise<AccountingSettingReadSyncResult> => {
    if (!canReadFromPostgres()) return { ...EMPTY_RESULT };
    return mergeRemoteAccountingInitialSetupSettingIntoDexie(
      await accountingInitialSetupSettingPostgresAdapter.get(),
    );
  };
