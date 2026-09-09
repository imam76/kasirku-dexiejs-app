import { z } from 'zod';
import {
  accessSchema,
  consentSchema,
  registrationSchema,
  type Access,
  type Consent,
  type Registration,
} from './contract';
import { getPlanModules, type PlanId } from './catalog';
import { DAY_MS, TRIAL_DAYS } from './contract';
import {
  PRIVACY_TEXT,
  PRIVACY_VERSION,
  TERMS_TEXT,
  TERMS_VERSION,
} from './legal';

export const SUBSCRIPTION_KEY = 'frayukti-subscription-v1';
export const SUBSCRIPTION_EVENT = 'frayukti-subscription-changed';
const subscriptionSchema = z.object({
  version: z.literal(1),
  installationId: z.uuid(),
  businessId: z.uuid().optional(),
  token: z.string().regex(/^[a-f0-9]{64}$/),
  recoveryCode: z.string().regex(/^[a-f0-9]{64}$/),
  registration: registrationSchema,
  consent: consentSchema,
  access: accessSchema,
  originalTrial: accessSchema.optional(),
  leadPending: z.boolean(),
  consentPending: z.boolean(),
  reminderDismissed: z.string().nullable(),
});
export type Subscription = z.infer<typeof subscriptionSchema>;
export function readSubscription(): Subscription | null {
  try {
    const raw = localStorage.getItem(SUBSCRIPTION_KEY);
    if (!raw) return null;
    return subscriptionSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}
export function writeSubscription(value: Subscription) {
  localStorage.setItem(
    SUBSCRIPTION_KEY,
    JSON.stringify(subscriptionSchema.parse(value)),
  );
  window.dispatchEvent(new Event(SUBSCRIPTION_EVENT));
}
export function updateSubscription(patch: Partial<Subscription>) {
  const current = readSubscription();
  if (current) writeSubscription({ ...current, ...patch });
}
export const randomSecret = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (v) =>
    v.toString(16).padStart(2, '0'),
  ).join('');
export async function digestText(value: string) {
  const hash = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(hash), (v) =>
    v.toString(16).padStart(2, '0'),
  ).join('');
}
export async function makeConsent(marketing: boolean): Promise<Consent> {
  const now = new Date().toISOString();
  return {
    termsVersion: TERMS_VERSION,
    termsHash: await digestText(TERMS_TEXT),
    privacyVersion: PRIVACY_VERSION,
    privacyHash: await digestText(PRIVACY_TEXT),
    acceptedAt: now,
    marketing,
    marketingUpdatedAt: now,
  };
}
export async function createTrial(
  registration: Registration,
  plan: PlanId,
  modules: string[],
  marketing: boolean,
): Promise<Subscription> {
  const now = Date.now();
  const access: Access = {
    kind: 'trial',
    plan,
    modules: getPlanModules(plan, modules),
    start: new Date(now).toISOString(),
    end: new Date(now + TRIAL_DAYS * DAY_MS).toISOString(),
  };
  return {
    version: 1,
    installationId: crypto.randomUUID(),
    token: randomSecret(),
    recoveryCode: randomSecret(),
    registration: registrationSchema.parse(registration),
    consent: await makeConsent(marketing),
    access,
    originalTrial: access,
    leadPending: true,
    consentPending: false,
    reminderDismissed: null,
  };
}
