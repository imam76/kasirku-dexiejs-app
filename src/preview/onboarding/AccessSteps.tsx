import { Alert, Button, Radio, Tag, Typography } from 'antd';
import { CalendarDays, ChevronDown, ChevronRight, HelpCircle, CreditCard, Download, Info, Landmark, QrCode, ReceiptText, RefreshCw, ShieldCheck } from 'lucide-react';
import { checkoutQuote, isAccessExpired, PAYMENT_METHODS, remainingDays, shouldShowReminder } from './model';
import { PAYMENT_OUTCOMES, RECOVERY_ACCESS } from './simulation';
import type { OnboardingController } from './useOnboardingPreview';
import { useOnboardingCopy } from './useOnboardingCopy';
import { CheckoutAction, PlanSummary } from './BillingPresentation';

const { Paragraph, Text } = Typography;
type Props = { flow: OnboardingController };

export function AccessStep({ flow }: Props) {
  const { copy, date } = useOnboardingCopy();
  const { state } = flow;
  const expired = isAccessExpired(state);
  if (state.access.kind === 'subscription' && !expired) return <ActiveSubscriptionStep flow={flow} />;
  const status = state.access.kind === 'trial'
    ? copy(expired ? 'trialExpired' : remainingDays(state) <= 7 ? 'trialEnding' : 'trialActive')
    : copy(expired ? 'subscriptionExpired' : 'subscriptionActive');
  return <>
    {state.recovery === 'success' && <Alert className="preview-spaced-bottom" showIcon type="success" title={copy('recoverySuccess')} />}
    {shouldShowReminder(state) && <section className="preview-reminder" aria-label={copy('wednesday')}>
      <CalendarDays size={22} aria-hidden /><div><strong>{copy('wednesday')}</strong>
        <p>{copy('reminder', { status, days: remainingDays(state), date: date(state.access.end) })}</p>
        <div className="preview-inline-actions"><Button onClick={() => flow.go('checkout')}>{copy(expired ? 'payNow' : state.access.kind === 'trial' ? 'upgrade' : 'renew')}</Button>
          <Button type="text" onClick={() => flow.dispatch({ type: 'dismiss-reminder' })}>{copy('dismiss')}</Button></div>
      </div>
    </section>}
    {flow.home && !expired && <Alert className="preview-spaced-bottom" showIcon type="info" title={copy('homeHint')} description={copy('homeBody')} />}
    <section className="preview-access-card">
      <div className="preview-access-heading"><ShieldCheck size={30} aria-hidden /><Tag color={expired ? 'error' : 'success'}>{status}</Tag></div>
      <h2>{copy(`plan.${state.access.plan}`)}</h2>
      <p className="preview-days">{copy('daysLeft', { days: remainingDays(state) })}</p>
      <dl className="preview-dates"><div><dt>{copy('startDate')}</dt><dd>{date(state.access.start)}</dd></div><div><dt>{copy('endDate')}</dt><dd>{date(state.access.end)}</dd></div></dl>
      <Text type="secondary">{copy('exclusiveEnd')}</Text>
    </section>
    <Paragraph className="preview-note" type="secondary">{copy(expired ? 'expiredHint' : 'offlineAccess')}</Paragraph>
    {state.payment.activation === 'waiting' && <Alert showIcon type="warning" title={copy('activationWaiting')} />}
    <div className="preview-action-grid">
      {!expired && <Button size="large" onClick={() => flow.setHome(!flow.home)}>{copy(flow.home ? 'status' : 'home')}</Button>}
      <Button size="large" onClick={() => flow.go('recovery')}>{copy('existing')}</Button>
      {!expired && <Button size="large" icon={<Download size={16} />} onClick={() => flow.openOverlay('backup')}>{copy('export')}</Button>}
      <Button size="large" onClick={() => state.payment.status === 'idle' ? flow.go('recovery') : flow.go('payment')}>{copy('checkStatus')}</Button>
    </div>
    {state.consent.marketing ? <Button type="text" className="preview-wrap-button" onClick={() => flow.dispatch({ type: 'consent', patch: { marketing: false } })}>{copy('withdraw')}</Button> : <Text type="secondary">{copy('withdrawn')}</Text>}
  </>;
}

