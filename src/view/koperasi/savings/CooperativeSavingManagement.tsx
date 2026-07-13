import { useState } from 'react';
import { App, Button, Card, Form, Input, Select, Space, Tabs } from 'antd';
import { ArrowUpRight, History, Plus, WalletCards } from 'lucide-react';
import dayjs from '@/lib/dayjs';
import { useCooperativeCashPreference } from '@/hooks/useCooperativeCashPreference';
import {
  useCooperativeSavings,
  type CooperativeSavingPendingReturn,
  type CooperativeSavingStatusFilter,
  type CooperativeSavingTransactionTypeFilter,
  type CooperativeSavingTypeFilter,
} from '@/hooks/useCooperativeSavings';
import { useI18n } from '@/hooks/useI18n';
import type {
  CooperativeMemberSavingBalance,
  CooperativeSavingTransaction,
  CooperativeSavingTransactionType,
  CooperativeSavingWithdrawalSource,
} from '@/types';
import { getDefaultCashAccountId } from '@/utils/chartOfAccounts/getDefaultCashAccountId';
import CooperativeSavingBalanceTable from './CooperativeSavingBalanceTable';
import CooperativeSavingDetailDrawer from './CooperativeSavingDetailDrawer';
import CooperativeSavingFormModal, { type CooperativeSavingFormValues } from './CooperativeSavingFormModal';
import CooperativeSavingOpeningBalanceModal, {
  type CooperativeSavingOpeningBalanceFormValues,
} from './CooperativeSavingOpeningBalanceModal';
import CooperativeSavingTable from './CooperativeSavingTable';
import {
  cooperativeSavingStatusOptions,
  cooperativeSavingTransactionTypeOptions,
  cooperativeSavingTypeOptions,
} from './savingOptions';

const buildPendingReturnNotes = (pendingReturn: CooperativeSavingPendingReturn) => (
  `Pembayaran pengembalian simpanan wajib pelunasan pinjaman ${pendingReturn.loan_numbers.join(', ')}. ${pendingReturn.tokens.join(' ')}`
);

