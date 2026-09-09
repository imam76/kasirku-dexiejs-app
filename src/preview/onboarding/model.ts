import { z } from 'zod';
import dayjs from '@/lib/dayjs';
import { createDefaultAccountingDraft, validateAccountingDraft, type AccountingDraft } from '@/view/auth/ownerAccountingSetupModel';
import { getPlan, getPlanModules, PLAN_IDS } from './catalog';

export const PREVIEW_DATE = '2026-09-09'; // Wednesday; simulation never depends on the device clock.
export const SCREENS = ['welcome', 'registration', 'plans', 'accounting', 'consent', 'status', 'checkout', 'payment', 'recovery'] as const;
export type Screen = typeof SCREENS[number];
export type Overlay = 'terms' | 'privacy' | 'modules' | 'backup' | 'scenarios' | 'menu' | 'invoice' | 'history' | 'help'
  | 'business-type' | 'accounting-template' | 'accounting-currency'
  | 'date-cutoffDate' | 'date-fiscalPeriodStart' | 'date-fiscalPeriodEnd' | 'date-currentPeriodStart' | 'date-currentPeriodEnd' | null;
export const registrationSchema = z.object({
  owner: z.string().trim().min(1, 'required'),
  business: z.string().trim().min(1, 'required'),
  whatsapp: z.string().trim().regex(/^\+?[0-9][0-9\s()-]{7,19}$/, 'phone'),
  businessType: z.string().trim().min(1, 'required'),
  email: z.union([z.literal(''), z.email({ error: 'email' })]),
  location: z.string(),
});
export type Registration = z.infer<typeof registrationSchema>;
export type ValidationErrors = Partial<Record<keyof Registration | 'plan' | 'terms' | 'privacy' | 'accounting', string>>;
export type Access = { kind: 'none' | 'trial' | 'subscription'; start: string; end: string; plan: typeof PLAN_IDS[number]; modules: string[] };
export type PaymentStatus = 'idle' | 'pending' | 'success' | 'failed' | 'cancelled';
export const PAYMENT_METHODS = ['qris', 'va', 'card'] as const;
export type PaymentMethod = typeof PAYMENT_METHODS[number];
export type Payment = { status: PaymentStatus; activation: 'none' | 'waiting' | 'received'; orderId: string; entitlement: Access | null; method: PaymentMethod; amount: number };
export type RecoveryStatus = 'idle' | 'success' | 'failed' | 'offline';
export type FlowState = {
  registration: Registration;
  plan: typeof PLAN_IDS[number] | null;
  customModules: string[];
  accounting: AccountingDraft;
  accountingMode: 'default' | 'configure';
  consent: { terms: boolean; privacy: boolean; marketing: boolean };
  onboarding: 'not-started' | 'in-progress' | 'complete';
  access: Access;
  payment: Payment;
  paymentMethod: PaymentMethod;
  recovery: RecoveryStatus;
  offline: boolean;
  now: string;
  reminderDismissed: string | null;
  screen: Screen;
  overlay: Overlay;
  errors: ValidationErrors;
};

