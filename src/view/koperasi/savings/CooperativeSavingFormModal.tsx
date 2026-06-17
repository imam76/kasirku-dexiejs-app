import { Button, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Select, Space, Tag } from 'antd';
import type { FormInstance } from 'antd';
import type { Dayjs } from 'dayjs';
import { useEffect, useMemo } from 'react';
import { useI18n } from '@/hooks/useI18n';
import type { CooperativeSavingPendingReturn } from '@/hooks/useCooperativeSavings';
import type { ChartOfAccount, CooperativeMember, CooperativeMemberSavingBalance, CooperativeSavingTransactionType, CooperativeSavingType, Employee, PaymentMethod } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { getResponsibleFieldCashAccountId } from '@/utils/koperasi/fieldCashDefaults';
import {
  cooperativeSavingTransactionTypeOptions,
  cooperativeSavingTypeOptions,
} from './savingOptions';

const { TextArea } = Input;
const AUTO_MANDATORY_SAVING_RETURN_TOKEN_PREFIX = 'AUTO_MANDATORY_SAVING_RETURN_PAYMENT';

const buildPendingReturnNotes = (pendingReturn: CooperativeSavingPendingReturn) => (
  `Pembayaran pengembalian simpanan wajib pelunasan pinjaman ${pendingReturn.loan_numbers.join(', ')}. ${pendingReturn.tokens.join(' ')}`
);

export interface CooperativeSavingFormValues {
  member_id: string;
  saving_type: CooperativeSavingType;
  transaction_type: Extract<CooperativeSavingTransactionType, 'DEPOSIT' | 'WITHDRAWAL'>;
  amount: number;
  transaction_date: Dayjs;
  payment_method: PaymentMethod;
  cash_account_id?: string;
  remember_cash_account: boolean;
  payment_channel?: string;
  notes?: string;
}

interface CooperativeSavingFormModalProps {
  form: FormInstance<CooperativeSavingFormValues>;
  open: boolean;
  isSubmitting: boolean;
  activeMembers: CooperativeMember[];
  savingBalances: CooperativeMemberSavingBalance[];
  pendingReturnByBalanceKey: Map<string, CooperativeSavingPendingReturn>;
  paymentAccounts: ChartOfAccount[];
  fieldCashEmployees: Employee[];
  fieldCashAccountIds: Set<string>;
  fieldCashBalances: Map<string, number>;
  defaultCashAccountId?: string;
  onCancel: () => void;
  onSubmit: (values: CooperativeSavingFormValues) => void;
}

