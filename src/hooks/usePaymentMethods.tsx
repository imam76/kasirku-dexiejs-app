import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  archivePaymentMethod,
  createPaymentMethod,
  ensureDefaultPaymentMethods,
  restorePaymentMethod,
  updatePaymentMethod,
  type PaymentMethodUpsertInput,
} from '@/services/paymentMethodService';
import type { PaymentMethodCategory, PaymentMethodMaster } from '@/types';

export type PaymentMethodStatusFilter = 'active' | 'inactive' | 'all';
export type PaymentMethodCategoryFilter = PaymentMethodCategory | 'all';

export const usePaymentMethods = () => {
  const queryClient = useQueryClient();
  const [editingPaymentMethod, setEditingPaymentMethod] = useState<PaymentMethodMaster | null>(null);
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<PaymentMethodStatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<PaymentMethodCategoryFilter>('all');

  useEffect(() => {
    void ensureDefaultPaymentMethods().catch((error) => {
      console.error('Failed to ensure default payment methods', error);
    });
  }, []);
  const paymentMethods = useLiveQuery(
    async () => (await db.paymentMethods.toArray()).sort((left, right) => (
      left.sort_order - right.sort_order || left.name.localeCompare(right.name)
    )),
    [],
    [],
  );
  const postingAccounts = useLiveQuery(
    () => db.chartOfAccounts.filter((account) => (
      account.type === 'ASSET' && account.is_active && account.is_postable
    )).sortBy('code'),
    [],
    [],
  );

  const filteredPaymentMethods = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return paymentMethods.filter((method) => {
      const matchesSearch = !query || [
        method.code,
        method.name,
        method.category,
        method.posting_account_code,
        method.posting_account_name,
      ].some((value) => value?.toLowerCase().includes(query));
      const matchesStatus = statusFilter === 'all' || (
        statusFilter === 'active' ? method.is_active : !method.is_active
      );
      const matchesCategory = categoryFilter === 'all' || method.category === categoryFilter;
      return matchesSearch && matchesStatus && matchesCategory;
    });
  }, [categoryFilter, paymentMethods, searchText, statusFilter]);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['payment-methods'] });
  const createMutation = useMutation({ mutationFn: createPaymentMethod, onSuccess: invalidate });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: PaymentMethodUpsertInput }) => updatePaymentMethod(id, input),
    onSuccess: invalidate,
  });
  const archiveMutation = useMutation({ mutationFn: archivePaymentMethod, onSuccess: invalidate });
  const restoreMutation = useMutation({ mutationFn: restorePaymentMethod, onSuccess: invalidate });

  const submitForm = (input: PaymentMethodUpsertInput) => editingPaymentMethod
    ? updateMutation.mutateAsync({ id: editingPaymentMethod.id, input })
    : createMutation.mutateAsync(input);

  return {
    filteredPaymentMethods,
    postingAccounts,
    editingPaymentMethod,
    searchText,
    setSearchText,
    statusFilter,
    setStatusFilter,
    categoryFilter,
    setCategoryFilter,
    handleEdit: setEditingPaymentMethod,
    resetForm: () => setEditingPaymentMethod(null),
    submitForm,
    archivePaymentMethod: archiveMutation.mutateAsync,
    restorePaymentMethod: restoreMutation.mutateAsync,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
  };
};
