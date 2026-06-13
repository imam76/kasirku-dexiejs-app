import { App } from 'antd';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  cancelStockOpnameDraft,
  createStockOpnameDraft,
  postStockOpname,
  updateStockOpnameDraft,
  type CancelStockOpnameDraftInput,
  type CreateStockOpnameDraftInput,
  type PostStockOpnameInput,
  type UpdateStockOpnameDraftInput,
} from '@/services/stockOpnameService';
import {
  getStockOpnameCandidates,
  getStockOpnameDetail,
  listStockOpnames,
  type StockOpnameCandidateFilters,
  type StockOpnameListFilters,
} from '@/services/stockOpnameReadService';
import { useI18n } from '@/hooks/useI18n';

export interface UseStockOpnamesOptions {
  filters?: StockOpnameListFilters;
  detailId?: string;
  candidateFilters?: StockOpnameCandidateFilters;
  enableCandidates?: boolean;
}

export const stockOpnameQueryKeys = {
  lists: () => ['stockOpnames'] as const,
  list: (filters: StockOpnameListFilters) => ['stockOpnames', filters] as const,
  detail: (id: string | undefined) => ['stockOpname', id] as const,
  candidates: (filters: StockOpnameCandidateFilters) => ['stockOpnameCandidates', filters] as const,
};

export const useStockOpnames = (options: UseStockOpnamesOptions = {}) => {
  const queryClient = useQueryClient();
  const { message } = App.useApp();
  const { t } = useI18n();
  const filters = options.filters ?? {};
  const candidateFilters = options.candidateFilters ?? {};

  const invalidateStockOpnameQueries = async (id?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: stockOpnameQueryKeys.lists() }),
      id ? queryClient.invalidateQueries({ queryKey: stockOpnameQueryKeys.detail(id) }) : Promise.resolve(),
      queryClient.invalidateQueries({ queryKey: ['products'] }),
      queryClient.invalidateQueries({ queryKey: ['stockCard'] }),
      queryClient.invalidateQueries({ queryKey: ['stockOpnameCandidates'] }),
    ]);
  };

  const listQuery = useQuery({
    queryKey: stockOpnameQueryKeys.list(filters),
    queryFn: () => listStockOpnames(filters),
  });

  const detailQuery = useQuery({
    queryKey: stockOpnameQueryKeys.detail(options.detailId),
    queryFn: () => getStockOpnameDetail(options.detailId!),
    enabled: Boolean(options.detailId),
  });

  const candidatesQuery = useQuery({
    queryKey: stockOpnameQueryKeys.candidates(candidateFilters),
    queryFn: () => getStockOpnameCandidates(candidateFilters),
    enabled: options.enableCandidates ?? false,
  });

  const createMutation = useMutation({
    mutationFn: (input: CreateStockOpnameDraftInput) => createStockOpnameDraft(input),
    onSuccess: async (result) => {
      await invalidateStockOpnameQueries(result.opname.id);
      message.success(t('stockOpname.createSuccess'));
    },
  });

  const updateMutation = useMutation({
    mutationFn: (input: UpdateStockOpnameDraftInput) => updateStockOpnameDraft(input),
    onSuccess: async (result) => {
      await invalidateStockOpnameQueries(result.opname.id);
      message.success(t('stockOpname.updateSuccess'));
    },
  });

  const postMutation = useMutation({
    mutationFn: (input: PostStockOpnameInput) => postStockOpname(input),
    onSuccess: async (result) => {
      await invalidateStockOpnameQueries(result.opname.id);
      message.success(t('stockOpname.postSuccess'));
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (input: CancelStockOpnameDraftInput) => cancelStockOpnameDraft(input),
    onSuccess: async (opname) => {
      await invalidateStockOpnameQueries(opname.id);
      message.success(t('stockOpname.cancelSuccess'));
    },
  });

  return {
    opnames: listQuery.data ?? [],
    isLoadingOpnames: listQuery.isLoading,
    isFetchingOpnames: listQuery.isFetching,
    refetchOpnames: listQuery.refetch,
    detail: detailQuery.data ?? null,
    isLoadingDetail: detailQuery.isLoading,
    isFetchingDetail: detailQuery.isFetching,
    refetchDetail: detailQuery.refetch,
    candidates: candidatesQuery.data ?? [],
    isLoadingCandidates: candidatesQuery.isLoading,
    isFetchingCandidates: candidatesQuery.isFetching,
    createDraft: createMutation.mutateAsync,
    updateDraft: updateMutation.mutateAsync,
    postDraft: postMutation.mutateAsync,
    cancelDraft: cancelMutation.mutateAsync,
    isCreatingDraft: createMutation.isPending,
    isUpdatingDraft: updateMutation.isPending,
    isPostingDraft: postMutation.isPending,
    isCancellingDraft: cancelMutation.isPending,
  };
};
