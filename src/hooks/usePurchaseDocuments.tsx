import { useMemo } from 'react';
import { App } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '@/hooks/useI18n';
import { db } from '@/lib/db';
import {
  convertPurchaseDocument,
  createPurchaseDocument,
  issuePurchaseDocument,
  updatePurchaseDocument,
  voidPurchaseDocument,
  type PurchaseDocumentUpsertInput,
} from '@/services/purchaseDocumentService';
import type { PurchaseDocument, PurchaseDocumentType } from '@/types';

export const usePurchaseDocuments = () => {
  const queryClient = useQueryClient();
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const documents = useLiveQuery(
    () => db.purchaseDocuments.orderBy('created_at').reverse().toArray(),
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

  const activeContacts = useMemo(
    () => contacts.filter((contact) => contact.is_active && ['SUPPLIER', 'CUSTOMER_SUPPLIER'].includes(contact.contact_type)),
    [contacts],
  );
  const activeTaxes = useMemo(() => taxes.filter((tax) => tax.is_active), [taxes]);
  const activeDepartments = useMemo(() => departments.filter((department) => department.is_active), [departments]);
  const activeProjects = useMemo(() => projects.filter((project) => project.is_active), [projects]);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['purchaseDocuments'] });
    queryClient.invalidateQueries({ queryKey: ['purchaseReport'] });
    queryClient.invalidateQueries({ queryKey: ['financeBalance'] });
    queryClient.invalidateQueries({ queryKey: ['financeTransactions'] });
    queryClient.invalidateQueries({ queryKey: ['journalEntries'] });
    queryClient.invalidateQueries({ queryKey: ['trialBalance'] });
    queryClient.invalidateQueries({ queryKey: ['incomeStatement'] });
    queryClient.invalidateQueries({ queryKey: ['balanceSheet'] });
  };

  const createMutation = useMutation({
    mutationFn: createPurchaseDocument,
    onSuccess: () => {
      invalidate();
      message.success(t('purchaseDocuments.message.createSuccess'));
    },
    onError: (error: Error) => modal.error({ title: t('purchaseDocuments.error.saveTitle'), content: error.message }),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: PurchaseDocumentUpsertInput }) => updatePurchaseDocument(id, input),
    onSuccess: () => {
      invalidate();
      message.success(t('purchaseDocuments.message.updateSuccess'));
    },
    onError: (error: Error) => modal.error({ title: t('purchaseDocuments.error.updateTitle'), content: error.message }),
  });
  const issueMutation = useMutation({
    mutationFn: issuePurchaseDocument,
    onSuccess: () => {
      invalidate();
      message.success(t('purchaseDocuments.message.issueSuccess'));
    },
    onError: (error: Error) => modal.error({ title: t('purchaseDocuments.error.issueTitle'), content: error.message }),
  });
  const convertMutation = useMutation({
    mutationFn: ({ sourceId, targetType }: { sourceId: string; targetType: PurchaseDocumentType }) => convertPurchaseDocument(sourceId, targetType),
    onSuccess: () => {
      invalidate();
      message.success(t('purchaseDocuments.message.convertSuccess'));
    },
    onError: (error: Error) => modal.error({ title: t('purchaseDocuments.error.convertTitle'), content: error.message }),
  });
  const voidMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => voidPurchaseDocument(id, reason),
    onSuccess: () => {
      invalidate();
      message.success(t('purchaseDocuments.message.voidSuccess'));
    },
    onError: (error: Error) => modal.error({ title: t('purchaseDocuments.error.voidTitle'), content: error.message }),
  });

  const getItems = (documentId: string) => db.purchaseDocumentItems.where('document_id').equals(documentId).toArray();
  const getDocument = (documentId: string): PurchaseDocument | undefined => documents.find((document) => document.id === documentId);

  return {
    documents,
    products,
    contacts: activeContacts,
    taxes: activeTaxes,
    departments: activeDepartments,
    projects: activeProjects,
    getDocument,
    getItems,
    createDocument: createMutation.mutateAsync,
    updateDocument: updateMutation.mutateAsync,
    issueDocument: issueMutation.mutateAsync,
    convertDocument: convertMutation.mutateAsync,
    voidDocument: voidMutation.mutateAsync,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
    isMutating: issueMutation.isPending || convertMutation.isPending || voidMutation.isPending,
  };
};
