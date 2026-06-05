import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, App, Button, Descriptions, Select, Space, Switch, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Layers, RefreshCw, Save, Wand2 } from 'lucide-react';
import {
  ACCOUNTING_PROFILE_LABELS,
  INDUSTRY_EXTENSION_LABELS,
} from '@/constants/accounting';
import { FINANCE_CATEGORIES } from '@/constants/finance';
import { SAK_EMKM_RETAIL_TEMPLATE } from '@/constants/chartOfAccounts';
import { useI18n } from '@/hooks/useI18n';
import { getFinanceCategoryLabel } from '@/i18n/finance';
import type {
  AccountingProfileCode,
  AccountingProfileSetting,
  AccountingModuleCode,
  ChartOfAccount,
  EnabledModule,
  FinanceAccountMapping,
  IndustryExtensionCode,
} from '@/types';
import {
  getChartOfAccountTemplatePreview,
  type ChartOfAccountTemplatePreview,
} from '@/services/chartOfAccountService';

const { Text } = Typography;

interface MappingHealth {
  inactiveMappings: FinanceAccountMapping[];
  nonPostableMappings: FinanceAccountMapping[];
  unmappedTransactionCount: number;
}

interface FinanceAccountMappingPanelProps {
  mappings: FinanceAccountMapping[];
  accounts: ChartOfAccount[];
  profileSetting?: AccountingProfileSetting;
  enabledModules: EnabledModule[];
  templatePreview?: ChartOfAccountTemplatePreview;
  mappingHealth: MappingHealth;
  isUpdatingMapping: boolean;
  isApplyingTemplate: boolean;
  isBackfilling: boolean;
  isUpdatingProfile: boolean;
  isUpdatingModule: boolean;
  onUpdateMapping: (key: string, accountId: string) => Promise<unknown>;
  onApplyTemplate: (input: {
    accounting_profile: AccountingProfileCode;
    industry_extension: IndustryExtensionCode;
    template_id: string;
    mode: 'MERGE_MISSING_ONLY';
    update_mappings: boolean;
    update_modules: boolean;
  }) => Promise<unknown>;
  onBackfillSnapshots: () => Promise<number>;
  onUpdateProfile: (input: {
    accountingProfile: AccountingProfileCode;
    industryExtension: IndustryExtensionCode;
    templateId?: string;
  }) => Promise<unknown>;
  onUpdateModule: (code: AccountingModuleCode, isEnabled: boolean) => Promise<unknown>;
}

const profileOptions = (Object.keys(ACCOUNTING_PROFILE_LABELS) as AccountingProfileCode[])
  .filter((profile) => profile !== 'SAK_ETAP_LEGACY')
  .map((profile) => ({
    value: profile,
    label: ACCOUNTING_PROFILE_LABELS[profile],
  }));

const extensionOptions = (Object.keys(INDUSTRY_EXTENSION_LABELS) as IndustryExtensionCode[]).map((extension) => ({
  value: extension,
  label: INDUSTRY_EXTENSION_LABELS[extension],
}));

