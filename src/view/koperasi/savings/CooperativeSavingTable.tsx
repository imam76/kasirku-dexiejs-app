import { Button, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Ban, Eye } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeSavingTransaction, CooperativeSavingTransactionStatus, CooperativeSavingTransactionType, CooperativeSavingType } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import {
  cooperativeSavingStatusOptions,
  cooperativeSavingTransactionTypeOptions,
  cooperativeSavingTypeOptions,
} from './savingOptions';

const { Text } = Typography;

interface CooperativeSavingTableProps {
  transactions: CooperativeSavingTransaction[];
  onView: (transaction: CooperativeSavingTransaction) => void;
  onReverse: (transaction: CooperativeSavingTransaction) => void;
  loading?: boolean;
}

export default function CooperativeSavingTable({
  transactions,
  onView,
  onReverse,
  loading,
}: CooperativeSavingTableProps) {
  const { t } = useI18n();
  const savingTypeLabels = cooperativeSavingTypeOptions.reduce<Record<CooperativeSavingType, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey);
    return acc;
  }, {} as Record<CooperativeSavingType, string>);
  const transactionTypeLabels = cooperativeSavingTransactionTypeOptions.reduce<Record<string, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey);
    return acc;
  }, {
    REVERSAL: t('cooperative.savings.transactionType.reversal'),
  });
  const statusLabels = cooperativeSavingStatusOptions.reduce<Record<CooperativeSavingTransactionStatus, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey);
    return acc;
  }, {} as Record<CooperativeSavingTransactionStatus, string>);

  const getTransactionTypeColor = (transactionType: CooperativeSavingTransactionType) => {
    if (transactionType === 'DEPOSIT') return 'green';
    if (transactionType === 'WITHDRAWAL') return 'red';
    return 'orange';
  };

  const columns: ColumnsType<CooperativeSavingTransaction> = [
    {
      title: t('cooperative.savings.table.date'),
      dataIndex: 'transaction_date',
      key: 'transaction_date',
      width: 160,
      render: (value: string) => formatDate(value),
    },
    {
      title: t('cooperative.savings.table.member'),
      dataIndex: 'member_name',
      key: 'member_name',
      render: (name: string, transaction) => (
        <Space orientation="vertical" size={0}>
          <Text strong>{name}</Text>
          <Text type="secondary">{transaction.member_number}</Text>
        </Space>
      ),
    },
    {
      title: t('cooperative.savings.table.savingType'),
      dataIndex: 'saving_type',
      key: 'saving_type',
      width: 120,
      render: (savingType: CooperativeSavingType) => {
        const option = cooperativeSavingTypeOptions.find((item) => item.value === savingType);
        return <Tag color={option?.color}>{savingTypeLabels[savingType]}</Tag>;
      },
    },
    {
      title: t('cooperative.savings.table.transactionType'),
      dataIndex: 'transaction_type',
      key: 'transaction_type',
      width: 130,
      render: (transactionType: CooperativeSavingTransactionType, transaction) => (
        <Space orientation="vertical" size={0}>
          <Tag color={getTransactionTypeColor(transactionType)}>
            {transactionTypeLabels[transactionType]}
          </Tag>
          {transactionType === 'WITHDRAWAL' && (
            <Text type="secondary" className="text-xs">
              {transaction.withdrawal_source === 'INTEREST'
                ? t('cooperative.savings.withdrawalSource.interestShort')
                : t('cooperative.savings.withdrawalSource.savingShort')}
            </Text>
          )}
        </Space>
      ),
    },
    {
      title: t('cooperative.savings.table.amount'),
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      width: 150,
      render: (amount: number, transaction) => (
        <span className={transaction.status === 'REVERSED' ? 'line-through text-gray-400' : 'font-semibold'}>
          Rp {formatCurrency(amount)}
        </span>
      ),
    },
    {
      title: t('finance.cashAccount'),
      dataIndex: 'cash_account_name',
      key: 'cash_account_name',
      width: 220,
      render: (_value: string | undefined, transaction) => (
        transaction.cash_account_code && transaction.cash_account_name
          ? `${transaction.cash_account_code} - ${transaction.cash_account_name}`
          : '-'
      ),
    },
    {
      title: t('cooperative.savings.table.status'),
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: CooperativeSavingTransactionStatus, transaction) => (
        <div>
          <Tag color={status === 'POSTED' ? 'green' : 'red'}>{statusLabels[status]}</Tag>
          {transaction.reversal_reason && (
            <div className="mt-1 text-xs text-gray-500">{transaction.reversal_reason}</div>
          )}
        </div>
      ),
    },
    {
      title: t('cooperative.savings.table.action'),
      key: 'action',
      fixed: 'right',
      width: 180,
      render: (_value: unknown, transaction) => (
        <Space wrap>
          <Button type="text" icon={<Eye size={16} />} onClick={() => onView(transaction)}>
            {t('cooperative.savings.view')}
          </Button>
          <Button
            danger
            type="text"
            icon={<Ban size={16} />}
            disabled={transaction.status !== 'POSTED' || transaction.transaction_type === 'REVERSAL'}
            data-testid={`koperasi-saving-reverse-${transaction.id}`}
            onClick={() => onReverse(transaction)}
          >
            {t('cooperative.savings.reverse')}
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Table
      dataSource={transactions}
      columns={columns}
      rowKey="id"
      loading={loading}
      onRow={(transaction) => ({
        'data-testid': `koperasi-saving-row-${transaction.id}`,
      } as unknown as HTMLAttributes<HTMLElement>)}
      pagination={{ pageSize: 8 }}
      scroll={{ x: 1200 }}
      locale={{ emptyText: t('cooperative.savings.empty') }}
    />
  );
}
