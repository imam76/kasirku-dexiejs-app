import { db } from '@/lib/db';
import type { CompanyProfileSetting } from '@/types';

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

export const ensureCompanyProfileSetting = async (): Promise<CompanyProfileSetting> => {
  const existing = await db.companyProfileSetting.get(DEFAULT_COMPANY_PROFILE_SETTING_ID);
  if (existing) return existing;

  const now = new Date().toISOString();
  const setting = buildDefaultCompanyProfileSetting(now);
  await db.companyProfileSetting.put(setting);
  return setting;
};

export const getCompanyProfileSetting = async (): Promise<CompanyProfileSetting> => {
  return ensureCompanyProfileSetting();
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
  return setting;
};
