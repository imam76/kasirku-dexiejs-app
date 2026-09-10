import { describe, expect, test } from 'bun:test';
import {
  authorizeSupabaseClient,
  requiresSupabaseApiKey,
} from '../../services/billing/supabase/functions/billing/index';

const publishableKey = 'sb_publishable_billing_test_key';
const authEnv = {
  url: 'https://billing-test.supabase.co',
  publishableKeys: { default: publishableKey },
  secretKeys: { default: 'sb_secret_billing_test_key' },
  jwks: null,
};

describe('@supabase/server billing edge auth', () => {
  test('keeps only operational public routes outside the API-key gate', () => {
    const request = (method: string, path: string) => ({
      method,
      url: `https://billing-test.supabase.co/functions/v1/billing${path}`,
    });

    expect(requiresSupabaseApiKey(request('OPTIONS', '/v1/status'))).toBe(false);
    expect(requiresSupabaseApiKey(request('GET', '/health'))).toBe(false);
    expect(requiresSupabaseApiKey(request('GET', '/payment/finish'))).toBe(false);
    expect(
      requiresSupabaseApiKey(request('POST', '/v1/midtrans/notifications')),
    ).toBe(false);
    expect(requiresSupabaseApiKey(request('POST', '/v1/registrations'))).toBe(
      true,
    );
    expect(requiresSupabaseApiKey(request('GET', '/v1/status'))).toBe(true);
  });

  test('accepts the configured publishable key in the apikey header', async () => {
    const response = await authorizeSupabaseClient(
      new Request('https://billing-test.supabase.co/v1/status', {
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${'a'.repeat(64)}`,
        },
      }),
      authEnv,
    );

    expect(response).toBeNull();
  });

  test('rejects missing and invalid publishable keys before Fastify', async () => {
    for (const headers of [
      { Authorization: `Bearer ${'a'.repeat(64)}` },
      { apikey: 'sb_publishable_wrong_project' },
    ]) {
      const response = await authorizeSupabaseClient(
        new Request('https://billing-test.supabase.co/v1/status', { headers }),
        authEnv,
      );

      expect(response?.status).toBe(401);
      expect(await response?.json()).toMatchObject({
        error: 'Akses API billing tidak valid.',
      });
    }
  });
});
