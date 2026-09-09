import { createHashHistory } from '@tanstack/react-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getHostPlatform } from '@/utils/export/platform';
import { flowReducer, previousScreen, type FlowAction, type FlowState, type Overlay, type Screen } from './model';
import { navigationHref, readNavigation } from './navigation';
import { readPreviewState, savePreviewState } from './persistence';
import { createScenario, simulationAdapter, type PaymentOutcome, type RecoveryOutcome, type Scenario } from './simulation';

// The same TanStack history primitive used by the app router. Native WebView Back
// consumes its browser history; no additional native/popstate listener is installed.
const history = createHashHistory();

export function useOnboardingPreview() {
  const [state, setState] = useState(() => {
    const saved = readPreviewState(localStorage);
    const requested = window.location.hash.length > 1 ? readNavigation(history.location.href) : { screen: saved.screen, overlay: null };
    return flowReducer(saved, { type: 'navigate', ...requested });
  });
  const [storageAvailable, setStorageAvailable] = useState(true);
  const [checkoutPlatform, setCheckoutPlatform] = useState<'android' | 'desktop'>(() => getHostPlatform() === 'android' ? 'android' : 'desktop');
  const [paymentOutcome, setPaymentOutcome] = useState<PaymentOutcome>('pending');
  const [recoveryOutcome, setRecoveryOutcome] = useState<RecoveryOutcome>('success');
  const [handoff, setHandoff] = useState(false);
  const [home, setHome] = useState(false);
  const ownNavigation = useRef(false);

  const commit = useCallback((next: FlowState, replace = false) => {
    ownNavigation.current = true;
    const href = navigationHref(next.screen, next.overlay);
    if (history.location.href !== href) {
      if (replace) history.replace(href);
      else history.push(href);
    }
    ownNavigation.current = false;
    setState(next);
    setStorageAvailable(savePreviewState(localStorage, next));
  }, []);
  const dispatch = useCallback((action: FlowAction) => commit(flowReducer(state, action)), [commit, state]);
  useEffect(() => history.subscribe(() => {
    if (ownNavigation.current) return;
    const next = flowReducer(state, { type: 'navigate', ...readNavigation(history.location.href) });
    commit(next, true);
    setHandoff(false);
    setHome(false);
  }), [state, commit]);
  useEffect(() => {
    if (history.location.href === '/') history.replace(navigationHref(state.screen, null));
  }, [state.screen]);

  const go = (screen: Screen) => { setHome(false); setHandoff(false); dispatch({ type: 'navigate', screen }); };
  const openOverlay = (overlay: Overlay) => dispatch({ type: 'navigate', screen: state.screen, overlay });
  const closeOverlay = () => {
    if (history.canGoBack()) history.back();
    else commit({ ...state, overlay: null }, true);
  };
  const back = () => {
    if (state.overlay) closeOverlay();
    else if (handoff) setHandoff(false);
    else if (home) setHome(false);
    else if (history.canGoBack()) history.back();
    else go(previousScreen(state));
  };
  const applyScenario = (scenario: Scenario) => {
    setHome(false); setHandoff(false);
    setRecoveryOutcome(scenario === 'recovery-expired' ? 'expired' : scenario === 'recovery-failed' ? 'failed' : 'success');
    setPaymentOutcome(scenario === 'activation-waiting' ? 'activation-waiting' : scenario === 'payment-success' ? 'success' : scenario === 'payment-failed' ? 'failed' : scenario === 'payment-cancelled' ? 'cancelled' : 'pending');
    commit(createScenario(scenario), true);
  };
  const checkPayment = useCallback(() => {
    const payment = simulationAdapter.checkPayment(state, paymentOutcome);
    if (payment !== state.payment) dispatch({ type: 'payment', payment });
  }, [state, paymentOutcome, dispatch]);
  useEffect(() => {
    if (state.payment.status === 'idle') return;
    const onForeground = () => { if (document.visibilityState === 'visible') checkPayment(); };
    window.addEventListener('focus', onForeground);
    document.addEventListener('visibilitychange', onForeground);
    return () => {
      window.removeEventListener('focus', onForeground);
      document.removeEventListener('visibilitychange', onForeground);
    };
  }, [state.payment.status, checkPayment]);
  const launchCheckout = () => {
    const result = simulationAdapter.createCheckout(state);
    if (!result.ok) return;
    commit({ ...flowReducer(state, { type: 'payment', payment: result.payment }), screen: 'payment' });
    setHandoff(checkoutPlatform === 'android');
  };
  const recover = () => {
    const result = simulationAdapter.recover(state.offline, recoveryOutcome);
    dispatch({ type: 'recovery', ...result });
  };
  return { state, dispatch, go, back, openOverlay, closeOverlay, applyScenario, storageAvailable,
    checkoutPlatform, setCheckoutPlatform, paymentOutcome, setPaymentOutcome, recoveryOutcome, setRecoveryOutcome,
    launchCheckout, checkPayment, recover, handoff, returnFromBrowser: () => { setHandoff(false); checkPayment(); }, home, setHome };
}
export type OnboardingController = ReturnType<typeof useOnboardingPreview>;
