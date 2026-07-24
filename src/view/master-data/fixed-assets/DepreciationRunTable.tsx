import { Button, Empty, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Eye, RotateCcw, Send, Trash2 } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useI18n } from '@/hooks/useI18n';
import type { FixedAssetDepreciationRun, JournalEntry } from '@/types';

export default function DepreciationRunTable({ runs, journals, currency, onDetail, onPost, onDelete, onReverse }: {
  runs: FixedAssetDepreciationRun[];
  journals: JournalEntry[];
  currency: (value: number) => string;
  onDetail: (run: FixedAssetDepreciationRun) => void;
  onPost: (run: FixedAssetDepreciationRun) => void;
  onDelete: (run: FixedAssetDepreciationRun) => void;
  onReverse: (run: FixedAssetDepreciationRun) => void;
}) {
  const { t } = useI18n();
  const journalById = new Map(journals.map((journal) => [journal.id, journal]));
  const columns: ColumnsType<FixedAssetDepreciationRun> = [
    { title: t('fixedAssets.column.run'), fixed: 'left', width: 160, render: (_, run) => <Button type="link" className="p-0" onClick={() => onDetail(run)}>{run.run_number}</Button> },
    { title: t('fixedAssets.column.period'), width: 190, render: (_, run) => <div><Typography.Text strong>{run.period_name}</Typography.Text><div className="text-xs text-gray-500">{run.period_start} – {run.period_end}</div></div> },
    { title: t('fixedAssets.column.assetCount'), dataIndex: 'asset_count', width: 110, align: 'right' },
    { title: t('fixedAssets.column.depreciation'), width: 170, align: 'right', render: (_, run) => currency(run.total_depreciation) },
    { title: t('fixedAssets.column.status'), width: 110, render: (_, run) => <Tag color={run.status === 'POSTED' ? 'green' : run.status === 'REVERSED' ? 'orange' : 'blue'}>{t(`fixedAssets.runStatus.${run.status}`)}</Tag> },
    { title: t('fixedAssets.column.journal'), width: 170, render: (_, run) => run.journal_entry_id ? <Link to="/finance/general-ledger">{journalById.get(run.journal_entry_id)?.entry_number ?? run.journal_entry_id}</Link> : '-' },
    { title: t('fixedAssets.column.audit'), width: 210, render: (_, run) => <div><div>{run.posted_by_name ?? run.created_by_name ?? '-'}</div><div className="text-xs text-gray-500">{run.posted_at ?? run.created_at}</div></div> },
    { title: t('fixedAssets.column.action'), fixed: 'right', width: 170, render: (_, run) => <Space size={2}>
      <Button type="text" icon={<Eye size={15} />} title={t('fixedAssets.action.detail')} onClick={() => onDetail(run)} />
      {run.status === 'DRAFT' ? <Button type="text" icon={<Send size={15} />} title={t('fixedAssets.action.post')} onClick={() => onPost(run)} /> : null}
      {run.status === 'DRAFT' ? <Button danger type="text" icon={<Trash2 size={15} />} title={t('fixedAssets.action.deleteDraft')} onClick={() => onDelete(run)} /> : null}
      {run.status === 'POSTED' ? <Button danger type="text" icon={<RotateCcw size={15} />} title={t('fixedAssets.action.reverse')} onClick={() => onReverse(run)} /> : null}
    </Space> },
  ];
  return <Table rowKey="id" columns={columns} dataSource={runs} pagination={{ pageSize: 10, showSizeChanger: true }} scroll={{ x: 1250 }} locale={{ emptyText: <Empty description={t('fixedAssets.empty.runs')} /> }} />;
}