function ActiveSubscriptionStep({ flow }: Props) {
  const { copy, date } = useOnboardingCopy();
  const { state } = flow;
  return <div className="preview-manage">
    {state.recovery === 'success' && <Alert className="preview-spaced-bottom" showIcon type="success" title={copy('recoverySuccess')} />}
    {flow.home && <Alert className="preview-spaced-bottom" showIcon type="info" title={copy('homeHint')} description={copy('homeBody')} />}
    <section className="preview-subscription-card">
      <Tag className="preview-active-badge" color="success">{copy('activeBadge')}</Tag>
      <PlanSummary plan={state.access.plan} price detail={copy('validUntil', { date: date(state.access.end) })} />
      <div className="preview-manual-renewal"><RefreshCw size={15} aria-hidden />{copy('manualRenewal')}</div>
      <div className="preview-subscription-actions">
        <Button type="primary" block size="large" onClick={() => flow.go('checkout')}>{copy('renew')}</Button>
        <Button block size="large" className="preview-outline-button" onClick={() => flow.go('plans')}>{copy('changePlan')}</Button>
      </div>
    </section>
    <div className="preview-link-list">
      <button type="button" className="preview-list-link" onClick={() => flow.openOverlay('history')}><ReceiptText size={20} aria-hidden /><span>{copy('paymentHistory')}</span><ChevronRight size={18} aria-hidden /></button>
      <button type="button" className="preview-list-link" onClick={() => flow.openOverlay('help')}><HelpCircle size={20} aria-hidden /><span>{copy('help')}</span><ChevronRight size={18} aria-hidden /></button>
    </div>
    {shouldShowReminder(state) && <aside className="preview-renewal-reminder"><CalendarDays size={18} aria-hidden /><span><strong>{copy('wednesday')}</strong><small>{copy('validUntil', { date: date(state.access.end) })}</small></span><Button type="text" onClick={() => flow.dispatch({ type: 'dismiss-reminder' })}>{copy('dismiss')}</Button></aside>}
    <details className="preview-plan-terms"><summary>{copy('status')}<ChevronDown size={15} aria-hidden /></summary>
      <dl className="preview-dates"><div><dt>{copy('startDate')}</dt><dd>{date(state.access.start)}</dd></div><div><dt>{copy('endDate')}</dt><dd>{date(state.access.end)}</dd></div></dl>
      <p>{copy('offlineAccess')}</p>
      <div className="preview-inline-actions"><Button onClick={() => flow.go('recovery')}>{copy('existing')}</Button><Button onClick={() => flow.openOverlay('backup')}>{copy('export')}</Button><Button onClick={() => state.payment.status === 'idle' ? flow.go('recovery') : flow.go('payment')}>{copy('checkStatus')}</Button></div>
      {state.consent.marketing && <Button className="preview-spaced preview-wrap-button" onClick={() => flow.dispatch({ type: 'consent', patch: { marketing: false } })}>{copy('withdraw')}</Button>}
    </details>
  </div>;
}

export function CheckoutStep({ flow }: Props) {
  const { copy, money } = useOnboardingCopy();
  const { state } = flow;
  const { plan, setup, amount, method: selectedMethod, resuming } = checkoutQuote(state);
  const icons = { qris: QrCode, va: Landmark, card: CreditCard };
  const invoice = <dl className="preview-invoice"><div><dt>{copy('monthly')}</dt><dd>{money(plan.monthlyPrice)}</dd></div>
    {setup > 0 && <div><dt>{copy('setupFee', { price: '' })}</dt><dd>{money(setup)}</dd></div>}
    <div className="preview-total"><dt>{copy('estimate')}</dt><dd>{money(amount)}</dd></div>
  </dl>;
  return <>
    <Paragraph className="preview-checkout-intro" type="secondary">{copy('checkoutIntro')}</Paragraph>
    <div className="preview-checkout-grid">
      <div className="preview-payment-methods">
        <div className="preview-mobile-package"><PlanSummary plan={plan.id} price /></div>
        <h2>{copy('paymentMethods')}</h2>
        <Radio.Group value={selectedMethod} disabled={resuming} onChange={(event) => {
          const method = PAYMENT_METHODS.find((value) => value === event.target.value);
          if (method) flow.dispatch({ type: 'payment-method', method });
        }} aria-label={copy('paymentMethods')} className="preview-method-options">
          {PAYMENT_METHODS.map((method) => {
            const Icon = icons[method];
            return <Radio value={method} key={method} className={`preview-method ${selectedMethod === method ? 'is-selected' : ''}`}>
              <span className="preview-method-content"><span className="preview-method-icon"><Icon size={27} aria-hidden /></span><span><strong>{copy(`method.${method}`)}</strong><small>{copy(`methodHint.${method}`)}</small></span>{method !== 'qris' && <ChevronRight size={18} aria-hidden />}</span>
            </Radio>;
          })}
        </Radio.Group>
        <aside className="preview-confirmation-hint"><Info size={19} aria-hidden /><div><strong>{copy('confirmHint')}</strong><p>{copy('confirmBody')}</p></div></aside>
        <details className="preview-mobile-invoice preview-plan-terms"><summary>{copy('invoiceDetails')}<ChevronDown size={16} aria-hidden /></summary>{invoice}<p>{copy('taxes')}</p></details>
      </div>
      <aside className="preview-payment-summary"><h2>{copy('paymentSummary')}</h2><div className="preview-payment-summary-card"><PlanSummary plan={plan.id} />{invoice}</div>
        <CheckoutAction flow={flow} /><span className="preview-secure"><ShieldCheck size={17} aria-hidden />{copy('securePayment')}</span><p className="preview-tax-note">{copy('taxes')}</p>
      </aside>
    </div>
    {flow.checkoutPlatform === 'android' && <Paragraph className="preview-platform-note" type="secondary">{copy('androidCheckout')}</Paragraph>}
  </>;
}

