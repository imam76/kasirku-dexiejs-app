import { Alert, Button, Checkbox, DatePicker, Form, Input, Radio, Select, Typography } from 'antd';
import dayjs from '@/lib/dayjs';
import { useIsMobile } from '@/hooks/useIsMobile';
import { Check, ChevronDown, Store, Link2 } from 'lucide-react';
import { BASE_MODULES, getPlan, moduleLabel, PLAN_CATALOG } from './catalog';
import { validateAccountingDraft } from '@/view/auth/ownerAccountingSetupModel';
import type { OnboardingController } from './useOnboardingPreview';
import { useOnboardingCopy } from './useOnboardingCopy';
import type { Registration } from './model';

const { Paragraph, Text } = Typography;
type Props = { flow: OnboardingController };

export function WelcomeStep({ flow }: Props) {
  const { copy } = useOnboardingCopy();
  return <>
    <Paragraph type="secondary">{copy('welcomeIntro')}</Paragraph>
    <div className="preview-entry-options">
      <button className="preview-choice" type="button" onClick={() => flow.go('registration')}>
        <Store size={28} aria-hidden /><strong>{copy('newBusiness')}</strong><span>{copy('newHint')}</span>
      </button>
      <button className="preview-choice" type="button" onClick={() => flow.go('recovery')}>
        <Link2 size={28} aria-hidden /><strong>{copy('existing')}</strong><span>{copy('existingHint')}</span>
      </button>
    </div>
    <Paragraph className="preview-note" type="secondary">{copy('accountSeparation')}</Paragraph>
  </>;
}

export function RegistrationStep({ flow }: Props) {
  const { copy } = useOnboardingCopy();
  const { state, dispatch } = flow;
  const field = (name: keyof Registration, options: { autoComplete: string; inputMode?: 'text' | 'tel' | 'email'; placeholder?: string }) => {
    const error = state.errors[name];
    const message = error ? copy(error === 'phone' ? 'phone' : error === 'email' ? 'invalidEmail' : 'required') : undefined;
    return <Form.Item label={copy(name)} htmlFor={`preview-${name}`} validateStatus={error ? 'error' : undefined} help={message} required={!['email', 'location'].includes(name)}>
      <Input id={`preview-${name}`} value={state.registration[name]} aria-invalid={!!error} aria-describedby={error ? `preview-${name}-error` : undefined}
        {...options} size="large" maxLength={name === 'whatsapp' ? 21 : 150}
        onChange={(event) => dispatch({ type: 'registration', patch: { [name]: event.target.value } })} />
      {error && <span className="sr-only" id={`preview-${name}-error`}>{message}</span>}
    </Form.Item>;
  };
  return <>
    <Paragraph type="secondary">{copy('registrationIntro')}</Paragraph>
    <Form layout="vertical" component="div" requiredMark={false} className="preview-form-grid preview-registration-form">
      {field('owner', { autoComplete: 'name' })}
      {field('business', { autoComplete: 'organization' })}
      {field('whatsapp', { autoComplete: 'tel', inputMode: 'tel', placeholder: '081234567890' })}
      <Form.Item label={copy('businessType')} htmlFor="preview-businessType" required validateStatus={state.errors.businessType ? 'error' : undefined} help={state.errors.businessType ? copy('required') : undefined}>
        <Select id="preview-businessType" virtual={false} size="large" value={state.registration.businessType || undefined} placeholder={copy('notSelected')} aria-invalid={!!state.errors.businessType}
          open={state.overlay === 'business-type'} onOpenChange={(open) => open ? flow.openOverlay('business-type') : state.overlay === 'business-type' && flow.closeOverlay()}
          onChange={(value: string) => dispatch({ type: 'registration', patch: { businessType: value } })}
          options={(['retail', 'trading', 'production', 'cooperative', 'other'] as const).map((value) => ({ value, label: copy(value) }))} />
      </Form.Item>
      {field('email', { autoComplete: 'email', inputMode: 'email' })}
      {field('location', { autoComplete: 'address-level2' })}
    </Form>
  </>;
}

