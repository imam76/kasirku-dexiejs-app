import { describe, expect, test } from 'bun:test';
import { PLAN_CATALOG, getPlanModules } from '../../src/onboarding/catalog';
import {
  accessSchema,
  addBillingMonth,
  DAY_MS,
  hasAccess,
  registrationSchema,
  remainingDays,
  reminderDate,
  type Access,
} from '../../src/onboarding/contract';
import {
  normalizeSetupConfig,
  CURRENT_MODULE_CATALOG_VERSION,
} from '../../src/services/setupKeyService';
import { withAutomaticAccountingBaselineModules } from '../../src/services/accountingInitialSetupService';
import { createHash } from 'node:crypto';
import {
  isPaid,
  verifySignature,
  type MidtransStatus,
} from '../../services/billing/midtrans';

const trial: Access = {
  kind: 'trial',
  plan: 'pos',
  modules: getPlanModules('pos', []),
  start: '2026-01-01T00:00:00.000Z',
  end: '2026-04-01T00:00:00.000Z',
};
describe('onboarding access and sellable entitlements', () => {
  test('caps trial at 90 days, blocks at the exact expiry, and shows a partial final day', () => {
    expect(accessSchema.safeParse(trial).success).toBe(true);
    expect(hasAccess(trial, Date.parse(trial.end) - 1)).toBe(true);
    expect(remainingDays(trial, Date.parse(trial.end) - 1)).toBe(1);
    expect(hasAccess(trial, Date.parse(trial.end))).toBe(false);
    expect(
      hasAccess({
        ...trial,
        end: new Date(Date.parse(trial.end) + DAY_MS).toISOString(),
      }),
    ).toBe(false);
    expect(hasAccess({ ...trial, end: 'invalid' })).toBe(false);
  });
  test('paid access outlives the trial and clamps calendar-month renewals', () => {
    expect(
      hasAccess(
        { ...trial, kind: 'subscription', end: '2027-01-01T00:00:00.000Z' },
        Date.parse('2026-09-01'),
      ),
    ).toBe(true);
    expect(addBillingMonth('2026-01-31T12:34:56.000Z')).toBe(
      '2026-02-28T12:34:56.000Z',
    );
    expect(addBillingMonth('2028-01-31T12:34:56.000Z')).toBe(
      '2028-02-29T12:34:56.000Z',
    );
    expect(addBillingMonth('2026-12-31T00:00:00.000Z')).toBe(
      '2027-01-31T00:00:00.000Z',
    );
  });
  test('all sale packages survive BOTH setup normalizers without extra GL or production access', () => {
    for (const plan of PLAN_CATALOG) {
      const normalized = normalizeSetupConfig({
        enabledModules: plan.modules,
        configuredAt: trial.start,
        configuredBy: 'test',
        moduleCatalogVersion: CURRENT_MODULE_CATALOG_VERSION,
      });
      expect(normalized.enabledModules).toEqual(plan.modules);
      expect(withAutomaticAccountingBaselineModules(plan.modules)).toEqual(
        plan.modules,
      );
      expect(normalized.enabledModules).not.toContain('GENERAL_LEDGER');
      expect(normalized.enabledModules).not.toContain('FIXED_ASSET');
    }
    expect(getPlanModules('pos', [])).not.toContain('PRODUCTION');
    expect(
      withAutomaticAccountingBaselineModules(['GENERAL_LEDGER']),
    ).toContain('GENERAL_LEDGER');
  });
  test('rejects forged or incomplete entitlements and limits Custom to sale catalog', () => {
    expect(
      accessSchema.safeParse({
        ...trial,
        modules: [...trial.modules, 'GENERAL_LEDGER'],
      }).success,
    ).toBe(false);
    expect(
      accessSchema.safeParse({ ...trial, modules: ['POS_TRANSACTION'] })
        .success,
    ).toBe(false);
    expect(getPlanModules('custom', ['GENERAL_LEDGER', 'PRODUCTION'])).toEqual([
      'ROLE_PERMISSION',
      'CASH_FLOW',
      'CHART_OF_ACCOUNTS',
      'PRODUCTION',
    ]);
  });
  test('keeps email optional, rejects extra business transaction data, and reminds on Wednesday', () => {
    const registration = {
      owner: 'Pemilik',
      business: 'Usaha uji',
      whatsapp: '081234567890',
      businessType: 'Ritel',
    };
    expect(registrationSchema.safeParse(registration).success).toBe(true);
    expect(
      registrationSchema.safeParse({ ...registration, transactions: [] })
        .success,
    ).toBe(false);
    expect(
      registrationSchema.safeParse({ ...registration, whatsapp: '123' })
        .success,
    ).toBe(false);
    expect(reminderDate(new Date(2026, 8, 9))).toBe('2026-9-9');
    expect(reminderDate(new Date(2026, 8, 10))).toBeNull();
  });
});
describe('Midtrans verification', () => {
  const key = 'Mid-server-test';
  const body = {
    order_id: 'test-123',
    status_code: '200',
    gross_amount: '149000.00',
    signature_key: '',
  };
  test('authenticates signature and rejects tampered amount/signatures', () => {
    const signature_key = createHash('sha512')
      .update(body.order_id + body.status_code + body.gross_amount + key)
      .digest('hex');
    expect(verifySignature({ ...body, signature_key }, key)).toBe(true);
    expect(
      verifySignature({ ...body, signature_key, gross_amount: '1.00' }, key),
    ).toBe(false);
    expect(verifySignature({ ...body, signature_key: 'bad' }, key)).toBe(false);
  });
  test('only settlement or accepted card capture grant access', () => {
    const status: MidtransStatus = {
      order_id: 'test',
      merchant_id: 'test',
      gross_amount: '149000.00',
      status_code: '200',
      transaction_status: 'settlement',
      payment_type: 'bank_transfer',
    };
    expect(isPaid(status)).toBe(true);
    for (const transaction_status of [
      'pending',
      'deny',
      'expire',
      'cancel',
      'refund',
      'authorize',
      'capture',
    ])
      expect(isPaid({ ...status, transaction_status })).toBe(false);
    expect(isPaid({ ...status, fraud_status: 'challenge' })).toBe(false);
    expect(
      isPaid({
        ...status,
        transaction_status: 'capture',
        payment_type: 'credit_card',
        fraud_status: 'accept',
      }),
    ).toBe(true);
    expect(isPaid({ ...status, status_code: '201' })).toBe(false);
  });
});
