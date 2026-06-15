import { App } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createDraftProductionOrder,
  postProductionOrder,
  voidProductionOrder,
  type CreateDraftProductionOrderInput,
  type PostProductionOrderInput,
  type VoidProductionOrderInput,
} from '@/services/productionService';
import {
  getProductionOrderDetail,
  listProductionOrders,
  type ProductionOrderListFilters,
} from '@/services/productionReadService';

export interface UseProductionOrdersOptions {
  filters?: ProductionOrderListFilters;
  detailId?: string;
}

export const productionOrderQueryKeys = {
  lists: () => ['productionOrders'] as const,
  list: (filters: ProductionOrderListFilters) => ['productionOrders', filters] as const,
  detail: (id: string | undefined) => ['productionOrder', id] as const,
};

export const useProductionOrders = (options: UseProductionOrdersOptions = {}) => {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const filters = options.filters ?? {};

  const invalidateProductionQueries = async (id?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: productionOrderQueryKeys.lists() }),
      id ? queryClient.invalidateQueries({ queryKey: productionOrderQueryKeys.detail(id) }) : Promise.resolve(),
      queryClient.invalidateQueries({ queryKey: ['products'] }),
      queryClient.invalidateQueries({ queryKey: ['stockCard'] }),
      queryClient.invalidateQueries({ queryKey: ['journalEntries'] }),
      queryClient.invalidateQueries({ queryKey: ['trialBalance'] }),
      queryClient.invalidateQueries({ queryKey: ['incomeStatement'] }),
      queryClient.invalidateQueries({ queryKey: ['balanceSheet'] }),
    ]);
  };

  const listQuery = useQuery({
    queryKey: productionOrderQueryKeys.list(filters),
    queryFn: () => listProductionOrders(filters),
  });

  const detailQuery = useQuery({
    queryKey: productionOrderQueryKeys.detail(options.detailId),
    queryFn: () => getProductionOrderDetail(options.detailId!),
    enabled: Boolean(options.detailId),
  });

  const createDraftMutation = useMutation({
    mutationFn: (input: CreateDraftProductionOrderInput) => createDraftProductionOrder(input),
    onSuccess: async (result) => {
      await invalidateProductionQueries(result.order.id);
      message.success('Draft produksi berhasil disimpan.');
    },
  });

  const postMutation = useMutation({
    mutationFn: (input: PostProductionOrderInput) => postProductionOrder(input),
    onSuccess: async (result) => {
      await invalidateProductionQueries(result.order.id);
      message.success('Produksi berhasil diposting.');
    },
  });

  const voidMutation = useMutation({
    mutationFn: (input: VoidProductionOrderInput) => voidProductionOrder(input),
    onSuccess: async (result) => {
      await invalidateProductionQueries(result.order.id);
      message.success('Produksi berhasil divoid.');
    },
  });

  return {
    orders: listQuery.data ?? [],
    isLoadingOrders: listQuery.isLoading,
    isFetchingOrders: listQuery.isFetching,
    refetchOrders: listQuery.refetch,
    detail: detailQuery.data ?? null,
    isLoadingDetail: detailQuery.isLoading,
    isFetchingDetail: detailQuery.isFetching,
    refetchDetail: detailQuery.refetch,
    createDraft: createDraftMutation.mutateAsync,
    postDraft: postMutation.mutateAsync,
    voidOrder: voidMutation.mutateAsync,
    isCreatingDraft: createDraftMutation.isPending,
    isPostingDraft: postMutation.isPending,
    isVoidingOrder: voidMutation.isPending,
  };
};
