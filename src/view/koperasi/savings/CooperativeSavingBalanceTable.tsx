import { Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeMemberSavingBalance, CooperativeSavingType } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { cooperativeSavingTypeOptions } from './savingOptions';

const { Text } = Typography;

interface CooperativeSavingBalanceTableProps {
  balances: CooperativeMemberSavingBalance[];
}

export default function CooperativeSavingBalanceTable({
  balances,
}: CooperativeSavingBalanceTableProps) {
  const { t } = useI18n();
  const savingTypeLabels = cooperativeSavingTypeOptions.reduce<Record<CooperativeSavingType, string>>((acc, option) => {
    acc[option.value] = t(option.labelKey);
    return acc;
  }, {} as Record<CooperativeSavingType, string>);

  const columns: ColumnsType<CooperativeMemberSavingBalance> = [
    {
      title: t('cooperative.savings.table.member'),
      dataIndex: 'member_name',
      key: 'member_name',
      render: (name: string, balance) => (
        <div>
          <Text strong>{name}</Text>
          <div className="text-xs text-gray-500">{balance.member_number}</div>
        </div>
      ),
    },
    {
      title: t('cooperative.savings.table.savingType'),
      dataIndex: 'saving_type',
      key: 'saving_type',
      width: 140,
      render: (savingType: CooperativeSavingType) => {
        const option = cooperativeSavingTypeOptions.find((item) => item.value === savingType);
        return <Tag color={option?.color}>{savingTypeLabels[savingType]}</Tag>;
      },
    },
    {
      title: t('cooperative.savings.balance'),
      dataIndex: 'balance',
      key: 'balance',
      align: 'right',
      width: 180,
      render: (value: number) => <span className="font-semibold">Rp {formatCurrency(value)}</span>,
    },
    {
      title: t('cooperative.savings.table.updatedAt'),
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 180,
      render: (value: string) => formatDate(value),
    },
  ];

  return (
    <Table
      dataSource={balances}
      columns={columns}
      rowKey="id"
      pagination={{ pageSize: 8 }}
      scroll={{ x: true }}
      locale={{ emptyText: t('cooperative.savings.balanceEmpty') }}
    />
  );
}
