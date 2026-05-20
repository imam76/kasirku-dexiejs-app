import { Spin } from 'antd';
import { useLiveQuery } from 'dexie-react-hooks';
import type { ReactNode } from 'react';
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

  if (isLoading || hasOwner === null) {
    return (
      <div className="flex min-h-[100dvh] items-center justify-center">
        <Spin size="large" />
      </div>
    );
  }

  if (!hasOwner) {
    return <SetupOwner />;
  }

  if (!currentUser) {
    return <Login />;
  }

  return <>{children}</>;
};