export const emptyPayment = (): Payment => ({ status: 'idle', activation: 'none', orderId: '', entitlement: null, method: 'qris', amount: 0 });
export const initialState = (): FlowState => ({
  registration: { owner: '', business: '', whatsapp: '', businessType: '', email: '', location: '' },
  plan: null, customModules: [],
  accounting: { ...createDefaultAccountingDraft(), cutoffDate: PREVIEW_DATE, fiscalPeriodStart: '2026-01-01', fiscalPeriodEnd: '2026-12-31', currentPeriodStart: '2026-09-01', currentPeriodEnd: '2026-09-30' },
  accountingMode: 'default', consent: { terms: false, privacy: false, marketing: false },
  onboarding: 'not-started', access: { kind: 'none', start: '', end: '', plan: 'pos', modules: [] },
  payment: emptyPayment(), paymentMethod: 'qris', recovery: 'idle', offline: false, now: PREVIEW_DATE,
  reminderDismissed: null, screen: 'welcome', overlay: null, errors: {},
});
export const validateRegistration = (value: Registration): ValidationErrors => {
  const result = registrationSchema.safeParse(value);
  if (result.success) return {};
  return Object.fromEntries(result.error.issues.map((issue) => [issue.path[0], issue.message]));
};
export const validateStep = (state: FlowState, screen: Screen): ValidationErrors => {
  if (screen === 'registration') return validateRegistration(state.registration);
  if (screen === 'plans') return !state.plan || (state.plan === 'custom' && !state.customModules.length) ? { plan: 'required' } : {};
  if (screen === 'accounting' && state.accountingMode === 'configure') {
    return Object.keys(validateAccountingDraft(state.accounting, false)).length ? { accounting: 'accounting' } : {};
  }
  if (screen === 'consent') return { ...(!state.consent.terms ? { terms: 'required' } : {}), ...(!state.consent.privacy ? { privacy: 'required' } : {}) };
  return {};
};
export const remainingDays = (state: Pick<FlowState, 'access' | 'now'>) => Math.max(0, dayjs(state.access.end).diff(dayjs(state.now), 'day'));
export const isAccessExpired = (state: Pick<FlowState, 'access' | 'now'>) => state.access.kind !== 'none' && remainingDays(state) === 0;
export const shouldShowReminder = (state: FlowState) => state.access.kind !== 'none' && dayjs(state.now).day() === 3 && state.reminderDismissed !== state.now;
export const WIZARD_STEPS: Screen[] = ['registration', 'plans', 'accounting', 'consent'];
export const checkoutQuote = (state: FlowState) => {
  const resuming = state.payment.status === 'pending' || state.payment.activation === 'waiting';
  const plan = getPlan(resuming && state.payment.entitlement ? state.payment.entitlement.plan : state.plan ?? state.access.plan);
  const setup = plan.id === 'custom' && (state.access.kind !== 'subscription' || state.access.plan !== 'custom') ? plan.setupPrice : 0;
  return { plan, setup, resuming, amount: resuming && state.payment.amount > 0 ? state.payment.amount : plan.monthlyPrice + setup,
    method: resuming ? state.payment.method : state.paymentMethod };
};
export const resolveScreen = (state: FlowState, target: Screen): Screen => {
  if (state.access.kind !== 'none' && target === 'plans') return 'plans';
  if (state.onboarding === 'complete' && WIZARD_STEPS.includes(target)) return 'status';
  const index = WIZARD_STEPS.indexOf(target);
  if (index >= 0) {
    return WIZARD_STEPS.slice(0, index).find((step) => Object.keys(validateStep(state, step)).length > 0) ?? target;
  }
  if (['status', 'checkout', 'payment'].includes(target) && state.access.kind === 'none') return 'welcome';
  if (target === 'checkout' && state.plan === 'custom' && Object.keys(validateStep(state, 'plans')).length) return 'plans';
  if (target === 'payment' && state.payment.status === 'idle') return 'checkout';
  return target;
};
export const previousScreen = (state: FlowState): Screen => {
  if (state.screen === 'plans' && state.access.kind !== 'none') return 'status';
  const index = WIZARD_STEPS.indexOf(state.screen);
  if (index >= 0) return index === 0 ? 'welcome' : WIZARD_STEPS[index - 1];
  return ['checkout', 'payment', 'recovery'].includes(state.screen) && state.access.kind !== 'none' ? 'status' : 'welcome';
};
export type FlowAction =
  | { type: 'registration'; patch: Partial<Registration> }
  | { type: 'plan'; plan: NonNullable<FlowState['plan']> }
  | { type: 'custom'; modules: string[] }
  | { type: 'accounting'; patch: Partial<AccountingDraft> }
  | { type: 'accounting-mode'; mode: FlowState['accountingMode'] }
  | { type: 'skip-accounting' }
  | { type: 'consent'; patch: Partial<FlowState['consent']> }
  | { type: 'navigate'; screen: Screen; overlay?: Overlay }
  | { type: 'next' } | { type: 'start-trial' }
  | { type: 'payment'; payment: Payment }
  | { type: 'payment-method'; method: PaymentMethod }
  | { type: 'recovery'; status: RecoveryStatus; access?: Access; identity?: Registration }
  | { type: 'offline'; value: boolean }
  | { type: 'dismiss-reminder' }
  | { type: 'scenario'; state: FlowState };

export function flowReducer(state: FlowState, action: FlowAction): FlowState {
  switch (action.type) {
    case 'registration': return { ...state, registration: { ...state.registration, ...action.patch }, errors: {} };
    case 'plan': return { ...state, plan: action.plan, errors: {} };
    case 'custom': return { ...state, customModules: action.modules.filter((code) => getPlanModules('custom', action.modules).includes(code)), errors: {} };
    case 'accounting': return { ...state, accounting: { ...state.accounting, ...action.patch }, errors: {} };
    case 'accounting-mode': return { ...state, accountingMode: action.mode, errors: {} };
    case 'skip-accounting': return state.screen === 'accounting' ? { ...state, accountingMode: 'default', screen: 'consent', errors: {} } : state;
    case 'consent': return { ...state, consent: { ...state.consent, ...action.patch }, errors: {} };
    case 'navigate': return { ...state, screen: resolveScreen(state, action.screen), overlay: action.overlay ?? null, errors: {} };
    case 'next': {
      const errors = validateStep(state, state.screen);
      if (Object.keys(errors).length) return { ...state, errors };
      if (state.screen === 'plans' && state.access.kind !== 'none') return { ...state, screen: 'checkout', errors: {} };
      const index = WIZARD_STEPS.indexOf(state.screen);
      if (index < 0 || index >= WIZARD_STEPS.length - 1) return state;
      return { ...state, onboarding: 'in-progress', screen: WIZARD_STEPS[index + 1], errors: {} };
    }
    case 'start-trial': {
      if (state.onboarding === 'complete') return state;
      const invalid = WIZARD_STEPS.find((step) => Object.keys(validateStep(state, step)).length);
      if (invalid) return { ...state, screen: invalid, errors: validateStep(state, invalid) };
      const plan = state.plan!;
      return { ...state, onboarding: 'complete', screen: 'status', errors: {}, access: {
        kind: 'trial', plan, modules: getPlanModules(plan, state.customModules), start: state.now,
        end: dayjs(state.now).add(90, 'day').format('YYYY-MM-DD'),
      } };
    }
    case 'payment-method': return { ...state, paymentMethod: action.method };
    case 'payment': return { ...state, payment: action.payment,
      plan: action.payment.activation === 'received' && action.payment.entitlement ? action.payment.entitlement.plan : state.plan,
      access: action.payment.status === 'success' && action.payment.activation === 'received' && action.payment.entitlement
        ? action.payment.entitlement : state.access };
    case 'recovery': return { ...state, recovery: action.status,
      ...(action.status === 'success' && action.access ? { access: action.access, plan: action.access.plan,
        registration: action.identity ?? state.registration, payment: emptyPayment(), onboarding: 'complete' as const, screen: 'status' as const } : {}),
    };
    case 'offline': return { ...state, offline: action.value };
    case 'dismiss-reminder': return { ...state, reminderDismissed: state.now };
    case 'scenario': return action.state;
  }
}
