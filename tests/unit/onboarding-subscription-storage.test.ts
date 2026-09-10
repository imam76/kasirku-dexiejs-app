import { afterAll, describe, expect, test } from 'bun:test';
import { getPlanModules } from '../../src/onboarding/catalog';
import {
  readSubscription,
  SUBSCRIPTION_KEY,
} from '../../src/onboarding/storage';

const originalLocalStorage = Object.getOwnPropertyDescriptor(
  globalThis,
  'localStorage',
);
const values = new Map<string, string>();
const localStorageStub: Storage = {
  get length() {
    return values.size;
  },
  clear: () => values.clear(),
  getItem: (key) => values.get(key) ?? null,
  key: (index) => [...values.keys()][index] ?? null,
  removeItem: (key) => values.delete(key),
  setItem: (key, value) => values.set(key, value),
};

Object.defineProperty(globalThis, 'localStorage', {
  configurable: true,
  value: localStorageStub,
});

afterAll(() => {
  if (originalLocalStorage)
    Object.defineProperty(globalThis, 'localStorage', originalLocalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
});

describe('subscription storage migration', () => {
  test('upgrades version 1 and permanently removes its installation token', () => {
    const now = new Date().toISOString();
    const access = {
      kind: 'trial' as const,
      plan: 'pos' as const,
      modules: getPlanModules('pos', []),
      start: now,
      end: new Date(Date.parse(now) + 90 * 86_400_000).toISOString(),
    };
    localStorage.setItem(
      SUBSCRIPTION_KEY,
      JSON.stringify({
        version: 1,
        installationId: crypto.randomUUID(),
        businessId: crypto.randomUUID(),
        token: 'a'.repeat(64),
        recoveryCode: 'b'.repeat(64),
        registration: {
          owner: 'Owner Lama',
          business: 'Usaha Lama',
          whatsapp: '081234567890',
          businessType: 'Retail',
          email: '',
          location: '',
        },
        consent: {
          termsVersion: 'terms-test',
          termsHash: 'c'.repeat(64),
          privacyVersion: 'privacy-test',
          privacyHash: 'd'.repeat(64),
          acceptedAt: now,
          marketing: false,
          marketingUpdatedAt: now,
        },
        access,
        originalTrial: access,
        leadPending: false,
        consentPending: false,
        reminderDismissed: null,
      }),
    );

    const migrated = readSubscription();
    const persisted = JSON.parse(localStorage.getItem(SUBSCRIPTION_KEY)!);

    expect(migrated).toMatchObject({
      version: 2,
      recoveryCode: 'b'.repeat(64),
      access,
    });
    expect(migrated).not.toHaveProperty('token');
    expect(persisted.version).toBe(2);
    expect(persisted).not.toHaveProperty('token');
  });
});
