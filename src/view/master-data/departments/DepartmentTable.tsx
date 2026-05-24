import { Button, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Archive, Edit2, RotateCcw } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { Department } from '@/types';

const { Text } = Typography;

interface DepartmentTableProps {
  departments: Department[];
  onEdit: (department: Department) => void;
  onArchive: (department: Department) => void;
  onRestore: (department: Department) => void;
}

export default function DepartmentTable({ departments, onEdit, onArchive, onRestore }: DepartmentTableProps) {
  const { t } = useI18n();
  const columns: ColumnsType<Department> = [
    {
      title: t('departments.table.name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, department) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          {department.code && <Text type="secondary">{department.code}</Text>}
        </Space>
      ),
    },
    {
      title: t('departments.table.code'),
      dataIndex: 'code',
      key: 'code',
      render: (code?: string) => code ? <Tag color="blue">{code}</Tag> : '-',
    },
    {
      title: t('departments.table.description'),
      dataIndex: 'description',
      key: 'description',
      render: (description?: string) => description || '-',
    },
    {
      title: t('departments.table.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'green' : 'default'}>
          {isActive ? t('departments.status.active') : t('departments.status.inactive')}
        </Tag>
      ),
    },
    {
      title: t('departments.table.action'),
      key: 'action',
      render: (_value: unknown, department) => (
        <Space wrap>
          <Button type="text" icon={<Edit2 size={16} />} onClick={() => onEdit(department)}>
            {t('departments.edit')}
          </Button>
          {department.is_active ? (
            <Button danger type="text" icon={<Archive size={16} />} onClick={() => onArchive(department)}>
              {t('departments.archive')}
            </Button>
          ) : (
            <Button type="text" icon={<RotateCcw size={16} />} onClick={() => onRestore(department)}>
              {t('departments.restore')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Table
      dataSource={departments}
      columns={columns}
      rowKey="id"
      pagination={{ pageSize: 8 }}
      scroll={{ x: true }}
      locale={{ emptyText: t('departments.empty') }}
    />
  );
}