export function PaymentStep({ flow }: Props) {
  const { copy, date } = useOnboardingCopy();
  const { state } = flow;
  if (state.payment.activation === 'received') return <div className="preview-activation">
    <Paragraph type="secondary">{copy('activeBody')}</Paragraph>
    <div className="preview-activation-package"><PlanSummary plan={state.access.plan} detail={copy('activeUntil', { date: date(state.access.end) })} /></div>
    <Button type="primary" block size="large" onClick={() => flow.go('status')}>{copy('returnApp')}</Button>
    <Button block size="large" className="preview-outline-button" onClick={() => flow.openOverlay('invoice')}>{copy('viewInvoice')}</Button>
  </div>;
  return <>
    {flow.handoff && <Alert showIcon type="info" className="preview-spaced-bottom" title={copy('browserHandoff')} description={copy('browserHint')} />}
    <Tag color={state.payment.status === 'success' ? 'success' : state.payment.status === 'failed' ? 'error' : 'processing'}>{copy(`payment.${state.payment.status}`)}</Tag>
    <Paragraph className="preview-note">{copy('order')}: <strong>{state.payment.orderId}</strong></Paragraph>
    <Paragraph type="secondary">{copy('paymentHint')}</Paragraph>
    {state.payment.activation === 'waiting' && <Alert showIcon type="warning" title={copy('activationWaiting')} />}
    <div className="preview-simulation-field">
      <label htmlFor="preview-payment-outcome">{copy('outcome')}</label>
      <select id="preview-payment-outcome" className="preview-select" value={flow.paymentOutcome}
        onChange={(event) => { const outcome = PAYMENT_OUTCOMES.find((value) => value === event.target.value); if (outcome) flow.setPaymentOutcome(outcome); }}>
        {PAYMENT_OUTCOMES.map((outcome) => <option key={outcome} value={outcome}>{copy(`outcome.${outcome}`)}</option>)}
      </select>
    </div>
    <Button className="preview-spaced" size="large" disabled={state.offline} onClick={flow.handoff ? flow.returnFromBrowser : flow.checkPayment}>
      {copy(flow.handoff ? 'returning' : 'checkPayment')}
    </Button>
    {(state.payment.status === 'failed' || state.payment.status === 'cancelled') && <Button className="preview-spaced" size="large" onClick={() => flow.go('checkout')}>{copy('retry')}</Button>}
  </>;
}

export function RecoveryStep({ flow }: Props) {
  const { copy, date } = useOnboardingCopy();
  return <>
    <Paragraph type="secondary">{copy('recoveryIntro')}</Paragraph>
    <Alert showIcon type="info" title={copy('verificationDraft')} />
    <section className="preview-access-card preview-spaced">
      <h2>Toko Sinar (demo)</h2>
      <Paragraph>{copy(`plan.${RECOVERY_ACCESS.plan}`)} · {copy('endDate')} {date(flow.recoveryOutcome === 'expired' ? '2026-09-01' : RECOVERY_ACCESS.end)}</Paragraph>
    </section>
    <div className="preview-simulation-field">
      <label htmlFor="preview-recovery-outcome">{copy('outcome')}</label>
      <select id="preview-recovery-outcome" className="preview-select" value={flow.recoveryOutcome}
        onChange={(event) => { const value = event.target.value; if (value === 'success' || value === 'failed' || value === 'expired') flow.setRecoveryOutcome(value); }}>
        <option value="success">{copy('recoverySuccess')}</option><option value="failed">{copy('outcome.failed')}</option><option value="expired">{copy('recoverExpired')}</option>
      </select>
    </div>
    {flow.state.recovery === 'failed' && <Alert role="alert" type="error" showIcon title={copy('recoveryFailed')} />}
    {(flow.state.recovery === 'offline' || flow.state.offline) && <Alert role="alert" type="warning" showIcon title={copy('recoveryOffline')} />}
    <Paragraph className="preview-note" type="secondary">{copy('accountSeparation')}</Paragraph>
  </>;
}
