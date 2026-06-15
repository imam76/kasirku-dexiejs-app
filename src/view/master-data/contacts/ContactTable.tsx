import { Button, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Archive, Edit2, RotateCcw } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { Contact, ContactType } from '@/types';
import { contactTypeOptions } from './contactOptions';
import { formatCurrency } from '@/utils/formatters';

const { Text } = Typography;

interface ContactTableProps {
  contacts: Contact[];
  onEdit: (contact: Contact) => void;
  onArchive: (contact: Contact) => void;
  onRestore: (contact: Contact) => void;
}

export default function ContactTable({ contacts, onEdit, onArchive, onRestore }: ContactTableProps) {
  const { t } = useI18n();
  const typeLabelMap = contactTypeOptions.reduce<Record<ContactType, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey);
    return acc;
  }, {} as Record<ContactType, string>);

  const columns: ColumnsType<Contact> = [
    {
      title: t('contacts.table.name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, contact) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{name}</Text>
          {contact.is_member && (
            <div className="flex flex-wrap items-center gap-1">
              <Tag color={contact.membership_status === 'INACTIVE' ? 'default' : 'blue'} className="m-0">
                {contact.membership_number ?? 'Member'}
              </Tag>
              <Text type="secondary">{formatCurrency(contact.membership_points_balance ?? 0)} poin</Text>
            </div>
          )}
          {contact.company_name && <Text type="secondary">{contact.company_name}</Text>}
        </Space>
      ),
    },
    {
      title: t('contacts.table.type'),
      dataIndex: 'contact_type',
      key: 'contact_type',
      render: (contactType: ContactType) => {
        const option = contactTypeOptions.find((item) => item.value === contactType);
        return <Tag color={option?.color}>{typeLabelMap[contactType]}</Tag>;
      },
    },
    {
      title: t('contacts.table.phone'),
      dataIndex: 'phone',
      key: 'phone',
      render: (phone?: string) => phone || '-',
    },
    {
      title: t('contacts.table.email'),
      dataIndex: 'email',
      key: 'email',
      render: (email?: string) => email || '-',
    },
    {
      title: t('contacts.table.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      render: (isActive: boolean) => (
        <Tag color={isActive ? 'green' : 'default'}>
          {isActive ? t('contacts.status.active') : t('contacts.status.inactive')}
        </Tag>
      ),
    },
    {
      title: t('contacts.table.action'),
      key: 'action',
      render: (_value: unknown, contact) => (
        <Space wrap>
          <Button type="text" icon={<Edit2 size={16} />} onClick={() => onEdit(contact)}>
            {t('contacts.edit')}
          </Button>
          {contact.is_active ? (
            <Button danger type="text" icon={<Archive size={16} />} onClick={() => onArchive(contact)}>
              {t('contacts.archive')}
            </Button>
          ) : (
            <Button type="text" icon={<RotateCcw size={16} />} onClick={() => onRestore(contact)}>
              {t('contacts.restore')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Table
      dataSource={contacts}
      columns={columns}
      rowKey="id"
      pagination={{ pageSize: 8 }}
      scroll={{ x: true }}
      locale={{ emptyText: t('contacts.empty') }}
    />
  );
}
