import { useState } from 'react';
import { App, Button, Card, Form, Input, Select, Tabs } from 'antd';
import { BookOpen, Plus } from 'lucide-react';
import ChartOfAccountFormModal, {
  type ChartOfAccountFormValues,
} from '@/components/chart-of-accounts/ChartOfAccountFormModal';
import ChartOfAccountsTable from '@/components/chart-of-accounts/ChartOfAccountsTable';
import FinanceAccountMappingPanel from '@/components/chart-of-accounts/FinanceAccountMappingPanel';
import {
  useChartOfAccounts,
  type ChartOfAccountStatusFilter,
  type ChartOfAccountTypeFilter,
} from '@/hooks/useChartOfAccounts';
import { useI18n } from '@/hooks/useI18n';
import type { TranslationKey } from '@/i18n/messages';
import { accountTypeValues } from '@/lib/validations/chartOfAccount';
import type { ChartOfAccount } from '@/types';

export default function ChartOfAccountsManagement() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const [form] = Form.useForm<ChartOfAccountFormValues>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const {
    accounts,
    accountTree,
    activePostableAccounts,
    mappings,
    profileSetting,
    enabledModules,
    templatePreview,
    mappingHealth,
    isLoading,
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
    archiveAccount,
    restoreAccount,
    updateMapping,
    updateProfileSetting,
    updateModule,
    applyTemplate,
    backfillSnapshots,
    isSubmitting,
    isUpdatingMapping,
    isApplyingTemplate,
    isBackfilling,
    isUpdatingProfile,
    isUpdatingModule,
  } = useChartOfAccounts();

  const closeModal = () => {
    setIsModalOpen(false);
    resetForm();
    form.resetFields();
  };

  const openAddModal = () => {
    resetForm();
    form.resetFields();
    form.setFieldsValue({
      type: 'ASSET',
      is_postable: true,
      is_active: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (account: ChartOfAccount) => {
    handleEdit(account);
    form.resetFields();
    form.setFieldsValue({
      code: account.code,
      name: account.name,
      type: account.type,
      parent_id: account.parent_id,
      is_postable: account.is_postable,
      is_active: account.is_active,
      description: account.description,
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (values: ChartOfAccountFormValues) => {
    try {
      const wasEditing = Boolean(editingAccount);
      await submitForm(values);
      message.success(wasEditing ? t('coa.updateSuccess') : t('coa.createSuccess'));
      closeModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('coa.saveFailed'));
    }
  };

  const handleArchive = (account: ChartOfAccount) => {
    modal.confirm({
      title: t('coa.archiveConfirmTitle'),
      content: t('coa.archiveConfirmContent', { code: account.code, name: account.name }),
      okText: t('coa.archive'),
      okType: 'danger',
      cancelText: t('common.cancel'),
      onOk: async () => {
        try {
          await archiveAccount(account.id);
          message.success(t('coa.archiveSuccess'));
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('coa.archiveFailed'));
        }
      },
    });
  };

  const handleRestore = async (account: ChartOfAccount) => {
    try {
      await restoreAccount(account.id);
      message.success(t('coa.restoreSuccess'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('coa.restoreFailed'));
    }
  };

  return (
    <Card
      className="shadow-md"
      title={(
        <div className="flex items-center gap-2">
          <BookOpen className="h-5 w-5" />
          {t('coa.title')}
        </div>
      )}
      extra={(
        <Button type="primary" icon={<Plus size={16} />} onClick={openAddModal}>
          {t('coa.add')}
        </Button>
      )}
      loading={isLoading}
    >
      <Tabs
        items={[
          {
            key: 'accounts',
            label: t('coa.tabs.accounts'),
            children: (
              <>
                <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1fr)_180px_180px]">
                  <Input.Search
                    allowClear
                    value={searchText}
                    placeholder={t('coa.searchPlaceholder')}
                    onChange={(event) => setSearchText(event.target.value)}
                  />
                  <Select<ChartOfAccountTypeFilter>
                    value={typeFilter}
                    onChange={setTypeFilter}
                    options={[
                      { value: 'ALL', label: t('coa.filter.allTypes') },
                      ...accountTypeValues.map((type) => ({
                        value: type,
                        label: t(`coa.accountType.${type}` as TranslationKey),
                      })),
                    ]}
                  />
                  <Select<ChartOfAccountStatusFilter>
                    value={statusFilter}
                    onChange={setStatusFilter}
                    options={[
                      { value: 'active', label: t('coa.filter.active') },
                      { value: 'inactive', label: t('coa.filter.inactive') },
                      { value: 'all', label: t('coa.filter.allStatuses') },
                    ]}
                  />
                </div>
                <ChartOfAccountsTable
                  accounts={accountTree}
                  onEdit={openEditModal}
                  onArchive={handleArchive}
                  onRestore={handleRestore}
                />
              </>
            ),
          },
          {
            key: 'mapping',
            label: t('coa.tabs.mapping'),
            children: (
              <FinanceAccountMappingPanel
                mappings={mappings}
                accounts={activePostableAccounts}
                profileSetting={profileSetting}
                enabledModules={enabledModules}
                templatePreview={templatePreview}
                mappingHealth={mappingHealth}
                isUpdatingMapping={isUpdatingMapping}
                isApplyingTemplate={isApplyingTemplate}
                isBackfilling={isBackfilling}
                isUpdatingProfile={isUpdatingProfile}
                isUpdatingModule={isUpdatingModule}
                onUpdateMapping={(key, accountId) => updateMapping({ key, accountId })}
                onApplyTemplate={applyTemplate}
                onBackfillSnapshots={backfillSnapshots}
                onUpdateProfile={updateProfileSetting}
                onUpdateModule={(code, isEnabled) => updateModule({ code, isEnabled })}
              />
            ),
          },
        ]}
      />

      <ChartOfAccountFormModal
        form={form}
        open={isModalOpen}
        isEditing={Boolean(editingAccount)}
        isSubmitting={isSubmitting}
        accounts={accounts}
        editingAccount={editingAccount}
        onCancel={closeModal}
        onSubmit={handleSubmit}
      />
    </Card>
  );
}
