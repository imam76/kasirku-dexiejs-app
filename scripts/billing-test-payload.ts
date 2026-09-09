import { randomBytes, randomUUID } from 'node:crypto';
import { getPlanModules } from '../src/onboarding/catalog.ts';
import { hashSecret } from '../services/billing/midtrans.ts';
import {
  TERMS_TEXT,
  TERMS_VERSION,
  PRIVACY_TEXT,
  PRIVACY_VERSION,
} from '../src/onboarding/legal.ts';
export function createTrialPayload(token: string) {
  const now = Date.now();
  const timestamp = new Date(now).toISOString();
  return {
    installationId: randomUUID(),
    token,
    recoveryCode: randomBytes(32).toString('hex'),
    registration: {
      owner: 'Sandbox Tester',
      business: 'Frayukti Sandbox Test',
      whatsapp: '081234567890',
      businessType: 'Retail',
      email: '',
      location: '',
    },
    consent: {
      termsVersion: TERMS_VERSION,
      termsHash: hashSecret(TERMS_TEXT),
      privacyVersion: PRIVACY_VERSION,
      privacyHash: hashSecret(PRIVACY_TEXT),
      acceptedAt: timestamp,
      marketing: false,
      marketingUpdatedAt: timestamp,
    },
    access: {
      kind: 'trial',
      plan: 'pos',
      modules: getPlanModules('pos', []),
      start: timestamp,
      end: new Date(now + 90 * 86_400_000).toISOString(),
    },
  };
}
