import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { archiveContact, createContact, restoreContact, updateContact, type ContactUpsertInput } from '@/services/contactService';
import type { Contact, ContactType } from '@/types';

export type ContactTypeFilter = ContactType | 'ALL';
export type ContactStatusFilter = 'active' | 'inactive' | 'all';
export type ContactMembershipFilter = 'members' | 'non_members' | 'all';

export const useContacts = () => {
  const queryClient = useQueryClient();
  const [editingContact, setEditingContact] = useState<Contact | null>(null);
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState<ContactTypeFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<ContactStatusFilter>('active');
  const [membershipFilter, setMembershipFilter] = useState<ContactMembershipFilter>('all');

  const contacts = useLiveQuery(
    () => db.contacts.orderBy('name').toArray(),
    [],
    [],
  );

  const filteredContacts = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return contacts.filter((contact) => {
      const matchesSearch = !query || [
        contact.name,
        contact.company_name,
        contact.phone,
        contact.email,
        contact.membership_number,
      ].some((value) => value?.toLowerCase().includes(query));
      const matchesType = typeFilter === 'ALL' || contact.contact_type === typeFilter;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? contact.is_active : !contact.is_active);
      const matchesMembership =
        membershipFilter === 'all' ||
        (membershipFilter === 'members' ? contact.is_member : !contact.is_member);

      return matchesSearch && matchesType && matchesStatus && matchesMembership;
    });
  }, [contacts, membershipFilter, searchText, statusFilter, typeFilter]);

  const invalidateContacts = () => {
    queryClient.invalidateQueries({ queryKey: ['contacts'] });
  };

  const createMutation = useMutation({
    mutationFn: createContact,
    onSuccess: invalidateContacts,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ContactUpsertInput }) => updateContact(id, input),
    onSuccess: invalidateContacts,
  });
  const archiveMutation = useMutation({
    mutationFn: archiveContact,
    onSuccess: invalidateContacts,
  });
  const restoreMutation = useMutation({
    mutationFn: restoreContact,
    onSuccess: invalidateContacts,
  });

  const resetForm = () => setEditingContact(null);
  const handleEdit = (contact: Contact) => setEditingContact(contact);
  const submitForm = async (input: ContactUpsertInput) => {
    if (editingContact) {
      return updateMutation.mutateAsync({ id: editingContact.id, input });
    }

    return createMutation.mutateAsync(input);
  };

  return {
    contacts,
    filteredContacts,
    editingContact,
    searchText,
    setSearchText,
    typeFilter,
    setTypeFilter,
    statusFilter,
    setStatusFilter,
    membershipFilter,
    setMembershipFilter,
    handleEdit,
    resetForm,
    submitForm,
    archiveContact: archiveMutation.mutateAsync,
    restoreContact: restoreMutation.mutateAsync,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
    isArchiving: archiveMutation.isPending,
    isRestoring: restoreMutation.isPending,
  };
};
