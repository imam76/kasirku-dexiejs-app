import { describe, expect, test } from 'bun:test';
import { resolveHostSwitchDecision } from '@/utils/hostSwitch';

describe('host switch guard', () => {
  test('binds the host on first connection even when local data exists', () => {
    expect(resolveHostSwitchDecision({
      storedInstanceId: null,
      nextInstanceId: 'host-a',
      hasLocalData: true,
    })).toBe('bind-host');
  });

  test('keeps reconnecting to the same host untouched', () => {
    expect(resolveHostSwitchDecision({
      storedInstanceId: 'host-a',
      nextInstanceId: 'host-a',
      hasLocalData: true,
    })).toBe('same-host');
  });

  test('requires a local reset when moving to another host with local data', () => {
    expect(resolveHostSwitchDecision({
      storedInstanceId: 'host-a',
      nextInstanceId: 'host-b',
      hasLocalData: true,
    })).toBe('requires-local-reset');
  });

  test('rebinds without reset when the local database is empty', () => {
    expect(resolveHostSwitchDecision({
      storedInstanceId: 'host-a',
      nextInstanceId: 'host-b',
      hasLocalData: false,
    })).toBe('bind-host');
  });

  test('falls back to binding when the host identity is unavailable', () => {
    expect(resolveHostSwitchDecision({
      storedInstanceId: 'host-a',
      nextInstanceId: null,
      hasLocalData: true,
    })).toBe('bind-host');
  });
});