export function PlansStep({ flow }: Props) {
  const { copy, money } = useOnboardingCopy();
  const { state, dispatch } = flow;
  return <>
    <div className="preview-plan-toolbar"><Paragraph type="secondary">{copy('plansIntro')}</Paragraph><span className="preview-period"><span>{copy('billingMonthly')}</span><small>{copy('manualRenewal')}</small></span></div>
    <div className="preview-plans" role="group" aria-label={copy('plans')}>
      {PLAN_CATALOG.map((plan) => <section className={`preview-plan ${state.plan === plan.id ? 'is-selected' : ''}`} key={plan.id}>
        {plan.id === 'pos' && <span className="preview-recommended">{copy('recommended')}</span>}
        <button type="button" className="preview-plan-mobile-choice" aria-pressed={state.plan === plan.id} aria-expanded={state.plan === plan.id}
          aria-label={`${copy('choose')} ${copy(`plan.${plan.id}`)}`} onClick={() => dispatch({ type: 'plan', plan: plan.id })}>
          <span className="preview-selection-dot" aria-hidden /><strong>{copy(`plan.${plan.id}`)}</strong>
          <span className="preview-compact-price">{money(plan.monthlyPrice)}<small>{copy('month')}</small></span><ChevronDown size={17} aria-hidden />
        </button>
        <div className="preview-plan-content">
        <h2>{copy(`plan.${plan.id}`)}</h2>
        <div className="preview-price">{money(plan.monthlyPrice)} <small>{copy('month')}</small></div>
        <ul className="preview-plan-features">{([1, 2, 3] as const).map((index) => <li key={index}><Check size={14} aria-hidden /><span>{copy(`feature.${plan.id}.${index}`)}</span></li>)}</ul>
        {plan.setupPrice > 0 && <Text>{copy('setupFee', { price: money(plan.setupPrice) })}</Text>}
        <Button className="preview-plan-desktop-choice" size="large" block type={state.plan === plan.id ? 'primary' : 'default'} aria-pressed={state.plan === plan.id}
          icon={state.plan === plan.id ? <Check size={16} /> : undefined} onClick={() => dispatch({ type: 'plan', plan: plan.id })}>
          {state.plan === plan.id ? copy('selected') : copy('choose')}
          <span className="sr-only"> {copy(`plan.${plan.id}`)}</span>
        </Button>
        </div>
      </section>)}
    </div>
    {state.plan && <Button className="preview-spaced" onClick={() => flow.openOverlay('modules')}>{copy('modules')} · {copy(`plan.${state.plan}`)}</Button>}
    {state.plan === 'custom' && <fieldset className="preview-custom">
      <legend>{copy('customModules')}</legend>
      <div className="preview-module-options">
        {getPlan('custom').modules.map((code) => <Checkbox key={code} disabled={BASE_MODULES.includes(code)} checked={BASE_MODULES.includes(code) || state.customModules.includes(code)}
          onChange={(event) => dispatch({ type: 'custom', modules: event.target.checked ? [...state.customModules, code] : state.customModules.filter((value) => value !== code) })}>
          {moduleLabel(code)}
        </Checkbox>)}
      </div>
    </fieldset>}
    {state.errors.plan && <Alert type="error" showIcon title={copy('required')} />}
    <details className="preview-plan-terms"><summary>{copy('planTerms')}<ChevronDown size={15} aria-hidden /></summary><Paragraph type="secondary">{copy('pricingNote')}</Paragraph><Paragraph type="secondary">{copy('exclusions')}</Paragraph></details>
  </>;
}

const dateFields = [
  { key: 'cutoffDate', error: 'cutoff_date' }, { key: 'fiscalPeriodStart', error: 'fiscal_period_start' },
  { key: 'fiscalPeriodEnd', error: 'fiscal_period_end' }, { key: 'currentPeriodStart', error: 'current_period_start' },
  { key: 'currentPeriodEnd', error: 'current_period_end' },
] as const;

