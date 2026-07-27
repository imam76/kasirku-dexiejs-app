import type { PostgresHealth } from '@/services/postgresAdapter';

export const shouldRunDatabaseSyncForHealth = (
  previousAvailability: boolean | undefined,
  isAvailable: boolean,
) => isAvailable && previousAvailability !== true;

interface DeduplicatedHealthCheckOptions {
  healthCheck: () => Promise<PostgresHealth>;
  onCheckingChange: (isChecking: boolean) => void;
  onHealth: (health: PostgresHealth) => void;
}

export const createDeduplicatedPostgresHealthCheck = ({
  healthCheck,
  onCheckingChange,
  onHealth,
}: DeduplicatedHealthCheckOptions) => {
  let activeHealthCheck: Promise<PostgresHealth> | null = null;

  return async (): Promise<PostgresHealth> => {
    if (activeHealthCheck) {
      return activeHealthCheck;
    }

    onCheckingChange(true);
    activeHealthCheck = healthCheck()
      .then((health) => {
        onHealth(health);
        return health;
      })
      .finally(() => {
        activeHealthCheck = null;
        onCheckingChange(false);
      });

    return activeHealthCheck;
  };
};
