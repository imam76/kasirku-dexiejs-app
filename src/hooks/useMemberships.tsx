import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  archiveMembership,
  createMembership,
  restoreMembership,
  updateMembership,
  type MembershipUpsertInput,
} from '@/services/membershipManagementService';
import type { Membership } from '@/types';

export type MembershipStatusFilter = 'active' | 'inactive' | 'all';

export const useMemberships = () => {
  const queryClient = useQueryClient();
  const [editingMembership, setEditingMembership] = useState<Membership | null>(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<MembershipStatusFilter>('active');

  const queriedMemberships = useLiveQuery(
    () => db.memberships.orderBy('member_number').toArray(),
    [],
  );
  const memberships = useMemo(() => queriedMemberships ?? [], [queriedMemberships]);

  const filteredMemberships = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return memberships.filter((membership) => {
      const matchesSearch = !query || [
        membership.name,
        membership.phone,
        membership.member_number,
        membership.email,
      ].some((value) => value?.toLowerCase().includes(query));
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? membership.is_active : !membership.is_active);

      return matchesSearch && matchesStatus;
    });
  }, [memberships, searchText, statusFilter]);

  const invalidateMemberships = () => {
    queryClient.invalidateQueries({ queryKey: ['memberships'] });
  };

  const createMutation = useMutation({
    mutationFn: createMembership,
    onSuccess: invalidateMemberships,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: MembershipUpsertInput }) => updateMembership(id, input),
    onSuccess: invalidateMemberships,
  });
  const archiveMutation = useMutation({
    mutationFn: archiveMembership,
    onSuccess: invalidateMemberships,
  });
  const restoreMutation = useMutation({
    mutationFn: restoreMembership,
    onSuccess: invalidateMemberships,
  });

  const resetForm = () => setEditingMembership(null);
  const handleEdit = (membership: Membership) => setEditingMembership(membership);
  const submitForm = async (input: MembershipUpsertInput) => {
    if (editingMembership) {
      return updateMutation.mutateAsync({ id: editingMembership.id, input });
    }

    return createMutation.mutateAsync(input);
  };

  return {
    memberships,
    isLoading: queriedMemberships === undefined,
    filteredMemberships,
    editingMembership,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    handleEdit,
    resetForm,
    submitForm,
    archiveMembership: archiveMutation.mutateAsync,
    restoreMembership: restoreMutation.mutateAsync,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
  };
};
