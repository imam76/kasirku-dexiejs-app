import dayjs from '@/lib/dayjs';
import { getPlan, getPlanModules } from './catalog';
import { emptyPayment, initialState, PREVIEW_DATE, type Access, type FlowState, type Payment, type RecoveryStatus, type Registration } from './model';

export const PAYMENT_OUTCOMES = ['pending', 'success', 'failed', 'cancelled', 'activation-waiting'] as const;
export type PaymentOutcome = typeof PAYMENT_OUTCOMES[number];
export type RecoveryOutcome = 'success' | 'failed' | 'expired';
export interface BillingPreviewAdapter {
  createCheckout(state: FlowState): { ok: true; payment: Payment } | { ok: false; reason: 'offline' };
  checkPayment(state: FlowState, outcome: PaymentOutcome): Payment;
  recover(offline: boolean, outcome: RecoveryOutcome): { status: RecoveryStatus; access?: Access; identity?: Registration };
}

export const RECOVERY_ACCESS: Access = {
  kind: 'subscription', start: '2026-09-01', end: '2026-10-01', plan: 'pos', modules: getPlanModules('pos', []),
};
const RECOVERY_IDENTITY: Registration = { owner: 'Rani (demo)', business: 'Toko Sinar (demo)', whatsapp: '081234567890', businessType: 'retail', email: '', location: '' };
export const simulationAdapter: BillingPreviewAdapter = {
  createCheckout(state) {
    if (state.offline) return { ok: false, reason: 'offline' };
    if (state.payment.status === 'pending' || state.payment.activation === 'waiting') return { ok: true, payment: state.payment };
    const start = state.access.kind === 'subscription' && state.access.end > state.now ? state.access.end : state.now;
    const plan = getPlan(state.plan ?? state.access.plan);
    return { ok: true, payment: {
      status: 'pending', activation: 'none', orderId: `SIM-${plan.id}-${start}`, method: state.paymentMethod,
      amount: plan.monthlyPrice + (plan.id === 'custom' && (state.access.kind !== 'subscription' || state.access.plan !== 'custom') ? plan.setupPrice : 0),
      // A deterministic billing response, not a client decision about real renewal terms.
      entitlement: { kind: 'subscription', plan: plan.id, modules: getPlanModules(plan.id, state.customModules), start, end: dayjs(start).add(1, 'month').format('YYYY-MM-DD') },
    } };
  },
  checkPayment(state, outcome) {
    if (state.offline || state.payment.status === 'idle' || state.payment.activation === 'received') return state.payment;
    if (state.payment.status === 'failed' || state.payment.status === 'cancelled') return state.payment;
    if (state.payment.activation === 'waiting' && outcome !== 'success') return state.payment;
    return { ...state.payment, status: outcome === 'activation-waiting' ? 'success' : outcome,
      activation: outcome === 'success' ? 'received' : outcome === 'activation-waiting' ? 'waiting' : 'none' };
  },
  recover(offline, outcome) {
    if (offline) return { status: 'offline' };
    if (outcome === 'failed') return { status: 'failed' };
    return { status: 'success', identity: { ...RECOVERY_IDENTITY }, access: { ...RECOVERY_ACCESS, modules: [...RECOVERY_ACCESS.modules],
      ...(outcome === 'expired' ? { start: '2026-08-01', end: '2026-09-01' } : {}) } };
  },
};

export const SCENARIOS = [
  'new', 'plans', 'checkout', 'validation', 'offline', 'trial-active', 'trial-ending', 'trial-expired',
  'subscription-active', 'subscription-expired', 'payment-pending', 'payment-success',
  'payment-failed', 'payment-cancelled', 'activation-waiting', 'recovery-success', 'recovery-failed', 'recovery-offline', 'recovery-expired',
] as const;
export type Scenario = typeof SCENARIOS[number];
export function createScenario(scenario: Scenario): FlowState {
  const state = initialState();
  if (scenario === 'new') return state;
  if (scenario === 'validation') return { ...state, screen: 'registration', errors: { owner: 'required', business: 'required', whatsapp: 'phone', businessType: 'required' } };
  if (scenario === 'offline') return { ...state, screen: 'registration', offline: true };
  state.registration = { ...RECOVERY_IDENTITY };
  state.plan = 'pos';
  state.consent = { terms: true, privacy: true, marketing: false };
  state.onboarding = 'complete';
  state.screen = 'status';
  state.access = { kind: 'trial', start: '2026-08-01', end: '2026-10-30', plan: 'pos', modules: getPlanModules('pos', []) };
  if (scenario === 'plans' || scenario === 'checkout') state.screen = scenario;
  if (scenario === 'trial-ending') state.access = { ...state.access, start: '2026-06-13', end: '2026-09-11' };
  if (scenario === 'trial-expired') state.access = { ...state.access, start: '2026-06-11', end: PREVIEW_DATE };
  if (scenario.startsWith('subscription')) state.access = { ...RECOVERY_ACCESS };
  if (scenario === 'subscription-expired') state.access = { ...RECOVERY_ACCESS, start: '2026-08-01', end: '2026-09-01' };
  if (scenario.startsWith('payment-') || scenario === 'activation-waiting') {
    const checkout = simulationAdapter.createCheckout(state);
    state.payment = checkout.ok ? checkout.payment : emptyPayment();
    const outcome: PaymentOutcome = scenario === 'activation-waiting' ? scenario
      : scenario === 'payment-success' ? 'success' : scenario === 'payment-failed' ? 'failed'
        : scenario === 'payment-cancelled' ? 'cancelled' : 'pending';
    state.payment = simulationAdapter.checkPayment(state, outcome);
    if (state.payment.activation === 'received') state.access = state.payment.entitlement!;
    state.screen = 'payment';
  }
  if (scenario.startsWith('recovery-')) {
    state.screen = 'recovery';
    state.recovery = scenario === 'recovery-failed' ? 'failed' : scenario === 'recovery-offline' ? 'offline' : 'idle';
    state.offline = scenario === 'recovery-offline';
  }
  return state;
}
