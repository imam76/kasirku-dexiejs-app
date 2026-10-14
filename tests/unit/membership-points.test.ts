import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { getSyncQueuePriority } from '@/lib/database/checkoutReadModels';
import { membershipManagementSchema, membershipQuickCreateSchema } from '@/lib/validations/membership';
import {
  DEFAULT_MEMBERSHIP_SETTING_ID,
  evaluateMembershipCheckoutSync,
} from '@/services/membershipService';
import type { PromoEvaluationResult } from '@/services/promoService';
import { resolveRealtimeRefreshPlan } from '@/services/realtimeSyncTableMap';
import {
  buildMembershipOutboxItem,
  buildMembershipPointTransactionOutboxItem,
} from '@/services/syncQueueService';
import { calculateVoidMembershipPointImpact } from '@/services/transactionVoidService';
import type { CartItem, Membership, MembershipPointTransaction, MembershipSetting } from '@/types';
import {
  createMembershipNumberSuffix,
  formatMembershipNumber,
  getRedeemablePoints,
  isMembershipActive,
  normalizeMembershipPhone,
  toMembershipStatus,
} from '@/utils/membership';

const readSource = (relativePath: string) => readFileSync(
  new URL(`../../${relativePath}`, import.meta.url),
  'utf8',
);

const member = (overrides: Partial<Membership> = {}): Membership => ({
  id: 'member-1',
  member_number: 'MBR-20261014-7KQ2M',
  name: 'Budi',
  phone: '08123456789',
  status: 'ACTIVE',
  joined_at: '2026-10-14T00:00:00.000Z',
  points_balance: 100,
  is_active: true,
  created_at: '2026-10-14T00:00:00.000Z',
  updated_at: '2026-10-14T00:00:00.000Z',
  ...overrides,
});

const setting: MembershipSetting = {
  id: DEFAULT_MEMBERSHIP_SETTING_ID,
  earning_amount: 1000,
  earning_points: 1,
  point_value: 1,
  redeem_enabled: true,
  created_at: '2026-10-14T00:00:00.000Z',
  updated_at: '2026-10-14T00:00:00.000Z',
};

const promoEvaluation = (total: number): PromoEvaluationResult => ({
  subtotal_before_discount: total,
  discount_amount: 0,
  total_amount: total,
  lines: [{
    product_id: 'product-1',
    price_before_discount: total,
    quantity: 1,
    subtotal_before_discount: total,
    discount_amount: 0,
    final_unit_price: total,
    final_subtotal: total,
    adjustments: [],
  }],
  applied_promos_snapshot: [],
  discount_breakdown: [],
});

const cart = [{ id: 'product-1', quantity: 1 }] as unknown as CartItem[];

describe('member point ledger sync', () => {
  test('a member snapshot leaves the balance to point events', () => {
    const queueItem = buildMembershipOutboxItem(member({ points_balance: 105 }), 'update');
    expect(queueItem.payload).toMatchObject({ points_balance: 105, preserve_points_balance: true });
  });

  test('a point event is queued as an immutable create of its own', () => {
    const entry: MembershipPointTransaction = {
      id: 'point-1',
      membership_id: 'member-1',
      membership_number: 'MBR-20261014-7KQ2M',
      member_name: 'Budi',
      transaction_id: 'trx-1',
      transaction_number: 'TRX-1',
      type: 'EARN',
      points_delta: 5,
      amount_value: 0,
      balance_after: 105,
      reason: 'Poin dari transaksi TRX-1',
      created_at: '2026-10-14T01:00:00.000Z',
      sync_status: 'pending',
    };
    const queueItem = buildMembershipPointTransactionOutboxItem(entry, entry.created_at);

    expect(queueItem).toMatchObject({
      entity: 'membershipPointTransactions',
      entity_id: 'point-1',
      operation: 'create',
    });
    expect(queueItem.payload).toMatchObject({ membership_id: 'member-1', points_delta: 5, type: 'EARN' });
    // Local-only sync bookkeeping never travels to PostgreSQL.
    expect(queueItem.payload).not.toHaveProperty('sync_status');
  });

  test('uploads a member before the point events that reference it', () => {
    expect(getSyncQueuePriority({ entity: 'memberships' }))
      .toBeLessThan(getSyncQueuePriority({ entity: 'membershipPointTransactions' }));
  });

  test('applies each event additively and exactly once on PostgreSQL', () => {
    const repository = readSource('src-tauri/src/repositories/membership_repository.rs');
    const migration = readSource('src-tauri/migrations/0096_membership_point_ledger.sql');

    expect(repository).toContain('ON CONFLICT (id) DO NOTHING');
    expect(repository).toContain('points_balance = points_balance + $1');
    // The member snapshot must not overwrite a ledger-owned balance.
    expect(repository).toContain('WHEN $14::BOOLEAN THEN memberships.points_balance');
    expect(repository).toContain('WHERE EXCLUDED.profile_updated_at >= memberships.profile_updated_at');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS membership_point_transactions');
    expect(migration).toContain('ON membership_point_transactions');
  });

  test('checkout and void queue every point event they record', () => {
    expect(readSource('src/services/checkoutService.ts')).toContain('buildMembershipPointTransactionOutboxItem');
    expect(readSource('src/services/transactionVoidService.ts')).toContain('enqueueMembershipPointTransactionsSync');
  });

  test('member changes get a scoped realtime refresh instead of a full one', () => {
    const plan = resolveRealtimeRefreshPlan(['memberships', 'membership_point_transactions']);
    expect(plan.unknownTables).toEqual([]);
    expect(plan.refreshFns.length).toBe(2);
  });
});

