import { Alert, Descriptions, Drawer, Statistic, Table, Tag, Typography } from 'antd';
import { Link } from '@tanstack/react-router';
import { useI18n } from '@/hooks/useI18n';
import { buildFixedAssetDepreciationSchedule, type FixedAssetPostedLine } from '@/utils/fixedAssets/calculateDepreciation';
import type { FixedAsset, FixedAssetDepreciationRun, FixedAssetDepreciationRunLine, FixedAssetDerivedStatus, JournalEntry } from '@/types';

export default function FixedAssetDetailDrawer({ asset, open, onClose, position, postedLines, runs, runLines, journals, currency }: {
  asset?: FixedAsset;
  open: boolean;
  onClose: () => void;
  position?: { accumulatedDepreciation: number; bookValue: number; derivedStatus: FixedAssetDerivedStatus };
  postedLines: FixedAssetPostedLine[];
  runs: FixedAssetDepreciationRun[];
  runLines: FixedAssetDepreciationRunLine[];
  journals: JournalEntry[];
  currency: (value: number) => string;
}) {
  const { t } = useI18n();
  if (!asset || !position) return null;
  const schedule = buildFixedAssetDepreciationSchedule(asset, postedLines);
  const linesByRun = new Set(runLines.filter((line) => line.asset_id === asset.id).map((line) => line.run_id));
  const history = runs.filter((run) => linesByRun.has(run.id) && !run.deleted_at).sort((left, right) => right.period_end.localeCompare(left.period_end));
  const journalById = new Map(journals.map((journal) => [journal.id, journal]));
  return (
    <Drawer open={open} onClose={onClose} width={900} title={`${t('fixedAssets.detail.title')} — ${asset.asset_code}`}>
      {asset.registration_type === 'EXISTING' ? <Alert className="mb-4" type="warning" showIcon message={t('fixedAssets.detail.baselineBadge')} /> : null}
      <Descriptions bordered size="small" column={{ xs: 1, sm: 2, md: 3 }} title={asset.name}>
        <Descriptions.Item label={t('fixedAssets.form.category')}>{t(`fixedAssets.category.${asset.category}`)}</Descriptions.Item>
        <Descriptions.Item label={t('fixedAssets.form.location')}>{asset.location ?? '-'}</Descriptions.Item>
        <Descriptions.Item label={t('fixedAssets.form.registration')}>{t(asset.registration_type === 'NEW' ? 'fixedAssets.form.new' : 'fixedAssets.form.existing')}</Descriptions.Item>
        <Descriptions.Item label={t('fixedAssets.form.acquisitionDate')}>{asset.acquisition_date}</Descriptions.Item>
        <Descriptions.Item label={t('fixedAssets.form.availableDate')}>{asset.available_for_use_date}</Descriptions.Item>
        <Descriptions.Item label={t('fixedAssets.form.life')}>{asset.useful_life_months}</Descriptions.Item>
        <Descriptions.Item label={t('fixedAssets.form.residual')}>{currency(asset.residual_value)}</Descriptions.Item>
        <Descriptions.Item label={t('fixedAssets.form.previewStart')}>{asset.depreciation_start_date}</Descriptions.Item>
        <Descriptions.Item label={t('fixedAssets.form.previewRegular')}>{currency(asset.regular_depreciation_amount)}</Descriptions.Item>
        {asset.registration_type === 'EXISTING' ? <Descriptions.Item label={t('fixedAssets.form.openingDate')}>{asset.opening_balance_date}</Descriptions.Item> : null}
        {asset.registration_type === 'EXISTING' ? <Descriptions.Item label={t('fixedAssets.form.openingAccumulated')}>{currency(asset.opening_accumulated_depreciation)}</Descriptions.Item> : null}
        {asset.registration_type === 'EXISTING' ? <Descriptions.Item label={t('fixedAssets.form.remainingLife')}>{asset.opening_remaining_useful_life_months}</Descriptions.Item> : null}
        <Descriptions.Item label={t('fixedAssets.form.assetAccount')}>{asset.asset_account_code} - {asset.asset_account_name}</Descriptions.Item>
        <Descriptions.Item label={t('fixedAssets.form.accumulatedAccount')}>{asset.accumulated_depreciation_account_code} - {asset.accumulated_depreciation_account_name}</Descriptions.Item>
        <Descriptions.Item label={t('fixedAssets.form.expenseAccount')}>{asset.depreciation_expense_account_code} - {asset.depreciation_expense_account_name}</Descriptions.Item>
        <Descriptions.Item label={t('fixedAssets.detail.dimensions')}>{asset.department_name ?? '-'} / {asset.project_name ?? '-'}</Descriptions.Item>
      </Descriptions>
      <div className="my-5 grid grid-cols-1 gap-3 md:grid-cols-3">
        <div className="rounded-lg border p-3"><Statistic title={t('fixedAssets.column.cost')} value={asset.acquisition_cost} formatter={(value) => currency(Number(value))} /></div>
        <div className="rounded-lg border p-3"><Statistic title={t('fixedAssets.column.accumulated')} value={position.accumulatedDepreciation} formatter={(value) => currency(Number(value))} /></div>
        <div className="rounded-lg border p-3"><Statistic title={t('fixedAssets.column.bookValue')} value={position.bookValue} formatter={(value) => currency(Number(value))} /></div>
      </div>
      <Typography.Title level={5}>{t('fixedAssets.detail.schedule')}</Typography.Title>
      <Table size="small" rowKey="periodStart" dataSource={schedule} pagination={{ pageSize: 12 }} scroll={{ x: 700 }} columns={[
        { title: t('fixedAssets.column.period'), dataIndex: 'periodStart', render: (_, row) => row.periodStart.slice(0, 7) },
        { title: t('fixedAssets.detail.openingBookValue'), dataIndex: 'openingBookValue', align: 'right', render: currency },
        { title: t('fixedAssets.column.depreciation'), dataIndex: 'depreciationAmount', align: 'right', render: currency },
        { title: t('fixedAssets.column.accumulated'), dataIndex: 'closingAccumulatedDepreciation', align: 'right', render: currency },
        { title: t('fixedAssets.detail.closingBookValue'), dataIndex: 'closingBookValue', align: 'right', render: currency },
        { title: t('fixedAssets.column.status'), dataIndex: 'status', render: (value) => <Tag color={value === 'POSTED' ? 'green' : 'default'}>{value === 'POSTED' ? t('fixedAssets.runStatus.POSTED') : t('fixedAssets.detail.projected')}</Tag> },
      ]} />
      <Typography.Title level={5} className="mt-5">{t('fixedAssets.detail.history')}</Typography.Title>
      <Table size="small" rowKey="id" dataSource={history} pagination={false} columns={[
        { title: t('fixedAssets.column.run'), dataIndex: 'run_number' },
        { title: t('fixedAssets.column.period'), dataIndex: 'period_name' },
        { title: t('fixedAssets.column.status'), dataIndex: 'status', render: (value) => <Tag>{t(`fixedAssets.runStatus.${value as FixedAssetDepreciationRun['status']}`)}</Tag> },
        { title: t('fixedAssets.column.journal'), render: (_, run) => run.journal_entry_id ? <Link to="/finance/general-ledger">{journalById.get(run.journal_entry_id)?.entry_number ?? run.journal_entry_id}</Link> : '-' },
      ]} />
    </Drawer>
  );
}
