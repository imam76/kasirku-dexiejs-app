import { Button, Tag } from 'antd';
import { Briefcase, ChevronRight, HelpCircle, CreditCard, Home, LayoutGrid, RefreshCw, ShieldCheck } from 'lucide-react';
import { getPlan, type PlanId } from './catalog';
import type { OnboardingController } from './useOnboardingPreview';
import { useOnboardingCopy } from './useOnboardingCopy';

type Props = { flow: OnboardingController };

export function PlanSummary({ plan, detail, price = false }: { plan: PlanId; detail?: string; price?: boolean }) {
  const { copy, money } = useOnboardingCopy();
  return <div className="preview-plan-summary">
    <span className="preview-plan-icon"><Briefcase size={27} aria-hidden /></span>
    <div><strong>{copy(`plan.${plan}`)}</strong>
      {price && <span className="preview-summary-price">{money(getPlan(plan).monthlyPrice)} <small>{copy('month')}</small></span>}
      <span className="preview-summary-detail">{detail ?? copy('billingMonthly')}</span>
    </div>
  </div>;
}

export function CheckoutAction({ flow }: Props) {
  const { copy, money } = useOnboardingCopy();
  const plan = getPlan(flow.state.plan ?? flow.state.access.plan);
  const setup = plan.id === 'custom' && (flow.state.access.kind !== 'subscription' || flow.state.access.plan !== 'custom') ? plan.setupPrice : 0;
  return <Button type="primary" size="large" block className="preview-wrap-button" disabled={flow.state.offline} onClick={flow.launchCheckout}
    aria-label={copy(flow.checkoutPlatform === 'android' ? 'external' : 'launchCheckout')}>
    {copy(flow.checkoutPlatform === 'android' ? 'external' : 'payAmount', { amount: money(plan.monthlyPrice + setup) })}
  </Button>;
}

export function PreviewNavigation({ flow }: Props) {
  const { copy } = useOnboardingCopy();
  const available = flow.state.access.kind !== 'none';
  const entries = [
    { key: 'home', icon: Home, action: () => available ? flow.go('status') : flow.go('welcome'), active: flow.state.screen === 'welcome' },
    { key: 'plans', icon: LayoutGrid, action: () => flow.go('plans'), active: flow.state.screen === 'plans' },
    { key: 'checkout', icon: CreditCard, action: () => flow.go('checkout'), active: ['checkout', 'payment'].includes(flow.state.screen), disabled: !available },
    { key: 'status', icon: RefreshCw, action: () => flow.go('status'), active: flow.state.screen === 'status', disabled: !available },
  ] as const;
  return <nav className="preview-navigation" aria-label={copy('navigation')}>
    {entries.map(({ key, icon: Icon, action, active, ...entry }) => <button type="button" key={key}
      disabled={'disabled' in entry && entry.disabled} aria-current={active ? 'page' : undefined} onClick={action}>
      <Icon size={18} aria-hidden /><span>{copy(`nav.${key}`)}</span>
    </button>)}
    <button type="button" onClick={() => flow.openOverlay('help')}><HelpCircle size={18} aria-hidden /><span>{copy('help')}</span></button>
  </nav>;
}

export function BillingOverlay({ flow }: Props) {
  const { copy, money, date } = useOnboardingCopy();
  const { state } = flow;
  if (state.overlay === 'menu') return <PreviewNavigation flow={flow} />;
  if (state.overlay === 'help') return <div className="preview-help">
    <p>{copy('helpBody')}</p>
    <Button block onClick={() => flow.go('recovery')}>{copy('existing')}</Button>
    <p>{copy('accountSeparation')}</p>
  </div>;
  if (state.overlay !== 'history' && state.overlay !== 'invoice') return null;
  if (state.payment.status === 'idle') return <p>{copy('emptyHistory')}</p>;
  if (state.overlay === 'history') return <>
    <p>{copy('historyHint')}</p>
    <button type="button" className="preview-list-link" onClick={() => flow.openOverlay('invoice')}>
      <CreditCard size={21} aria-hidden /><span><strong>{state.payment.orderId}</strong><small>{money(state.payment.amount)} · {copy(`payment.${state.payment.status}`)}</small></span><ChevronRight size={18} aria-hidden />
    </button>
  </>;
  return <section className="preview-receipt">
    <Tag color="blue">{copy('invoicePreview')}</Tag>
    <p>{copy('invoiceNotice')}</p>
    <PlanSummary plan={state.payment.entitlement?.plan ?? state.access.plan} />
    <dl className="preview-invoice">
      <div><dt>{copy('order')}</dt><dd>{state.payment.orderId}</dd></div>
      <div><dt>{copy('business')}</dt><dd>{state.registration.business}</dd></div>
      <div><dt>{copy('paymentMethods')}</dt><dd>{copy(`method.${state.payment.method}`)}</dd></div>
      <div><dt>{copy('payment')}</dt><dd>{copy(`payment.${state.payment.status}`)}</dd></div>
      {state.payment.entitlement && <div><dt>{copy('endDate')}</dt><dd>{date(state.payment.entitlement.end)}</dd></div>}
      <div className="preview-total"><dt>{copy('estimate')}</dt><dd>{money(state.payment.amount)}</dd></div>
    </dl>
    <span className="preview-secure"><ShieldCheck size={16} aria-hidden />{copy('preview')}</span>
  </section>;
}
