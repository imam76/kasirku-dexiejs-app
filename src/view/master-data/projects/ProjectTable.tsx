import { Button, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Archive, Edit2, RotateCcw } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { Project, ProjectStatus } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { getProjectPeriodLabel } from './projectFormatters';
import { projectStatusOptions } from './projectOptions';

const { Text } = Typography;

interface ProjectTableProps {
  projects: Project[];
  onEdit: (project: Project) => void;
  onArchive: (project: Project) => void;
  onRestore: (project: Project) => void;
}

export default function ProjectTable({ projects, onEdit, onArchive, onRestore }: ProjectTableProps) {
  const { t } = useI18n();
  const statusLabelMap = projectStatusOptions.reduce<Record<ProjectStatus, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey);
    return acc;
  }, {} as Record<ProjectStatus, string>);

  const columns: ColumnsType<Project> = [
    {
      title: t('projects.table.name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, project) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{name}</Text>
          {project.code && <Text type="secondary">{project.code}</Text>}
        </Space>
      ),
    },
    {
      title: t('projects.table.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: ProjectStatus) => {
        const option = projectStatusOptions.find((item) => item.value === status);
        return <Tag color={option?.color}>{statusLabelMap[status]}</Tag>;
      },
    },
    {
      title: t('projects.table.contact'),
      dataIndex: 'contact_name',
      key: 'contact_name',
      render: (contactName?: string) => contactName || '-',
    },
    {
      title: t('projects.table.department'),
      key: 'department',
      render: (_value: unknown, project) => project.department_name
        ? `${project.department_name}${project.department_code ? ` (${project.department_code})` : ''}`
        : '-',
    },
    {
      title: t('projects.table.period'),
      key: 'period',
      render: (_value: unknown, project) => getProjectPeriodLabel(project),
    },
    {
      title: t('projects.table.budget'),
      dataIndex: 'budget_amount',
      key: 'budget_amount',
      align: 'right',
      render: (budget?: number) => budget === undefined ? '-' : `Rp ${formatCurrency(budget)}`,
    },
    {
      title: t('projects.table.activeStatus'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'green' : 'default'}>
          {isActive ? t('projects.activeStatus.active') : t('projects.activeStatus.inactive')}
        </Tag>
      ),
    },
    {
      title: t('projects.table.action'),
      key: 'action',
      render: (_value: unknown, project) => (
        <Space wrap>
          <Button type="text" icon={<Edit2 size={16} />} onClick={() => onEdit(project)}>
            {t('projects.edit')}
          </Button>
          {project.is_active ? (
            <Button danger type="text" icon={<Archive size={16} />} onClick={() => onArchive(project)}>
              {t('projects.archive')}
            </Button>
          ) : (
            <Button type="text" icon={<RotateCcw size={16} />} onClick={() => onRestore(project)}>
              {t('projects.restore')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Table
      dataSource={projects}
      columns={columns}
      rowKey="id"
      pagination={{ pageSize: 8 }}
      scroll={{ x: true }}
      locale={{ emptyText: t('projects.empty') }}
    />
  );
}