export default function FinanceAccountMappingPanel({
  mappings,
  accounts,
  profileSetting,
  enabledModules,
  templatePreview,
  mappingHealth,
  isUpdatingMapping,
  isApplyingTemplate,
  isBackfilling,
  isUpdatingProfile,
  isUpdatingModule,
  onUpdateMapping,
  onApplyTemplate,
  onBackfillSnapshots,
  onUpdateProfile,
  onUpdateModule,
}: FinanceAccountMappingPanelProps) {
  const { message } = App.useApp();
  const { t } = useI18n();
  const [selectedProfileDraft, setSelectedProfileDraft] = useState<AccountingProfileCode>();
  const [selectedExtensionDraft, setSelectedExtensionDraft] = useState<IndustryExtensionCode>();
  const selectedProfile = selectedProfileDraft ?? profileSetting?.accounting_profile ?? 'SAK_EMKM';
  const selectedExtension = selectedExtensionDraft ?? profileSetting?.industry_extension ?? 'RETAIL';
  const selectedTemplatePreviewQuery = useQuery({
    queryKey: ['chartOfAccountTemplatePreviewDraft', selectedProfile, selectedExtension],
    queryFn: () => getChartOfAccountTemplatePreview({
      accounting_profile: selectedProfile,
      industry_extension: selectedExtension,
    }),
  });
  const selectedTemplatePreview = selectedTemplatePreviewQuery.data ?? templatePreview;

  const accountOptions = useMemo(() => accounts.map((account) => ({
    value: account.id,
    label: `${account.code} - ${account.name}`,
  })), [accounts]);
  const mappingByKey = useMemo(() => new Map(mappings.map((mapping) => [mapping.key, mapping])), [mappings]);
  const categoryKeys = useMemo(() => {
    return Array.from(new Set([
      ...Object.values(FINANCE_CATEGORIES),
      ...mappings.map((mapping) => mapping.key),
    ])).sort();
  }, [mappings]);

  const unmappedCategories = categoryKeys.filter((key) => !mappingByKey.has(key));
  const moduleRows = enabledModules.map((module) => ({
    key: module.code,
    label: module.code.replace(/_/g, ' '),
    enabled: module.is_enabled,
  }));
  const toggleableModules: AccountingModuleCode[] = ['GENERAL_LEDGER'];

  const handleMappingChange = async (key: string, accountId: string) => {
    try {
      await onUpdateMapping(key, accountId);
      message.success(t('coa.mapping.updateSuccess'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('coa.mapping.updateFailed'));
    }
  };

  const handleSaveProfile = async () => {
    try {
      await onUpdateProfile({
        accountingProfile: selectedProfile,
        industryExtension: selectedExtension,
        templateId: selectedProfile === 'SAK_EMKM' && selectedExtension === 'RETAIL'
          ? SAK_EMKM_RETAIL_TEMPLATE.id
          : undefined,
      });
      message.success(t('coa.template.profileSaved'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('coa.template.profileSaveFailed'));
    }
  };

  const handleApplyTemplate = async () => {
    try {
      if (!selectedTemplatePreview?.canApply) {
        message.warning(t('coa.template.previewOnly'));
        return;
      }

      await onApplyTemplate({
        accounting_profile: selectedProfile,
        industry_extension: selectedExtension,
        template_id: selectedTemplatePreview.templateId,
        mode: 'MERGE_MISSING_ONLY',
        update_mappings: true,
        update_modules: true,
      });
      message.success(t('coa.template.applySuccess'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('coa.template.applyFailed'));
    }
  };

  const handleModuleChange = async (code: AccountingModuleCode, isEnabled: boolean) => {
    try {
      await onUpdateModule(code, isEnabled);
      message.success(t('coa.modules.updateSuccess'));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('coa.modules.updateFailed'));
    }
  };

  const handleBackfill = async () => {
    try {
      const count = await onBackfillSnapshots();
      message.success(t('coa.mapping.backfillSuccess', { count }));
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('coa.mapping.backfillFailed'));
    }
  };

  const columns: ColumnsType<{ key: string }> = [
    {
      title: t('coa.mapping.category'),
      dataIndex: 'key',
      key: 'key',
      render: (key: string) => getFinanceCategoryLabel(key, t),
    },
    {
      title: t('coa.mapping.account'),
      dataIndex: 'key',
      key: 'account',
      render: (key: string) => (
        <Select
          showSearch
          optionFilterProp="label"
          placeholder={t('coa.mapping.accountPlaceholder')}
          value={mappingByKey.get(key)?.account_id}
          options={accountOptions}
          loading={isUpdatingMapping}
          onChange={(accountId) => handleMappingChange(key, accountId)}
          style={{ minWidth: 260 }}
        />
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="rounded-md border border-gray-100 p-4">
          <div className="mb-3 flex items-center gap-2 font-medium">
            <Wand2 size={18} />
            <span>{t('coa.template.title')}</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Select
              value={selectedProfile}
              options={profileOptions}
              onChange={setSelectedProfileDraft}
            />
            <Select
              value={selectedExtension}
              options={extensionOptions}
              onChange={setSelectedExtensionDraft}
            />
          </div>
          <Descriptions size="small" column={2} className="mt-4">
            <Descriptions.Item label={t('coa.template.activeTemplate')}>
              {profileSetting?.template_id ?? '-'}
            </Descriptions.Item>
            <Descriptions.Item label={t('coa.template.missingAccounts')}>
              {selectedTemplatePreview?.missingAccounts.length ?? 0}
            </Descriptions.Item>
            <Descriptions.Item label={t('coa.template.mappingChanges')}>
              {selectedTemplatePreview?.mappingChangeCount ?? 0}
            </Descriptions.Item>
            <Descriptions.Item label={t('coa.template.moduleChanges')}>
              {selectedTemplatePreview?.moduleChangeCount ?? 0}
            </Descriptions.Item>
          </Descriptions>
          {selectedTemplatePreview && (
            <div className="mt-3 space-y-2">
              {selectedTemplatePreview.warningMessages.map((warning) => (
                <Alert key={warning} type="warning" showIcon title={warning} />
              ))}
              {selectedTemplatePreview.requiredDomainFeatures.length > 0 && (
                <Alert
                  type="info"
                  showIcon
                  title={t('coa.template.requiredFeatures')}
                  description={selectedTemplatePreview.requiredDomainFeatures.join(', ')}
                />
              )}
            </div>
          )}
          <Space wrap className="mt-3">
            <Button
              icon={<Save size={16} />}
              loading={isUpdatingProfile}
              onClick={handleSaveProfile}
            >
              {t('coa.template.saveProfile')}
            </Button>
            <Button
              type="primary"
              icon={<Wand2 size={16} />}
              loading={isApplyingTemplate || selectedTemplatePreviewQuery.isLoading}
              onClick={handleApplyTemplate}
              disabled={!selectedTemplatePreview?.canApply}
            >
              {t('coa.template.apply')}
            </Button>
          </Space>
        </div>

        <div className="rounded-md border border-gray-100 p-4">
          <div className="mb-3 flex items-center gap-2 font-medium">
            <Layers size={18} />
            <span>{t('coa.modules.title')}</span>
          </div>
          <Space wrap>
            {moduleRows.map((module) => (
              <div key={module.key} className="flex items-center gap-2 rounded-md border border-gray-100 px-2 py-1">
                <Text>{module.label}</Text>
                {toggleableModules.includes(module.key) ? (
                  <Switch
                    size="small"
                    checked={module.enabled}
                    loading={isUpdatingModule}
                    onChange={(checked) => handleModuleChange(module.key, checked)}
                  />
                ) : (
                  <Tag color={module.enabled ? 'green' : 'default'}>
                    {module.enabled ? t('common.yes') : t('common.no')}
                  </Tag>
                )}
              </div>
            ))}
          </Space>
        </div>
      </div>

      {(unmappedCategories.length > 0 ||
        mappingHealth.inactiveMappings.length > 0 ||
        mappingHealth.nonPostableMappings.length > 0 ||
        mappingHealth.unmappedTransactionCount > 0) && (
        <Alert
          type="warning"
          showIcon
          title={t('coa.mapping.healthTitle')}
          description={(
            <Space orientation="vertical" size={2}>
              <Text>{t('coa.mapping.unmappedCategories', { count: unmappedCategories.length })}</Text>
              <Text>{t('coa.mapping.inactiveMappings', { count: mappingHealth.inactiveMappings.length })}</Text>
              <Text>{t('coa.mapping.nonPostableMappings', { count: mappingHealth.nonPostableMappings.length })}</Text>
              <Text>{t('coa.mapping.unmappedTransactions', { count: mappingHealth.unmappedTransactionCount })}</Text>
            </Space>
          )}
          action={(
            <Button
              size="small"
              icon={<RefreshCw size={14} />}
              loading={isBackfilling}
              onClick={handleBackfill}
            >
              {t('coa.mapping.backfill')}
            </Button>
          )}
        />
      )}

      <Table
        dataSource={categoryKeys.map((key) => ({ key }))}
        columns={columns}
        rowKey="key"
        pagination={{ pageSize: 8 }}
        scroll={{ x: 640 }}
      />
    </div>
  );
}