export function AccountingStep({ flow }: Props) {
  const { copy } = useOnboardingCopy();
  const isMobile = useIsMobile();
  const { state, dispatch } = flow;
  const errors = state.errors.accounting ? validateAccountingDraft(state.accounting, false) : {};
  return <>
    <Paragraph type="secondary">{copy('accountingIntro')}</Paragraph>
    <Radio.Group className="preview-radio-stack" value={state.accountingMode} onChange={(event) => dispatch({ type: 'accounting-mode', mode: event.target.value })}>
      <Radio value="default">{copy('defaultAccounting')}</Radio>
      <Radio value="configure">{copy('configureAccounting')}</Radio>
    </Radio.Group>
    {state.accountingMode === 'default' ? <Alert className="preview-spaced" type="info" showIcon title={copy('defaultHint')} /> :
      <Form component="div" layout="vertical" className="preview-form-grid preview-spaced">
        <Form.Item label={copy('template')} htmlFor="preview-template">
          <Select id="preview-template" virtual={false} size="large" value={state.accounting.businessTemplateCode}
            open={state.overlay === 'accounting-template'} onOpenChange={(open) => open ? flow.openOverlay('accounting-template') : state.overlay === 'accounting-template' && flow.closeOverlay()}
            onChange={(code) => dispatch({ type: 'accounting', patch: { businessTemplateCode: code } })}
            options={[{ value: 'RETAIL', label: copy('retail') }, { value: 'COOPERATIVE', label: copy('cooperative') },
              { value: 'GENERAL_TRADING', label: copy('trading') }, { value: 'GENERAL_SERVICE', label: copy('service') }]} />
        </Form.Item>
        <Form.Item label={copy('currency')} htmlFor="preview-currency">
          <Select id="preview-currency" virtual={false} size="large" value={state.accounting.baseCurrencyCode} onChange={(value: string) => dispatch({ type: 'accounting', patch: { baseCurrencyCode: value } })}
            open={state.overlay === 'accounting-currency'} onOpenChange={(open) => open ? flow.openOverlay('accounting-currency') : state.overlay === 'accounting-currency' && flow.closeOverlay()}
            options={['IDR', 'USD', 'SGD', 'EUR', 'AUD', 'JPY'].map((value) => ({ value, label: value }))} />
        </Form.Item>
        {dateFields.map(({ key, error }) => <Form.Item key={key} label={copy(key)} htmlFor={`preview-${key}`} validateStatus={errors[error] ? 'error' : undefined} help={errors[error] ? copy('accountingError') : undefined}>
          {isMobile ? <Input id={`preview-${key}`} type="date" size="large" value={state.accounting[key]} aria-invalid={!!errors[error]}
            onChange={(event) => dispatch({ type: 'accounting', patch: { [key]: event.target.value } })} />
            : <DatePicker id={`preview-${key}`} className="w-full" size="large" format="YYYY-MM-DD" allowClear={false}
              open={state.overlay === `date-${key}`} onOpenChange={(open) => open ? flow.openOverlay(`date-${key}`) : state.overlay === `date-${key}` && flow.closeOverlay()}
              value={state.accounting[key] && dayjs(state.accounting[key]).isValid() ? dayjs(state.accounting[key]) : null}
              onChange={(value) => dispatch({ type: 'accounting', patch: { [key]: value ? value.format('YYYY-MM-DD') : '' } })} />}
        </Form.Item>)}
      </Form>}
    {isMobile && state.accountingMode === 'configure' && <Button block size="large" onClick={() => dispatch({ type: 'skip-accounting' })}>{copy('skip')}</Button>}
  </>;
}

export function ConsentStep({ flow }: Props) {
  const { copy } = useOnboardingCopy();
  const { state, dispatch } = flow;
  return <>
    <Paragraph type="secondary">{copy('consentIntro')}</Paragraph>
    <div className="preview-documents">
      <Button onClick={() => flow.openOverlay('terms')}>{copy('terms')}</Button>
      <Button onClick={() => flow.openOverlay('privacy')}>{copy('privacy')}</Button>
    </div>
    <div className="preview-consents">
      {(['terms', 'privacy'] as const).map((key) => <div key={key}>
        <Checkbox checked={state.consent[key]} onChange={(event) => dispatch({ type: 'consent', patch: { [key]: event.target.checked } })}>
          {copy(key === 'terms' ? 'acceptTerms' : 'acceptPrivacy')}
        </Checkbox>
        {state.errors[key] && <div role="alert" tabIndex={-1}><Text type="danger">{copy('required')}</Text></div>}
      </div>)}
      <div className="preview-marketing">
        <Checkbox checked={state.consent.marketing} onChange={(event) => dispatch({ type: 'consent', patch: { marketing: event.target.checked } })}>{copy('marketing')}</Checkbox>
        <Paragraph type="secondary">{copy('marketingHint')}</Paragraph>
      </div>
    </div>
  </>;
}
