import { Button, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Archive, Edit2, RotateCcw } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { Warehouse } from '@/types';

const { Text } = Typography;

interface WarehouseTableProps {
  warehouses: Warehouse[];
  onEdit: (warehouse: Warehouse) => void;
  onArchive: (warehouse: Warehouse) => void;
  onRestore: (warehouse: Warehouse) => void;
}

export default function WarehouseTable({ warehouses, onEdit, onArchive, onRestore }: WarehouseTableProps) {
  const { t } = useI18n();

  const columns: ColumnsType<Warehouse> = [
    {
      title: t('warehouses.table.name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, warehouse) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{name}</Text>
          {warehouse.code && <Text type="secondary">{warehouse.code}</Text>}
        </Space>
      ),
    },
    {
      title: t('warehouses.table.address'),
      dataIndex: 'address',
      key: 'address',
      render: (address?: string) => address || '-',
    },
    {
      title: t('warehouses.table.phone'),
      dataIndex: 'phone',
      key: 'phone',
      render: (phone?: string) => phone || '-',
    },
    {
      title: t('warehouses.table.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'green' : 'default'}>
          {isActive ? t('warehouses.status.active') : t('warehouses.status.inactive')}
        </Tag>
      ),
    },
    {
      title: t('warehouses.table.action'),
      key: 'action',
      render: (_value: unknown, warehouse) => (
        <Space wrap>
          <Button type="text" icon={<Edit2 size={16} />} onClick={() => onEdit(warehouse)}>
            {t('warehouses.edit')}
          </Button>
          {warehouse.is_active ? (
            <Button danger type="text" icon={<Archive size={16} />} onClick={() => onArchive(warehouse)}>
              {t('warehouses.archive')}
            </Button>
          ) : (
            <Button type="text" icon={<RotateCcw size={16} />} onClick={() => onRestore(warehouse)}>
              {t('warehouses.restore')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Table
      dataSource={warehouses}
      columns={columns}
      rowKey="id"
      pagination={{ pageSize: 8 }}
      scroll={{ x: true }}
      locale={{ emptyText: t('warehouses.empty') }}
    />
  );
}
