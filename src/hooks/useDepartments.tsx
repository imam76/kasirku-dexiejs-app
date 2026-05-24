import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { archiveDepartment, createDepartment, restoreDepartment, updateDepartment, type DepartmentUpsertInput } from '@/services/departmentService';
import type { Department } from '@/types';

export type DepartmentStatusFilter = 'active' | 'inactive' | 'all';

export const useDepartments = () => {
  const queryClient = useQueryClient();
  const [editingDepartment, setEditingDepartment] = useState<Department | null>(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<DepartmentStatusFilter>('active');

  const departments = useLiveQuery(
    () => db.departments.orderBy('name').toArray(),
    [],
    [],
  );

  const filteredDepartments = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return departments.filter((department) => {
      const matchesSearch = !query || [
        department.name,
        department.code,
        department.description,
      ].some((value) => value?.toLowerCase().includes(query));
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? department.is_active : !department.is_active);

      return matchesSearch && matchesStatus;
    });
  }, [departments, searchText, statusFilter]);

  const invalidateDepartments = () => {
    queryClient.invalidateQueries({ queryKey: ['departments'] });
  };

  const createMutation = useMutation({
    mutationFn: createDepartment,
    onSuccess: invalidateDepartments,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: DepartmentUpsertInput }) => updateDepartment(id, input),
    onSuccess: invalidateDepartments,
  });
  const archiveMutation = useMutation({
    mutationFn: archiveDepartment,
    onSuccess: invalidateDepartments,
  });
  const restoreMutation = useMutation({
    mutationFn: restoreDepartment,
    onSuccess: invalidateDepartments,
  });

  const resetForm = () => setEditingDepartment(null);
  const handleEdit = (department: Department) => setEditingDepartment(department);
  const submitForm = async (input: DepartmentUpsertInput) => {
    if (editingDepartment) {
      return updateMutation.mutateAsync({ id: editingDepartment.id, input });
    }

    return createMutation.mutateAsync(input);
  };

  return {
    departments,
    filteredDepartments,
    editingDepartment,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    handleEdit,
    resetForm,
    submitForm,
    archiveDepartment: archiveMutation.mutateAsync,
    restoreDepartment: restoreMutation.mutateAsync,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
    isArchiving: archiveMutation.isPending,
    isRestoring: restoreMutation.isPending,
  };
};
