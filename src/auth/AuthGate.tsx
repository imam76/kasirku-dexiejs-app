import { Spin } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { hasActiveOwner } from './authService';
import { useAuth } from './useAuth';
import { Login } from '@/view/auth/Login';
import { SetupOwner } from '@/view/auth/SetupOwner';
import { SetupKeyDrawer } from '@/view/auth/SetupKeyDrawer';

interface AuthGateProps {
  children: ReactNode;
}

export const AuthGate = ({ children }: AuthGateProps) => {
  const { currentUser, isLoading } = useAuth();
  const hasOwner = useLiveQuery(() => hasActiveOwner(), [], null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [showSetupDrawer, setShowSetupDrawer] = useState(false);

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
        open={showSetupDrawer}
        onClose={() => setShowSetupDrawer(false)}
      />
    </>
  );
};
