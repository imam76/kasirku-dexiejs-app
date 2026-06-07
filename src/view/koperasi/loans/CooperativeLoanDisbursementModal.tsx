import { DatePicker, Form, Input, Modal, Select } from 'antd';
import type { FormInstance } from 'antd';
import type { Dayjs } from 'dayjs';
import { useMemo } from 'react';
import { useI18n } from '@/hooks/useI18n';
import type { ChartOfAccount, CooperativeLoan, PaymentMethod } from '@/types';

const { TextArea } = Input;

export interface CooperativeLoanDisbursementFormValues {
  disbursement_date: Dayjs;
  first_due_date: Dayjs;
  payment_method: PaymentMethod;
  cash_account_id?: string;
  payment_channel?: string;
  notes?: string;
}

interface CooperativeLoanDisbursementModalProps {
  form: FormInstance<CooperativeLoanDisbursementFormValues>;
  loan: CooperativeLoan | null;
  open: boolean;
  isSubmitting: boolean;
  paymentAccounts: ChartOfAccount[];
  onCancel: () => void;
  onSubmit: (values: CooperativeLoanDisbursementFormValues) => void;
}

export default function CooperativeLoanDisbursementModal({
  form,
  loan,
  open,
  isSubmitting,
  paymentAccounts,
  onCancel,
  onSubmit,
}: CooperativeLoanDisbursementModalProps) {
  const { t } = useI18n();
  const accountOptions = useMemo(() => paymentAccounts.map((account) => ({
    value: account.id,
    label: `${account.code} - ${account.name}`,
  })), [paymentAccounts]);

  return (
    <Modal
      title={loan ? `${t('cooperative.loans.disburseTitle')} ${loan.loan_number}` : t('cooperative.loans.disburseTitle')}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText={t('cooperative.loans.disburse')}
      okButtonProps={{ 'data-testid': 'koperasi-loan-disbursement-submit-button' }}
      confirmLoading={isSubmitting}
      destroyOnHidden
      forceRender
      width={760}
    >
      <Form<CooperativeLoanDisbursementFormValues>
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark={false}
        className="mt-4"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item
            name="disbursement_date"
            label={t('cooperative.loans.form.disbursementDate')}
            rules={[{ required: true, message: t('cooperative.loans.validation.disbursementDateRequired') }]}
          >
            <DatePicker showTime className="w-full" data-testid="koperasi-loan-disbursement-date-input" />
          </Form.Item>
          <Form.Item
            name="first_due_date"
            label={t('cooperative.loans.form.firstDueDate')}
            rules={[{ required: true, message: t('cooperative.loans.validation.firstDueDateRequired') }]}
          >
            <DatePicker className="w-full" data-testid="koperasi-loan-first-due-date-input" />
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
              data-testid="koperasi-loan-disbursement-payment-method-select"
            />
          </Form.Item>
          <Form.Item name="cash_account_id" label={t('finance.cashAccount')}>
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder={t('finance.cashAccountPlaceholder')}
              options={accountOptions}
            />
          </Form.Item>
          <Form.Item name="payment_channel" label={t('finance.paymentChannel')}>
            <Input placeholder={t('finance.paymentChannelPlaceholder')} />
          </Form.Item>
        </div>

        <Form.Item name="notes" label={t('cooperative.loans.form.disbursementNotes')}>
          <TextArea rows={3} placeholder={t('cooperative.loans.form.disbursementNotesPlaceholder')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
