import { z } from 'zod';
import { PLAN_IDS } from './catalog';
import { initialState, PAYMENT_METHODS, SCREENS, type FlowState } from './model';

// Only this namespace is written. No setup, auth, consent, entitlement or Dexie stores are accessed.
export const PREVIEW_STORAGE_KEY = 'frayukti:onboarding-preview:v1';
const date = z.iso.date();
const access = z.object({ kind: z.enum(['none', 'trial', 'subscription']), start: z.union([date, z.literal('')]), end: z.union([date, z.literal('')]), plan: z.enum(PLAN_IDS), modules: z.array(z.string()) });
const snapshotSchema = z.object({
  registration: z.object({ owner: z.string(), business: z.string(), whatsapp: z.string(), businessType: z.string(), email: z.string(), location: z.string() }),
  plan: z.enum(PLAN_IDS).nullable(), customModules: z.array(z.string()),
  accounting: z.object({ businessTemplateCode: z.enum(['RETAIL', 'COOPERATIVE', 'GENERAL_TRADING', 'GENERAL_SERVICE']), cutoffDate: z.string(), fiscalPeriodStart: z.string(), fiscalPeriodEnd: z.string(), currentPeriodStart: z.string(), currentPeriodEnd: z.string(), baseCurrencyCode: z.string() }),
  accountingMode: z.enum(['default', 'configure']),
  consent: z.object({ terms: z.boolean(), privacy: z.boolean(), marketing: z.boolean() }),
  onboarding: z.enum(['not-started', 'in-progress', 'complete']), access,
  payment: z.object({ status: z.enum(['idle', 'pending', 'success', 'failed', 'cancelled']), activation: z.enum(['none', 'waiting', 'received']), orderId: z.string(), entitlement: access.nullable(), method: z.enum(PAYMENT_METHODS).default('qris'), amount: z.number().nonnegative().default(0) }),
  paymentMethod: z.enum(PAYMENT_METHODS).default('qris'),
  recovery: z.enum(['idle', 'success', 'failed', 'offline']), offline: z.boolean(), now: date,
  reminderDismissed: date.nullable(), screen: z.enum(SCREENS),
});
export function readPreviewState(storage: Pick<Storage, 'getItem'>): FlowState {
  try {
    const result = snapshotSchema.safeParse(JSON.parse(storage.getItem(PREVIEW_STORAGE_KEY) ?? 'null'));
    return result.success ? { ...result.data, overlay: null, errors: {} } : initialState();
  } catch { return initialState(); }
}
export function savePreviewState(storage: Pick<Storage, 'setItem'>, state: FlowState): boolean {
  try { storage.setItem(PREVIEW_STORAGE_KEY, JSON.stringify({ ...state, overlay: null, errors: {} })); return true; }
  catch { return false; }
}
