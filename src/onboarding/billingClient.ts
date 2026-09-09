import { z } from 'zod';
import {
  billingStatusSchema,
  reminderDate,
  type BillingStatus,
} from './contract';
import {
  readSubscription,
  updateSubscription,
  writeSubscription,
  randomSecret,
  type Subscription,
} from './storage';
import type { PlanId } from './catalog';
import { isTauriRuntime } from '@/utils/export/platform';
import {
  SETUP_CONFIG_CHANGED_EVENT,
  CURRENT_MODULE_CATALOG_VERSION,
  saveSetupConfig,
} from '@/services/setupKeyService';

const meta = import.meta as unknown as { env?: Record<string, string> };
export const BILLING_URL = (
  meta.env?.VITE_BILLING_API_URL ?? 'http://localhost:8787'
).replace(/\/$/, '');
async function api(
  path: string,
  body?: unknown,
  token?: string,
  method = 'POST',
) {
  const url = new URL(BILLING_URL);
  if (
    url.protocol !== 'https:' &&
    !['localhost', '127.0.0.1'].includes(url.hostname)
  )
    throw new Error('Layanan billing harus memakai HTTPS.');
  const response = await fetch(`${BILLING_URL}${path}`, {
    method: body === undefined ? 'GET' : method,
    signal: AbortSignal.timeout(12_000),
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
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
  if (local.leadPending && local.originalTrial) {
    const result = z.object({ businessId: z.uuid() }).parse(
      await api('/v1/registrations', {
        installationId,
        token: local.token,
        recoveryCode: local.recoveryCode,
        registration: local.registration,
        consent: local.consent,
        access: local.originalTrial,
      }),
    );
    if (!sameIdentity()) return null;
    updateSubscription({ businessId: result.businessId, leadPending: false });
  }
  local = readSubscription()!;
  if (local.consentPending) {
    const sentAt = local.consent.marketingUpdatedAt;
    await api('/v1/consent', local.consent, local.token, 'PATCH');
    if (!sameIdentity()) return null;
    if (readSubscription()?.consent.marketingUpdatedAt === sentAt)
      updateSubscription({ consentPending: false });
  }
  const status = billingStatusSchema.parse(
    await api('/v1/status', undefined, local.token),
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
        local.token,
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
  const token = randomSecret();
  await api('/v1/recovery', { recoveryCode: recoveryCode.trim(), token });
  const status = billingStatusSchema.parse(
    await api('/v1/status', undefined, token),
  );
  // Recovery restores existing acceptance, never invents new acceptance or grants a local user role.
  const consentResult = z
    .object({ consent: z.unknown() })
    .parse(await api('/v1/consent', undefined, token));
  const { consentSchema } = await import('./contract');
  const recovered: Subscription = {
    version: 1,
    installationId: crypto.randomUUID(),
    businessId: status.businessId,
    token,
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
