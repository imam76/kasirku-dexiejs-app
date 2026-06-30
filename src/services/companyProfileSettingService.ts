import { db } from '@/lib/db';
import type { CompanyProfileSetting } from '@/types';
import {
  companyProfileSettingPostgresAdapter,
  isTauriRuntime,
  type RemoteCompanyProfileSettingDto,
} from './postgresAdapter';

export const DEFAULT_COMPANY_PROFILE_SETTING_ID = 'default';

export type CompanyProfileSettingInput = {
  company_name?: string;
  logo_data_url?: string;
  logo_file_name?: string;
  logo_mime_type?: string;
  logo_size?: number;
};

const buildDefaultCompanyProfileSetting = (now: string): CompanyProfileSetting => ({
  id: DEFAULT_COMPANY_PROFILE_SETTING_ID,
  created_at: now,
  updated_at: now,
});

const normalizeCompanyName = (value?: string) => value?.trim() || undefined;
const optionalRemoteString = (value?: string | null) => value || undefined;

const toTimestamp = (value: string) => {
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : timestamp;
};

const hasCompanyProfileContent = (profile: CompanyProfileSetting) => (
  Boolean(
    profile.company_name ||
    profile.logo_data_url ||
    profile.logo_file_name ||
    profile.logo_mime_type ||
    profile.logo_size,
  )
);

const mapRemoteCompanyProfileSettingToLocal = (
  remote: RemoteCompanyProfileSettingDto,
): CompanyProfileSetting => ({
  id: DEFAULT_COMPANY_PROFILE_SETTING_ID,
  company_name: normalizeCompanyName(remote.companyName ?? undefined),
  logo_data_url: optionalRemoteString(remote.logoDataUrl),
  logo_file_name: optionalRemoteString(remote.logoFileName),
  logo_mime_type: optionalRemoteString(remote.logoMimeType),
  logo_size: remote.logoSize ?? undefined,
  created_at: remote.createdAt,
  updated_at: remote.updatedAt,
});

const mapLocalCompanyProfileSettingToRemote = (
  setting: CompanyProfileSetting,
): RemoteCompanyProfileSettingDto => ({
  id: setting.id,
  companyName: setting.company_name ?? null,
  logoDataUrl: setting.logo_data_url ?? null,
  logoFileName: setting.logo_file_name ?? null,
  logoMimeType: setting.logo_mime_type ?? null,
  logoSize: setting.logo_size ?? null,
  createdAt: setting.created_at,
  updatedAt: setting.updated_at,
});

const shouldApplyRemoteSetting = (
  local: CompanyProfileSetting,
  remote: CompanyProfileSetting,
) => {
  if (!hasCompanyProfileContent(local) && hasCompanyProfileContent(remote)) {
    return true;
  }

  const localTimestamp = toTimestamp(local.updated_at);
  const remoteTimestamp = toTimestamp(remote.updated_at);

  if (localTimestamp !== null && remoteTimestamp !== null) {
    return remoteTimestamp >= localTimestamp;
  }

  return remote.updated_at >= local.updated_at;
};

const shouldPushLocalSetting = (
  local: CompanyProfileSetting,
  remote: CompanyProfileSetting,
) => {
  if (!hasCompanyProfileContent(local)) return false;

  const localTimestamp = toTimestamp(local.updated_at);
  const remoteTimestamp = toTimestamp(remote.updated_at);

  if (localTimestamp !== null && remoteTimestamp !== null) {
    return localTimestamp > remoteTimestamp;
  }

  return local.updated_at > remote.updated_at;
};

const syncCompanyProfileSettingFromPostgres = async (
  local: CompanyProfileSetting,
): Promise<CompanyProfileSetting> => {
  if (!isTauriRuntime()) return local;

  try {
    const remote = await companyProfileSettingPostgresAdapter.get();
    if (!remote) {
      if (hasCompanyProfileContent(local)) {
        await companyProfileSettingPostgresAdapter.upsert(
          mapLocalCompanyProfileSettingToRemote(local),
        );
      }
      return local;
    }

    const remoteSetting = mapRemoteCompanyProfileSettingToLocal(remote);
    if (shouldApplyRemoteSetting(local, remoteSetting)) {
      await db.companyProfileSetting.put(remoteSetting);
      return remoteSetting;
    }

    if (shouldPushLocalSetting(local, remoteSetting)) {
      await companyProfileSettingPostgresAdapter.upsert(
        mapLocalCompanyProfileSettingToRemote(local),
      );
    }

    return local;
  } catch (error) {
    console.error('Failed to sync company profile setting from PostgreSQL:', error);
    return local;
  }
};

const syncSavedCompanyProfileSettingToPostgres = async (
  setting: CompanyProfileSetting,
): Promise<CompanyProfileSetting> => {
  if (!isTauriRuntime()) return setting;

  try {
    const remote = await companyProfileSettingPostgresAdapter.upsert(
      mapLocalCompanyProfileSettingToRemote(setting),
    );
    if (!remote) return setting;

    const syncedSetting = mapRemoteCompanyProfileSettingToLocal(remote);
    await db.companyProfileSetting.put(syncedSetting);
    return syncedSetting;
  } catch (error) {
    console.error('Failed to sync company profile setting to PostgreSQL:', error);
    const reason = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Identitas tersimpan lokal, tetapi gagal disimpan ke database: ${reason}`);
  }
};

export const ensureCompanyProfileSetting = async (): Promise<CompanyProfileSetting> => {
  const existing = await db.companyProfileSetting.get(DEFAULT_COMPANY_PROFILE_SETTING_ID);
  if (existing) return existing;

  const now = new Date().toISOString();
  const setting = buildDefaultCompanyProfileSetting(now);
  await db.companyProfileSetting.put(setting);
  return setting;
};

export const getCompanyProfileSetting = async (): Promise<CompanyProfileSetting> => {
  const local = await ensureCompanyProfileSetting();
  return syncCompanyProfileSettingFromPostgres(local);
};

export const saveCompanyProfileSetting = async (
  input: CompanyProfileSettingInput,
): Promise<CompanyProfileSetting> => {
  const current = await ensureCompanyProfileSetting();
  const now = new Date().toISOString();
  const setting: CompanyProfileSetting = {
    ...current,
    company_name: normalizeCompanyName(input.company_name),
    logo_data_url: input.logo_data_url,
    logo_file_name: input.logo_file_name,
    logo_mime_type: input.logo_mime_type,
    logo_size: input.logo_size,
    updated_at: now,
  };

  await db.companyProfileSetting.put(setting);
  return syncSavedCompanyProfileSettingToPostgres(setting);
};
