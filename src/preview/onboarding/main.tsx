import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider } from '@/ThemeProvider';
import { I18nProvider } from '@/providers/I18nProvider';
import { initializeSafeAreaInsets } from '@/platform/safeAreaInsets';
import '@/lib/dayjs';
import '@/index.css';
import './preview.css';
import { OnboardingPreview } from './OnboardingPreview';

void initializeSafeAreaInsets().catch((error: unknown) => console.error('Preview safe-area initialization failed:', error));
// Deliberately does not import AuthProvider, AppShell, db, billing or sync workers.
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider storageKey="frayukti:onboarding-preview:locale">
      <ThemeProvider storageKey="frayukti:onboarding-preview:theme">
        <OnboardingPreview />
      </ThemeProvider>
    </I18nProvider>
  </StrictMode>,
);
