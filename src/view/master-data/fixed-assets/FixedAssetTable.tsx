import { Button, Empty, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Archive, Eye, Pencil, RotateCcw } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { FixedAsset, FixedAssetDerivedStatus } from '@/types';

export interface FixedAssetTableRow {
  asset: FixedAsset;
  position: {
    accumulatedDepreciation: number;
    bookValue: number;
    derivedStatus: FixedAssetDerivedStatus;
  };
}

export default function FixedAssetTable({ rows, currency, onDetail, onEdit, onArchive, onRestore }: {
  rows: FixedAssetTableRow[];
  currency: (value: number) => string;
  onDetail: (asset: FixedAsset) => void;
  onEdit: (asset: FixedAsset) => void;
  onArchive: (asset: FixedAsset) => void;
  onRestore: (asset: FixedAsset) => void;
}) {
  const { t } = useI18n();
  const statusColor: Record<FixedAssetDerivedStatus, string> = { NOT_STARTED: 'default', DEPRECIATING: 'blue', FULLY_DEPRECIATED: 'green', ARCHIVED: 'orange' };
  const columns: ColumnsType<FixedAssetTableRow> = [
    { title: t('fixedAssets.column.asset'), fixed: 'left', width: 220, render: (_, row) => <div><Typography.Text strong>{row.asset.asset_code} — {row.asset.name}</Typography.Text><div className="text-xs text-gray-500">{row.asset.location ?? '-'}</div></div> },
    { title: t('fixedAssets.column.category'), width: 150, render: (_, row) => <Tag>{t(`fixedAssets.category.${row.asset.category}`)}</Tag> },
    { title: t('fixedAssets.column.available'), dataIndex: ['asset', 'available_for_use_date'], width: 130 },
    { title: t('fixedAssets.column.cost'), width: 150, align: 'right', render: (_, row) => currency(row.asset.acquisition_cost) },
    { title: t('fixedAssets.column.accumulated'), width: 150, align: 'right', render: (_, row) => currency(row.position.accumulatedDepreciation) },
    { title: t('fixedAssets.column.bookValue'), width: 150, align: 'right', render: (_, row) => <Typography.Text strong>{currency(row.position.bookValue)}</Typography.Text> },
    { title: t('fixedAssets.column.regular'), width: 145, align: 'right', render: (_, row) => currency(row.asset.regular_depreciation_amount) },
    { title: t('fixedAssets.column.status'), width: 140, render: (_, row) => <Tag color={statusColor[row.position.derivedStatus]}>{t(`fixedAssets.status.${row.position.derivedStatus}`)}</Tag> },
    { title: t('fixedAssets.column.action'), fixed: 'right', width: 165, render: (_, row) => <Space size={2}>
      <Button type="text" title={t('fixedAssets.action.detail')} icon={<Eye size={15} />} onClick={() => onDetail(row.asset)} />
      <Button type="text" title={t('fixedAssets.action.edit')} icon={<Pencil size={15} />} onClick={() => onEdit(row.asset)} />
      {row.asset.is_active
        ? <Button danger type="text" title={t('fixedAssets.action.archive')} icon={<Archive size={15} />} onClick={() => onArchive(row.asset)} />
        : <Button type="text" title={t('fixedAssets.action.restore')} icon={<RotateCcw size={15} />} onClick={() => onRestore(row.asset)} />}
    </Space> },
  ];
  return <Table rowKey={(row) => row.asset.id} columns={columns} dataSource={rows} pagination={{ pageSize: 10, showSizeChanger: true }} scroll={{ x: 1400 }} locale={{ emptyText: <Empty description={t('fixedAssets.empty.assets')} /> }} />;
}
