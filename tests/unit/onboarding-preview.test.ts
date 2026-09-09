import { describe, expect, test } from 'bun:test';
import { BASE_MODULES, getPlan, getPlanModules, PLAN_CATALOG } from '@/preview/onboarding/catalog';
import { flowReducer, initialState, isAccessExpired, remainingDays, resolveScreen, shouldShowReminder, validateRegistration, type FlowState } from '@/preview/onboarding/model';
import { navigationHref, readNavigation } from '@/preview/onboarding/navigation';
import { PREVIEW_STORAGE_KEY, readPreviewState, savePreviewState } from '@/preview/onboarding/persistence';
import { createScenario, RECOVERY_ACCESS, SCENARIOS, simulationAdapter } from '@/preview/onboarding/simulation';
import { SETUP_MODULE_GROUPS } from '@/constants/setupModules';

function readyForTrial(): FlowState {
  return { ...initialState(), registration: { owner: 'Rani', business: 'Toko', whatsapp: '081234567890', businessType: 'retail', email: '', location: '' }, plan: 'pos', consent: { terms: true, privacy: true, marketing: false }, screen: 'consent' };
}

describe('onboarding preview registration and consent', () => {
  test('requires only owner, business, WhatsApp and business type; optional email still validates', () => {
    expect(validateRegistration(initialState().registration)).toEqual({ owner: 'required', business: 'required', whatsapp: 'phone', businessType: 'required' });
    expect(validateRegistration(readyForTrial().registration)).toEqual({});
    expect(validateRegistration({ ...readyForTrial().registration, owner: '  ', email: 'oops' })).toEqual({ owner: 'required', email: 'email' });
  });
  test('cannot skip registration, package or mandatory consents', () => {
    expect(flowReducer(initialState(), { type: 'start-trial' }).access.kind).toBe('none');
    for (const field of ['terms', 'privacy'] as const) {
      const state = readyForTrial(); state.consent[field] = false;
      expect(flowReducer(state, { type: 'start-trial' }).errors[field]).toBe('required');
      expect(flowReducer(state, { type: 'start-trial' }).access.kind).toBe('none');
    }
    expect(flowReducer({ ...readyForTrial(), plan: null }, { type: 'start-trial' }).screen).toBe('plans');
  });
  test('offline trial is exactly 90 days; marketing is optional and can be withdrawn', () => {
    const trial = flowReducer({ ...readyForTrial(), offline: true }, { type: 'start-trial' });
    expect(trial.access).toMatchObject({ kind: 'trial', start: '2026-09-09', end: '2026-12-08' });
    expect(remainingDays(trial)).toBe(90);
    expect(trial.consent.marketing).toBe(false);
    const optedIn = flowReducer(trial, { type: 'consent', patch: { marketing: true } });
    const withdrawn = flowReducer(optedIn, { type: 'consent', patch: { marketing: false } });
    expect(withdrawn.consent.marketing).toBe(false);
    expect(withdrawn.access).toEqual(trial.access);
  });
  test('starting an existing trial never resets or extends it', () => {
    const trial = flowReducer(readyForTrial(), { type: 'start-trial' });
    expect(flowReducer({ ...trial, now: '2026-09-15' }, { type: 'start-trial' }).access).toEqual(trial.access);
  });
  test('configured accounting validates; default setup can be skipped', () => {
    const invalid = { ...readyForTrial(), accountingMode: 'configure' as const, accounting: { ...initialState().accounting, fiscalPeriodEnd: '2025-01-01' } };
    expect(flowReducer(invalid, { type: 'start-trial' }).screen).toBe('accounting');
    expect(flowReducer({ ...invalid, accountingMode: 'default' }, { type: 'start-trial' }).access.kind).toBe('trial');
  });
});

describe('package entitlement and prices', () => {
  test('exact launch prices and one-time Custom fee', () => {
    expect(PLAN_CATALOG.map(({ monthlyPrice }) => monthlyPrice)).toEqual([149000, 299000, 449000, 699000, 999000]);
    expect(getPlan('custom').setupPrice).toBe(3500000);
  });
  test('all modules exist, include baseline, exclude unsellable and normalization extras', () => {
    const known = new Set(SETUP_MODULE_GROUPS.flatMap((group) => group.modules.map((module) => module.code)));
    for (const plan of PLAN_CATALOG) {
      expect(BASE_MODULES.every((module) => plan.modules.includes(module))).toBe(true);
      expect(plan.modules.every((module) => known.has(module))).toBe(true);
      expect(new Set(plan.modules).size).toBe(plan.modules.length);
      expect(plan.modules.some((code) => ['GENERAL_LEDGER', 'FIXED_ASSET', 'REPORT_PAYROLL', 'REPORT_BALANCE_SHEET'].includes(code) || code.startsWith('MARKETPLACE'))).toBe(false);
    }
    expect(getPlan('pos').modules).toHaveLength(19);
    expect(getPlan('trading').modules).toHaveLength(35);
    expect(getPlan('production').modules).toHaveLength(36);
    expect(getPlan('cooperative').modules).toHaveLength(26);
  });
  test('Custom requires an explicit selection from sellable modules', () => {
    const state = { ...readyForTrial(), plan: 'custom' as const };
    expect(flowReducer(state, { type: 'start-trial' }).screen).toBe('plans');
    expect(getPlanModules('custom', ['PRODUCTION', 'GENERAL_LEDGER', 'FIXED_ASSET'])).toEqual([...BASE_MODULES, 'PRODUCTION']);
  });
});

