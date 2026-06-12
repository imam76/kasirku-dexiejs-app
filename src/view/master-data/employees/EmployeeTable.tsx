import { Button, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Archive, Edit2, RotateCcw } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { EmployeeWithAreas } from '@/hooks/useEmployees';

const { Text } = Typography;

interface EmployeeTableProps {
  employees: EmployeeWithAreas[];
  onEdit: (employee: EmployeeWithAreas) => void;
  onArchive: (employee: EmployeeWithAreas) => void;
  onRestore: (employee: EmployeeWithAreas) => void;
}

export default function EmployeeTable({
  employees,
  onEdit,
  onArchive,
  onRestore,
}: EmployeeTableProps) {
  const { t } = useI18n();

  const columns: ColumnsType<EmployeeWithAreas> = [
    {
      title: t('employees.table.employee'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, employee) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{name}</Text>
          <Text type="secondary">{employee.position || '-'}</Text>
        </Space>
      ),
    },
    {
      title: t('employees.table.contact'),
      key: 'contact',
      render: (_value: unknown, employee) => (
        <Space orientation="vertical" size={0}>
          <Text>{employee.phone || '-'}</Text>
          <Text type="secondary">{employee.email || '-'}</Text>
        </Space>
      ),
    },
    {
      title: t('employees.table.user'),
      dataIndex: 'user_name',
      key: 'user_name',
      render: (userName?: string) => userName || '-',
    },
    {
      title: 'Kas Petugas',
      key: 'field_cash_account',
      render: (_value: unknown, employee) => employee.field_cash_account_id ? (
        <Space orientation="vertical" size={0}>
          <Text>{employee.field_cash_account_name}</Text>
          <Text type="secondary">{employee.field_cash_account_code}</Text>
        </Space>
      ) : '-',
    },
    {
      title: t('employees.table.areas'),
      key: 'areas',
      render: (_value: unknown, employee) => (
        <Space wrap size={[4, 4]}>
          {employee.area_assignments.length > 0
            ? employee.area_assignments.map((assignment) => (
              <Tag key={assignment.id} color="blue">
                {assignment.area_code ? `${assignment.area_code} - ${assignment.area_name}` : assignment.area_name}
              </Tag>
            ))
            : '-'}
        </Space>
      ),
    },
    {
      title: t('employees.table.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'green' : 'default'}>
          {isActive ? t('employees.status.active') : t('employees.status.inactive')}
        </Tag>
      ),
    },
    {
      title: t('employees.table.action'),
      key: 'action',
      render: (_value: unknown, employee) => (
        <Space wrap>
          <Button type="text" icon={<Edit2 size={16} />} onClick={() => onEdit(employee)}>
            {t('employees.edit')}
          </Button>
          {employee.is_active ? (
            <Button danger type="text" icon={<Archive size={16} />} onClick={() => onArchive(employee)}>
              {t('employees.archive')}
            </Button>
          ) : (
            <Button type="text" icon={<RotateCcw size={16} />} onClick={() => onRestore(employee)}>
              {t('employees.restore')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Table
      dataSource={employees}
      columns={columns}
      rowKey="id"
      pagination={{ pageSize: 8 }}
      scroll={{ x: true }}
      locale={{ emptyText: t('employees.empty') }}
    />
  );
}
