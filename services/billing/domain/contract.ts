import { z } from 'zod';
import { PLAN_IDS, getPlanModules } from './catalog.ts';

export const DAY_MS = 86_400_000;
export const TRIAL_DAYS = 90;
export const registrationSchema = z
  .object({
    owner: z.string().trim().min(2).max(100),
    business: z.string().trim().min(2).max(150),
    whatsapp: z
      .string()
      .trim()
      .regex(/^\+?[0-9][0-9\s()-]{7,19}$/),
    businessType: z.string().trim().min(1).max(100),
    email: z.union([z.literal(''), z.email().max(254)]).default(''),
    location: z.string().trim().max(250).default(''),
  })
  .strict();
export type Registration = z.infer<typeof registrationSchema>;
export const consentSchema = z
  .object({
    termsVersion: z.string().max(80),
    termsHash: z.string().regex(/^[a-f0-9]{64}$/),
    privacyVersion: z.string().max(80),
    privacyHash: z.string().regex(/^[a-f0-9]{64}$/),
    acceptedAt: z.iso.datetime(),
    marketing: z.boolean(),
    marketingUpdatedAt: z.iso.datetime(),
  })
  .strict();
export type Consent = z.infer<typeof consentSchema>;
export const accessSchema = z
  .object({
    kind: z.enum(['trial', 'subscription']),
    plan: z.enum(PLAN_IDS),
    modules: z.array(z.string()).max(100),
    start: z.iso.datetime(),
    end: z.iso.datetime(),
  })
  .strict()
  .refine((value) => {
    const allowed = getPlanModules(value.plan, value.modules);
    return (
      Date.parse(value.end) > Date.parse(value.start) &&
      value.modules.length === allowed.length &&
      allowed.every((code) => value.modules.includes(code)) &&
      (value.kind !== 'trial' ||
        Date.parse(value.end) - Date.parse(value.start) <= TRIAL_DAYS * DAY_MS)
    );
  }, 'Entitlement tidak valid');
export type Access = z.infer<typeof accessSchema>;
export const registerBillingSchema = z
  .object({
    installationId: z.uuid(),
    recoveryCode: z.string().regex(/^[a-f0-9]{64}$/),
    registration: registrationSchema,
    consent: consentSchema,
    access: accessSchema.refine((access) => access.kind === 'trial'),
  })
  .strict();
export const checkoutSchema = z
  .object({
    requestId: z.uuid(),
    plan: z.enum(PLAN_IDS),
    customModules: z.array(z.string()).max(100),
  })
  .strict();
export const billingStatusSchema = z.object({
  paymentCheck: z.enum(['verified', 'waiting', 'unavailable']).optional(),
  businessId: z.uuid(),
  registration: registrationSchema,
  access: accessSchema,
  orders: z.array(
    z.object({
      orderId: z.string(),
      plan: z.enum(PLAN_IDS),
      amount: z.number(),
      status: z.string(),
      createdAt: z.string(),
      accessStart: z.string().nullable(),
      accessEnd: z.string().nullable(),
      redirectUrl: z.string().nullable(),
    }),
  ),
});
export type BillingStatus = z.infer<typeof billingStatusSchema>;
export const remainingDays = (access: Access, now = Date.now()) =>
  Math.max(0, Math.ceil((Date.parse(access.end) - now) / DAY_MS));
export const hasAccess = (access: Access, now = Date.now()) =>
  accessSchema.safeParse(access).success && now < Date.parse(access.end);
export const reminderDate = (date = new Date()) =>
  date.getDay() === 3
    ? `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
    : null;

// UTC calendar month, clamped to the last day (31 January -> 28/29 February).
export function addBillingMonth(value: string): string {
  const date = new Date(value);
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + 1);
  const lastDay = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0),
  ).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return date.toISOString();
}
