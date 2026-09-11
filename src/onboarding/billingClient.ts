import { z } from 'zod';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  billingStatusSchema,
  reminderDate,
  type BillingStatus,
} from './contract';
import {
  readSubscription,
  updateSubscription,
  writeSubscription,
  type Subscription,
} from './storage';
import type { PlanId } from './catalog';
import { isTauriRuntime } from '@/utils/export/platform';
import { hasActiveOwner } from '@/auth/authService';
import { requireSubscriptionOwner } from './ownerAccess';
import {
  SETUP_CONFIG_CHANGED_EVENT,
  CURRENT_MODULE_CATALOG_VERSION,
  saveSetupConfig,
} from '@/services/setupKeyService';

const rawBillingUrl = import.meta.env.VITE_BILLING_API_URL;
const configuredBillingUrl =
  typeof rawBillingUrl === 'string' ? rawBillingUrl.trim() : '';
const rawBillingPublishableKey =
  import.meta.env.VITE_BILLING_SUPABASE_PUBLISHABLE_KEY;
const billingPublishableKey =
  typeof rawBillingPublishableKey === 'string'
    ? rawBillingPublishableKey.trim()
    : '';
export const BILLING_URL = (
  configuredBillingUrl ||
  (import.meta.env.DEV
    ? 'http://127.0.0.1:54321/functions/v1/billing'
    : '')
).replace(/\/$/, '');

const BILLING_AUTH_STORAGE_KEY = 'frayukti-billing-supabase-auth-v1';
let billingSupabase: SupabaseClient | null = null;

function billingSupabaseSettings() {
  if (!BILLING_URL || !billingPublishableKey)
    throw new Error(
      'Supabase Auth billing belum dikonfigurasi pada build aplikasi.',
    );
  const functionUrl = new URL(BILLING_URL);
  const marker = '/functions/v1/billing';
  const local = ['localhost', '127.0.0.1'].includes(functionUrl.hostname);
  if (!local && !functionUrl.pathname.endsWith(marker))
    throw new Error('URL billing Supabase tidak valid.');
  return { url: functionUrl.origin, key: billingPublishableKey };
}

function getBillingSupabase() {
  if (billingSupabase) return billingSupabase;
  const { url, key } = billingSupabaseSettings();
  billingSupabase = createClient(url, key, {
    auth: {
      storageKey: BILLING_AUTH_STORAGE_KEY,
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
    },
  });
  return billingSupabase;
}

async function requireBillingAccessToken(client = getBillingSupabase()) {
  const current = await client.auth.getSession();
  if (current.error) throw current.error;
  if (current.data.session?.access_token)
    return current.data.session.access_token;

  const signedIn = await client.auth.signInAnonymously();
  if (signedIn.error || !signedIn.data.session)
    throw new Error(
      `Tidak dapat membuat sesi Supabase billing. Pastikan Anonymous Sign-Ins aktif.${signedIn.error ? ` ${signedIn.error.message}` : ''}`,
    );
  return signedIn.data.session.access_token;
}

class BillingApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function api(
  path: string,
  body?: unknown,
  method = 'POST',
  timeoutMs = 12_000,
  accessToken?: string,
) {
  if (!BILLING_URL)
    throw new Error(
      'URL layanan billing belum dikonfigurasi pada build aplikasi.',
    );
  const url = new URL(BILLING_URL);
  if (
    url.protocol !== 'https:' &&
    !['localhost', '127.0.0.1'].includes(url.hostname)
  )
    throw new Error('Layanan billing harus memakai HTTPS.');
  const resolvedAccessToken =
    accessToken ?? (await requireBillingAccessToken());
  const response = await fetch(`${BILLING_URL}${path}`, {
    method: body === undefined ? 'GET' : method,
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      'Content-Type': 'application/json',
      apikey: billingPublishableKey,
      Authorization: `Bearer ${resolvedAccessToken}`,
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 401 && accessToken === undefined) {
    const refreshed = await getBillingSupabase().auth.refreshSession();
    if (
      !refreshed.error &&
      refreshed.data.session?.access_token &&
      refreshed.data.session.access_token !== resolvedAccessToken
    )
      return api(
        path,
        body,
        method,
        timeoutMs,
        refreshed.data.session.access_token,
      );
  }
  const result = await response.json();
  if (!response.ok)
    throw new BillingApiError(
      response.status,
      typeof result.error === 'string'
        ? result.error
        : 'Layanan billing tidak tersedia.',
    );
  return result;
}
export function applySubscriptionModules(subscription: Subscription) {
  saveSetupConfig({
    enabledModules: subscription.access.modules,
    configuredBy: `subscription:${subscription.businessId ?? subscription.installationId}`,
    configuredAt: new Date().toISOString(),
    moduleCatalogVersion: CURRENT_MODULE_CATALOG_VERSION,
  });
}
let syncing: Promise<BillingStatus | null> | null = null;
export function syncBilling(): Promise<BillingStatus | null> {
  if (syncing) return syncing;
  syncing = sync().finally(() => {
    syncing = null;
  });
  return syncing;
}
async function sync(): Promise<BillingStatus | null> {
  let local = readSubscription();
  if (!local || navigator.onLine === false) return null;
  const installationId = local.installationId;
  const sameIdentity = () =>
    readSubscription()?.installationId === installationId;
  let status: BillingStatus | undefined;
  if (local.leadPending && local.originalTrial) {
    const result = z.object({ businessId: z.uuid() }).parse(
      await api('/v1/registrations', {
        installationId,
        recoveryCode: local.recoveryCode,
        registration: local.registration,
        consent: local.consent,
        access: local.originalTrial,
      }),
    );
    if (!sameIdentity()) return null;
    updateSubscription({ businessId: result.businessId, leadPending: false });
  } else {
    try {
      status = billingStatusSchema.parse(
        await api('/v1/status', undefined, 'GET'),
      );
    } catch (error) {
      if (!(error instanceof BillingApiError) || error.status !== 401)
        throw error;
      // One-time migration from the old installation-token design: prove
      // ownership with the existing recovery code and bind this Supabase user.
      await api('/v1/recovery', { recoveryCode: local.recoveryCode });
    }
  }
  if (!sameIdentity()) return null;
  local = readSubscription()!;
  if (local.consentPending) {
    const sentAt = local.consent.marketingUpdatedAt;
    try {
      await api('/v1/consent', local.consent, 'PATCH');
      if (!sameIdentity()) return null;
      if (readSubscription()?.consent.marketingUpdatedAt === sentAt)
        updateSubscription({ consentPending: false });
    } catch {
      // Keep the preference queued for retry. A leads/consent outage must not
      // block reading paid access or preparing a checkout for a registered business.
    }
    if (!sameIdentity()) return null;
  }
  status ??= billingStatusSchema.parse(
    await api('/v1/status', undefined, 'GET'),
  );
  if (!sameIdentity()) return null;
  const current = readSubscription()!;
  // A missing/stale server activation never shortens a paid period already received locally.
  const keepPaid =
    current.access.kind === 'subscription' &&
    (status.access.kind !== 'subscription' ||
      Date.parse(status.access.end) < Date.parse(current.access.end));
  const paymentActivated =
    status.access.kind === 'subscription' &&
    (current.access.kind !== 'subscription' ||
      Date.parse(status.access.end) > Date.parse(current.access.end));
  updateSubscription({
    businessId: status.businessId,
    access: keepPaid ? current.access : status.access,
    ...(paymentActivated ? { reminderDismissed: reminderDate() } : {}),
  });
  window.dispatchEvent(new Event(SETUP_CONFIG_CHANGED_EVENT));
  return status;
}
export async function requestCheckout(
  plan: PlanId,
  customModules: string[],
  requestId: string,
) {
  await syncBilling();
  const local = readSubscription();
  if (!local?.businessId)
    throw new Error('Hubungkan layanan billing saat online terlebih dahulu.');
  return z
    .object({
      orderId: z.string(),
      redirectUrl: z.url(),
      amount: z.number().positive(),
    })
    .parse(
      await api(
        '/v1/checkouts',
        { plan, customModules, requestId },
        'POST',
        30_000,
      ),
    );
}
export async function openCheckout(url: string) {
  const parsed = new URL(url);
  if (
    parsed.origin !== 'https://app.sandbox.midtrans.com' ||
    !parsed.pathname.startsWith('/snap/')
  )
    throw new Error('URL checkout tidak valid.');
  if (isTauriRuntime()) {
    const { openUrl } = await import('@tauri-apps/plugin-opener');
    await openUrl(url);
  } else {
    const opened = window.open(url, '_blank', 'noopener,noreferrer');
    // Some browsers return null for noopener; the explicit checkout link stays available in the UI.
    void opened;
  }
}
export async function recoverSubscription(
  recoveryCode: string,
): Promise<Subscription> {
  // A fresh installation can recover before creating its first local Owner.
  if (await hasActiveOwner()) await requireSubscriptionOwner();
  const { url, key } = billingSupabaseSettings();
  const recoveryClient = createClient(url, key, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const signedIn = await recoveryClient.auth.signInAnonymously();
  if (signedIn.error || !signedIn.data.session)
    throw new Error(
      `Tidak dapat membuat identitas pemulihan Supabase.${signedIn.error ? ` ${signedIn.error.message}` : ''}`,
    );
  const recoveryToken = signedIn.data.session.access_token;
  await api(
    '/v1/recovery',
    { recoveryCode: recoveryCode.trim() },
    'POST',
    12_000,
    recoveryToken,
  );
  const status = billingStatusSchema.parse(
    await api('/v1/status', undefined, 'GET', 12_000, recoveryToken),
  );
  // Recovery restores existing acceptance, never invents new acceptance or grants a local user role.
  const consentResult = z
    .object({ consent: z.unknown() })
    .parse(await api('/v1/consent', undefined, 'GET', 12_000, recoveryToken));
  const adopted = await getBillingSupabase().auth.setSession({
    access_token: recoveryToken,
    refresh_token: signedIn.data.session.refresh_token,
  });
  if (adopted.error) throw adopted.error;
  const { consentSchema } = await import('./contract');
  const recovered: Subscription = {
    version: 2,
    installationId: crypto.randomUUID(),
    businessId: status.businessId,
    recoveryCode: recoveryCode.trim(),
    registration: status.registration,
    access: status.access,
    consent: consentSchema.parse(consentResult.consent),
    leadPending: false,
    consentPending: false,
    reminderDismissed: null,
  };
  writeSubscription(recovered);
  applySubscriptionModules(recovered);
  return recovered;
}

export async function revealRecoveryCode(): Promise<string> {
  await requireSubscriptionOwner();
  const subscription = readSubscription();
  if (!subscription) throw new Error('Identitas langganan belum tersedia.');
  return subscription.recoveryCode;
}
