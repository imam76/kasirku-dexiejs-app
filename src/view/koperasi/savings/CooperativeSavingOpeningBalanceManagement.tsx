import { useMemo, useState } from 'react';
import { App, Button, Card, Form, Input, Select, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { DatabaseBackup, Eye, Plus, RotateCcw } from 'lucide-react';
import { useAuth } from '@/auth/useAuth';
import { useCooperativeSavings } from '@/hooks/useCooperativeSavings';
import { useI18n } from '@/hooks/useI18n';
import dayjs from '@/lib/dayjs';
import type {
  CooperativeSavingTransaction,
  CooperativeSavingTransactionStatus,
  CooperativeSavingType,
} from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import CooperativeSavingDetailDrawer from './CooperativeSavingDetailDrawer';
import CooperativeSavingOpeningBalanceModal, {
  type CooperativeSavingOpeningBalanceFormValues,
} from './CooperativeSavingOpeningBalanceModal';
import {
  cooperativeSavingStatusOptions,
  cooperativeSavingTypeOptions,
} from './savingOptions';

const { Text } = Typography;

type SavingTypeFilter = CooperativeSavingType | 'ALL';
type StatusFilter = CooperativeSavingTransactionStatus | 'ALL';

export default function CooperativeSavingOpeningBalanceManagement() {
  const { message, modal } = App.useApp();
  const { can } = useAuth();
  const { t } = useI18n();
  const [form] = Form.useForm<CooperativeSavingOpeningBalanceFormValues>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedTransaction, setSelectedTransaction] = useState<CooperativeSavingTransaction | null>(null);
  const [searchText, setSearchText] = useState('');
  const [savingTypeFilter, setSavingTypeFilter] = useState<SavingTypeFilter>('ALL');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const canManage = can('COOPERATIVE_SAVING_MANAGE');
  const {
    activeMembers,
    transactions,
    openingBalanceSuggestionByMemberId,
    openingBalanceCutoffDate,
    recordOpeningBalance,
    reverseSaving,
    isMutating,
  } = useCooperativeSavings();

  const savingTypeLabels = useMemo(
    () => cooperativeSavingTypeOptions.reduce<Record<CooperativeSavingType, string>>((acc, option) => {
      acc[option.value] = t(option.labelKey);
      return acc;
    }, {} as Record<CooperativeSavingType, string>),
    [t],
  );
  const statusLabels = useMemo(
    () => cooperativeSavingStatusOptions.reduce<Record<CooperativeSavingTransactionStatus, string>>((acc, option) => {
      acc[option.value] = t(option.labelKey);
      return acc;
    }, {} as Record<CooperativeSavingTransactionStatus, string>),
    [t],
  );
  const openingBalances = useMemo(() => {
    const query = searchText.trim().toLowerCase();
    return transactions
      .filter((transaction) => transaction.transaction_type === 'OPENING_BALANCE')
      .filter((transaction) => (
        savingTypeFilter === 'ALL' || transaction.saving_type === savingTypeFilter
      ))
      .filter((transaction) => statusFilter === 'ALL' || transaction.status === statusFilter)
      .filter((transaction) => (
        !query ||
        transaction.member_number.toLowerCase().includes(query) ||
        transaction.member_name.toLowerCase().includes(query) ||
        transaction.notes?.toLowerCase().includes(query)
      ));
  }, [savingTypeFilter, searchText, statusFilter, transactions]);

  const closeModal = () => {
    setIsModalOpen(false);
    form.resetFields();
  };

  const openModal = () => {
    form.resetFields();
    form.setFieldsValue({
      saving_type: 'WAJIB',
      amount: 0,
      opening_interest_amount: 0,
      transaction_date: openingBalanceCutoffDate ? dayjs(openingBalanceCutoffDate) : dayjs(),
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (values: CooperativeSavingOpeningBalanceFormValues) => {
    try {
      await recordOpeningBalance({
        member_id: values.member_id,
        saving_type: values.saving_type,
        amount: Number(values.amount || 0),
        opening_interest_amount: Number(values.opening_interest_amount || 0),
        transaction_date: values.transaction_date.toISOString(),
        notes: values.notes,
      });
      message.success(t('cooperative.savings.openingBalance.success'));
      closeModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('cooperative.savings.openingBalance.failed'));
    }
  };

  const handleReverse = (transaction: CooperativeSavingTransaction) => {
    let reversalReason = '';
    modal.confirm({
      title: t('cooperative.savings.openingBalance.reverseConfirmTitle'),
      content: (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            {t('cooperative.savings.openingBalance.reverseConfirmContent', {
              member: transaction.member_name,
            })}
          </p>
          <Input.TextArea
            rows={3}
            placeholder={t('cooperative.savings.reverseReasonPlaceholder')}
            onChange={(event) => {
              reversalReason = event.target.value;
            }}
          />
        </div>
      ),
      okText: t('cooperative.savings.reverse'),
      okButtonProps: { danger: true, loading: isMutating },
      cancelText: t('common.cancel'),
      onOk: async () => {
        const reason = reversalReason.trim();
        if (!reason) {
          throw new Error(t('cooperative.savings.reverseReasonRequired'));
        }
        try {
          await reverseSaving({ transaction_id: transaction.id, reason });
          message.success(t('cooperative.savings.openingBalance.reverseSuccess'));
        } catch (error) {
          message.error(
            error instanceof Error
              ? error.message
              : t('cooperative.savings.openingBalance.reverseFailed'),
          );
          throw error;
        }
      },
    });
  };

  const columns: ColumnsType<CooperativeSavingTransaction> = [
    {
      title: t('cooperative.savings.openingBalance.date'),
      dataIndex: 'transaction_date',
      key: 'transaction_date',
      width: 170,
      render: (value: string) => formatDate(value),
    },
    {
      title: t('cooperative.savings.table.member'),
      key: 'member',
      render: (_value, transaction) => (
        <div>
          <Text strong>{transaction.member_name}</Text>
          <div className="text-xs text-gray-500">{transaction.member_number}</div>
        </div>
      ),
    },
    {
      title: t('cooperative.savings.table.savingType'),
      dataIndex: 'saving_type',
      key: 'saving_type',
      width: 130,
      render: (savingType: CooperativeSavingType) => {
        const option = cooperativeSavingTypeOptions.find((item) => item.value === savingType);
        return <Tag color={option?.color}>{savingTypeLabels[savingType]}</Tag>;
      },
    },
    {
      title: t('cooperative.savings.openingBalance.currentSaving'),
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      width: 170,
      render: (value: number) => `Rp ${formatCurrency(value)}`,
    },
    {
      title: t('cooperative.savings.openingBalance.interestAmount'),
      dataIndex: 'opening_interest_amount',
      key: 'opening_interest_amount',
      align: 'right',
      width: 170,
      render: (value?: number) => `Rp ${formatCurrency(Number(value || 0))}`,
    },
    {
      title: t('cooperative.savings.openingBalance.totalEntitlement'),
      key: 'total',
      align: 'right',
      width: 170,
      render: (_value, transaction) => (
        <Text strong>
          Rp {formatCurrency(
            Number(transaction.amount || 0) + Number(transaction.opening_interest_amount || 0),
          )}
        </Text>
      ),
    },
    {
      title: t('cooperative.savings.table.status'),
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: CooperativeSavingTransactionStatus) => (
        <Tag color={status === 'POSTED' ? 'green' : 'red'}>{statusLabels[status]}</Tag>
      ),
    },
    {
      title: t('cooperative.savings.table.action'),
      key: 'action',
      fixed: 'right',
      width: 190,
      render: (_value, transaction) => (
        <Space size={0}>
          <Button type="text" icon={<Eye size={16} />} onClick={() => setSelectedTransaction(transaction)}>
            {t('cooperative.savings.view')}
          </Button>
          {canManage && (
            <Button
              type="text"
              danger
              icon={<RotateCcw size={16} />}
              disabled={transaction.status !== 'POSTED'}
              data-testid={`koperasi-saving-opening-reverse-${transaction.id}`}
              onClick={() => handleReverse(transaction)}
            >
              {t('cooperative.savings.reverse')}
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <Card
      className="shadow-md"
      title={(
        <div className="flex items-center gap-2">
          <DatabaseBackup className="h-5 w-5" />
          {t('cooperative.savings.openingBalance.managementTitle')}
        </div>
      )}
      extra={canManage && (
        <Button
          type="primary"
          icon={<Plus size={16} />}
          data-testid="koperasi-saving-opening-add-button"
          onClick={openModal}
        >
          {t('cooperative.savings.openingBalance.add')}
        </Button>
      )}
    >
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1fr)_180px_160px]">
        <Input.Search
          allowClear
          value={searchText}
          placeholder={t('cooperative.savings.openingBalance.searchPlaceholder')}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <Select<SavingTypeFilter>
          value={savingTypeFilter}
          onChange={setSavingTypeFilter}
          options={[
            { value: 'ALL', label: t('cooperative.savings.filter.allSavingTypes') },
            ...cooperativeSavingTypeOptions.map((option) => ({
              value: option.value,
              label: t(option.labelKey),
            })),
          ]}
        />
        <Select<StatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'ALL', label: t('cooperative.savings.filter.allStatuses') },
            ...cooperativeSavingStatusOptions.map((option) => ({
              value: option.value,
              label: t(option.labelKey),
            })),
          ]}
        />
      </div>

      <Table<CooperativeSavingTransaction>
        rowKey="id"
        columns={columns}
        dataSource={openingBalances}
        loading={isMutating}
        pagination={{ pageSize: 10 }}
        scroll={{ x: 1300 }}
        locale={{ emptyText: t('cooperative.savings.openingBalance.empty') }}
        onRow={(transaction) => ({
          'data-testid': `koperasi-saving-opening-row-${transaction.member_number}-${transaction.saving_type}`,
        } as React.HTMLAttributes<HTMLElement>)}
      />

      <CooperativeSavingOpeningBalanceModal
        form={form}
        open={isModalOpen}
        isSubmitting={isMutating}
        activeMembers={activeMembers}
        suggestionByMemberId={openingBalanceSuggestionByMemberId}
        onCancel={closeModal}
        onSubmit={handleSubmit}
      />
      <CooperativeSavingDetailDrawer
        transaction={selectedTransaction}
        open={Boolean(selectedTransaction)}
        onClose={() => setSelectedTransaction(null)}
      />
    </Card>
  );
}
