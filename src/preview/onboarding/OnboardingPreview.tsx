import { useEffect, useRef, type CSSProperties } from 'react';
import { Alert, Button, ConfigProvider, Modal, Progress, Steps, Switch, Tag, Typography, theme } from 'antd';
import { ArrowLeft, Check, ChevronDown, Download, FlaskConical, Languages, Menu, Moon, Settings2, ShieldCheck } from 'lucide-react';
import { SetupPageHeading, SetupSurface } from '@/components/auth/SetupPresentation';
import MobileCrudBottomSheet from '@/components/mobile-crud/MobileCrudBottomSheet';
import { useI18n } from '@/hooks/useI18n';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useTheme } from '@/hooks/useTheme';
import { getPlan, getPlanModules, moduleLabel } from './catalog';
import { isAccessExpired, WIZARD_STEPS } from './model';
import { useOnboardingPreview } from './useOnboardingPreview';
import { useOnboardingCopy } from './useOnboardingCopy';
import { AccountingStep, ConsentStep, PlansStep, RegistrationStep, WelcomeStep } from './WizardSteps';
import { AccessStep, CheckoutStep, PaymentStep, RecoveryStep } from './AccessSteps';
import { SCENARIOS } from './simulation';
import { isDialogOverlay } from './navigation';
import { BillingOverlay, CheckoutAction, PreviewNavigation } from './BillingPresentation';

const { Paragraph, Text } = Typography;

