import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import { membershipManagementSchema } from '@/lib/validations/membership';
import { assertMembershipPhoneAvailable, generateMembershipNumber } from '@/services/membershipService';
import { enqueueMembershipSync } from '@/services/syncQueueService';
import type { Membership } from '@/types';
import { isMembershipActive, normalizeMembershipPhone, toMembershipStatus } from '@/utils/membership';

export interface MembershipUpsertInput {
  phone: string;
  name?: string;
  email?: string;
  contact_id?: string;
  is_active?: boolean;
}

const withPendingSync = (membership: Membership): Membership => ({
  ...membership,
  sync_status: 'pending',
  sync_error: undefined,
});

/** `status` only ever mirrors `is_active`, so the two can no longer disagree. */
const withActiveState = (membership: Membership, isActive: boolean): Membership => ({
  ...membership,
  is_active: isActive,
  status: toMembershipStatus(isActive),
});

export const createMembership = async (input: MembershipUpsertInput): Promise<Membership> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'CONTACT_MANAGE');

  const parsed = membershipManagementSchema.parse(input);
  await assertMembershipPhoneAvailable(parsed.phone);
  const now = new Date().toISOString();
  const membership: Membership = withPendingSync(withActiveState({
    id: crypto.randomUUID(),
    contact_id: parsed.contact_id,
    member_number: await generateMembershipNumber(new Date(now)),
    name: parsed.name,
    phone: parsed.phone,
    email: parsed.email,
    status: 'ACTIVE',
    joined_at: now,
    points_balance: 0,
    is_active: true,
    created_at: now,
    updated_at: now,
  }, parsed.is_active ?? true));

  await db.memberships.add(membership);
  await writeActivityLog({
    user: currentUser,
    action: 'MEMBERSHIP_CREATED',
    entity: 'memberships',
    entity_id: membership.id,
    description: `${currentUser?.name ?? 'User'} membuat member ${membership.name ?? membership.phone}.`,
  });
  await enqueueMembershipSync(membership, 'create');

  return membership;
};

export const updateMembership = async (id: string, input: MembershipUpsertInput): Promise<Membership> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'CONTACT_MANAGE');

  const existing = await db.memberships.get(id);
  if (!existing) {
    throw new Error('Member tidak ditemukan.');
  }

  const parsed = membershipManagementSchema.parse(input);
  // Only a changed number is checked, so members already duplicated before this check
  // existed can still be edited (and one of them given its correct number).
  if (normalizeMembershipPhone(existing.phone) !== parsed.phone) {
    await assertMembershipPhoneAvailable(parsed.phone, id);
  }
  const updated: Membership = withPendingSync(withActiveState({
    ...existing,
    contact_id: parsed.contact_id,
    name: parsed.name,
    phone: parsed.phone,
    email: parsed.email,
    updated_at: new Date().toISOString(),
  }, parsed.is_active ?? isMembershipActive(existing)));

  await db.memberships.put(updated);
  await writeActivityLog({
    user: currentUser,
    action: 'MEMBERSHIP_UPDATED',
    entity: 'memberships',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} memperbarui member ${updated.name ?? updated.phone}.`,
  });
  await enqueueMembershipSync(updated, 'update');

  return updated;
};

export const archiveMembership = async (id: string): Promise<Membership> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'CONTACT_MANAGE');

  const membership = await db.memberships.get(id);
  if (!membership) {
    throw new Error('Member tidak ditemukan.');
  }

  const archived: Membership = withPendingSync(withActiveState({
    ...membership,
    updated_at: new Date().toISOString(),
  }, false));

  await db.memberships.put(archived);
  await writeActivityLog({
    user: currentUser,
    action: 'MEMBERSHIP_ARCHIVED',
    entity: 'memberships',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} menonaktifkan member ${membership.name ?? membership.phone}.`,
  });
  await enqueueMembershipSync(archived, 'update');

  return archived;
};

export const restoreMembership = async (id: string): Promise<Membership> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'CONTACT_MANAGE');

  const membership = await db.memberships.get(id);
  if (!membership) {
    throw new Error('Member tidak ditemukan.');
  }

  const restored: Membership = withPendingSync(withActiveState({
    ...membership,
    updated_at: new Date().toISOString(),
  }, true));

  await db.memberships.put(restored);
  await writeActivityLog({
    user: currentUser,
    action: 'MEMBERSHIP_RESTORED',
    entity: 'memberships',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} mengaktifkan kembali member ${membership.name ?? membership.phone}.`,
  });
  await enqueueMembershipSync(restored, 'update');

  return restored;
};
