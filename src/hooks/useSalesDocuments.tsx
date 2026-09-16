import { useMemo } from 'react';
import { App } from 'antd';
import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '@/hooks/useI18n';
import { db } from '@/lib/db';
import { orderLineItemsForDisplay } from '@/utils/documentLineItems/lineItemView';
import {
  listSalesDocumentPage,
  type SalesDocumentListOptions,
} from '@/services/documentHistoryReadService';
import type { DateIdCursor } from '@/services/shared/dateIdCursor';
import {
  convertSalesDocument,
  correctSalesDocument,
  createSalesDocument,
  issueSalesDocument,
  markSalesInvoicePaid,
  updateSalesDocument,
  voidSalesDocument,
  type SalesDocumentUpsertInput,
  type SalesInvoicePaymentInput,
} from '@/services/salesDocumentService';
import type { SalesDocumentType } from '@/types';

const SALES_DOCUMENT_PAGE_SIZE = 40;

export const useSalesDocumentList = (
  filters: Omit<SalesDocumentListOptions, 'cursor' | 'limit'>,
) => {
  const query = useInfiniteQuery({
    queryKey: [
      'salesDocuments',
      'list',
      filters.type,
      filters.startDate,
      filters.endDate,
      filters.status ?? 'ALL',
      filters.search?.trim() ?? '',
    ],
    queryFn: ({ pageParam }) => listSalesDocumentPage({
      ...filters,
      cursor: pageParam,
      limit: SALES_DOCUMENT_PAGE_SIZE,
    }),
    initialPageParam: undefined as DateIdCursor | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  const documents = useMemo(() => {
    const uniqueDocuments = new Map(
      (query.data?.pages ?? []).flatMap((page) => page.rows)
        .map((document) => [document.id, document] as const),
    );
    return [...uniqueDocuments.values()];
  }, [query.data?.pages]);

  return {
    documents,
    isLoading: query.isLoading,
    isLoadingMore: query.isFetchingNextPage,
    hasMore: Boolean(query.hasNextPage),
    loadMore: async () => {
      await query.fetchNextPage();
    },
  };
};

export const useSalesDocuments = () => {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const products = useLiveQuery(
    () => db.products.orderBy('name').toArray(),
    [],
    [],
  );
  const contacts = useLiveQuery(
    () => db.contacts.orderBy('name').toArray(),
    [],
    [],
  );
  const taxes = useLiveQuery(
    () => db.taxes.orderBy('name').toArray(),
    [],
    [],
  );
  const departments = useLiveQuery(
    () => db.departments.orderBy('name').toArray(),
    [],
    [],
  );
  const projects = useLiveQuery(
    () => db.projects.orderBy('name').toArray(),
    [],
    [],
  );
  const warehouses = useLiveQuery(
    () => db.warehouses.orderBy('name').toArray(),
    [],
    [],
  );

  const activeContacts = useMemo(
    () => contacts.filter((contact) => contact.is_active && ['CUSTOMER', 'CUSTOMER_SUPPLIER'].includes(contact.contact_type)),
    [contacts],
  );
  const activeTaxes = useMemo(() => taxes.filter((tax) => tax.is_active), [taxes]);
  const activeDepartments = useMemo(() => departments.filter((department) => department.is_active), [departments]);
  const activeProjects = useMemo(() => projects.filter((project) => project.is_active), [projects]);
  const activeWarehouses = useMemo(() => warehouses.filter((warehouse) => warehouse.is_active), [warehouses]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['accountsReceivable'] });
    queryClient.invalidateQueries({ queryKey: ['salesDocuments'] });
    queryClient.invalidateQueries({ queryKey: ['financeBalance'] });
    queryClient.invalidateQueries({ queryKey: ['financeTransactions'] });
    queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
    queryClient.invalidateQueries({ queryKey: ['trialBalance'] });
    queryClient.invalidateQueries({ queryKey: ['incomeStatement'] });
    queryClient.invalidateQueries({ queryKey: ['balanceSheet'] });
  };

  const createMutation = useMutation({
    mutationFn: createSalesDocument,
    onSuccess: () => {
      invalidate();
      message.success(t('salesDocuments.message.createSuccess'));
    },
    onError: (error: Error) => modal.error({ title: t('salesDocuments.error.saveTitle'), content: error.message }),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: SalesDocumentUpsertInput }) => updateSalesDocument(id, input),
    onSuccess: () => {
      invalidate();
      message.success(t('salesDocuments.message.updateSuccess'));
    },
    onError: (error: Error) => modal.error({ title: t('salesDocuments.error.updateTitle'), content: error.message }),
  });
  const issueMutation = useMutation({
    mutationFn: issueSalesDocument,
    onSuccess: () => {
      invalidate();
      message.success(t('salesDocuments.message.issueSuccess'));
    },
    onError: (error: Error) => modal.error({ title: t('salesDocuments.error.issueTitle'), content: error.message }),
  });
  const convertMutation = useMutation({
    mutationFn: ({ sourceId, targetType }: { sourceId: string; targetType: SalesDocumentType }) => convertSalesDocument(sourceId, targetType),
    onSuccess: () => {
      invalidate();
      message.success(t('salesDocuments.message.convertSuccess'));
    },
    onError: (error: Error) => modal.error({ title: t('salesDocuments.error.convertTitle'), content: error.message }),
  });
  const voidMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => voidSalesDocument(id, reason),
    onSuccess: () => {
      invalidate();
      message.success(t('salesDocuments.message.voidSuccess'));
    },
    onError: (error: Error) => modal.error({ title: t('salesDocuments.error.voidTitle'), content: error.message }),
  });
  const correctMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => correctSalesDocument(id, reason),
    onSuccess: () => {
      invalidate();
      message.success(t('salesDocuments.message.correctSuccess'));
    },
    onError: (error: Error) => modal.error({ title: t('salesDocuments.error.correctTitle'), content: error.message }),
  });
  const payMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: SalesInvoicePaymentInput }) => markSalesInvoicePaid(id, input),
    onSuccess: () => {
      invalidate();
      message.success(t('salesDocuments.message.paymentSuccess'));
    },
    onError: (error: Error) => modal.error({ title: t('salesDocuments.error.paymentTitle'), content: error.message }),
  });

  const getItems = (documentId: string) => db.salesDocumentItems.where('document_id').equals(documentId).toArray().then(orderLineItemsForDisplay);
  return {
    products,
    contacts: activeContacts,
    taxes: activeTaxes,
    departments: activeDepartments,
    projects: activeProjects,
    warehouses: activeWarehouses,
    getItems,
    createDocument: createMutation.mutateAsync,
    updateDocument: updateMutation.mutateAsync,
    issueDocument: issueMutation.mutateAsync,
    convertDocument: convertMutation.mutateAsync,
    voidDocument: voidMutation.mutateAsync,
    correctDocument: correctMutation.mutateAsync,
    payInvoice: payMutation.mutateAsync,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
    isMutating: issueMutation.isPending || convertMutation.isPending || voidMutation.isPending || correctMutation.isPending || payMutation.isPending,
  };
};
