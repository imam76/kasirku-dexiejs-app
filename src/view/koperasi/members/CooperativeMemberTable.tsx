import { Button, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Archive, Edit2, Eye, RotateCcw } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeMember, CooperativeMemberStatus } from '@/types';
import { formatDateOnly } from '@/utils/formatters';
import { cooperativeMemberStatusOptions } from './memberOptions';

const { Text } = Typography;

interface CooperativeMemberTableProps {
  members: CooperativeMember[];
  onView: (member: CooperativeMember) => void;
  onEdit: (member: CooperativeMember) => void;
  onArchive: (member: CooperativeMember) => void;
  onRestore: (member: CooperativeMember) => void;
}

export default function CooperativeMemberTable({
  members,
  onView,
  onEdit,
  onArchive,
  onRestore,
}: CooperativeMemberTableProps) {
  const { t } = useI18n();
  const statusLabelMap = cooperativeMemberStatusOptions.reduce<Record<CooperativeMemberStatus, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey);
    return acc;
  }, {} as Record<CooperativeMemberStatus, string>);

  const columns: ColumnsType<CooperativeMember> = [
    {
      title: t('cooperative.members.table.member'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, member) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{name}</Text>
          <Text type="secondary">{member.member_number || '-'}</Text>
        </Space>
      ),
    },
    {
      title: t('cooperative.members.table.area'),
      key: 'area',
      render: (_value: unknown, member) => (
        member.area_name
          ? <Tag color="blue">{member.area_code ? `${member.area_code} - ${member.area_name}` : member.area_name}</Tag>
          : '-'
      ),
    },
    {
      title: t('cooperative.members.table.officer'),
      key: 'officer',
      render: (_value: unknown, member) => (
        member.officer_name
          ? (
            <Space orientation="vertical" size={0}>
              <Text>{member.officer_name}</Text>
              <Text type="secondary">{member.officer_position || '-'}</Text>
            </Space>
          )
          : '-'
      ),
    },
    {
      title: t('cooperative.members.table.identityNumber'),
      dataIndex: 'identity_number',
      key: 'identity_number',
      render: (identityNumber?: string) => identityNumber || '-',
    },
    {
      title: t('cooperative.members.table.phone'),
      dataIndex: 'phone',
      key: 'phone',
      render: (phone?: string) => phone || '-',
    },
    {
      title: t('cooperative.members.table.joinDate'),
      dataIndex: 'join_date',
      key: 'join_date',
      render: (joinDate: string) => formatDateOnly(joinDate),
    },
    {
      title: t('cooperative.members.table.status'),
      dataIndex: 'status',
      key: 'status',
      render: (status: CooperativeMemberStatus) => {
        const option = cooperativeMemberStatusOptions.find((item) => item.value === status);
        return <Tag color={option?.color}>{statusLabelMap[status]}</Tag>;
      },
    },
    {
      title: t('cooperative.members.table.action'),
      key: 'action',
      render: (_value: unknown, member) => {
        const memberTestKey = member.member_number || member.id;

        return (
          <Space wrap>
            <Button type="text" icon={<Eye size={16} />} onClick={() => onView(member)}>
              {t('cooperative.members.view')}
            </Button>
            <Button
              type="text"
              icon={<Edit2 size={16} />}
              data-testid={`koperasi-member-edit-${memberTestKey}`}
              onClick={() => onEdit(member)}
            >
              {t('cooperative.members.edit')}
            </Button>
            {member.status === 'ACTIVE' ? (
              <Button
                danger
                type="text"
                icon={<Archive size={16} />}
                data-testid={`koperasi-member-archive-${memberTestKey}`}
                onClick={() => onArchive(member)}
              >
                {t('cooperative.members.archive')}
              </Button>
            ) : (
              <Button
                type="text"
                icon={<RotateCcw size={16} />}
                data-testid={`koperasi-member-restore-${memberTestKey}`}
                onClick={() => onRestore(member)}
              >
                {t('cooperative.members.restore')}
              </Button>
            )}
          </Space>
        );
      },
    },
  ];

  return (
    <Table
      dataSource={members}
      columns={columns}
      rowKey="id"
      onRow={(member) => ({
        'data-testid': `koperasi-member-row-${member.member_number || member.id}`,
      } as unknown as HTMLAttributes<HTMLElement>)}
      pagination={{ pageSize: 8 }}
      scroll={{ x: true }}
      locale={{ emptyText: t('cooperative.members.empty') }}
    />
  );
}