export function OnboardingPreview() {
  const flow = useOnboardingPreview();
  const { state } = flow;
  const isMobile = useIsMobile();
  const { copy, money, date } = useOnboardingCopy();
  const { isDark, toggle } = useTheme();
  const { locale, toggleLocale } = useI18n();
  const { token } = theme.useToken();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const mainRef = useRef<HTMLElement>(null);
  const overlayTrigger = useRef<HTMLElement | null>(null);
  const wasOverlayOpen = useRef(false);
  const step = WIZARD_STEPS.indexOf(state.screen);
  const inWizard = step >= 0 && state.onboarding !== 'complete';
  const expired = isAccessExpired(state);
  const activated = state.screen === 'payment' && state.payment.activation === 'received';
  const managing = state.screen === 'status' && state.access.kind === 'subscription' && !expired;
  const billingScreen = ['plans', 'checkout', 'payment', 'status'].includes(state.screen);
  const dialogOpen = isDialogOverlay(state.overlay);
  const previewTheme = {
    colorPrimary: isDark ? '#4d98ff' : '#0672ff', colorInfo: isDark ? '#4d98ff' : '#0672ff',
    colorText: isDark ? '#edf3ff' : '#0b1638', colorTextSecondary: isDark ? '#a9bbd9' : '#536b91',
    colorPrimaryBg: isDark ? '#172b48' : '#edf5ff',
  };
  const cssVariables = {
    '--preview-bg': isDark ? token.colorBgLayout : '#fbfcff', '--preview-surface': token.colorBgContainer,
    '--preview-text': previewTheme.colorText, '--preview-muted': previewTheme.colorTextSecondary,
    '--preview-border': token.colorBorderSecondary, '--preview-primary': previewTheme.colorPrimary,
    '--preview-tint': previewTheme.colorPrimaryBg, '--preview-shadow': token.boxShadow,
  } as CSSProperties;

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
    mainRef.current?.scrollTo({ top: 0 });
  }, [state.screen]);
  useEffect(() => {
    if (Object.keys(state.errors).length) mainRef.current?.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]')?.focus();
  }, [state.errors]);
  useEffect(() => {
    if (dialogOpen && !wasOverlayOpen.current) overlayTrigger.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialogOpen && wasOverlayOpen.current) overlayTrigger.current?.focus();
    wasOverlayOpen.current = dialogOpen;
  }, [dialogOpen]);

  const title = copy(activated ? 'activeTitle' : managing ? 'nav.status' : state.screen);
  const overlayTitle = state.overlay === 'modules' ? copy('modules') : state.overlay === 'backup' ? copy('backupTitle')
    : state.overlay === 'scenarios' ? copy('controls') : state.overlay === 'menu' ? copy('navigation')
    : state.overlay === 'invoice' ? copy('invoicePreview') : state.overlay === 'history' ? copy('paymentHistory') : state.overlay === 'help' ? copy('help')
    : state.overlay === 'terms' ? copy('terms') : copy('privacy');
  const overlayContent = <div className="preview-overlay-content" style={cssVariables}>
    <BillingOverlay flow={flow} />
    {(state.overlay === 'terms' || state.overlay === 'privacy') && <Paragraph>{copy(state.overlay === 'terms' ? 'termsBody' : 'privacyBody')}</Paragraph>}
    {state.overlay === 'backup' && <Alert showIcon type="info" title={copy('backupBody')} />}
    {state.overlay === 'modules' && state.plan && <>
      <h3>{copy(`plan.${state.plan}`)}</h3>
      <ul className="preview-module-list">{getPlanModules(state.plan, state.customModules).map((code) => <li key={code}>{moduleLabel(code)}</li>)}</ul>
      <Paragraph type="secondary">{copy('exclusions')}</Paragraph>
    </>}
    {state.overlay === 'scenarios' && <>
      <Paragraph type="secondary">{copy('notice')} {copy('clock', { date: date(state.now) })}</Paragraph>
      <label htmlFor="preview-platform">{copy('runtime')}</label>
      <select id="preview-platform" className="preview-select" value={flow.checkoutPlatform} onChange={(event) => flow.setCheckoutPlatform(event.target.value === 'android' ? 'android' : 'desktop')}>
        <option value="desktop">{copy('desktop')}</option><option value="android">{copy('android')}</option>
      </select>
      <div className="preview-scenarios">{SCENARIOS.map((scenario) => <Button key={scenario} className="preview-wrap-button" onClick={() => flow.applyScenario(scenario)}>{copy(`scenario.${scenario}`)}</Button>)}</div>
    </>}
    <Button size="large" block className="preview-spaced" onClick={flow.closeOverlay}>{copy('close')}</Button>
  </div>;

  const next = () => flow.dispatch({ type: state.screen === 'consent' ? 'start-trial' : 'next' });
  const content = <>
    {state.screen === 'welcome' && <WelcomeStep flow={flow} />}
    {state.screen === 'registration' && <RegistrationStep flow={flow} />}
    {state.screen === 'plans' && <PlansStep flow={flow} />}
    {state.screen === 'accounting' && <AccountingStep flow={flow} />}
    {state.screen === 'consent' && <ConsentStep flow={flow} />}
    {state.screen === 'status' && <AccessStep flow={flow} />}
    {state.screen === 'checkout' && <CheckoutStep flow={flow} />}
    {state.screen === 'payment' && <PaymentStep flow={flow} />}
    {state.screen === 'recovery' && <RecoveryStep flow={flow} />}
  </>;
  const owner = state.registration.owner || copy('guest');
  const avatar = owner.split(' ').slice(0, 2).map((part) => part[0]).join('').toUpperCase();
  const profile = <div className="preview-profile"><span className="preview-avatar">{avatar}</span><span><strong>{owner}</strong><small>{copy('ownerRole')}</small></span></div>;
  const showFooter = state.screen !== 'welcome' && !activated && !managing && (state.screen !== 'checkout' || isMobile);
  return <ConfigProvider theme={{ token: { ...previewTheme, controlHeight: 44 }, components: { Button: { primaryColor: '#FFFFFF' } } }}>
    <div className={`onboarding-preview ${isMobile ? 'is-mobile' : 'is-desktop'} ${billingScreen ? 'is-billing' : ''} ${state.screen === 'plans' || state.screen === 'checkout' ? 'is-wide' : ''} ${activated ? 'is-activated' : ''} screen-${state.screen}`} style={cssVariables}
      onKeyDownCapture={(event) => {
        // With the underlay inert, Shift+Tab on the first drawer button would
        // otherwise leave the document for browser chrome before focusin fires.
        if (!isMobile || !dialogOpen || event.key !== 'Tab' || !(event.target instanceof HTMLElement)) return;
        const dialog = event.target.closest('[role="dialog"]');
        const controls = dialog ? Array.from(dialog.querySelectorAll<HTMLElement>('button, a[href], input, select, textarea, [tabindex]'))
          .filter((element) => element.tabIndex >= 0 && !element.matches(':disabled') && element.getClientRects().length > 0) : [];
        const first = controls[0];
        const last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first && last) { event.preventDefault(); last.focus(); }
        else if (!event.shiftKey && document.activeElement === last && first) { event.preventDefault(); first.focus(); }
      }}>
      <div className="preview-underlay" inert={dialogOpen}>
        <header className="preview-header">
          <div className="preview-brand-area">
            {isMobile && <Button type="text" icon={<Menu size={20} />} aria-label={copy('navigation')} onClick={() => flow.openOverlay('menu')} />}
            <a className="preview-brand" href="/onboarding-preview.html" onClick={(event) => { event.preventDefault(); flow.go(state.access.kind === 'none' ? 'welcome' : 'status'); }}>
              <img src="/frayukti-f.svg" alt="" /><span>Frayukti</span>
            </a>
            {!isMobile && <span className="preview-tagline">{copy('tagline')}</span>}
          </div>
          <div className="preview-header-actions">
            <Button type="text" icon={<Languages size={18} />} aria-label={copy('language')} onClick={toggleLocale}>{!isMobile && (locale === 'id' ? 'EN' : 'ID')}</Button>
            <Button type="text" icon={<Moon size={18} />} aria-label={copy('theme')} onClick={toggle} />
            <Button type="text" icon={<Settings2 size={18} />} aria-label={copy('controls')} onClick={() => flow.openOverlay('scenarios')}>{!isMobile && copy('controls')}</Button>
            {!isMobile && <div className="preview-header-profile">{profile}<ChevronDown size={14} aria-hidden /></div>}
          </div>
        </header>
        <div className="preview-environment">
          <Tag icon={<FlaskConical size={12} />}>{copy('preview')}</Tag><Text className="preview-environment-notice" type="secondary">{copy('notice')}</Text>
          <label className="preview-offline"><Switch size="small" checked={state.offline} onChange={(value) => flow.dispatch({ type: 'offline', value })} aria-label={copy('offline')} />{copy('offline')}</label>
        </div>
        <div className="preview-body">
          {!isMobile && <aside className="preview-sidebar"><span className="preview-sidebar-caption">{copy('settings')}</span><PreviewNavigation flow={flow} /><div className="preview-sidebar-profile">{profile}</div></aside>}
          <div className="preview-workspace">
            <main ref={mainRef} className="preview-main" id="preview-main">
              <div className="preview-page-container">
              {!flow.storageAvailable && <Alert type="warning" showIcon title={copy('storageError')} />}
              {state.offline && <Alert className="preview-spaced-bottom" type="warning" showIcon title={copy('offlineHint')} />}
              {billingScreen ? <div className="preview-billing-heading">
                {!isMobile && !activated && <div className="preview-breadcrumb">{copy('settings')}<span>/</span>{copy(state.screen === 'plans' ? 'nav.plans' : state.screen === 'checkout' || state.screen === 'payment' ? 'nav.checkout' : 'nav.status')}</div>}
                {activated && <div className="preview-success-icon"><Check size={46} strokeWidth={3} aria-hidden /></div>}
                <h1 ref={headingRef} tabIndex={-1}>{title}</h1>
              </div> : <SetupPageHeading headingRef={headingRef} icon={<ShieldCheck size={24} />} title={title} />}
              {inWizard && (isMobile ? <div className="preview-progress"><Text type="secondary">{copy('progress', { current: step + 1 })}</Text><Progress percent={(step + 1) * 25} showInfo={false} size="small" /></div>
                : <Steps className="mb-7" size="small" responsive={false} current={step}
                  items={WIZARD_STEPS.map((screen) => ({ title: copy(screen === 'registration' ? 'step.registration' : screen === 'plans' ? 'step.plans' : screen === 'accounting' ? 'step.accounting' : 'step.consent') }))}
                  onChange={(index) => { if (index < step) flow.go(WIZARD_STEPS[index]); }} />)}
              {state.plan && !billingScreen && state.screen !== 'welcome' && state.screen !== 'registration' && <div className="preview-summary">
                <Text type="secondary">{state.registration.business || copy('summary')}</Text>
                <Text strong>{copy(`plan.${state.plan}`)} · {money(getPlan(state.plan).monthlyPrice)} {copy('month')}</Text>
              </div>}
              {billingScreen ? content : <SetupSurface>{content}</SetupSurface>}
              </div>
            </main>
            {showFooter && <footer className="preview-footer"><div className="preview-footer-content">
              {state.screen === 'status' && expired
                ? <Button size="large" icon={<Download size={17} />} onClick={() => flow.openOverlay('backup')}>{copy('export')}</Button>
                : <Button size="large" icon={<ArrowLeft size={17} />} onClick={flow.back}>{copy('back')}</Button>}
              {!isMobile && state.screen === 'accounting' && state.accountingMode === 'configure' && <Button size="large" className="preview-wrap-button" onClick={() => {
                flow.dispatch({ type: 'skip-accounting' });
              }}>{copy('skip')}</Button>}
              {(inWizard || state.screen === 'plans') && <Button type="primary" size="large" onClick={next}>{copy(state.screen === 'consent' ? 'startTrial' : 'next')}</Button>}
              {state.screen === 'status' && <Button type="primary" size="large" onClick={() => flow.go('checkout')}>{copy(expired ? 'payNow' : state.access.kind === 'trial' ? 'upgrade' : 'renew')}</Button>}
              {state.screen === 'checkout' && <CheckoutAction flow={flow} />}
              {state.screen === 'payment' && <Button type="primary" size="large" onClick={() => flow.go('status')}>{copy('status')}</Button>}
              {state.screen === 'recovery' && <Button type="primary" size="large" className="preview-wrap-button" onClick={flow.recover}>{copy('verify')}</Button>}
            </div></footer>}
          </div>
        </div>
      </div>
      {isMobile ? <MobileCrudBottomSheet open={dialogOpen} onClose={flow.closeOverlay} title={overlayTitle} rootClassName="onboarding-preview-sheet"
        bodyStyle={{ maxHeight: 'calc(var(--app-vh, 100vh) - var(--app-safe-area-inset-top, 0px) - var(--app-keyboard-inset-bottom, 0px) - 90px)', overflowY: 'auto' }}>
        {overlayContent}
      </MobileCrudBottomSheet> : <Modal open={dialogOpen} title={overlayTitle} onCancel={flow.closeOverlay} footer={null} destroyOnHidden width={680}>{overlayContent}</Modal>}
    </div>
  </ConfigProvider>;
}
