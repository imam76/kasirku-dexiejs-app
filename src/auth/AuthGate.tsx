import { Spin } from 'antd';
import { Store, Zap, BarChart3, ShieldCheck } from 'lucide-react';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { hasActiveOwner } from './authService';
import { useAuth } from './useAuth';
import { Login } from '@/view/auth/Login';
import { SetupOwner } from '@/view/auth/SetupOwner';
import { SetupKeyDrawer } from '@/view/auth/SetupKeyDrawer';
import { isTauriRuntime } from '@/utils/export/platform';
import { isSetupConfigured } from '@/services/setupKeyService';

interface AuthGateProps {
  children: ReactNode;
}

export const AuthGate = ({ children }: AuthGateProps) => {
  const { currentUser, isLoading } = useAuth();
  const hasOwner = useLiveQuery(() => hasActiveOwner(), [], null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [showSetupDrawer, setShowSetupDrawer] = useState(false);

  // Tauri Enforcement
  const [isConfigured, setIsConfigured] = useState(() => isSetupConfigured());
  const isTauri = isTauriRuntime();
  const setupRequired = isTauri && !isConfigured;

  const isLoggedOut = !isLoading && !currentUser;

  // Hidden keyboard shortcut: Ctrl+Shift+? (only when not logged in)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isLoggedOut) return;
      // Ctrl+Shift+? — the '?' key is Shift+/ on most keyboards
      if (e.ctrlKey && e.shiftKey && e.key === '?') {
        e.preventDefault();
        setShowSetupDrawer((prev) => !prev);
      }
    },
    [isLoggedOut],
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Update isConfigured when drawer closes
  const handleDrawerClose = useCallback(() => {
    setShowSetupDrawer(false);
    setIsConfigured(isSetupConfigured());
  }, []);

  if (isLoading || hasOwner === null) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (currentUser) {
    return <>{children}</>;
  }

  // Unauthenticated — render Login/SetupOwner + hidden SetupKeyDrawer
  const authContent = (() => {
    if (setupRequired) {
      return (
        <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 p-4">
          <div className="max-w-md text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg">
              <Store size={32} />
            </div>
            <h1 className="mb-2 text-3xl font-bold text-gray-900">Selamat Datang di Frayukti</h1>
            <p className="mb-8 text-lg text-gray-600">
              Solusi cerdas untuk manajemen bisnis dan operasional kasir Anda.
            </p>
            <div className="grid gap-4 text-left">
              <div className="flex items-start gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                  <Zap size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Manajemen Cepat & Efisien</h3>
                  <p className="text-sm text-gray-500">Kelola produk dan transaksi dengan mudah, dirancang untuk kecepatan operasional.</p>
                </div>
              </div>
              <div className="flex items-start gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600">
                  <BarChart3 size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Laporan Real-time</h3>
                  <p className="text-sm text-gray-500">Pantau perkembangan dan performa bisnis Anda kapan saja dan di mana saja.</p>
                </div>
              </div>
              <div className="flex items-start gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
                  <ShieldCheck size={20} />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900">Keamanan Terjamin</h3>
                  <p className="text-sm text-gray-500">Sistem yang aman dengan perlindungan data dan sinkronisasi yang handal.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      );
    }

    if (!hasOwner) {
      if (authMode === 'register') {
        return (
          <SetupOwner
            onBackToLogin={() => setAuthMode('login')}
            onComplete={() => setAuthMode('login')}
          />
        );
      }

      return (
        <Login
          registrationAvailable
          onRegister={() => setAuthMode('register')}
        />
      );
    }

    return <Login />;
  })();

  return (
    <>
      {authContent}
      <SetupKeyDrawer
        open={showSetupDrawer || (setupRequired && showSetupDrawer)} // auto open can be handled by user clicking button
        onClose={handleDrawerClose}
        forceMode={setupRequired}
      />
    </>
  );
};
