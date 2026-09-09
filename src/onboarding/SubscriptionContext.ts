import { createContext } from 'react';
import type { Subscription } from './storage';

export const SubscriptionContext = createContext<{
  subscription: Subscription;
  now: number;
  openManage: () => void;
} | null>(null);
