import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  archiveWarehouse,
  createWarehouse,
  restoreWarehouse,
  updateWarehouse,
  type WarehouseUpsertInput,
} from '@/services/warehouseService';
import type { Warehouse } from '@/types';

export type WarehouseStatusFilter = 'active' | 'inactive' | 'all';

export const useWarehouses = () => {
  const queryClient = useQueryClient();
  const [editingWarehouse, setEditingWarehouse] = useState<Warehouse | null>(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<WarehouseStatusFilter>('active');

  const warehouses = useLiveQuery(
    () => db.warehouses.orderBy('name').toArray(),
    [],
    [],
  );

  const filteredWarehouses = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return warehouses.filter((warehouse) => {
      const matchesSearch = !query || [
        warehouse.name,
        warehouse.code,
        warehouse.address,
        warehouse.phone,
      ].some((value) => value?.toLowerCase().includes(query));
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? warehouse.is_active : !warehouse.is_active);

      return matchesSearch && matchesStatus;
    });
  }, [searchText, statusFilter, warehouses]);

  const invalidateWarehouses = () => {
    queryClient.invalidateQueries({ queryKey: ['warehouses'] });
  };

  const createMutation = useMutation({
    mutationFn: createWarehouse,
    onSuccess: invalidateWarehouses,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: WarehouseUpsertInput }) => updateWarehouse(id, input),
    onSuccess: invalidateWarehouses,
  });
  const archiveMutation = useMutation({
    mutationFn: archiveWarehouse,
    onSuccess: invalidateWarehouses,
  });
  const restoreMutation = useMutation({
    mutationFn: restoreWarehouse,
    onSuccess: invalidateWarehouses,
  });

  const resetForm = () => setEditingWarehouse(null);
  const handleEdit = (warehouse: Warehouse) => setEditingWarehouse(warehouse);
  const submitForm = async (input: WarehouseUpsertInput) => {
    if (editingWarehouse) {
      return updateMutation.mutateAsync({ id: editingWarehouse.id, input });
    }

    return createMutation.mutateAsync(input);
  };

  return {
    warehouses,
    filteredWarehouses,
    editingWarehouse,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    handleEdit,
    resetForm,
    submitForm,
    archiveWarehouse: archiveMutation.mutateAsync,
    restoreWarehouse: restoreMutation.mutateAsync,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
    isArchiving: archiveMutation.isPending,
    isRestoring: restoreMutation.isPending,
  };
};
