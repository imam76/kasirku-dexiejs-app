import { describe, expect, mock, test } from 'bun:test';
import type { PostgresHealth } from '@/services/postgresAdapter';
import {
  createDeduplicatedPostgresHealthCheck,
  shouldRunDatabaseSyncForHealth,
} from '@/utils/postgresConnection';
import { resolveSetupConfigReconciliation } from '@/utils/setupConfigReconciliation';
import type { SetupConfig } from '@/types/setup';

const availableHealth: PostgresHealth = {
  available: true,
  status: 'available',
};

const localConfig: SetupConfig = {
  enabledModules: ['POS_TRANSACTION'],
  configuredAt: '2026-07-24T00:00:00.000Z',
  configuredBy: 'local',
};

const remoteConfig: SetupConfig = {
  enabledModules: ['PRODUCT'],
  configuredAt: '2026-07-24T01:00:00.000Z',
  configuredBy: 'remote',
};

describe('PostgreSQL offline recovery', () => {
  test('syncs once on initial availability or recovery, not on repeated healthy checks', () => {
    expect(shouldRunDatabaseSyncForHealth(undefined, true)).toBe(true);
    expect(shouldRunDatabaseSyncForHealth(false, true)).toBe(true);
    expect(shouldRunDatabaseSyncForHealth(true, true)).toBe(false);
    expect(shouldRunDatabaseSyncForHealth(false, false)).toBe(false);
  });

  test('deduplicates overlapping health checks', async () => {
    let resolveHealth: ((health: PostgresHealth) => void) | undefined;
    const healthCheck = mock(() => new Promise<PostgresHealth>((resolve) => {
      resolveHealth = resolve;
    }));
    const checkingStates: boolean[] = [];
    const receivedHealth: PostgresHealth[] = [];
    const checkConnection = createDeduplicatedPostgresHealthCheck({
      healthCheck,
      onCheckingChange: (isChecking) => checkingStates.push(isChecking),
      onHealth: (health) => receivedHealth.push(health),
    });

    const firstCheck = checkConnection();
    const secondCheck = checkConnection();

    expect(healthCheck).toHaveBeenCalledTimes(1);
    resolveHealth?.(availableHealth);
    expect(await firstCheck).toEqual(availableHealth);
    expect(await secondCheck).toEqual(availableHealth);
    expect(receivedHealth).toEqual([availableHealth]);
    expect(checkingStates).toEqual([true, false]);
  });
});

describe('setup config reconciliation', () => {
  test('keeps remote config authoritative when it exists', () => {
    expect(resolveSetupConfigReconciliation(remoteConfig, localConfig)).toEqual({
      config: remoteConfig,
      shouldUploadLocal: false,
    });
  });

  test('uploads local config only when remote config is empty', () => {
    expect(resolveSetupConfigReconciliation(null, localConfig)).toEqual({
      config: localConfig,
      shouldUploadLocal: true,
    });
    expect(resolveSetupConfigReconciliation(null, null)).toEqual({
      config: null,
      shouldUploadLocal: false,
    });
  });
});