export default function CooperativeSavingFormModal({
  form,
  open,
  isSubmitting,
  activeMembers,
  savingBalances,
  pendingReturnByBalanceKey,
  paymentAccounts,
  fieldCashEmployees,
  fieldCashAccountIds,
  fieldCashBalances,
  defaultCashAccountId,
  onCancel,
  onSubmit,
}: CooperativeSavingFormModalProps) {
  const { t } = useI18n();
  const selectedMemberId = Form.useWatch('member_id', form);
  const selectedCashAccountId = Form.useWatch('cash_account_id', form);
  const selectedTransactionType = Form.useWatch('transaction_type', form);
  const selectedSavingType = Form.useWatch('saving_type', form);
  const memberOptions = useMemo(() => activeMembers.map((member) => ({
    value: member.id,
    label: `${member.member_number} - ${member.name}`,
  })), [activeMembers]);
  const accountOptions = useMemo(() => paymentAccounts.map((account) => ({
    value: account.id,
    label: `${account.code} - ${account.name}`,
  })), [paymentAccounts]);
  const selectedAccount = useMemo(() => (
    paymentAccounts.find((account) => account.id === selectedCashAccountId)
  ), [paymentAccounts, selectedCashAccountId]);
  const selectedMember = useMemo(() => (
    activeMembers.find((member) => member.id === selectedMemberId)
  ), [activeMembers, selectedMemberId]);
  const selectedSavingBalance = useMemo(() => (
    selectedMemberId && selectedSavingType
      ? savingBalances.find((balance) => (
          balance.member_id === selectedMemberId && balance.saving_type === selectedSavingType
        ))
      : undefined
  ), [savingBalances, selectedMemberId, selectedSavingType]);
  const selectedPendingReturn = selectedSavingBalance
    ? pendingReturnByBalanceKey.get(selectedSavingBalance.id)
    : undefined;
  const responsibleCashAccountId = useMemo(() => (
    getResponsibleFieldCashAccountId(selectedMember, fieldCashEmployees, paymentAccounts)
  ), [fieldCashEmployees, paymentAccounts, selectedMember]);

  const selectedCashAccountBalance = selectedCashAccountId
    ? Number(fieldCashBalances.get(selectedCashAccountId) || 0)
    : 0;

  useEffect(() => {
    if (!open || !selectedMemberId) return;

    const nextCashAccountId = responsibleCashAccountId ?? defaultCashAccountId;
    if (form.getFieldValue('cash_account_id') !== nextCashAccountId) {
      form.setFieldValue('cash_account_id', nextCashAccountId);
    }
  }, [defaultCashAccountId, form, open, responsibleCashAccountId, selectedMemberId]);

  useEffect(() => {
    if (!open || selectedTransactionType !== 'WITHDRAWAL') return;

    if (!selectedSavingBalance) {
      form.setFieldValue('amount', undefined);
      const currentNotes = form.getFieldValue('notes');
      if (typeof currentNotes === 'string' && currentNotes.includes(AUTO_MANDATORY_SAVING_RETURN_TOKEN_PREFIX)) {
        form.setFieldValue('notes', undefined);
      }
      return;
    }

    const nextAmount = selectedPendingReturn?.amount ?? Number(selectedSavingBalance.balance || 0);
    if (nextAmount > 0) {
      form.setFieldValue('amount', nextAmount);
    }

    const currentNotes = form.getFieldValue('notes');
    if (selectedPendingReturn) {
      form.setFieldValue('notes', buildPendingReturnNotes(selectedPendingReturn));
    } else if (typeof currentNotes === 'string' && currentNotes.includes(AUTO_MANDATORY_SAVING_RETURN_TOKEN_PREFIX)) {
      form.setFieldValue('notes', undefined);
    }
  }, [
    form,
    open,
    selectedPendingReturn,
    selectedSavingBalance,
    selectedTransactionType,
  ]);

  return (
    <Modal
      title={selectedTransactionType === 'WITHDRAWAL'
        ? t('cooperative.savings.withdrawTitle')
        : t('cooperative.savings.addTitle')}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText={t('cooperative.savings.save')}
      okButtonProps={{ 'data-testid': 'koperasi-saving-submit-button' }}
      confirmLoading={isSubmitting}
      destroyOnHidden
      forceRender
      width={820}
    >
      <Form<CooperativeSavingFormValues>
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark={false}
        className="mt-4"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item
            name="member_id"
            label={t('cooperative.savings.form.member')}
            rules={[{ required: true, message: t('cooperative.savings.validation.memberRequired') }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={t('cooperative.savings.form.memberPlaceholder')}
              options={memberOptions}
              data-testid="koperasi-saving-member-select"
            />
          </Form.Item>
          <Form.Item
            name="transaction_type"
            label={t('cooperative.savings.form.transactionType')}
            rules={[{ required: true, message: t('cooperative.savings.validation.transactionTypeRequired') }]}
          >
            <Select
              options={cooperativeSavingTransactionTypeOptions.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
              data-testid="koperasi-saving-transaction-type-select"
            />
          </Form.Item>
        </div>

        {selectedTransactionType === 'WITHDRAWAL' && selectedMemberId && selectedSavingType && (
          <div className="mb-4 flex flex-wrap gap-2">
            <Tag color="blue">
              {t('cooperative.savings.memberSavingBalance')}: Rp {formatCurrency(Number(selectedSavingBalance?.balance || 0))}
            </Tag>
            {selectedPendingReturn && (
              <Tag color="gold">
                {t('cooperative.savings.pendingReturn')}: Rp {formatCurrency(selectedPendingReturn.amount)}
              </Tag>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Form.Item
            name="saving_type"
            label={t('cooperative.savings.form.savingType')}
            rules={[{ required: true, message: t('cooperative.savings.validation.savingTypeRequired') }]}
          >
            <Select
              options={cooperativeSavingTypeOptions.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
              data-testid="koperasi-saving-type-select"
            />
          </Form.Item>
          <Form.Item
            name="amount"
            label={(
              <Space size={8}>
                <span>{t('cooperative.savings.form.amount')}</span>
                {selectedTransactionType === 'WITHDRAWAL' && selectedSavingBalance && (
                  <Button
                    type="link"
                    size="small"
                    className="h-auto p-0"
                    onClick={() => form.setFieldValue('amount', Number(selectedSavingBalance.balance || 0))}
                  >
                    {t('cooperative.savings.withdrawAll')}
                  </Button>
                )}
              </Space>
            )}
            rules={[
              { required: true, message: t('finance.amountRequired') },
              { type: 'number', min: 1, message: t('finance.amountMin') },
              {
                validator: async (_rule, value) => {
                  if (selectedTransactionType !== 'WITHDRAWAL') return;
                  const availableBalance = Number(selectedSavingBalance?.balance || 0);
                  const requestedAmount = Number(value || 0);
                  if (requestedAmount <= availableBalance + 0.01) return;
                  throw new Error(t('cooperative.savings.validation.withdrawalMax', {
                    amount: formatCurrency(availableBalance),
                  }));
                },
              },
            ]}
          >
            <InputNumber<number>
              min={1}
              className="w-full"
              formatter={(value) => `Rp ${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={(value) => value?.replace(/Rp\s?|(\.*)/g, '') as unknown as number}
              placeholder="0"
              data-testid="koperasi-saving-amount-input"
            />
          </Form.Item>
          <Form.Item
            name="transaction_date"
            label={t('cooperative.savings.form.transactionDate')}
            rules={[{ required: true, message: t('cooperative.savings.validation.transactionDateRequired') }]}
          >
            <DatePicker showTime className="w-full" data-testid="koperasi-saving-date-input" />
          </Form.Item>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <Form.Item
            name="payment_method"
            label={t('checkout.method')}
            rules={[{ required: true, message: t('salesDocuments.validation.required', { field: t('checkout.method') }) }]}
          >
            <Select
              options={[
                { value: 'TUNAI', label: t('payment.cash') },
                { value: 'NON_TUNAI', label: t('payment.nonCash') },
              ]}
              data-testid="koperasi-saving-payment-method-select"
            />
          </Form.Item>
          <div>
            <Form.Item name="cash_account_id" label={t('finance.cashAccount')} className="mb-2">
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder={t('finance.cashAccountPlaceholder')}
                options={accountOptions}
              />
            </Form.Item>
            <Form.Item name="remember_cash_account" valuePropName="checked" className="mb-0">
              <Checkbox>{t('cooperative.cashPreference.rememberCashAccount')}</Checkbox>
            </Form.Item>
          </div>
          <Form.Item name="payment_channel" label={t('finance.paymentChannel')}>
            <Input placeholder={t('finance.paymentChannelPlaceholder')} />
          </Form.Item>
        </div>

        <Form.Item name="notes" label={t('cooperative.savings.form.notes')}>
          <TextArea rows={3} placeholder={t('cooperative.savings.form.notesPlaceholder')} />
        </Form.Item>

        {selectedAccount && fieldCashAccountIds.has(selectedAccount.id) && (
          <div className="flex flex-wrap gap-2">
            <Tag color="green">
              {t('cooperative.savings.selectedFieldCash')}: {selectedAccount.code} - {selectedAccount.name}
            </Tag>
            <Tag color="cyan">
              {t('cooperative.savings.selectedFieldCashBalance')}: Rp {formatCurrency(selectedCashAccountBalance)}
            </Tag>
          </div>
        )}
      </Form>
    </Modal>
  );
}
