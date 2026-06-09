import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  archiveCooperativeArea,
  createCooperativeArea,
  restoreCooperativeArea,
  updateCooperativeArea,
  type CooperativeAreaUpsertInput,
} from '@/services/cooperativeAreaService';
import type { CooperativeArea } from '@/types';

export type CooperativeAreaStatusFilter = 'active' | 'inactive' | 'all';

export const useCooperativeAreas = () => {
  const queryClient = useQueryClient();
  const [editingArea, setEditingArea] = useState<CooperativeArea | null>(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<CooperativeAreaStatusFilter>('active');

  const areas = useLiveQuery(
    () => db.cooperativeAreas.orderBy('name').toArray(),
    [],
    [],
  );

  const filteredAreas = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return areas.filter((area) => {
      const matchesSearch = !query || [
        area.name,
        area.code,
        area.description,
      ].some((value) => value?.toLowerCase().includes(query));
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? area.is_active : !area.is_active);

      return matchesSearch && matchesStatus;
    });
  }, [areas, searchText, statusFilter]);

  const invalidateAreas = () => {
    queryClient.invalidateQueries({ queryKey: ['cooperativeAreas'] });
  };

  const createMutation = useMutation({
    mutationFn: createCooperativeArea,
    onSuccess: invalidateAreas,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: CooperativeAreaUpsertInput }) => updateCooperativeArea(id, input),
    onSuccess: invalidateAreas,
  });
  const archiveMutation = useMutation({
    mutationFn: archiveCooperativeArea,
    onSuccess: invalidateAreas,
  });
  const restoreMutation = useMutation({
    mutationFn: restoreCooperativeArea,
    onSuccess: invalidateAreas,
  });

  const resetForm = () => setEditingArea(null);
  const handleEdit = (area: CooperativeArea) => setEditingArea(area);
  const submitForm = async (input: CooperativeAreaUpsertInput) => {
    if (editingArea) {
      return updateMutation.mutateAsync({ id: editingArea.id, input });
    }

    return createMutation.mutateAsync(input);
  };

  return {
    areas,
    filteredAreas,
    editingArea,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    handleEdit,
    resetForm,
    submitForm,
    archiveArea: archiveMutation.mutateAsync,
    restoreArea: restoreMutation.mutateAsync,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
    isArchiving: archiveMutation.isPending,
    isRestoring: restoreMutation.isPending,
  };
};
