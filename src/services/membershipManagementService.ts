import { getCurrentSessionUser, requireUserPermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import { membershipManagementSchema } from '@/lib/validations/membership';
import { generateMembershipNumber } from '@/services/membershipService';
import { enqueueMembershipSync } from '@/services/syncQueueService';
import type { Membership } from '@/types';

export interface MembershipUpsertInput {
  phone: string;
  name?: string;
  email?: string;
  contact_id?: string;
  status?: Membership['status'];
  is_active?: boolean;
}

const withPendingSync = (membership: Membership): Membership => ({
  ...membership,
  sync_status: 'pending',
  sync_error: undefined,
});

export const createMembership = async (input: MembershipUpsertInput): Promise<Membership> => {
  const currentUser = await getCurrentSessionUser();
  await requireUserPermission(currentUser, 'CONTACT_MANAGE');

  const parsed = membershipManagementSchema.parse(input);
  const now = new Date().toISOString();
  const membership: Membership = withPendingSync({
    id: crypto.randomUUID(),
    contact_id: parsed.contact_id,
    member_number: await generateMembershipNumber(new Date(now)),
    name: parsed.name,
    phone: parsed.phone,
    email: parsed.email,
    status: parsed.status ?? 'ACTIVE',
    joined_at: now,
    points_balance: 0,
    is_active: parsed.is_active ?? true,
    created_at: now,
    updated_at: now,
  });

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
  const updated: Membership = withPendingSync({
    ...existing,
    contact_id: parsed.contact_id,
    name: parsed.name,
    phone: parsed.phone,
    email: parsed.email,
    status: parsed.status ?? existing.status,
    is_active: parsed.is_active ?? existing.is_active,
    updated_at: new Date().toISOString(),
  });

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

  const archived: Membership = withPendingSync({
    ...membership,
    is_active: false,
    updated_at: new Date().toISOString(),
  });

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

  const restored: Membership = withPendingSync({
    ...membership,
    is_active: true,
    updated_at: new Date().toISOString(),
  });

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
