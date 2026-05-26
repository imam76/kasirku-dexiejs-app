import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db';
import {
  applyChartOfAccountTemplate,
  archiveChartOfAccount,
  backfillFinanceTransactionAccountSnapshots,
  createChartOfAccount,
  ensureAccountingDefaults,
  getChartOfAccountTemplatePreview,
  restoreChartOfAccount,
  updateChartOfAccount,
  updateAccountingProfileSetting,
  updateFinanceAccountMapping,
  type ApplyChartOfAccountTemplateInput,
  type ChartOfAccountUpsertInput,
} from '@/services/chartOfAccountService';
import { buildAccountTree } from '@/utils/chartOfAccounts/buildAccountTree';
import { sortAccountsByCode } from '@/utils/chartOfAccounts/sortAccountsByCode';
import type { AccountType, ChartOfAccount } from '@/types';

export type ChartOfAccountStatusFilter = 'active' | 'inactive' | 'all';
export type ChartOfAccountTypeFilter = AccountType | 'ALL';

export const useChartOfAccounts = () => {
  const queryClient = useQueryClient();
  const [editingAccount, setEditingAccount] = useState<ChartOfAccount | null>(null);
  const [searchText, setSearchText] = useState('');
  const [typeFilter, setTypeFilter] = useState<ChartOfAccountTypeFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<ChartOfAccountStatusFilter>('active');

  const defaultsQuery = useQuery({
    queryKey: ['accountingDefaults'],
    queryFn: ensureAccountingDefaults,
  });

  const accounts = useLiveQuery(
    () => db.chartOfAccounts.orderBy('code').toArray(),
    [defaultsQuery.dataUpdatedAt],
    [],
  );
  const mappings = useLiveQuery(
    () => db.financeAccountMappings.orderBy('key').toArray(),
    [defaultsQuery.dataUpdatedAt],
    [],
  );
  const profileSetting = useLiveQuery(
    () => db.accountingProfileSetting.get('default'),
    [defaultsQuery.dataUpdatedAt],
    undefined,
  );
  const enabledModules = useLiveQuery(
    () => db.enabledModules.orderBy('code').toArray(),
    [defaultsQuery.dataUpdatedAt],
    [],
  );
  const financeTransactions = useLiveQuery(
    () => db.financeTransactions.toArray(),
    [defaultsQuery.dataUpdatedAt],
    [],
  );

  const filteredAccounts = useMemo(() => {
    const query = searchText.trim().toLowerCase();

    return sortAccountsByCode(accounts).filter((account) => {
      const matchesSearch = !query || [
        account.code,
        account.name,
        account.parent_code,
        account.parent_name,
        account.description,
      ].some((value) => value?.toLowerCase().includes(query));
      const matchesType = typeFilter === 'ALL' || account.type === typeFilter;
      const matchesStatus =
        statusFilter === 'all' ||
        (statusFilter === 'active' ? account.is_active : !account.is_active);

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [accounts, searchText, statusFilter, typeFilter]);

  const accountTree = useMemo(() => buildAccountTree(filteredAccounts), [filteredAccounts]);
  const activePostableAccounts = useMemo(() => {
    return sortAccountsByCode(accounts).filter((account) => account.is_active && account.is_postable);
  }, [accounts]);

  const mappingHealth = useMemo(() => {
    const accountById = new Map(accounts.map((account) => [account.id, account]));
    const inactiveMappings = mappings.filter((mapping) => {
      const account = accountById.get(mapping.account_id);
      return !account || !account.is_active;
    });
    const nonPostableMappings = mappings.filter((mapping) => {
      const account = accountById.get(mapping.account_id);
      return account && !account.is_postable;
    });
    const unmappedTransactionCount = financeTransactions.filter((transaction) => !transaction.account_id).length;

    return {
      inactiveMappings,
      nonPostableMappings,
      unmappedTransactionCount,
    };
  }, [accounts, financeTransactions, mappings]);

  const templatePreviewQuery = useQuery({
    queryKey: [
      'chartOfAccountTemplatePreview',
      profileSetting?.accounting_profile,
      profileSetting?.industry_extension,
      profileSetting?.template_id,
    ],
    queryFn: () => getChartOfAccountTemplatePreview({
      accounting_profile: profileSetting?.accounting_profile ?? 'SAK_EMKM',
      industry_extension: profileSetting?.industry_extension ?? 'RETAIL',
      template_id: profileSetting?.template_id,
    }),
    enabled: Boolean(profileSetting),
  });

  const invalidateAccounting = () => {
    queryClient.invalidateQueries({ queryKey: ['accountingDefaults'] });
    queryClient.invalidateQueries({ queryKey: ['chartOfAccountTemplatePreview'] });
    queryClient.invalidateQueries({ queryKey: ['financeTransactions'] });
    queryClient.invalidateQueries({ queryKey: ['financeBalance'] });
  };

  const createMutation = useMutation({
    mutationFn: createChartOfAccount,
    onSuccess: invalidateAccounting,
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, input }: { id: string; input: ChartOfAccountUpsertInput }) => updateChartOfAccount(id, input),
    onSuccess: invalidateAccounting,
  });
  const archiveMutation = useMutation({
    mutationFn: archiveChartOfAccount,
    onSuccess: invalidateAccounting,
  });
  const restoreMutation = useMutation({
    mutationFn: restoreChartOfAccount,
    onSuccess: invalidateAccounting,
  });
  const updateMappingMutation = useMutation({
    mutationFn: ({ key, accountId }: { key: string; accountId: string }) => updateFinanceAccountMapping(key, accountId),
    onSuccess: invalidateAccounting,
  });
  const updateProfileMutation = useMutation({
    mutationFn: ({
      accountingProfile,
      industryExtension,
      templateId,
    }: {
      accountingProfile: Parameters<typeof updateAccountingProfileSetting>[0];
      industryExtension: Parameters<typeof updateAccountingProfileSetting>[1];
      templateId?: string;
    }) => updateAccountingProfileSetting(accountingProfile, industryExtension, templateId),
    onSuccess: invalidateAccounting,
  });
  const applyTemplateMutation = useMutation({
    mutationFn: (input: ApplyChartOfAccountTemplateInput) => applyChartOfAccountTemplate(input),
    onSuccess: invalidateAccounting,
  });
  const backfillMutation = useMutation({
    mutationFn: backfillFinanceTransactionAccountSnapshots,
    onSuccess: invalidateAccounting,
  });

  const resetForm = () => setEditingAccount(null);
  const handleEdit = (account: ChartOfAccount) => setEditingAccount(account);
  const submitForm = async (input: ChartOfAccountUpsertInput) => {
    if (editingAccount) {
      return updateMutation.mutateAsync({ id: editingAccount.id, input });
    }

    return createMutation.mutateAsync(input);
  };

  return {
    accounts,
    filteredAccounts,
    accountTree,
    activePostableAccounts,
    mappings,
    profileSetting,
    enabledModules,
    financeTransactions,
    mappingHealth,
    templatePreview: templatePreviewQuery.data,
    isLoading: defaultsQuery.isLoading || templatePreviewQuery.isLoading,
    editingAccount,
    searchText,
    setSearchText,
    typeFilter,
    setTypeFilter,
    statusFilter,
    setStatusFilter,
    handleEdit,
    resetForm,
    submitForm,
    archiveAccount: archiveMutation.mutateAsync,
    restoreAccount: restoreMutation.mutateAsync,
    updateMapping: updateMappingMutation.mutateAsync,
    updateProfileSetting: updateProfileMutation.mutateAsync,
    applyTemplate: applyTemplateMutation.mutateAsync,
    backfillSnapshots: backfillMutation.mutateAsync,
    isSubmitting: createMutation.isPending || updateMutation.isPending,
    isArchiving: archiveMutation.isPending,
    isRestoring: restoreMutation.isPending,
    isUpdatingMapping: updateMappingMutation.isPending,
    isUpdatingProfile: updateProfileMutation.isPending,
    isApplyingTemplate: applyTemplateMutation.isPending,
    isBackfilling: backfillMutation.isPending,
  };
};
