import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import { archiveTax, createTax, restoreTax, setDefaultTax, updateTax, type TaxUpsertInput } from '@/services/taxService';
import type { Tax, TaxCalculationMode } from '@/types';

export type TaxStatusFilter = 'active' | 'inactive' | 'all';
export type TaxCalculationModeFilter = TaxCalculationMode | 'ALL';

export const useTaxes = () => {
  const queryClient = useQueryClient();
  const [editingTax, setEditingTax] = useState<Tax | null>(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<TaxStatusFilter>('active');
  const [calculationModeFilter, setCalculationModeFilter] = useState<TaxCalculationModeFilter>('ALL');

  const taxes = useLiveQuery(
    async () => {
      const data = await db.taxes.toArray();
      return data.sort((left, right) => {
        if (left.is_default !== right.is_default) return left.is_default ? -1 : 1;
        if (left.is_active !== right.is_active) return left.is_active ? -1 : 1;
        return left.name.localeCompare(right.name);
      });
    },
    [],
    [],
  );

  const filteredTaxes = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return taxes.filter((tax) => {
      const matchesSearch = !query || [
        tax.name,
        tax.code,
        tax.description,
      ].some((value) => value?.toLowerCase().includes(query));
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? tax.is_active : !tax.is_active);
      const matchesMode = calculationModeFilter === 'ALL' || tax.calculation_mode === calculationModeFilter;

      return matchesSearch && matchesStatus && matchesMode;
    });
  }, [calculationModeFilter, searchText, statusFilter, taxes]);

  const invalidateTaxes = () => {
    queryClient.invalidateQueries({ queryKey: ['taxes'] });
  };

  const createMutation = useMutation({
    mutationFn: createTax,
    onSuccess: invalidateTaxes,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: TaxUpsertInput }) => updateTax(id, input),
    onSuccess: invalidateTaxes,
  });
  const archiveMutation = useMutation({
    mutationFn: archiveTax,
    onSuccess: invalidateTaxes,
  });
  const restoreMutation = useMutation({
    mutationFn: restoreTax,
    onSuccess: invalidateTaxes,
  });
  const setDefaultMutation = useMutation({
    mutationFn: setDefaultTax,
    onSuccess: invalidateTaxes,
  });

  const resetForm = () => setEditingTax(null);
  const handleEdit = (tax: Tax) => setEditingTax(tax);
  const submitForm = async (input: TaxUpsertInput) => {
    if (editingTax) {
      return updateMutation.mutateAsync({ id: editingTax.id, input });
    }

    return createMutation.mutateAsync(input);
  };

  return {
    taxes,
    filteredTaxes,
    editingTax,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    calculationModeFilter,
    setCalculationModeFilter,
    handleEdit,
    resetForm,
    submitForm,
    archiveTax: archiveMutation.mutateAsync,
    restoreTax: restoreMutation.mutateAsync,
    setDefaultTax: setDefaultMutation.mutateAsync,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
    isArchiving: archiveMutation.isPending,
    isRestoring: restoreMutation.isPending,
    isSettingDefault: setDefaultMutation.isPending,
  };
};
