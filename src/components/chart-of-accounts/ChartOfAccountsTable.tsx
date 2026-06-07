import { Button, Space, Table, Tag, Tooltip, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Archive, Edit2, RotateCcw } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { TranslationKey } from '@/i18n/messages';
import type { ChartOfAccount } from '@/types';
import type { ChartOfAccountTreeNode } from '@/utils/chartOfAccounts/buildAccountTree';

const { Text } = Typography;

interface ChartOfAccountsTableProps {
  accounts: ChartOfAccountTreeNode[];
  onEdit: (account: ChartOfAccount) => void;
  onArchive: (account: ChartOfAccount) => void;
  onRestore: (account: ChartOfAccount) => void;
}

export default function ChartOfAccountsTable({
  accounts,
  onEdit,
  onArchive,
  onRestore,
}: ChartOfAccountsTableProps) {
  const { t } = useI18n();

  const columns: ColumnsType<ChartOfAccountTreeNode> = [
    {
      title: t('coa.table.code'),
      dataIndex: 'code',
      key: 'code',
      width: 140,
      render: (code: string, account) => (
        <Space size={6}>
          <Text style={{ paddingLeft: account.level * 16 }} strong>
            {code}
          </Text>
          {account.is_system && <Tag color="blue">{t('coa.badge.system')}</Tag>}
        </Space>
      ),
    },
    {
      title: t('coa.table.name'),
      dataIndex: 'name',
      key: 'name',
      render: (name: string, account) => (
        <Space direction="vertical" size={0}>
          <Text>{name}</Text>
          {account.description && <Text type="secondary">{account.description}</Text>}
        </Space>
      ),
    },
    {
      title: t('coa.table.type'),
      dataIndex: 'type',
      key: 'type',
      width: 160,
      render: (type: ChartOfAccount['type']) => <Tag>{t(`coa.accountType.${type}` as TranslationKey)}</Tag>,
    },
    {
      title: t('coa.table.normalBalance'),
      dataIndex: 'normal_balance',
      key: 'normal_balance',
      width: 150,
      render: (normalBalance: ChartOfAccount['normal_balance']) => t(`coa.normalBalance.${normalBalance}` as TranslationKey),
    },
    {
      title: t('coa.table.parent'),
      dataIndex: 'parent_name',
      key: 'parent_name',
      width: 180,
      render: (_value: string | undefined, account) => account.parent_code ? `${account.parent_code} - ${account.parent_name}` : '-',
    },
    {
      title: t('coa.table.status'),
      dataIndex: 'is_active',
      key: 'is_active',
      width: 190,
      render: (_isActive: boolean, account) => (
        <Space wrap size={4}>
          <Tag color={account.is_active ? 'green' : 'default'}>
            {account.is_active ? t('coa.status.active') : t('coa.status.inactive')}
          </Tag>
          {!account.is_postable && <Tag color="gold">{t('coa.badge.header')}</Tag>}
        </Space>
      ),
    },
    {
      title: t('coa.table.action'),
      key: 'action',
      width: 130,
      render: (_value: unknown, account) => (
        <Space>
          <Tooltip title={t('coa.edit')}>
            <Button type="text" aria-label={t('coa.edit')} icon={<Edit2 size={16} />} onClick={() => onEdit(account)} />
          </Tooltip>
          {account.is_active ? (
            <Tooltip title={t('coa.archive')}>
              <Button danger type="text" aria-label={t('coa.archive')} icon={<Archive size={16} />} onClick={() => onArchive(account)} />
            </Tooltip>
          ) : (
            <Tooltip title={t('coa.restore')}>
              <Button type="text" aria-label={t('coa.restore')} icon={<RotateCcw size={16} />} onClick={() => onRestore(account)} />
            </Tooltip>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Table
      dataSource={accounts}
      columns={columns}
      rowKey="id"
      pagination={{ pageSize: 10 }}
      scroll={{ x: 980 }}
      locale={{ emptyText: t('coa.empty') }}
    />
  );
}

