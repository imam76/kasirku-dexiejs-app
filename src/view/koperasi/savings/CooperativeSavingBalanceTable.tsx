import { Button, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowUpRight } from 'lucide-react';
import type { HTMLAttributes } from 'react';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeSavingPendingReturn } from '@/hooks/useCooperativeSavings';
import type { CooperativeMemberSavingBalance, CooperativeSavingType } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { cooperativeSavingTypeOptions } from './savingOptions';

const { Text } = Typography;

interface CooperativeSavingBalanceTableProps {
  balances: CooperativeMemberSavingBalance[];
  pendingReturnByBalanceKey: Map<string, CooperativeSavingPendingReturn>;
  onWithdraw?: (balance: CooperativeMemberSavingBalance) => void;
  loading?: boolean;
}

export default function CooperativeSavingBalanceTable({
  balances,
  pendingReturnByBalanceKey,
  onWithdraw,
  loading,
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
      render: (value: number, balance) => {
        const pendingReturn = pendingReturnByBalanceKey.get(balance.id);

        return (
          <div>
            <span className="font-semibold">Rp {formatCurrency(value)}</span>
            {pendingReturn && (
              <div className="text-xs text-amber-600">
                {t('cooperative.savings.pendingReturn')}: Rp {formatCurrency(pendingReturn.amount)}
              </div>
            )}
          </div>
        );
      },
    },
    {
      title: t('cooperative.savings.table.updatedAt'),
      dataIndex: 'updated_at',
      key: 'updated_at',
      width: 180,
      render: (value: string) => formatDate(value),
    },
    {
      title: t('cooperative.savings.table.action'),
      key: 'action',
      fixed: 'right',
      width: 140,
      render: (_value: unknown, balance) => (
        <Button
          type="text"
          icon={<ArrowUpRight size={16} />}
          disabled={Number(balance.balance || 0) <= 0}
          loading={loading}
          data-testid={`koperasi-saving-withdraw-${balance.member_number}-${balance.saving_type}`}
          onClick={() => onWithdraw?.(balance)}
        >
          {t('cooperative.savings.withdraw')}
        </Button>
      ),
    },
  ];

  return (
    <Table
      dataSource={balances}
      columns={columns}
      rowKey="id"
      onRow={(balance) => ({
        'data-testid': `koperasi-saving-balance-row-${balance.member_number}-${balance.saving_type}`,
      } as unknown as HTMLAttributes<HTMLElement>)}
      pagination={{ pageSize: 8 }}
      scroll={{ x: 820 }}
      locale={{ emptyText: t('cooperative.savings.balanceEmpty') }}
    />
  );
}
