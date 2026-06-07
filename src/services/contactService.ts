import { getCurrentSessionUser, requireRolePermission, writeActivityLog } from '@/auth/authService';
import { db } from '@/lib/db';
import { contactSchema } from '@/lib/validations/contact';
import { enqueueContactSync } from '@/services/syncQueueService';
import type { Contact, ContactType } from '@/types';

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
  const contact: Contact = withPendingSync({
    id: crypto.randomUUID(),
    ...sanitizeContactInput(input),
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

  const updatedContact: Contact = withPendingSync({
    ...existingContact,
    ...sanitizeContactInput(input),
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
