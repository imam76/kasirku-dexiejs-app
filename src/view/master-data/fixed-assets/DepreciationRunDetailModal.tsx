import { Alert, Descriptions, Modal, Statistic, Table, Tag } from 'antd';
import { FileSpreadsheet } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import dayjs from '@/lib/dayjs';
import ExportActions from '@/components/ExportActions';
import { useExportCsv } from '@/hooks/useExport';
import { useI18n } from '@/hooks/useI18n';
import type { FixedAssetDepreciationRun, FixedAssetDepreciationRunLine, JournalEntry } from '@/types';

export default function DepreciationRunDetailModal({ run, open, onClose, lines, journal, currency }: {
  run?: FixedAssetDepreciationRun;
  open: boolean;
  onClose: () => void;
  lines: FixedAssetDepreciationRunLine[];
  journal?: JournalEntry;
  currency: (value: number) => string;
}) {
  const { t } = useI18n();
  const exportCsv = useExportCsv();
  if (!run) return null;
  const exportRows = [
    ['run_number', 'period', 'asset_code', 'asset_name', 'opening_book_value', 'depreciation_amount', 'closing_accumulated_depreciation', 'closing_book_value', 'expense_account', 'accumulated_account', 'department', 'project'],
    ...lines.map((line) => [
      run.run_number, run.period_name, line.asset_code, line.asset_name, line.opening_book_value,
      line.depreciation_amount, line.closing_accumulated_depreciation, line.closing_book_value,
      `${line.depreciation_expense_account_code} - ${line.depreciation_expense_account_name}`,
      `${line.accumulated_depreciation_account_code} - ${line.accumulated_depreciation_account_name}`,
      line.department_name ?? '', line.project_name ?? '',
    ]),
  ];
  return (
    <Modal open={open} onCancel={onClose} footer={null} width={1000} title={`${t('fixedAssets.runDetail.title')} — ${run.run_number}`}>
      <div className="my-4 flex justify-end">
        <ExportActions buttonType="default" formats={[{ key: 'csv', label: 'CSV', icon: <FileSpreadsheet size={15} />, onExport: async (target) => { await exportCsv({ filename: `fixed-asset-depreciation-${run.period_end.slice(0, 7)}`, target, rows: exportRows, successMessage: t('fixedAssets.exportSuccess'), errorMessage: t('fixedAssets.exportFailed') }); } }]} />
      </div>
      <Alert type="info" showIcon className="mb-4" message={t('fixedAssets.runDetail.precheck')} />
      <Descriptions bordered size="small" column={3}>
        <Descriptions.Item label={t('fixedAssets.column.period')}>{run.period_name}</Descriptions.Item>
        <Descriptions.Item label={t('fixedAssets.column.status')}><Tag>{t(`fixedAssets.runStatus.${run.status}`)}</Tag></Descriptions.Item>
        <Descriptions.Item label={t('fixedAssets.column.journal')}>{journal ? <Link to="/finance/general-ledger">{journal.entry_number}</Link> : '-'}</Descriptions.Item>
        <Descriptions.Item label={t('fixedAssets.column.assetCount')}>{run.asset_count}</Descriptions.Item>
        <Descriptions.Item label={t('fixedAssets.column.depreciation')}><Statistic value={run.total_depreciation} formatter={(value) => currency(Number(value))} /></Descriptions.Item>
        <Descriptions.Item label={t('fixedAssets.column.audit')}>{run.posted_by_name ?? run.created_by_name ?? '-'}<br />{dayjs(run.posted_at ?? run.created_at).format('DD MMM YYYY HH:mm')}</Descriptions.Item>
      </Descriptions>
      <Table className="mt-4" size="small" rowKey="id" dataSource={lines} pagination={{ pageSize: 10 }} scroll={{ x: 1000 }} columns={[
        { title: t('fixedAssets.column.asset'), width: 220, render: (_, line) => <><strong>{line.asset_code}</strong><div>{line.asset_name}</div></> },
        { title: t('fixedAssets.detail.openingBookValue'), dataIndex: 'opening_book_value', align: 'right', render: currency },
        { title: t('fixedAssets.column.depreciation'), dataIndex: 'depreciation_amount', align: 'right', render: currency },
        { title: t('fixedAssets.column.accumulated'), dataIndex: 'closing_accumulated_depreciation', align: 'right', render: currency },
        { title: t('fixedAssets.detail.closingBookValue'), dataIndex: 'closing_book_value', align: 'right', render: currency },
        { title: t('fixedAssets.form.expenseAccount'), width: 220, render: (_, line) => `${line.depreciation_expense_account_code} - ${line.depreciation_expense_account_name}` },
        { title: t('fixedAssets.form.accumulatedAccount'), width: 220, render: (_, line) => `${line.accumulated_depreciation_account_code} - ${line.accumulated_depreciation_account_name}` },
        { title: t('fixedAssets.detail.dimensions'), width: 180, render: (_, line) => `${line.department_name ?? '-'} / ${line.project_name ?? '-'}` },
      ]} />
    </Modal>
  );
}
