import { App } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '@/hooks/useI18n';
import { db } from '@/lib/db';
import {
  createSalesReturn,
  getReturnableSource,
  issueSalesReturn,
  listReturnableSalesDocumentSources,
  updateSalesReturn,
  voidSalesReturn,
  type SalesReturnUpsertInput,
} from '@/services/salesReturnService';
import type { SalesReturn, SalesReturnSourceType } from '@/types';

const SALES_RETURN_RELATED_QUERY_KEYS = [
  'salesReturns',
  'salesDocuments',
  'transactions-history',
  'products',
  'financeBalance',
  'financeTransactions',
  'profitBalance',
  'profitLogs',
  'salesReport',
  'transactionDetailReport',
];

export const useSalesReturns = () => {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const salesReturns = useLiveQuery(
    () => db.salesReturns.orderBy('created_at').reverse().toArray(),
    [],
    [],
  );
  const salesReturnItems = useLiveQuery(
    () => db.salesReturnItems.toArray(),
    [],
    [],
  );
  const salesDocuments = useLiveQuery(
    () => db.salesDocuments.orderBy('created_at').reverse().toArray(),
    [],
    [],
  );
  const returnableSources = useLiveQuery(
    () => listReturnableSalesDocumentSources(),
    [salesDocuments.length],
    [],
  );

  const invalidate = () => {
    SALES_RETURN_RELATED_QUERY_KEYS.forEach((queryKey) => {
      queryClient.invalidateQueries({ queryKey: [queryKey] });
    });
  };

  const createMutation = useMutation({
    mutationFn: createSalesReturn,
    onSuccess: () => {
      invalidate();
      message.success(t('salesReturns.message.createSuccess'));
    },
    onError: (error: Error) => modal.error({ title: t('salesReturns.error.saveTitle'), content: error.message }),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: SalesReturnUpsertInput }) => updateSalesReturn(id, input),
    onSuccess: () => {
      invalidate();
      message.success(t('salesReturns.message.updateSuccess'));
    },
    onError: (error: Error) => modal.error({ title: t('salesReturns.error.updateTitle'), content: error.message }),
  });
  const issueMutation = useMutation({
    mutationFn: issueSalesReturn,
    onSuccess: () => {
      invalidate();
      message.success(t('salesReturns.message.issueSuccess'));
    },
    onError: (error: Error) => modal.error({ title: t('salesReturns.error.issueTitle'), content: error.message }),
  });
  const voidMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => voidSalesReturn(id, reason),
    onSuccess: () => {
      invalidate();
      message.success(t('salesReturns.message.voidSuccess'));
    },
    onError: (error: Error) => modal.error({ title: t('salesReturns.error.voidTitle'), content: error.message }),
  });

  const getReturn = (returnId: string): SalesReturn | undefined => (
    salesReturns.find((salesReturn) => salesReturn.id === returnId)
  );
  const getItems = (returnId: string) => db.salesReturnItems.where('return_id').equals(returnId).toArray();
  const loadSource = (sourceType: SalesReturnSourceType, sourceId: string) => getReturnableSource(sourceType, sourceId);

  return {
    salesReturns,
    salesReturnItems,
    returnableSources,
    getReturn,
    getItems,
    loadSource,
    listReturnableSources: listReturnableSalesDocumentSources,
    createReturn: createMutation.mutateAsync,
    updateReturn: updateMutation.mutateAsync,
    issueReturn: issueMutation.mutateAsync,
    voidReturn: voidMutation.mutateAsync,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
    isMutating: issueMutation.isPending || voidMutation.isPending,
  };
};
