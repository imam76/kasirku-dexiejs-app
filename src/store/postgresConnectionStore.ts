import { create } from 'zustand';
import {
  postgresAdapter,
  type PostgresHealth,
} from '@/services/postgresAdapter';
import { createDeduplicatedPostgresHealthCheck } from '@/utils/postgresConnection';

interface PostgresConnectionState {
  health: PostgresHealth | null;
  isChecking: boolean;
  lastCheckedAt?: string;
  setHealth: (health: PostgresHealth) => void;
}

export const usePostgresConnectionStore = create<PostgresConnectionState>((set) => ({
  health: null,
  isChecking: false,
  setHealth: (health) => {
    set({
      health,
      lastCheckedAt: new Date().toISOString(),
    });
  },
}));

export const setPostgresConnectionHealth = (health: PostgresHealth) => {
  usePostgresConnectionStore.getState().setHealth(health);
};

export const checkPostgresConnection = createDeduplicatedPostgresHealthCheck({
  healthCheck: () => postgresAdapter.healthCheck(),
  onCheckingChange: (isChecking) => {
    usePostgresConnectionStore.setState({ isChecking });
  },
  onHealth: setPostgresConnectionHealth,
});
