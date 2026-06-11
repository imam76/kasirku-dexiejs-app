import { Checkbox, DatePicker, Descriptions, Form, Input, Modal, Select, Typography } from 'antd';
import type { FormInstance } from 'antd';
import type { Dayjs } from 'dayjs';
import { useMemo } from 'react';
import { useI18n } from '@/hooks/useI18n';
import type { ChartOfAccount, CooperativeLoan, PaymentMethod } from '@/types';
import { formatCurrency } from '@/utils/formatters';

const { TextArea } = Input;
const { Text } = Typography;

export interface CooperativeLoanDisbursementFormValues {
  disbursement_date: Dayjs;
  first_due_date: Dayjs;
  payment_method: PaymentMethod;
  cash_account_id?: string;
  remember_cash_account: boolean;
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
  const isDeductedLoan = loan?.deduction_method === 'DEDUCT_ON_DISBURSEMENT';
  const netDisbursementAmount = loan
    ? loan.net_disbursement_amount ?? loan.principal_amount
    : 0;

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

        <Form.Item name="notes" label={t('cooperative.loans.form.disbursementNotes')}>
          <TextArea rows={3} placeholder={t('cooperative.loans.form.disbursementNotesPlaceholder')} />
        </Form.Item>

        {loan && (
          <div className="mb-2">
            <Text strong className="mb-2 block">{t('cooperative.loans.disbursementPreview')}</Text>
            <Descriptions size="small" bordered column={1}>
              <Descriptions.Item label={t('cooperative.loans.form.principalAmount')}>
                Rp {formatCurrency(loan.principal_amount)}
              </Descriptions.Item>
              {isDeductedLoan && (
                <>
                  <Descriptions.Item label={t('cooperative.loans.preview.adminFee')}>
                    Rp {formatCurrency(loan.admin_fee_amount ?? 0)}
                  </Descriptions.Item>
                  <Descriptions.Item label={t('cooperative.loans.preview.mandatorySaving')}>
                    Rp {formatCurrency(loan.mandatory_saving_amount ?? 0)}
                  </Descriptions.Item>
                </>
              )}
              <Descriptions.Item label={t('cooperative.loans.netDisbursement')}>
                Rp {formatCurrency(netDisbursementAmount)}
              </Descriptions.Item>
            </Descriptions>
          </div>
        )}
      </Form>
    </Modal>
  );
}
