import { Button, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Archive, Edit2, RotateCcw } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeArea } from '@/types';

interface AreaTableProps {
  areas: CooperativeArea[];
  onEdit: (area: CooperativeArea) => void;
  onArchive: (area: CooperativeArea) => void;
  onRestore: (area: CooperativeArea) => void;
}

export default function AreaTable({
  areas,
  onEdit,
  onArchive,
  onRestore,
}: AreaTableProps) {
  const { t } = useI18n();

  const columns: ColumnsType<CooperativeArea> = [
    {
      title: t('areas.table.name'),
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: t('areas.table.code'),
      dataIndex: 'code',
      key: 'code',
      render: (code?: string) => code || '-',
    },
    {
      title: t('areas.table.description'),
      dataIndex: 'description',
      key: 'description',
      render: (description?: string) => description || '-',
    },
    {
      title: t('areas.table.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'green' : 'default'}>
          {isActive ? t('areas.status.active') : t('areas.status.inactive')}
        </Tag>
      ),
    },
    {
      title: t('areas.table.action'),
      key: 'action',
      render: (_value: unknown, area) => (
        <Space wrap>
          <Button type="text" icon={<Edit2 size={16} />} onClick={() => onEdit(area)}>
            {t('areas.edit')}
          </Button>
          {area.is_active ? (
            <Button danger type="text" icon={<Archive size={16} />} onClick={() => onArchive(area)}>
              {t('areas.archive')}
            </Button>
          ) : (
            <Button type="text" icon={<RotateCcw size={16} />} onClick={() => onRestore(area)}>
              {t('areas.restore')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Table
      dataSource={areas}
      columns={columns}
      rowKey="id"
      pagination={{ pageSize: 8 }}
      scroll={{ x: true }}
      locale={{ emptyText: t('areas.empty') }}
    />
  );
}