export default function CooperativeSavingManagement() {
  const { message, modal } = App.useApp();
  const { t } = useI18n();
  const [form] = Form.useForm<CooperativeSavingFormValues>();
  const [openingBalanceForm] = Form.useForm<CooperativeSavingOpeningBalanceFormValues>();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isOpeningBalanceModalOpen, setIsOpeningBalanceModalOpen] = useState(false);
  const { rememberCashAccount } = useCooperativeCashPreference('savings');
  const {
    activeMembers,
    transactions,
    filteredTransactions,
    filteredBalances,
    balances,
    pendingReturnByBalanceKey,
    openingBalanceSuggestionByMemberId,
    openingBalanceCutoffDate,
    interestByBalanceKey,
    paymentAccounts,
    fieldCashAccountIds,
    fieldCashBalances,
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
    recordOpeningBalance,
    reverseSaving,
    isMutating,
  } = useCooperativeSavings();

  const closeModal = () => {
    setIsModalOpen(false);
    form.resetFields();
  };

  const closeOpeningBalanceModal = () => {
    setIsOpeningBalanceModalOpen(false);
    openingBalanceForm.resetFields();
  };

  const openSavingModal = (
    transactionType: Extract<CooperativeSavingTransactionType, 'DEPOSIT' | 'WITHDRAWAL'> = 'DEPOSIT',
    balance?: CooperativeMemberSavingBalance,
    withdrawalSource: CooperativeSavingWithdrawalSource = 'SAVING',
  ) => {
    const pendingReturn = balance ? pendingReturnByBalanceKey.get(balance.id) : undefined;
    const withdrawalAmount = withdrawalSource === 'INTEREST'
      ? (balance ? interestByBalanceKey.get(balance.id) : 0) || undefined
      : (pendingReturn?.amount ?? Number(balance?.balance || 0)) || undefined;
    const defaultCashAccountId = getDefaultCashAccountId(paymentAccounts);
    form.resetFields();
    form.setFieldsValue({
      member_id: balance?.member_id,
      transaction_type: transactionType,
      withdrawal_source: withdrawalSource,
      saving_type: balance?.saving_type ?? 'SUKARELA',
      amount: transactionType === 'WITHDRAWAL' ? withdrawalAmount : undefined,
      transaction_date: dayjs(),
      payment_method: 'TUNAI',
      remember_cash_account: true,
      cash_account_id: defaultCashAccountId,
      notes: withdrawalSource === 'SAVING' && pendingReturn
        ? buildPendingReturnNotes(pendingReturn)
        : undefined,
    });
    setIsModalOpen(true);
  };

  const openAddModal = () => openSavingModal('DEPOSIT');

  const openOpeningBalanceModal = () => {
    openingBalanceForm.resetFields();
    openingBalanceForm.setFieldsValue({
      saving_type: 'WAJIB',
      transaction_date: openingBalanceCutoffDate ? dayjs(openingBalanceCutoffDate) : dayjs(),
    });
    setIsOpeningBalanceModalOpen(true);
  };

  const openWithdrawModal = (
    balance?: CooperativeMemberSavingBalance,
    withdrawalSource: CooperativeSavingWithdrawalSource = 'SAVING',
  ) => {
    openSavingModal('WITHDRAWAL', balance, withdrawalSource);
  };

  const handleSubmit = async (values: CooperativeSavingFormValues) => {
    try {
      const result = await recordSaving({
        member_id: values.member_id,
        saving_type: values.saving_type,
        transaction_type: values.transaction_type,
        withdrawal_source: values.withdrawal_source,
        amount: Number(values.amount || 0),
        transaction_date: values.transaction_date?.toISOString(),
        payment_method: values.payment_method,
        cash_account_id: values.cash_account_id,
        payment_channel: values.payment_channel,
        notes: values.notes,
      });
      if (values.remember_cash_account) {
        rememberCashAccount({
          cash_account_id: result.transaction.cash_account_id ?? values.cash_account_id,
        });
      }
      message.success(t('cooperative.savings.recordSuccess'));
      closeModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('cooperative.savings.recordFailed'));
    }
  };

  const handleOpeningBalanceSubmit = async (values: CooperativeSavingOpeningBalanceFormValues) => {
    try {
      await recordOpeningBalance({
        member_id: values.member_id,
        saving_type: values.saving_type,
        amount: Number(values.amount || 0),
        transaction_date: values.transaction_date.toISOString(),
        notes: values.notes,
      });
      message.success(t('cooperative.savings.openingBalance.success'));
      closeOpeningBalanceModal();
    } catch (error) {
      message.error(error instanceof Error ? error.message : t('cooperative.savings.openingBalance.failed'));
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
        <Space wrap>
          <Button
            icon={<History size={16} />}
            data-testid="koperasi-saving-opening-button"
            onClick={openOpeningBalanceModal}
          >
            {t('cooperative.savings.openingBalance.action')}
          </Button>
          <Button
            icon={<ArrowUpRight size={16} />}
            data-testid="koperasi-saving-withdraw-button"
            onClick={() => openWithdrawModal()}
          >
            {t('cooperative.savings.withdraw')}
          </Button>
          <Button
            type="primary"
            icon={<Plus size={16} />}
            data-testid="koperasi-saving-add-button"
            onClick={openAddModal}
          >
            {t('cooperative.savings.add')}
          </Button>
        </Space>
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
            children: (
              <CooperativeSavingBalanceTable
                balances={filteredBalances}
                pendingReturnByBalanceKey={pendingReturnByBalanceKey}
                interestByBalanceKey={interestByBalanceKey}
                loading={isMutating}
                onWithdraw={openWithdrawModal}
              />
            ),
          },
        ]}
      />

      <CooperativeSavingFormModal
        form={form}
        open={isModalOpen}
        isSubmitting={isMutating}
        activeMembers={activeMembers}
        savingBalances={balances}
        savingTransactions={transactions}
        pendingReturnByBalanceKey={pendingReturnByBalanceKey}
        paymentAccounts={paymentAccounts}
        fieldCashAccountIds={fieldCashAccountIds}
        fieldCashBalances={fieldCashBalances}
        defaultCashAccountId={getDefaultCashAccountId(paymentAccounts)}
        onCancel={closeModal}
        onSubmit={handleSubmit}
      />
      <CooperativeSavingOpeningBalanceModal
        form={openingBalanceForm}
        open={isOpeningBalanceModalOpen}
        isSubmitting={isMutating}
        activeMembers={activeMembers}
        suggestionByMemberId={openingBalanceSuggestionByMemberId}
        onCancel={closeOpeningBalanceModal}
        onSubmit={handleOpeningBalanceSubmit}
      />
      <CooperativeSavingDetailDrawer
        transaction={selectedTransaction}
        open={Boolean(selectedTransaction)}
        onClose={() => setSelectedTransaction(null)}
      />
    </Card>
  );
}