describe('access, payment and recovery are independent', () => {
  test('expiry is at the start of the end date, with a one-day boundary', () => {
    const state = createScenario('trial-expired');
    expect(isAccessExpired(state)).toBe(true);
    expect(isAccessExpired({ ...state, now: '2026-09-08' })).toBe(false);
    expect(remainingDays({ ...state, now: '2026-09-08' })).toBe(1);
  });
  test('Wednesday reminder can be dismissed for that day only', () => {
    const state = createScenario('trial-active');
    expect(shouldShowReminder(state)).toBe(true);
    expect(shouldShowReminder({ ...state, now: '2026-09-10' })).toBe(false);
    const dismissed = flowReducer(state, { type: 'dismiss-reminder' });
    expect(shouldShowReminder(dismissed)).toBe(false);
    expect(shouldShowReminder({ ...dismissed, now: '2026-09-16' })).toBe(true);
  });
  test('pending, failed, cancelled and delayed activation preserve both trial and paid access', () => {
    for (const scenario of ['trial-active', 'subscription-active'] as const) {
      for (const outcome of ['pending', 'failed', 'cancelled', 'activation-waiting'] as const) {
        const state = createScenario(scenario);
        const checkout = simulationAdapter.createCheckout(state);
        if (!checkout.ok) throw new Error('Expected online checkout');
        const pending = flowReducer(state, { type: 'payment', payment: checkout.payment });
        const next = flowReducer(pending, { type: 'payment', payment: simulationAdapter.checkPayment(pending, outcome) });
        expect(next.access).toEqual(state.access);
      }
    }
  });
  test('only received successful activation changes access; duplicate delivery is idempotent', () => {
    const waiting = createScenario('activation-waiting');
    const success = flowReducer(waiting, { type: 'payment', payment: simulationAdapter.checkPayment(waiting, 'success') });
    expect(success.access.kind).toBe('subscription');
    expect(success.access.end).toBe('2026-10-09');
    expect(simulationAdapter.checkPayment(success, 'pending')).toEqual(success.payment);
    expect(flowReducer(success, { type: 'payment', payment: simulationAdapter.checkPayment(success, 'success') }).access).toEqual(success.access);
  });
  test('offline blocks new checkout, status retrieval and recovery but preserves cached access', () => {
    const state = { ...createScenario('payment-pending'), offline: true };
    expect(simulationAdapter.createCheckout(state)).toEqual({ ok: false, reason: 'offline' });
    expect(simulationAdapter.checkPayment(state, 'success')).toEqual(state.payment);
    const result = simulationAdapter.recover(true, 'success');
    expect(flowReducer(state, { type: 'recovery', ...result }).access).toEqual(state.access);
  });
  test('recovery keeps exact package/end date, including expired entitlement; never renews', () => {
    const result = simulationAdapter.recover(false, 'success');
    const once = flowReducer(initialState(), { type: 'recovery', ...result });
    const twice = flowReducer(once, { type: 'recovery', ...result });
    expect(twice.access).toEqual(RECOVERY_ACCESS);
    const expired = flowReducer(initialState(), { type: 'recovery', ...simulationAdapter.recover(false, 'expired') });
    expect(isAccessExpired(expired)).toBe(true);
    expect(expired.access.end).toBe('2026-09-01');
  });
  test('recovery failures never remove existing access', () => {
    const state = createScenario('subscription-active');
    expect(flowReducer(state, { type: 'recovery', ...simulationAdapter.recover(false, 'failed') }).access).toEqual(state.access);
  });
});

describe('navigation and isolated persistence', () => {
  test('direct links cannot jump past prerequisites or restart completed onboarding', () => {
    expect(resolveScreen(initialState(), 'consent')).toBe('registration');
    expect(resolveScreen(initialState(), 'checkout')).toBe('welcome');
    expect(resolveScreen(createScenario('trial-active'), 'consent')).toBe('status');
    expect(readNavigation('/consent?overlay=terms')).toEqual({ screen: 'consent', overlay: 'terms' });
    expect(readNavigation('/accounting?overlay=date-cutoffDate')).toEqual({ screen: 'accounting', overlay: 'date-cutoffDate' });
    expect(readNavigation('/unknown?overlay=unknown')).toEqual({ screen: 'welcome', overlay: null });
  });
  test('Back closes overlay before changing wizard step, preserving every field', () => {
    const state = { ...readyForTrial(), screen: 'consent' as const, overlay: 'terms' as const };
    const closed = flowReducer(state, { type: 'navigate', ...readNavigation(navigationHref('consent', null)) });
    expect(closed.overlay).toBeNull();
    expect(closed.screen).toBe('consent');
    const previous = flowReducer(closed, { type: 'navigate', screen: 'registration' });
    expect(previous.registration).toEqual(state.registration);
    expect(previous.consent).toEqual(state.consent);
  });
  test('all scenarios are deterministic and serializable; writes use only the preview namespace', () => {
    for (const scenario of SCENARIOS) {
      const state = createScenario(scenario);
      expect(createScenario(scenario)).toEqual(state);
      const values = new Map<string, string>();
      const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
      expect(savePreviewState(storage, state)).toBe(true);
      expect([...values.keys()]).toEqual([PREVIEW_STORAGE_KEY]);
      expect(readPreviewState(storage)).toEqual({ ...state, errors: {}, overlay: null });
    }
  });
  test('malformed or unavailable storage recovers safely', () => {
    expect(readPreviewState({ getItem: () => '{bad' })).toEqual(initialState());
    expect(readPreviewState({ getItem: () => '{"screen":"consent"}' })).toEqual(initialState());
    expect(savePreviewState({ setItem: () => { throw new Error('quota'); } }, initialState())).toBe(false);
  });
});
