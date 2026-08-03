import { expect, test } from '@playwright/test';

test.describe('identitas perusahaan', () => {
  test('tetap tersimpan lokal saat PostgreSQL tidak tersedia', async ({ page }) => {
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const tauriWindow = window as typeof window & {
        __TAURI_INTERNALS__?: {
          invoke: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
        };
      };
      const previousTauriInternals = tauriWindow.__TAURI_INTERNALS__;
      let remoteSaveAttempts = 0;
      let recoveredCompanyName: string | null = null;

      const tauriInternals = {
        invoke: async (command: string) => {
          if (command === 'postgres_upsert_company_profile_setting') {
            remoteSaveAttempts += 1;
            throw {
              code: 'postgres_unavailable',
              status: 'unreachable',
              message: 'PostgreSQL is unavailable.',
            };
          }

          return null;
        },
      };
      tauriWindow.__TAURI_INTERNALS__ = tauriInternals;

      try {
        const { db } = await import('/src/lib/db.ts');
        const { getCompanyProfileSetting, saveCompanyProfileSetting } = await import(
          '/src/services/companyProfileSettingService.ts'
        );
        const saved = await saveCompanyProfileSetting({
          company_name: '  PT Offline Sejahtera  ',
        });
        const local = await db.companyProfileSetting.get('default');
        const offlineRemoteSaveAttempts = remoteSaveAttempts;

        tauriInternals.invoke = async (command, args) => {
          if (command === 'postgres_get_company_profile_setting') return null;

          if (command === 'postgres_upsert_company_profile_setting') {
            const input = args?.input as { companyName?: string | null };
            recoveredCompanyName = input.companyName ?? null;
            return input;
          }

          return null;
        };
        await getCompanyProfileSetting();

        return {
          savedCompanyName: saved.company_name,
          localCompanyName: local?.company_name,
          offlineRemoteSaveAttempts,
          recoveredCompanyName,
        };
      } finally {
        if (previousTauriInternals) {
          tauriWindow.__TAURI_INTERNALS__ = previousTauriInternals;
        } else {
          delete tauriWindow.__TAURI_INTERNALS__;
        }
      }
    });

    expect(result).toEqual({
      savedCompanyName: 'PT Offline Sejahtera',
      localCompanyName: 'PT Offline Sejahtera',
      offlineRemoteSaveAttempts: 1,
      recoveredCompanyName: 'PT Offline Sejahtera',
    });
  });
});
