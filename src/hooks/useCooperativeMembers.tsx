import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { useCooperativeAreaScope } from '@/hooks/useCooperativeAreaScope';
import {
  archiveCooperativeMember,
  createCooperativeMember,
  restoreCooperativeMember,
  updateCooperativeMember,
  type CooperativeMemberUpsertInput,
} from '@/services/cooperativeMemberService';
import type { CooperativeMember, CooperativeMemberStatus, Employee } from '@/types';

export type CooperativeMemberStatusFilter = CooperativeMemberStatus | 'ALL';
export type CooperativeMemberAreaFilter = string | 'ALL' | 'UNASSIGNED';

export const useCooperativeMembers = () => {
  const queryClient = useQueryClient();
  const areaScope = useCooperativeAreaScope();
  const [editingMember, setEditingMember] = useState<CooperativeMember | null>(null);
  const [selectedMember, setSelectedMember] = useState<CooperativeMember | null>(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<CooperativeMemberStatusFilter>('ACTIVE');
  const [areaFilter, setAreaFilter] = useState<CooperativeMemberAreaFilter>('ALL');

  const members = useLiveQuery(
    () => db.cooperativeMembers.orderBy('member_number').toArray(),
    [],
    [],
  );
  const areas = useLiveQuery(
    () => db.cooperativeAreas.orderBy('name').toArray(),
    [],
    [],
  );
  const employees = useLiveQuery(
    () => db.employees.orderBy('name').toArray(),
    [],
    [] as Employee[],
  );

  const visibleAreas = useMemo(() => {
    if (!areaScope.isScoped) return areas;
    const allowedAreaIds = new Set(areaScope.areaIds);
    return areas.filter((area) => allowedAreaIds.has(area.id));
  }, [areaScope.areaIds, areaScope.isScoped, areas]);

  const filteredMembers = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    const allowedAreaIds = new Set(areaScope.areaIds);

    return members.filter((member) => {
      const matchesScope = !areaScope.isScoped || (member.area_id ? allowedAreaIds.has(member.area_id) : false);
      const matchesSearch = !query || [
        member.member_number,
        member.name,
        member.identity_number,
        member.phone,
        member.address,
        member.area_name,
        member.area_code,
        member.officer_name,
        member.officer_position,
      ].some((value) => value?.toLowerCase().includes(query));
      const matchesStatus = statusFilter === 'ALL' || member.status === statusFilter;
      const matchesArea =
        areaFilter === 'ALL' ||
        (areaFilter === 'UNASSIGNED' ? !member.area_id : member.area_id === areaFilter);

      return matchesScope && matchesSearch && matchesStatus && matchesArea;
    });
  }, [areaFilter, areaScope.areaIds, areaScope.isScoped, members, searchText, statusFilter]);

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
    areas,
    employees,
    visibleAreas,
    filteredMembers,
    areaScope,
    editingMember,
    selectedMember,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    areaFilter,
    setAreaFilter,
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
