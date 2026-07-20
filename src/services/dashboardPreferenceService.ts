import { db } from '@/lib/db';
import type { DashboardPreference } from '@/types';
import {
  getDefaultDashboardPreference,
  normalizeDashboardPreference,
} from '@/utils/dashboardPreferences';

export const getDashboardPreferenceId = (userId: string) => `dashboard:${userId}`;

export const getDashboardPreference = async (userId: string): Promise<DashboardPreference> => {
  const preference = await db.dashboardPreferences.get(getDashboardPreferenceId(userId));
  return normalizeDashboardPreference(preference, userId);
};

export const saveDashboardPreference = async (
  userId: string,
  preference: DashboardPreference,
): Promise<DashboardPreference> => {
  const normalized = normalizeDashboardPreference({
    ...preference,
    user_id: userId,
    updated_at: new Date().toISOString(),
  }, userId);

  await db.dashboardPreferences.put(normalized);
  return normalized;
};

export const resetDashboardPreference = async (userId: string): Promise<DashboardPreference> => {
  const defaultPreference = getDefaultDashboardPreference(userId);
  await db.dashboardPreferences.put(defaultPreference);
  return defaultPreference;
};
