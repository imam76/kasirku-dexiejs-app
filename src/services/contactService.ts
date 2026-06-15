import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import { contactSchema } from '@/lib/validations/contact';
import { generateMembershipNumber } from '@/services/membershipService';
import { enqueueContactSync } from '@/services/syncQueueService';
import type { Contact, ContactType, RetailMembershipStatus } from '@/types';

export interface ContactUpsertInput {
  name: string;
  contact_type: ContactType;
  phone?: string;
  email?: string;
  address?: string;
  company_name?: string;
  tax_number?: string;
  notes?: string;
  is_active?: boolean;
  is_member?: boolean;
  membership_number?: string;
  membership_status?: RetailMembershipStatus;
  membership_joined_at?: string;
}

const sanitizeContactInput = (input: ContactUpsertInput): Required<Pick<ContactUpsertInput, 'name' | 'contact_type' | 'is_active'>> & Omit<ContactUpsertInput, 'name' | 'contact_type' | 'is_active'> => {
  const parsed = contactSchema.parse(input);

  return {
    ...parsed,
    is_active: parsed.is_active ?? true,
  };
};

const withPendingSync = (contact: Contact): Contact => ({
  ...contact,
  sync_status: 'pending',
  sync_error: undefined,
});

export const createContact = async (input: ContactUpsertInput): Promise<Contact> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'SETTINGS_ACCESS');

  const now = new Date().toISOString();
  const sanitizedInput = sanitizeContactInput(input);
  const isMember = Boolean(sanitizedInput.is_member);
  const contact: Contact = withPendingSync({
    id: crypto.randomUUID(),
    ...sanitizedInput,
    is_member: isMember,
    membership_number: isMember
      ? sanitizedInput.membership_number ?? await generateMembershipNumber(new Date(now))
      : undefined,
    membership_status: isMember ? sanitizedInput.membership_status ?? 'ACTIVE' : undefined,
    membership_joined_at: isMember ? sanitizedInput.membership_joined_at ?? now : undefined,
    membership_points_balance: isMember ? 0 : undefined,
    created_at: now,
    updated_at: now,
  });

  await db.contacts.add(contact);
  await writeActivityLog({
    user: currentUser,
    action: 'CONTACT_CREATED',
    entity: 'contacts',
    entity_id: contact.id,
    description: `${currentUser?.name ?? 'User'} membuat contact ${contact.name}.`,
  });
  await enqueueContactSync(contact, 'create');

  return contact;
};

export const updateContact = async (id: string, input: ContactUpsertInput): Promise<Contact> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'SETTINGS_ACCESS');

  const existingContact = await db.contacts.get(id);
  if (!existingContact) {
    throw new Error('Contact tidak ditemukan.');
  }

  const sanitizedInput = sanitizeContactInput(input);
  const isMember = Boolean(sanitizedInput.is_member);
  const shouldKeepMembershipSnapshot = isMember || Boolean(existingContact.is_member || existingContact.membership_number);
  const updatedContact: Contact = withPendingSync({
    ...existingContact,
    ...sanitizedInput,
    is_member: isMember,
    membership_number: isMember
      ? sanitizedInput.membership_number ?? existingContact.membership_number ?? await generateMembershipNumber()
      : shouldKeepMembershipSnapshot ? existingContact.membership_number : undefined,
    membership_status: isMember
      ? sanitizedInput.membership_status ?? existingContact.membership_status ?? 'ACTIVE'
      : shouldKeepMembershipSnapshot ? existingContact.membership_status ?? 'INACTIVE' : undefined,
    membership_joined_at: isMember
      ? sanitizedInput.membership_joined_at ?? existingContact.membership_joined_at ?? new Date().toISOString()
      : shouldKeepMembershipSnapshot ? existingContact.membership_joined_at : undefined,
    membership_points_balance: shouldKeepMembershipSnapshot ? existingContact.membership_points_balance ?? 0 : undefined,
    updated_at: new Date().toISOString(),
  });

  await db.contacts.put(updatedContact);
  await writeActivityLog({
    user: currentUser,
    action: 'CONTACT_UPDATED',
    entity: 'contacts',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} memperbarui contact ${updatedContact.name}.`,
  });
  await enqueueContactSync(updatedContact, 'update');

  return updatedContact;
};

export const archiveContact = async (id: string): Promise<Contact> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'SETTINGS_ACCESS');

  const contact = await db.contacts.get(id);
  if (!contact) {
    throw new Error('Contact tidak ditemukan.');
  }

  const archivedContact: Contact = withPendingSync({
    ...contact,
    is_active: false,
    updated_at: new Date().toISOString(),
  });

  await db.contacts.put(archivedContact);
  await writeActivityLog({
    user: currentUser,
    action: 'CONTACT_ARCHIVED',
    entity: 'contacts',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} mengarsipkan contact ${contact.name}.`,
  });
  await enqueueContactSync(archivedContact, 'delete');

  return archivedContact;
};

export const restoreContact = async (id: string): Promise<Contact> => {
  const currentUser = await getCurrentSessionUser();
  requireRolePermission(currentUser?.role, 'SETTINGS_ACCESS');

  const contact = await db.contacts.get(id);
  if (!contact) {
    throw new Error('Contact tidak ditemukan.');
  }

  const restoredContact: Contact = withPendingSync({
    ...contact,
    is_active: true,
    updated_at: new Date().toISOString(),
  });

  await db.contacts.put(restoredContact);
  await writeActivityLog({
    user: currentUser,
    action: 'CONTACT_RESTORED',
    entity: 'contacts',
    entity_id: id,
    description: `${currentUser?.name ?? 'User'} memulihkan contact ${contact.name}.`,
  });
  await enqueueContactSync(restoredContact, 'update');

  return restoredContact;
};
