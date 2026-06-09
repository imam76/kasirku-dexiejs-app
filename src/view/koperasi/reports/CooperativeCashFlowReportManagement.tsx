import { useMemo, useState } from 'react';
import { Alert, Button, DatePicker, Modal, Select, Space, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { Banknote, Filter, RefreshCw } from 'lucide-react';
import { useCompanyProfileSetting } from '@/hooks/useCompanyProfileSetting';
import { useCooperativeReports } from '@/hooks/useCooperativeReports';
import { useI18n } from '@/hooks/useI18n';
import type { TranslationKey } from '@/i18n/messages';
import dayjs from '@/lib/dayjs';
import { accountTypeValues } from '@/lib/validations/chartOfAccount';
import type {
  CooperativeCashFlowActivity,
  CooperativeReportFilters,
} from '@/services/cooperativeReportService';
import type { AccountType } from '@/types';
import CooperativeCashFlowTab from './CooperativeCashFlowTab';

const { Text, Title } = Typography;

const ALL_VALUE = '__ALL__';

const cashFlowActivityLabelKey: Record<CooperativeCashFlowActivity, TranslationKey> = {
  OPERATING: 'cooperative.reports.cashFlow.operating',
  INVESTING: 'cooperative.reports.cashFlow.investing',
  FINANCING: 'cooperative.reports.cashFlow.financing',
};

const getOptionSortKey = (item: { code?: string; name: string; id: string }) => (
  item.code?.trim() || item.name || item.id
).toLowerCase();

const toAccountOptions = (items: Array<{ id: string; code?: string; name: string }>) => [
  { value: ALL_VALUE, label: 'All' },
  ...[...items]
    .sort((left, right) => getOptionSortKey(left).localeCompare(getOptionSortKey(right), undefined, { numeric: true }))
    .map((item) => ({
      value: item.id,
      label: item.code ? `${item.code} - ${item.name}` : item.name,
    })),
];

const getDefaultFilters = (): CooperativeReportFilters => ({
  startDate: dayjs.tz().startOf('month').toISOString(),
  endDate: dayjs.tz().endOf('month').toISOString(),
});

const getFilterCount = (filters: CooperativeReportFilters) => (
  (filters.startDate || filters.endDate ? 1 : 0) +
  (filters.cashFlowActivity ? 1 : 0) +
  (filters.cashFlowAccountType ? 1 : 0) +
  (filters.cashFlowAccountId ? 1 : 0)
);

export default function CooperativeCashFlowReportManagement() {
  const { t } = useI18n();
  const { profile } = useCompanyProfileSetting();
  const [filters, setFilters] = useState<CooperativeReportFilters>(() => getDefaultFilters());
  const [draftFilters, setDraftFilters] = useState<CooperativeReportFilters>(() => getDefaultFilters());
  const [filterOpen, setFilterOpen] = useState(false);
  const reportQuery = useCooperativeReports(filters);
  const data = reportQuery.data;
  const isLoading = reportQuery.isLoading || reportQuery.isFetching;
  const filterCount = getFilterCount(filters);
  const companyName = profile?.company_name || t('cooperative.ledger.companyFallback');
  const accountOptions = useMemo(() => toAccountOptions(data?.accounts ?? []), [data?.accounts]);
  const activityOptions = useMemo(() => [
    { value: ALL_VALUE, label: t('common.all') },
    ...Object.entries(cashFlowActivityLabelKey).map(([activity, labelKey]) => ({
      value: activity,
      label: t(labelKey),
    })),
  ], [t]);
  const accountTypeOptions = useMemo(() => [
    { value: ALL_VALUE, label: t('common.all') },
    ...accountTypeValues.map((accountType) => ({
      value: accountType,
      label: t(`coa.accountType.${accountType}` as TranslationKey),
    })),
  ], [t]);
  const dateRange = useMemo<[Dayjs, Dayjs] | null>(() => {
    if (!draftFilters.startDate || !draftFilters.endDate) return null;
    return [dayjs(draftFilters.startDate).tz(), dayjs(draftFilters.endDate).tz()];
  }, [draftFilters.endDate, draftFilters.startDate]);
  const periodText = `${filters.startDate ? dayjs(filters.startDate).tz().format('YYYY-MM-DD') : t('common.all')} - ${filters.endDate ? dayjs(filters.endDate).tz().format('YYYY-MM-DD') : t('common.all')}`;

  const handleOpenFilter = () => {
    setDraftFilters(filters);
    setFilterOpen(true);
  };

  const handleApplyFilter = () => {
    setFilters(draftFilters);
    setFilterOpen(false);
  };

  const handleResetFilter = () => {
    const defaultFilters = getDefaultFilters();
    setDraftFilters(defaultFilters);
    setFilters(defaultFilters);
  };

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Title level={2} className="!mb-1 flex items-center gap-2">
            <Banknote size={24} />
            {t('cooperative.reports.cashFlow.reportTitle')}
          </Title>
          <Text type="secondary">{t('cooperative.reports.cashFlow.subtitle')}</Text>
        </div>
        <Space wrap>
          <Button icon={<Filter size={16} />} onClick={handleOpenFilter}>
            {filterCount > 0
              ? t('cooperative.reports.cashFlow.filterWithCount', { count: filterCount })
              : t('cooperative.reports.cashFlow.filter')}
          </Button>
          <Button icon={<RefreshCw size={16} />} onClick={() => void reportQuery.refetch()} loading={isLoading}>
            {t('common.refresh')}
          </Button>
        </Space>
      </div>

      {reportQuery.error ? (
        <Alert
          type="error"
          showIcon
          message={reportQuery.error instanceof Error ? reportQuery.error.message : t('common.unknownError')}
        />
      ) : null}

      <CooperativeCashFlowTab
        statement={data?.cooperativeCashFlowStatement}
        financialReadiness={data?.financialReadiness}
        companyName={companyName}
        logoDataUrl={profile?.logo_data_url}
        periodText={periodText}
      />

      <Modal
        title={t('cooperative.reports.cashFlow.filterTitle')}
        open={filterOpen}
        onCancel={() => setFilterOpen(false)}
        onOk={handleApplyFilter}
        okText={t('cooperative.reports.cashFlow.applyFilter')}
        footer={[
          <Button key="reset" onClick={handleResetFilter}>
            {t('common.reset')}
          </Button>,
          <Button key="cancel" onClick={() => setFilterOpen(false)}>
            {t('common.cancel')}
          </Button>,
          <Button key="apply" type="primary" onClick={handleApplyFilter}>
            {t('cooperative.reports.cashFlow.applyFilter')}
          </Button>,
        ]}
      >
        <Space direction="vertical" className="w-full" size="middle">
          <div>
            <Text strong>{t('cooperative.reports.cashFlow.dateRange')}</Text>
            <DatePicker.RangePicker
              className="mt-2 w-full"
              value={dateRange}
              format="YYYY-MM-DD"
              onChange={(value) => {
                const fromDate = value?.[0];
                const toDate = value?.[1];

                if (!fromDate || !toDate) {
                  setDraftFilters((current) => ({ ...current, startDate: undefined, endDate: undefined }));
                  return;
                }
                setDraftFilters((current) => ({
                  ...current,
                  startDate: fromDate.startOf('day').toISOString(),
                  endDate: toDate.endOf('day').toISOString(),
                }));
              }}
            />
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Text strong>{t('cooperative.reports.cashFlow.activity')}</Text>
              <Select
                showSearch
                optionFilterProp="label"
                className="mt-2 w-full"
                value={draftFilters.cashFlowActivity ?? ALL_VALUE}
                options={activityOptions}
                onChange={(value: string) => setDraftFilters((current) => ({
                  ...current,
                  cashFlowActivity: value === ALL_VALUE ? undefined : value as CooperativeCashFlowActivity,
                }))}
              />
            </div>
            <div>
              <Text strong>{t('cooperative.reports.cashFlow.accountType')}</Text>
              <Select
                showSearch
                optionFilterProp="label"
                className="mt-2 w-full"
                value={draftFilters.cashFlowAccountType ?? ALL_VALUE}
                options={accountTypeOptions}
                onChange={(value: string) => setDraftFilters((current) => ({
                  ...current,
                  cashFlowAccountType: value === ALL_VALUE ? undefined : value as AccountType,
                }))}
              />
            </div>
          </div>

          <div>
            <Text strong>{t('cooperative.reports.cashFlow.account')}</Text>
            <Select
              showSearch
              optionFilterProp="label"
              className="mt-2 w-full"
              value={draftFilters.cashFlowAccountId ?? ALL_VALUE}
              options={accountOptions}
              onChange={(value: string) => setDraftFilters((current) => ({
                ...current,
                cashFlowAccountId: value === ALL_VALUE ? undefined : value,
              }))}
            />
          </div>
        </Space>
      </Modal>
    </div>
  );
}
