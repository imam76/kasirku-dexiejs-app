import { Alert, Checkbox, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Select, Tag } from 'antd';
import type { FormInstance } from 'antd';
import type { Dayjs } from 'dayjs';
import { useMemo } from 'react';
import { useI18n } from '@/hooks/useI18n';
import type { ChartOfAccount, CooperativeLoanInstallment, Employee, PaymentMethod } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import {
  allocateLoanPaymentAcrossInstallments,
  getInstallmentRemainingAmounts,
} from '@/utils/koperasi/loanPaymentAllocation';

const { TextArea } = Input;

export interface CooperativeLoanPaymentFormValues {
  idempotency_key: string;
  installment_id: string;
  amount: number;
  payment_date: Dayjs;
  payment_method: PaymentMethod;
  cash_account_id?: string;
  remember_cash_account: boolean;
  payment_channel?: string;
  collector_id?: string;
  notes?: string;
}

interface CooperativeLoanPaymentFormModalProps {
  form: FormInstance<CooperativeLoanPaymentFormValues>;
  open: boolean;
  isSubmitting: boolean;
  payableInstallments: CooperativeLoanInstallment[];
  paymentAccounts: ChartOfAccount[];
  activeCollectors?: Employee[];
  fieldCashBadge?: string;
  onInstallmentChange?: (installment?: CooperativeLoanInstallment) => void;
  onCancel: () => void;
  onSubmit: (values: CooperativeLoanPaymentFormValues) => void;
}

export default function CooperativeLoanPaymentFormModal({
  form,
  open,
  isSubmitting,
  payableInstallments,
  paymentAccounts,
  activeCollectors = [],
  fieldCashBadge,
  onInstallmentChange,
  onCancel,
  onSubmit,
}: CooperativeLoanPaymentFormModalProps) {
  const { t } = useI18n();
  const selectedInstallmentId = Form.useWatch('installment_id', form);
  const selectedAmount = Number(Form.useWatch('amount', form) || 0);
  const selectedInstallment = useMemo(() => (
    payableInstallments.find((installment) => installment.id === selectedInstallmentId)
  ), [payableInstallments, selectedInstallmentId]);
  const remaining = selectedInstallment ? getInstallmentRemainingAmounts(selectedInstallment) : undefined;
  const selectedLoanInstallments = useMemo(() => (
    selectedInstallment
      ? payableInstallments.filter((installment) => (
          installment.loan_id === selectedInstallment.loan_id &&
          installment.status !== 'PAID'
        ))
      : []
  ), [payableInstallments, selectedInstallment]);
  const totalLoanRemaining = useMemo(() => selectedLoanInstallments.reduce(
    (sum, installment) => sum + getInstallmentRemainingAmounts(installment).total_amount,
    0,
  ), [selectedLoanInstallments]);
  const allocationPreview = useMemo(() => {
    if (!selectedInstallment || selectedAmount <= 0) {
      return { rows: [], error: undefined as string | undefined };
    }

    try {
      return {
        rows: allocateLoanPaymentAcrossInstallments(selectedLoanInstallments, selectedAmount),
        error: undefined,
      };
    } catch (error) {
      return {
        rows: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [selectedAmount, selectedInstallment, selectedLoanInstallments]);
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
  const collectorOptions = useMemo(() => activeCollectors.map((employee) => ({
    value: employee.id,
    label: employee.position ? `${employee.name} - ${employee.position}` : employee.name,
  })), [activeCollectors]);
  const showCollectorSelect = collectorOptions.length > 0;

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
            onChange={(installmentId) => {
              onInstallmentChange?.(
                payableInstallments.find((installment) => installment.id === installmentId),
              );
            }}
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
            <Descriptions.Item label={t('cooperative.installments.totalLoanRemaining')}>
              Rp {formatCurrency(totalLoanRemaining)}
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
              {
                validator: async (_rule, value) => {
                  const numericValue = Number(value || 0);
                  if (selectedInstallment && numericValue - totalLoanRemaining > 0.01) {
                    throw new Error(t('cooperative.installments.validation.amountExceedsLoanRemaining'));
                  }
                },
              },
            ]}
          >
            <InputNumber<number>
              min={1}
              max={selectedInstallment ? totalLoanRemaining : undefined}
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

        {selectedInstallment && (
          <div className="mb-4 border border-gray-200 bg-gray-50 p-3">
            <div className="mb-2 text-sm font-semibold text-gray-700">
              {t('cooperative.installments.allocationPreview')}
            </div>
            {allocationPreview.error ? (
              <Alert type="error" showIcon message={allocationPreview.error} />
            ) : (
              <div className="space-y-2">
                {allocationPreview.rows.map(({ installment, allocation }) => (
                  <div
                    key={installment.id}
                    className="flex flex-col gap-1 border-b border-gray-200 pb-2 text-sm last:border-b-0 last:pb-0 md:flex-row md:items-center md:justify-between"
                  >
                    <span className="font-medium text-gray-700">
                      #{installment.installment_number} - {formatDate(installment.due_date)}
                    </span>
                    <span className="text-gray-600">
                      Rp {formatCurrency(allocation.total_amount)}
                      {' '}
                      {allocation.remaining_total_amount <= 0.01
                        ? `(${t('cooperative.loans.installmentStatus.paid')})`
                        : `(${t('cooperative.installments.table.remaining')}: Rp ${formatCurrency(allocation.remaining_total_amount)})`}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <div className={`grid grid-cols-1 gap-4 ${showCollectorSelect ? 'md:grid-cols-4' : 'md:grid-cols-3'}`}>
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
          {showCollectorSelect && (
            <Form.Item name="collector_id" label={t('cooperative.installments.form.collector')}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                placeholder={t('cooperative.installments.form.collectorPlaceholder')}
                options={collectorOptions}
              />
            </Form.Item>
          )}
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

        {fieldCashBadge && (
          <Tag color="green" className="mb-4">
            {fieldCashBadge}
          </Tag>
        )}

        <Form.Item name="notes" label={t('cooperative.installments.form.notes')}>
          <TextArea rows={3} placeholder={t('cooperative.installments.form.notesPlaceholder')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
