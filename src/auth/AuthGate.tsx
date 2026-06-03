import { Spin } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import { useState, type ReactNode } from 'react';
import { hasActiveOwner } from './authService';
import { useAuth } from './useAuth';
import { Login } from '@/view/auth/Login';
import { SetupOwner } from '@/view/auth/SetupOwner';

interface AuthGateProps {
  children: ReactNode;
}

export const AuthGate = ({ children }: AuthGateProps) => {
  const { currentUser, isLoading } = useAuth();
  const hasOwner = useLiveQuery(() => hasActiveOwner(), [], null);
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');

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
};
