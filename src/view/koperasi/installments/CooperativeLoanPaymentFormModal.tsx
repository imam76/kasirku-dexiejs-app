import { Checkbox, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import type { Dayjs } from 'dayjs';
import { useMemo } from 'react';
import { useI18n } from '@/hooks/useI18n';
import type { ChartOfAccount, CooperativeLoanInstallment, PaymentMethod } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { getInstallmentRemainingAmounts } from '@/utils/koperasi/loanPaymentAllocation';

const { TextArea } = Input;

export interface CooperativeLoanPaymentFormValues {
  installment_id: string;
  amount: number;
  payment_date: Dayjs;
  payment_method: PaymentMethod;
  cash_account_id?: string;
  remember_cash_account: boolean;
  payment_channel?: string;
  notes?: string;
}

interface CooperativeLoanPaymentFormModalProps {
  form: FormInstance<CooperativeLoanPaymentFormValues>;
  open: boolean;
  isSubmitting: boolean;
  payableInstallments: CooperativeLoanInstallment[];
  paymentAccounts: ChartOfAccount[];
  onCancel: () => void;
  onSubmit: (values: CooperativeLoanPaymentFormValues) => void;
}

export default function CooperativeLoanPaymentFormModal({
  form,
  open,
  isSubmitting,
  payableInstallments,
  paymentAccounts,
  onCancel,
  onSubmit,
}: CooperativeLoanPaymentFormModalProps) {
  const { t } = useI18n();
  const selectedInstallmentId = Form.useWatch('installment_id', form);
  const selectedInstallment = useMemo(() => (
    payableInstallments.find((installment) => installment.id === selectedInstallmentId)
  ), [payableInstallments, selectedInstallmentId]);
  const remaining = selectedInstallment ? getInstallmentRemainingAmounts(selectedInstallment) : undefined;
  const installmentOptions = useMemo(() => payableInstallments.map((installment) => {
    const installmentRemaining = getInstallmentRemainingAmounts(installment);

    return {
      value: installment.id,
      label: `${installment.loan_number} / ${installment.installment_number} - ${installment.member_name} - Rp ${formatCurrency(installmentRemaining.total_amount)}`,
    };
  }), [payableInstallments]);
  const accountOptions = useMemo(() => paymentAccounts.map((account) => ({
    value: account.id,
    label: `${account.code} - ${account.name}`,
  })), [paymentAccounts]);

  return (
    <Modal
      title={t('cooperative.installments.paymentTitle')}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText={t('cooperative.installments.savePayment')}
      okButtonProps={{ 'data-testid': 'koperasi-installment-payment-submit-button' }}
      confirmLoading={isSubmitting}
      destroyOnHidden
      forceRender
      width={860}
    >
      <Form<CooperativeLoanPaymentFormValues>
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark={false}
        className="mt-4"
      >
        <Form.Item
          name="installment_id"
          label={t('cooperative.installments.form.installment')}
          rules={[{ required: true, message: t('cooperative.installments.validation.installmentRequired') }]}
        >
          <Select
            showSearch
            optionFilterProp="label"
            placeholder={t('cooperative.installments.form.installmentPlaceholder')}
            options={installmentOptions}
            data-testid="koperasi-installment-select"
          />
        </Form.Item>

        {selectedInstallment && remaining && (
          <Descriptions column={2} size="small" bordered className="mb-4">
            <Descriptions.Item label={t('cooperative.installments.table.loan')}>
              {selectedInstallment.loan_number}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.installments.table.dueDate')}>
              {formatDate(selectedInstallment.due_date)}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.installments.remainingPenalty')}>
              Rp {formatCurrency(remaining.penalty_amount)}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.installments.remainingInterest')}>
              Rp {formatCurrency(remaining.interest_amount)}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.installments.remainingPrincipal')}>
              Rp {formatCurrency(remaining.principal_amount)}
            </Descriptions.Item>
            <Descriptions.Item label={t('cooperative.installments.table.remaining')}>
              Rp {formatCurrency(remaining.total_amount)}
            </Descriptions.Item>
          </Descriptions>
        )}

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item
            name="amount"
            label={t('cooperative.installments.form.amount')}
            rules={[
              { required: true, message: t('cooperative.installments.validation.amountRequired') },
              { type: 'number', min: 1, message: t('finance.amountMin') },
            ]}
          >
            <InputNumber<number>
              min={1}
              max={remaining?.total_amount}
              className="w-full"
              formatter={(value) => `Rp ${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}
              parser={(value) => value?.replace(/Rp\s?|(\.*)/g, '') as unknown as number}
              placeholder="0"
              data-testid="koperasi-installment-payment-amount-input"
            />
          </Form.Item>
          <Form.Item
            name="payment_date"
            label={t('cooperative.installments.form.paymentDate')}
            rules={[{ required: true, message: t('cooperative.installments.validation.paymentDateRequired') }]}
          >
            <DatePicker showTime className="w-full" data-testid="koperasi-installment-payment-date-input" />
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
              data-testid="koperasi-installment-payment-method-select"
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

        <Form.Item name="notes" label={t('cooperative.installments.form.notes')}>
          <TextArea rows={3} placeholder={t('cooperative.installments.form.notesPlaceholder')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
