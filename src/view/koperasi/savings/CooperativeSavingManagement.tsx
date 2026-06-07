import { useState } from 'react';
import { App, Button, Card, Form, Input, Select, Tabs } from 'antd';
import { Plus, WalletCards } from 'lucide-react';
import dayjs from '@/lib/dayjs';
import {
  useCooperativeSavings,
  type CooperativeSavingStatusFilter,
  type CooperativeSavingTransactionTypeFilter,
  type CooperativeSavingTypeFilter,
} from '@/hooks/useCooperativeSavings';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeSavingTransaction } from '@/types';
import CooperativeSavingBalanceTable from './CooperativeSavingBalanceTable';
import CooperativeSavingDetailDrawer from './CooperativeSavingDetailDrawer';
import CooperativeSavingFormModal, { type CooperativeSavingFormValues } from './CooperativeSavingFormModal';
import CooperativeSavingTable from './CooperativeSavingTable';
import {
  cooperativeSavingStatusOptions,
  cooperativeSavingTransactionTypeOptions,
  cooperativeSavingTypeOptions,
} from './savingOptions';

export default function CooperativeSavingManagement() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const [form] = Form.useForm<CooperativeSavingFormValues>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const {
    activeMembers,
    filteredTransactions,
    filteredBalances,
    paymentAccounts,
    selectedTransaction,
    setSelectedTransaction,
    searchText,
    setSearchText,
    savingTypeFilter,
    setSavingTypeFilter,
    transactionTypeFilter,
    setTransactionTypeFilter,
    statusFilter,
    setStatusFilter,
    recordSaving,
    reverseSaving,
    isMutating,
  } = useCooperativeSavings();

  const closeModal = () => {
    setIsModalOpen(false);
    form.resetFields();
  };

  const openAddModal = () => {
    form.resetFields();
    form.setFieldsValue({
      transaction_type: 'DEPOSIT',
      saving_type: 'SUKARELA',
      transaction_date: dayjs(),
      payment_method: 'TUNAI',
    });
    setIsModalOpen(true);
  };

  const handleSubmit = async (values: CooperativeSavingFormValues) => {
    try {
      await recordSaving({
        member_id: values.member_id,
        saving_type: values.saving_type,
        transaction_type: values.transaction_type,
        amount: Number(values.amount || 0),
        transaction_date: values.transaction_date?.toISOString(),
        payment_method: values.payment_method,
        cash_account_id: values.cash_account_id,
        payment_channel: values.payment_channel,
        notes: values.notes,
      });
      message.success(t('cooperative.savings.recordSuccess'));
      closeModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('cooperative.savings.recordFailed'));
    }
  };

  const handleReverse = (transaction: CooperativeSavingTransaction) => {
    let reversalReason = '';

    modal.confirm({
      title: t('cooperative.savings.reverseConfirmTitle'),
      content: (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">
            {t('cooperative.savings.reverseConfirmContent', {
              member: transaction.member_name,
              amount: transaction.amount,
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
          await reverseSaving({
            transaction_id: transaction.id,
            reason,
          });
          message.success(t('cooperative.savings.reverseSuccess'));
        } catch (error) {
          message.error(error instanceof Error ? error.message : t('cooperative.savings.reverseFailed'));
          throw error;
        }
      },
    });
  };

  return (
    <Card
      className="shadow-md"
      title={(
        <div className="flex items-center gap-2">
          <WalletCards className="h-5 w-5" />
          {t('cooperative.savings.title')}
        </div>
      )}
      extra={(
        <Button
          type="primary"
          icon={<Plus size={16} />}
          data-testid="koperasi-saving-add-button"
          onClick={openAddModal}
        >
          {t('cooperative.savings.add')}
        </Button>
      )}
    >
      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-[minmax(240px,1fr)_160px_170px_150px]">
        <Input.Search
          allowClear
          value={searchText}
          placeholder={t('cooperative.savings.searchPlaceholder')}
          onChange={(event) => setSearchText(event.target.value)}
        />
        <Select<CooperativeSavingTypeFilter>
          value={savingTypeFilter}
          onChange={setSavingTypeFilter}
          options={[
            { value: 'ALL', label: t('cooperative.savings.filter.allSavingTypes') },
            ...cooperativeSavingTypeOptions.map((option) => ({ value: option.value, label: t(option.labelKey) })),
          ]}
        />
        <Select<CooperativeSavingTransactionTypeFilter>
          value={transactionTypeFilter}
          onChange={setTransactionTypeFilter}
          options={[
            { value: 'ALL', label: t('cooperative.savings.filter.allTransactionTypes') },
            ...cooperativeSavingTransactionTypeOptions.map((option) => ({ value: option.value, label: t(option.labelKey) })),
            { value: 'REVERSAL', label: t('cooperative.savings.transactionType.reversal') },
          ]}
        />
        <Select<CooperativeSavingStatusFilter>
          value={statusFilter}
          onChange={setStatusFilter}
          options={[
            { value: 'ALL', label: t('cooperative.savings.filter.allStatuses') },
            ...cooperativeSavingStatusOptions.map((option) => ({ value: option.value, label: t(option.labelKey) })),
          ]}
        />
      </div>

      <Tabs
        items={[
          {
            key: 'transactions',
            label: t('cooperative.savings.tab.transactions'),
            children: (
              <CooperativeSavingTable
                transactions={filteredTransactions}
                onView={setSelectedTransaction}
                onReverse={handleReverse}
                loading={isMutating}
              />
            ),
          },
          {
            key: 'balances',
            label: t('cooperative.savings.tab.balances'),
            children: <CooperativeSavingBalanceTable balances={filteredBalances} />,
          },
        ]}
      />

      <CooperativeSavingFormModal
        form={form}
        open={isModalOpen}
        isSubmitting={isMutating}
        activeMembers={activeMembers}
        paymentAccounts={paymentAccounts}
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
