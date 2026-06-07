import { useMemo } from 'react';
import { App } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '@/hooks/useI18n';
import { db } from '@/lib/db';
import {
  convertSalesDocument,
  createSalesDocument,
  issueSalesDocument,
  markSalesInvoicePaid,
  updateSalesDocument,
  voidSalesDocument,
  type SalesDocumentUpsertInput,
  type SalesInvoicePaymentInput,
} from '@/services/salesDocumentService';
import type { SalesDocument, SalesDocumentType } from '@/types';

export const useSalesDocuments = () => {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const documents = useLiveQuery(
    () => db.salesDocuments.orderBy('created_at').reverse().toArray(),
    [],
    [],
  );
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
  const payMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: SalesInvoicePaymentInput }) => markSalesInvoicePaid(id, input),
    onSuccess: () => {
      invalidate();
      message.success(t('salesDocuments.message.paymentSuccess'));
    },
    onError: (error: Error) => modal.error({ title: t('salesDocuments.error.paymentTitle'), content: error.message }),
  });

  const getItems = (documentId: string) => db.salesDocumentItems.where('document_id').equals(documentId).toArray();
  const getDocument = (documentId: string): SalesDocument | undefined => documents.find((document) => document.id === documentId);

  return {
    documents,
    products,
    contacts: activeContacts,
    taxes: activeTaxes,
    departments: activeDepartments,
    projects: activeProjects,
    warehouses: activeWarehouses,
    getDocument,
    getItems,
    createDocument: createMutation.mutateAsync,
    updateDocument: updateMutation.mutateAsync,
    issueDocument: issueMutation.mutateAsync,
    convertDocument: convertMutation.mutateAsync,
    voidDocument: voidMutation.mutateAsync,
    payInvoice: payMutation.mutateAsync,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
    isMutating: issueMutation.isPending || convertMutation.isPending || voidMutation.isPending || payMutation.isPending,
  };
};
