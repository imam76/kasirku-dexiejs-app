import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  archiveCooperativeMember,
  createCooperativeMember,
  restoreCooperativeMember,
  updateCooperativeMember,
  type CooperativeMemberUpsertInput,
} from '@/services/cooperativeMemberService';
import type { CooperativeMember, CooperativeMemberStatus } from '@/types';

export type CooperativeMemberStatusFilter = CooperativeMemberStatus | 'ALL';

export const useCooperativeMembers = () => {
  const queryClient = useQueryClient();
  const [editingMember, setEditingMember] = useState<CooperativeMember | null>(null);
  const [selectedMember, setSelectedMember] = useState<CooperativeMember | null>(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<CooperativeMemberStatusFilter>('ACTIVE');

  const members = useLiveQuery(
    () => db.cooperativeMembers.orderBy('member_number').toArray(),
    [],
    [],
  );

  const filteredMembers = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return members.filter((member) => {
      const matchesSearch = !query || [
        member.member_number,
        member.name,
        member.identity_number,
        member.phone,
        member.address,
      ].some((value) => value?.toLowerCase().includes(query));
      const matchesStatus = statusFilter === 'ALL' || member.status === statusFilter;

      return matchesSearch && matchesStatus;
    });
  }, [members, searchText, statusFilter]);

  const invalidateMembers = () => {
    queryClient.invalidateQueries({ queryKey: ['cooperativeMembers'] });
  };

  const createMutation = useMutation({
    mutationFn: createCooperativeMember,
    onSuccess: invalidateMembers,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: CooperativeMemberUpsertInput }) => updateCooperativeMember(id, input),
    onSuccess: invalidateMembers,
  });
  const archiveMutation = useMutation({
    mutationFn: archiveCooperativeMember,
    onSuccess: invalidateMembers,
  });
  const restoreMutation = useMutation({
    mutationFn: restoreCooperativeMember,
    onSuccess: invalidateMembers,
  });

  const resetForm = () => setEditingMember(null);
  const handleEdit = (member: CooperativeMember) => setEditingMember(member);
  const handleSelect = (member: CooperativeMember | null) => setSelectedMember(member);
  const submitForm = async (input: CooperativeMemberUpsertInput) => {
    if (editingMember) {
      return updateMutation.mutateAsync({ id: editingMember.id, input });
    }

    return createMutation.mutateAsync(input);
  };

  return {
    members,
    filteredMembers,
    editingMember,
    selectedMember,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    handleEdit,
    handleSelect,
    resetForm,
    submitForm,
    archiveMember: archiveMutation.mutateAsync,
    restoreMember: restoreMutation.mutateAsync,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
    isArchiving: archiveMutation.isPending,
    isRestoring: restoreMutation.isPending,
  };
};
