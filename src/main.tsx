import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import AppShell from '@/AppShell';
import 'react-grid-layout/css/styles.css';
import 'react-resizable/css/styles.css';
import '@/index.css';
import { ThemeProvider } from '@/ThemeProvider';
import { QueryProvider } from '@/providers/QueryProvider';
import '@/lib/dayjs';
import { I18nProvider } from '@/providers/I18nProvider';
import { AuthProvider } from '@/auth/AuthProvider';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryProvider>
      <I18nProvider>
        <ThemeProvider defaultMode="light">
          <AuthProvider>
            <AppShell />
          </AuthProvider>
        </ThemeProvider>
      </I18nProvider>
    </QueryProvider>
  </StrictMode>
);
