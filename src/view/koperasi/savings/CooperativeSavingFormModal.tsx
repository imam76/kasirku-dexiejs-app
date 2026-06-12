import { Checkbox, DatePicker, Form, Input, InputNumber, Modal, Select, Tag } from 'antd';
import type { FormInstance } from 'antd';
import type { Dayjs } from 'dayjs';
import { useMemo } from 'react';
import { useI18n } from '@/hooks/useI18n';
import type { ChartOfAccount, CooperativeMember, CooperativeSavingTransactionType, CooperativeSavingType, PaymentMethod } from '@/types';
import {
  cooperativeSavingTransactionTypeOptions,
  cooperativeSavingTypeOptions,
} from './savingOptions';
import { formatCurrency } from '@/utils/formatters';

const { TextArea } = Input;

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
  paymentAccounts: ChartOfAccount[];
  fieldCashAccountIds: Set<string>;
  fieldCashBalances: Map<string, number>;
  onCancel: () => void;
  onSubmit: (values: CooperativeSavingFormValues) => void;
}

export default function CooperativeSavingFormModal({
  form,
  open,
  isSubmitting,
  activeMembers,
  paymentAccounts,
  fieldCashAccountIds,
  fieldCashBalances,
  onCancel,
  onSubmit,
}: CooperativeSavingFormModalProps) {
  const { t } = useI18n();
  const selectedCashAccountId = Form.useWatch('cash_account_id', form);
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

  return (
    <Modal
      title={t('cooperative.savings.addTitle')}
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
            label={t('cooperative.savings.form.amount')}
            rules={[
              { required: true, message: t('finance.amountRequired') },
              { type: 'number', min: 1, message: t('finance.amountMin') },
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
          <Tag color="green">
            Kas Petugas {selectedAccount.code} - saldo Rp {formatCurrency(Number(fieldCashBalances.get(selectedAccount.id) || 0))}
          </Tag>
        )}
      </Form>
    </Modal>
  );
}
