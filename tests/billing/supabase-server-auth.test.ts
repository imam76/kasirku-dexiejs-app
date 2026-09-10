import { describe, expect, test } from 'bun:test';
import { generateKeyPairSync, randomUUID, sign } from 'node:crypto';
import {
  authorizeSupabaseUser,
  requiresSupabaseUser,
} from '../../services/billing/supabase/functions/billing/index';
import { isPublicBillingRoute } from '../../services/billing/supabase/functions/billing-public/index';

const publishableKey = 'sb_publishable_billing_test_key';
const keyId = 'billing-test-key';
const { publicKey, privateKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
});
const publicJwk = {
  ...publicKey.export({ format: 'jwk' }),
  alg: 'RS256',
  kid: keyId,
  use: 'sig',
};
const authEnv = {
  url: 'https://billing-test.supabase.co',
  publishableKeys: { default: publishableKey },
  secretKeys: { default: 'sb_secret_billing_test_key' },
  jwks: { keys: [publicJwk] },
};

function jwt(userId: string) {
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', kid: keyId, typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      role: 'authenticated',
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString('base64url');
  const content = `${header}.${payload}`;
  return `${content}.${sign('RSA-SHA256', Buffer.from(content), privateKey).toString('base64url')}`;
}

describe('@supabase/server billing Edge Function auth', () => {
  test('separates JWT routes from public operational routes', () => {
    const protectedRequest = (method: string, path: string) => ({
      method,
      url: `https://billing-test.supabase.co/functions/v1/billing${path}`,
    });
    const publicRequest = (method: string, path: string) => ({
      method,
      url: `https://billing-test.supabase.co/functions/v1/billing-public${path}`,
    });

    expect(requiresSupabaseUser(protectedRequest('OPTIONS', '/v1/status'))).toBe(
      false,
    );
    expect(requiresSupabaseUser(protectedRequest('GET', '/health'))).toBe(false);
    expect(
      requiresSupabaseUser(protectedRequest('POST', '/v1/registrations')),
    ).toBe(true);
    expect(requiresSupabaseUser(protectedRequest('GET', '/v1/status'))).toBe(
      true,
    );
    expect(isPublicBillingRoute(publicRequest('GET', '/health'))).toBe(true);
    expect(
      isPublicBillingRoute(
        publicRequest('POST', '/v1/midtrans/notifications'),
      ),
    ).toBe(true);
    expect(isPublicBillingRoute(publicRequest('GET', '/v1/status'))).toBe(false);
  });

  test('accepts a verified Supabase user JWT and returns its subject', async () => {
    const userId = randomUUID();
    const result = await authorizeSupabaseUser(
      new Request('https://billing-test.supabase.co/v1/status', {
        headers: {
          apikey: publishableKey,
          Authorization: `Bearer ${jwt(userId)}`,
        },
      }),
      authEnv,
    );

    expect(result).toEqual({ userId });
  });

  test('rejects a missing or installation-style bearer token', async () => {
    for (const headers of [
      { apikey: publishableKey },
      {
        apikey: publishableKey,
        Authorization: `Bearer ${'a'.repeat(64)}`,
      },
    ]) {
      const result = await authorizeSupabaseUser(
        new Request('https://billing-test.supabase.co/v1/status', { headers }),
        authEnv,
      );

      expect(result).toBeInstanceOf(Response);
      const response = result as Response;
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({
        error: 'Sesi Supabase tidak valid atau sudah berakhir.',
      });
    }
  });
});
