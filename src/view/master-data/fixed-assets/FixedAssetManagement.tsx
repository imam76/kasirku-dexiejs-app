import { useMemo, useState } from 'react';
import { Alert, App, Badge, Button, Card, DatePicker, Empty, Form, Input, Modal, Select, Spin, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import { Building2, FileSpreadsheet, Filter, Plus, RotateCcw } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import dayjs from '@/lib/dayjs';
import { useFixedAssets } from '@/hooks/useFixedAssets';
import { useBaseCurrency } from '@/hooks/useBaseCurrency';
import { useI18n } from '@/hooks/useI18n';
import { useExportCsv } from '@/hooks/useExport';
import { useAuth } from '@/auth/useAuth';
import ExportActions from '@/components/ExportActions';
import type { FixedAsset, FixedAssetDepreciationRun } from '@/types';
import type { DepreciationRunPreview } from '@/services/fixedAssetService';
import FixedAssetFormModal, { type FixedAssetFormValues } from './FixedAssetFormModal';
import FixedAssetFilterModal, { type FixedAssetFilterValues } from './FixedAssetFilterModal';
import FixedAssetTable from './FixedAssetTable';
import DepreciationRunTable from './DepreciationRunTable';
import FixedAssetDetailDrawer from './FixedAssetDetailDrawer';
import DepreciationRunDetailModal from './DepreciationRunDetailModal';

export default function FixedAssetManagement() {
  const { t } = useI18n();
  const { message, modal } = App.useApp();
  const { can } = useAuth();
  const { baseCurrencyCode } = useBaseCurrency();
  const exportCsv = useExportCsv();
  const data = useFixedAssets();
  const [form] = Form.useForm<FixedAssetFormValues>();
  const [activeTab, setActiveTab] = useState('assets');
  const [formOpen, setFormOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [draftPeriodId, setDraftPeriodId] = useState<string>();
  const [draftNotes, setDraftNotes] = useState('');
  const [draftPreview, setDraftPreview] = useState<DepreciationRunPreview>();
  const [draftPreviewError, setDraftPreviewError] = useState('');
  const [detailAsset, setDetailAsset] = useState<FixedAsset>();
  const [detailRun, setDetailRun] = useState<FixedAssetDepreciationRun>();
  const currency = (value: number) => new Intl.NumberFormat(undefined, { style: 'currency', currency: baseCurrencyCode, maximumFractionDigits: 2 }).format(value || 0);
  const runById = useMemo(() => new Map(data.runs.map((run) => [run.id, run])), [data.runs]);
  const hasPostedHistory = (assetId: string) => data.runLines.some((line) => {
    const status = runById.get(line.run_id)?.status;
    return line.asset_id === assetId && (status === 'POSTED' || status === 'REVERSED');
  });
  const activeFilterCount = Number(data.categoryFilter !== 'ALL') + Number(data.derivedStatusFilter !== 'ALL') + Number(data.activityFilter !== 'active') +
    Number(Boolean(data.departmentFilter)) + Number(Boolean(data.projectFilter)) + Number(Boolean(data.assetAccountFilter)) + Number(Boolean(data.availableDateRange[0] || data.availableDateRange[1]));
  const validAccountHealth = {
    asset: data.accounts.some((account) => account.is_active && account.is_postable && account.type === 'ASSET' && account.normal_balance === 'DEBIT'),
    accumulated: data.accounts.some((account) => account.is_active && account.is_postable && account.type === 'ASSET' && account.normal_balance === 'CREDIT'),
    expense: data.accounts.some((account) => account.is_active && account.is_postable && account.type === 'EXPENSE' && account.normal_balance === 'DEBIT'),
  };
  const accountReady = Object.values(validAccountHealth).every(Boolean);

  const closeForm = () => {
    setFormOpen(false);
    data.setEditingAsset(null);
    form.resetFields();
  };
  const openCreate = () => {
    data.setEditingAsset(null);
    form.resetFields();
    form.setFieldsValue({ registration_type: 'NEW', category: 'OTHER', residual_value: 0, opening_accumulated_depreciation: 0, is_active: true });
    setFormOpen(true);
  };
  const openEdit = (asset: FixedAsset) => {
    data.setEditingAsset(asset);
    form.setFieldsValue({
      ...asset,
      acquisition_date: dayjs(asset.acquisition_date),
      available_for_use_date: dayjs(asset.available_for_use_date),
      opening_balance_date: asset.opening_balance_date ? dayjs(asset.opening_balance_date) : undefined,
    });
    setFormOpen(true);
  };
  const saveAsset = async (values: FixedAssetFormValues) => {
    try {
      await data.saveAsset({
        ...values,
        acquisition_date: values.acquisition_date.format('YYYY-MM-DD'),
        available_for_use_date: values.available_for_use_date.format('YYYY-MM-DD'),
        opening_balance_date: values.registration_type === 'EXISTING' ? values.opening_balance_date?.format('YYYY-MM-DD') : undefined,
        opening_accumulated_depreciation: values.registration_type === 'EXISTING' ? values.opening_accumulated_depreciation ?? 0 : 0,
        opening_remaining_useful_life_months: values.registration_type === 'EXISTING' ? values.opening_remaining_useful_life_months : undefined,
      });
      message.success(t('fixedAssets.saveSuccess'));
      closeForm();
    } catch (error) {
      message.error(error instanceof Error ? error.message : String(error));
    }
  };
  const archiveAsset = (asset: FixedAsset) => modal.confirm({
    title: t('fixedAssets.confirm.archive', { name: asset.name }),
    okType: 'danger', okText: t('fixedAssets.action.archive'), cancelText: t('common.cancel'),
    onOk: async () => { try { await data.archiveAsset(asset.id); message.success(t('fixedAssets.archiveSuccess')); } catch (error) { message.error(error instanceof Error ? error.message : String(error)); } },
  });
  const restoreAsset = async (asset: FixedAsset) => {
    try { await data.restoreAsset(asset.id); message.success(t('fixedAssets.restoreSuccess')); }
    catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
  };
  const createDraft = async () => {
    const periodId = draftPeriodId ?? data.selectedPeriodId;
    if (!periodId) return;
    try {
      await data.createDraft({ periodId, notes: draftNotes });
      message.success(t('fixedAssets.draftSuccess'));
      setDraftOpen(false); setDraftNotes(''); setDraftPreview(undefined); setDraftPreviewError(''); setActiveTab('runs');
    } catch (error) { message.error(error instanceof Error ? error.message : String(error)); }
  };
  const loadDraftPreview = async (periodId: string) => {
    setDraftPreview(undefined);
    setDraftPreviewError('');
    try {
      setDraftPreview(await data.previewDraft(periodId));
    } catch (error) {
      setDraftPreviewError(error instanceof Error ? error.message : t('fixedAssets.preview.loadFailed'));
    }
  };
  const openDraftModal = () => {
    const periodId = data.selectedPeriodId;
    setDraftPeriodId(periodId);
    setDraftOpen(true);
    if (periodId) void loadDraftPreview(periodId);
  };
  const postRun = (run: FixedAssetDepreciationRun) => modal.confirm({
    title: t('fixedAssets.confirm.post', { number: run.run_number }), okText: t('fixedAssets.action.post'), cancelText: t('common.cancel'),
    onOk: async () => { try { await data.postRun(run.id); message.success(t('fixedAssets.postSuccess')); } catch (error) { message.error(error instanceof Error ? error.message : String(error)); } },
  });
  const deleteDraft = (run: FixedAssetDepreciationRun) => modal.confirm({
    title: t('fixedAssets.confirm.delete', { number: run.run_number }), okType: 'danger', okText: t('fixedAssets.action.deleteDraft'), cancelText: t('common.cancel'),
    onOk: async () => { try { await data.deleteDraft(run.id); message.success(t('fixedAssets.deleteSuccess')); } catch (error) { message.error(error instanceof Error ? error.message : String(error)); } },
  });
  const reverseRun = (run: FixedAssetDepreciationRun) => {
    let reason = '';
    modal.confirm({
      title: `${t('fixedAssets.action.reverse')} ${run.run_number}`,
      content: <Input.TextArea className="mt-3" placeholder={t('fixedAssets.reverseReason')} onChange={(event) => { reason = event.target.value; }} />,
      okType: 'danger', okText: t('fixedAssets.action.reverse'), cancelText: t('common.cancel'),
      onOk: async () => { try { await data.reverseRun({ runId: run.id, reason }); message.success(t('fixedAssets.reverseSuccess')); } catch (error) { message.error(error instanceof Error ? error.message : String(error)); throw error; } },
    });
  };
  const applyFilters = (values: FixedAssetFilterValues) => {
    data.setCategoryFilter(values.category);
    data.setDerivedStatusFilter(values.derivedStatus);
    data.setActivityFilter(values.activity);
    data.setDepartmentFilter(values.departmentId);
    data.setProjectFilter(values.projectId);
    data.setAssetAccountFilter(values.assetAccountId);
    data.setAvailableDateRange([
      values.availableDateRange?.[0]?.format('YYYY-MM-DD'),
      values.availableDateRange?.[1]?.format('YYYY-MM-DD'),
    ]);
    setFilterOpen(false);
  };
  const resetAssetFilters = () => {
    data.setAssetSearch(''); data.setCategoryFilter('ALL'); data.setDerivedStatusFilter('ALL'); data.setActivityFilter('active');
    data.setDepartmentFilter(undefined); data.setProjectFilter(undefined); data.setAssetAccountFilter(undefined); data.setAvailableDateRange([]);
  };
  const registerExportRows = [
    ['asset_code', 'name', 'category', 'location', 'acquisition_date', 'available_for_use_date', 'acquisition_cost', 'residual_value', 'useful_life_months', 'depreciation_start_date', 'regular_depreciation_amount', 'accumulated_depreciation', 'book_value', 'status', 'asset_account', 'accumulated_account', 'expense_account', 'department', 'project'],
    ...data.filteredAssetRows.map(({ asset, position }) => [
      asset.asset_code, asset.name, t(`fixedAssets.category.${asset.category}`), asset.location ?? '',
      asset.acquisition_date, asset.available_for_use_date, asset.acquisition_cost, asset.residual_value,
      asset.useful_life_months, asset.depreciation_start_date, asset.regular_depreciation_amount,
      position.accumulatedDepreciation, position.bookValue, t(`fixedAssets.status.${position.derivedStatus}`),
      `${asset.asset_account_code} - ${asset.asset_account_name}`,
      `${asset.accumulated_depreciation_account_code} - ${asset.accumulated_depreciation_account_name}`,
      `${asset.depreciation_expense_account_code} - ${asset.depreciation_expense_account_name}`,
      asset.department_name ?? '', asset.project_name ?? '',
    ]),
  ];
  const detailAssetRow = detailAsset ? data.assetRows.find((row) => row.asset.id === detailAsset.id) : undefined;
  const detailRunLines = detailRun ? data.runLines.filter((line) => line.run_id === detailRun.id) : [];

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <Card className="shadow-md" title={<div className="flex items-center gap-2"><Building2 size={20} />{t('fixedAssets.title')}</div>} extra={activeTab === 'assets'
        ? <Button type="primary" icon={<Plus size={16} />} disabled={!accountReady} onClick={openCreate}>{t('fixedAssets.add')}</Button>
        : <Button type="primary" icon={<Plus size={16} />} disabled={!data.selectedPeriodId} onClick={openDraftModal}>{t('fixedAssets.createDraft')}</Button>}>
        {!accountReady ? <Alert className="mb-4" type="error" showIcon message={t('fixedAssets.accountPrerequisiteMissing')} description={<Link to="/finance/chart-of-accounts">{t('fixedAssets.openChartOfAccounts')}</Link>} /> : null}
        <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Card size="small"><Statistic title={t('fixedAssets.summary.cost')} value={data.summary.acquisitionCost} formatter={(value) => currency(Number(value))} /></Card>
          <Card size="small"><Statistic title={t('fixedAssets.summary.accumulated')} value={data.summary.accumulatedDepreciation} formatter={(value) => currency(Number(value))} /></Card>
          <Card size="small"><Statistic title={t('fixedAssets.summary.bookValue')} value={data.summary.bookValue} formatter={(value) => currency(Number(value))} /></Card>
          <Card size="small"><Statistic title={t('fixedAssets.summary.period')} value={data.summary.periodDepreciation} formatter={(value) => currency(Number(value))} suffix={<Tag color={data.summary.periodPosted ? 'green' : 'orange'}>{data.summary.periodPosted ? t('fixedAssets.summary.posted') : t('fixedAssets.summary.unposted')}</Tag>} /></Card>
        </div>
        <Tabs activeKey={activeTab} onChange={setActiveTab} items={[
          { key: 'assets', label: t('fixedAssets.assetsTab'), children: <>
            <div className="mb-4 flex flex-col gap-2 md:flex-row">
              <Input.Search allowClear className="min-w-0 flex-1" value={data.assetSearch} onChange={(event) => data.setAssetSearch(event.target.value)} placeholder={t('fixedAssets.searchAssets')} />
              <Button icon={<Filter size={15} />} onClick={() => setFilterOpen(true)}>{t('fixedAssets.filter')} {activeFilterCount ? <Badge count={activeFilterCount} /> : null}</Button>
              <Button icon={<RotateCcw size={15} />} onClick={resetAssetFilters}>{t('fixedAssets.reset')}</Button>
              <ExportActions buttonType="default" disabled={registerExportRows.length <= 1} formats={[{ key: 'csv', label: 'CSV', icon: <FileSpreadsheet size={15} />, onExport: async (target) => { await exportCsv({ filename: `fixed-assets-${dayjs().format('YYYY-MM-DD')}`, target, rows: registerExportRows, successMessage: t('fixedAssets.exportSuccess'), errorMessage: t('fixedAssets.exportFailed') }); } }]} />
            </div>
            <FixedAssetTable rows={data.filteredAssetRows} currency={currency} onDetail={setDetailAsset} onEdit={openEdit} onArchive={archiveAsset} onRestore={restoreAsset} />
          </> },
          { key: 'runs', label: t('fixedAssets.runsTab'), children: <>
            <div className="mb-4 grid grid-cols-1 gap-2 md:grid-cols-[1fr_170px_240px_260px_auto]">
              <Input.Search allowClear value={data.runSearch} onChange={(event) => data.setRunSearch(event.target.value)} placeholder={t('fixedAssets.searchRuns')} />
              <Select value={data.runStatusFilter} onChange={data.setRunStatusFilter} options={['ALL', 'DRAFT', 'POSTED', 'REVERSED'].map((value) => ({ value, label: value === 'ALL' ? t('fixedAssets.all') : t(`fixedAssets.runStatus.${value as 'DRAFT' | 'POSTED' | 'REVERSED'}`) }))} />
              <Select value={data.selectedPeriodId} onChange={data.setSelectedPeriodId} placeholder={t('fixedAssets.selectPeriod')} options={data.openMonthlyPeriods.map((period) => ({ value: period.id, label: `${period.name} (${period.end_date})` }))} />
              <DatePicker.RangePicker value={data.runPeriodRange[0] || data.runPeriodRange[1] ? [data.runPeriodRange[0] ? dayjs(data.runPeriodRange[0]) : null, data.runPeriodRange[1] ? dayjs(data.runPeriodRange[1]) : null] : null} onChange={(value) => data.setRunPeriodRange([value?.[0]?.format('YYYY-MM-DD'), value?.[1]?.format('YYYY-MM-DD')])} />
              <Button onClick={() => { data.setRunSearch(''); data.setRunStatusFilter('ALL'); data.setRunPeriodRange([]); }}>{t('fixedAssets.reset')}</Button>
            </div>
            <DepreciationRunTable runs={data.filteredRuns} journals={data.journalEntries} currency={currency} onDetail={setDetailRun} onPost={postRun} onDelete={deleteDraft} onReverse={reverseRun} />
          </> },
        ]} />
      </Card>

      <FixedAssetFormModal open={formOpen} form={form} editing={Boolean(data.editingAsset)} hasPostedHistory={Boolean(data.editingAsset && hasPostedHistory(data.editingAsset.id))} accounts={data.accounts} departments={data.departments} projects={data.projects} loading={data.isSaving} currency={currency} onCancel={closeForm} onSubmit={saveAsset} />
      <FixedAssetFilterModal
        open={filterOpen}
        values={{
          category: data.categoryFilter,
          derivedStatus: data.derivedStatusFilter,
          activity: data.activityFilter,
          departmentId: data.departmentFilter,
          projectId: data.projectFilter,
          assetAccountId: data.assetAccountFilter,
          availableDateRange: data.availableDateRange[0] || data.availableDateRange[1]
            ? [data.availableDateRange[0] ? dayjs(data.availableDateRange[0]) : null, data.availableDateRange[1] ? dayjs(data.availableDateRange[1]) : null]
            : undefined,
        }}
        accounts={data.accounts}
        departments={data.departments}
        projects={data.projects}
        onCancel={() => setFilterOpen(false)}
        onApply={applyFilters}
      />
      <FixedAssetDetailDrawer asset={detailAsset} open={Boolean(detailAsset)} onClose={() => setDetailAsset(undefined)} position={detailAssetRow?.position} postedLines={data.postedLines} runs={data.runs} runLines={data.runLines} journals={data.journalEntries} currency={currency} />
      <DepreciationRunDetailModal run={detailRun} open={Boolean(detailRun)} onClose={() => setDetailRun(undefined)} lines={detailRunLines} journal={detailRun?.journal_entry_id ? data.journalEntries.find((entry) => entry.id === detailRun.journal_entry_id) : undefined} currency={currency} />
      <Modal
        open={draftOpen}
        title={t('fixedAssets.createDraft')}
        width={820}
        onCancel={() => { setDraftOpen(false); setDraftPreview(undefined); setDraftPreviewError(''); }}
        onOk={createDraft}
        confirmLoading={data.isProcessing || data.isPreviewing}
        okButtonProps={{ disabled: !draftPreview || draftPreview.lines.length === 0 }}
      >
        <div className="space-y-3 pt-3">
          <Select className="w-full" value={draftPeriodId ?? data.selectedPeriodId} onChange={(periodId) => { setDraftPeriodId(periodId); void loadDraftPreview(periodId); }} placeholder={t('fixedAssets.selectPeriod')} options={data.openMonthlyPeriods.map((period) => ({ value: period.id, label: `${period.name} (${period.start_date} – ${period.end_date})` }))} />
          <Input.TextArea value={draftNotes} onChange={(event) => setDraftNotes(event.target.value)} placeholder={t('fixedAssets.form.description')} />
          <Typography.Title level={5} className="!mb-2">{t('fixedAssets.preview.title')}</Typography.Title>
          <Spin spinning={data.isPreviewing}>
            {draftPreviewError ? <Alert type="error" showIcon message={draftPreviewError} /> : null}
            {draftPreview ? <>
              <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Card size="small"><Statistic title={t('fixedAssets.preview.assetCount')} value={draftPreview.assetCount} /></Card>
                <Card size="small"><Statistic title={t('fixedAssets.preview.total')} value={draftPreview.totalDepreciation} formatter={(value) => currency(Number(value))} /></Card>
              </div>
              <Table
                size="small"
                rowKey="id"
                dataSource={draftPreview.lines}
                pagination={false}
                scroll={{ x: 650, y: 260 }}
                locale={{ emptyText: <Empty description={t('fixedAssets.preview.empty')} /> }}
                columns={[
                  { title: t('fixedAssets.column.asset'), render: (_, line) => <><strong>{line.asset_code}</strong><div>{line.asset_name}</div></> },
                  { title: t('fixedAssets.detail.openingBookValue'), dataIndex: 'opening_book_value', align: 'right', render: currency },
                  { title: t('fixedAssets.column.depreciation'), dataIndex: 'depreciation_amount', align: 'right', render: currency },
                  { title: t('fixedAssets.detail.closingBookValue'), dataIndex: 'closing_book_value', align: 'right', render: currency },
                ]}
              />
            </> : null}
          </Spin>
        </div>
      </Modal>
      {!can('JOURNAL_MANAGE') && activeTab === 'runs' ? <Alert type="warning" showIcon message={t('fixedAssets.journalPermissionRequired')} /> : null}
    </div>
  );
}