describe('duplicate members', () => {
  test('stores one form of an Indonesian phone number', () => {
    expect(normalizeMembershipPhone(' 0812-3456-789 ')).toBe('08123456789');
    expect(normalizeMembershipPhone('+62 812 3456 789')).toBe('08123456789');
    expect(normalizeMembershipPhone('628123456789')).toBe('08123456789');
    expect(normalizeMembershipPhone('(021) 555.1234')).toBe('0215551234');
    // Too short to be a mobile number with country code: left alone.
    expect(normalizeMembershipPhone('62812')).toBe('62812');
  });

  test('normalizes the phone in both member forms', () => {
    expect(membershipQuickCreateSchema.parse({ phone: '+62 812 3456 789' }).phone).toBe('08123456789');
    expect(membershipManagementSchema.parse({ phone: '0812 3456 789' }).phone).toBe('08123456789');
    expect(() => membershipQuickCreateSchema.parse({ phone: ' - ' })).toThrow();
  });

  test('numbers members with a random suffix instead of a per-terminal counter', () => {
    const suffixes = new Set(Array.from({ length: 200 }, () => createMembershipNumberSuffix()));
    for (const suffix of suffixes) {
      expect(suffix).toMatch(/^[0-9A-HJKMNP-TV-Z]{5}$/);
    }
    // Two terminals counting from 0001 always collided; random suffixes practically never do.
    expect(suffixes.size).toBeGreaterThan(195);
    expect(formatMembershipNumber('20261014', '7KQ2M')).toBe('MBR-20261014-7KQ2M');
  });
});

describe('member status', () => {
  test('treats a member as active only when both fields agree', () => {
    expect(isMembershipActive(member())).toBe(true);
    expect(isMembershipActive(member({ is_active: false }))).toBe(false);
    // The mismatch that showed "Aktif" in the list while the POS hid the member.
    expect(isMembershipActive(member({ status: 'INACTIVE' }))).toBe(false);
    expect(isMembershipActive(null)).toBe(false);
  });

  test('derives status from the single active switch', () => {
    expect(toMembershipStatus(true)).toBe('ACTIVE');
    expect(toMembershipStatus(false)).toBe('INACTIVE');
  });

  test('the member form no longer offers a second status control', () => {
    expect(readSource('src/view/master-data/memberships/MembershipFormModal.tsx')).not.toContain('name="status"');
  });
});

describe('negative point balance', () => {
  test('a void can leave a debt, which is kept rather than forgiven', () => {
    expect(calculateVoidMembershipPointImpact(
      { membership_points_earned: 10, membership_points_redeemed: 0 },
      0,
    )).toEqual({ earnedPoints: 10, redeemedPoints: 0, balanceAfter: -10 });
    expect(calculateVoidMembershipPointImpact(
      { membership_points_earned: 3, membership_points_redeemed: 20 },
      50,
    )).toEqual({ earnedPoints: 3, redeemedPoints: 20, balanceAfter: 67 });
  });

  test('a debt cannot be redeemed but still earns points that pay it off', () => {
    expect(getRedeemablePoints(-10)).toBe(0);
    const evaluation = evaluateMembershipCheckoutSync({
      cart,
      promoEvaluation: promoEvaluation(25_000),
      member: member({ points_balance: -10 }),
      redeemPoints: 50,
      setting,
    });

    expect(evaluation.redeem_points).toBe(0);
    expect(evaluation.redeem_amount).toBe(0);
    expect(evaluation.earned_points).toBe(25);
  });

  test('checkout no longer clamps the starting balance to zero', () => {
    const checkout = readSource('src/services/checkoutService.ts');
    expect(checkout).not.toContain('Math.max(0, Math.floor(Number(membershipEvaluation.member.points_balance');
  });
});
