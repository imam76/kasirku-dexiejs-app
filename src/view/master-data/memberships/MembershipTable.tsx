import { Button, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Edit2, History, PowerOff, RotateCcw } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { Contact, Membership } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { isMembershipActive } from '@/utils/membership';

const { Text } = Typography;

interface MembershipTableProps {
  memberships: Membership[];
  contactsById: Map<string, Contact>;
  loading?: boolean;
  onEdit: (membership: Membership) => void;
  onArchive: (membership: Membership) => void;
  onRestore: (membership: Membership) => void;
  onShowHistory: (membership: Membership) => void;
}

export default function MembershipTable({
  memberships,
  contactsById,
  loading = false,
  onEdit,
  onArchive,
  onRestore,
  onShowHistory,
}: MembershipTableProps) {
  const { t } = useI18n();

  const columns: ColumnsType<Membership> = [
    {
      title: t('members.table.member'),
      key: 'member',
      render: (_value, membership) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{membership.name ?? membership.phone}</Text>
          <Tag color="blue" className="m-0 w-fit">{membership.member_number}</Tag>
        </Space>
      ),
    },
    {
      title: t('members.table.phone'),
      dataIndex: 'phone',
      key: 'phone',
    },
    {
      title: t('members.table.email'),
      dataIndex: 'email',
      key: 'email',
      render: (email?: string) => email || '-',
    },
    {
      title: t('members.table.points'),
      dataIndex: 'points_balance',
      key: 'points_balance',
      align: 'right',
      render: (points: number) => (
        <Text type={(points ?? 0) < 0 ? 'danger' : undefined}>{formatCurrency(points ?? 0)}</Text>
      ),
    },
    {
      title: t('members.table.linkedContact'),
      dataIndex: 'contact_id',
      key: 'contact_id',
      render: (contactId?: string) => (contactId ? contactsById.get(contactId)?.name ?? '-' : '-'),
    },
    {
      title: t('members.table.status'),
      key: 'status',
      render: (_value: unknown, membership) => {
        const isActive = isMembershipActive(membership);
        return (
          <Tag color={isActive ? 'green' : 'default'}>
            {isActive ? t('members.status.active') : t('members.status.inactive')}
          </Tag>
        );
      },
    },
    {
      title: t('members.table.action'),
      key: 'action',
      render: (_value: unknown, membership) => (
        <Space wrap>
          <Button type="text" icon={<Edit2 size={16} />} onClick={() => onEdit(membership)}>
            {t('members.edit')}
          </Button>
          <Button type="text" icon={<History size={16} />} onClick={() => onShowHistory(membership)}>
            {t('members.history.open')}
          </Button>
          {isMembershipActive(membership) ? (
            <Button danger type="text" icon={<PowerOff size={16} />} onClick={() => onArchive(membership)}>
              {t('members.archive')}
            </Button>
          ) : (
            <Button type="text" icon={<RotateCcw size={16} />} onClick={() => onRestore(membership)}>
              {t('members.restore')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Table
      dataSource={memberships}
      columns={columns}
      loading={loading}
      rowKey="id"
      pagination={{ pageSize: 8 }}
      scroll={{ x: true }}
      locale={{ emptyText: t('members.empty') }}
    />
  );
}
