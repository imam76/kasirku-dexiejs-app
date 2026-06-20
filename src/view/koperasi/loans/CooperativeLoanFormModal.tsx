import { Checkbox, DatePicker, Descriptions, Form, Input, InputNumber, Modal, Select, Typography } from 'antd';
import type { FormInstance } from 'antd';
import type { Dayjs } from 'dayjs';
import { useMemo } from 'react';
import { useI18n } from '@/hooks/useI18n';
import type {
  CooperativeLoanBillingFrequency,
  CooperativeLoanInterestCalculationType,
  CooperativeMember,
} from '@/types';
import { formatCurrency } from '@/utils/formatters';
import {
  calculateFlatLoanSummary,
  calculateTotalPercentLoanSummary,
  roundCurrency,
} from '@/utils/koperasi/loanSchedule';
import {
  cooperativeLoanBillingFrequencyOptions,
  cooperativeLoanCalculationTypeOptions,
} from './loanOptions';

const { TextArea } = Input;
const { Text } = Typography;

export interface CooperativeLoanFormValues {
  member_id: string;
  principal_amount: number;
  interest_calculation_type: CooperativeLoanInterestCalculationType;
  interest_rate_per_month?: number;
  tenor_months?: number;
  loan_service_rate?: number;
  admin_fee_rate?: number;
  mandatory_saving_rate?: number;
  remember_total_percent_rates?: boolean;
  installment_count?: number;
  billing_frequency?: CooperativeLoanBillingFrequency;
  application_date: Dayjs;
  notes?: string;
}

interface CooperativeLoanFormModalProps {
  form: FormInstance<CooperativeLoanFormValues>;
  open: boolean;
  isSubmitting: boolean;
  activeMembers: CooperativeMember[];
  onCancel: () => void;
  onSubmit: (values: CooperativeLoanFormValues) => void;
}

const formatCurrencyInput = (value: number | string | undefined) => (
  `Rp ${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
);

const parseCurrencyInput = (value: string | undefined) => (
  value?.replace(/Rp\s?|(\.*)/g, '') as unknown as number
);

const formatPercentInput = (value: number | string | undefined) => `${value ?? ''}%`;
const parsePercentInput = (value: string | undefined) => value?.replace('%', '') as unknown as number;

export default function CooperativeLoanFormModal({
  form,
  open,
  isSubmitting,
  activeMembers,
  onCancel,
  onSubmit,
}: CooperativeLoanFormModalProps) {
  const { t } = useI18n();
  const calculationType = Form.useWatch('interest_calculation_type', form) ?? 'MONTHLY_RATE';
  const principalAmount = Number(Form.useWatch('principal_amount', form) || 0);
  const interestRatePerMonth = Number(Form.useWatch('interest_rate_per_month', form) || 0);
  const tenorMonths = Number(Form.useWatch('tenor_months', form) || 0);
  const loanServiceRate = Number(Form.useWatch('loan_service_rate', form) || 0);
  const adminFeeRate = Number(Form.useWatch('admin_fee_rate', form) || 0);
  const mandatorySavingRate = Number(Form.useWatch('mandatory_saving_rate', form) || 0);
  const installmentCount = Number(Form.useWatch('installment_count', form) || 0);

  const memberOptions = useMemo(() => activeMembers.map((member) => ({
    value: member.id,
    label: `${member.member_number} - ${member.name}`,
  })), [activeMembers]);
  const previewRows = useMemo(() => {
    if (principalAmount <= 0) return [];

    if (calculationType === 'MONTHLY_RATE') {
      if (tenorMonths <= 0) return [];
      const summary = calculateFlatLoanSummary({
        principalAmount,
        interestRatePerMonth,
        tenorMonths,
      });

      return [
        { label: t('cooperative.loans.preview.totalInterest'), value: summary.total_interest_amount },
        { label: t('cooperative.loans.preview.totalPayable'), value: summary.total_payable_amount },
        {
          label: t('cooperative.loans.preview.installmentAmount'),
          value: roundCurrency(summary.total_payable_amount / summary.tenor_months),
        },
      ];
    }

    if (installmentCount <= 0) return [];
    const summary = calculateTotalPercentLoanSummary({
      principalAmount,
      loanServiceRate,
      adminFeeRate,
      mandatorySavingRate,
      installmentCount,
    });

    return [
      { label: t('cooperative.loans.preview.loanService'), value: summary.loan_service_amount },
      { label: t('cooperative.loans.preview.adminFee'), value: summary.admin_fee_amount },
      { label: t('cooperative.loans.preview.mandatorySaving'), value: summary.mandatory_saving_amount },
      { label: t('cooperative.loans.preview.totalPayable'), value: summary.total_payable_amount },
      {
        label: t('cooperative.loans.preview.installmentAmount'),
        value: roundCurrency(summary.total_payable_amount / summary.installment_count),
      },
      { label: t('cooperative.loans.preview.netDisbursement'), value: summary.net_disbursement_amount },
    ];
  }, [
    adminFeeRate,
    calculationType,
    installmentCount,
    interestRatePerMonth,
    loanServiceRate,
    mandatorySavingRate,
    principalAmount,
    t,
    tenorMonths,
  ]);

  return (
    <Modal
      title={t('cooperative.loans.addTitle')}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText={t('cooperative.loans.submit')}
      okButtonProps={{ 'data-testid': 'koperasi-loan-submit-button' }}
      confirmLoading={isSubmitting}
      destroyOnHidden
      forceRender
      width={860}
    >
      <Form<CooperativeLoanFormValues>
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark={false}
        className="mt-4"
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item
            name="member_id"
            label={t('cooperative.loans.form.member')}
            rules={[{ required: true, message: t('cooperative.loans.validation.memberRequired') }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder={t('cooperative.loans.form.memberPlaceholder')}
              options={memberOptions}
              data-testid="koperasi-loan-member-select"
            />
          </Form.Item>
          <Form.Item
            name="application_date"
            label={t('cooperative.loans.form.applicationDate')}
            rules={[{ required: true, message: t('cooperative.loans.validation.applicationDateRequired') }]}
          >
            <DatePicker showTime className="w-full" data-testid="koperasi-loan-application-date-input" />
          </Form.Item>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item
            name="interest_calculation_type"
            label={t('cooperative.loans.form.calculationType')}
            rules={[{ required: true, message: t('cooperative.loans.validation.calculationTypeRequired') }]}
          >
            <Select
              options={cooperativeLoanCalculationTypeOptions.map((option) => ({
                value: option.value,
                label: t(option.labelKey),
              }))}
              data-testid="koperasi-loan-calculation-type-select"
            />
          </Form.Item>
          <Form.Item
            name="principal_amount"
            label={t('cooperative.loans.form.principalAmount')}
            rules={[
              { required: true, message: t('cooperative.loans.validation.principalRequired') },
              { type: 'number', min: 1, message: t('finance.amountMin') },
            ]}
          >
            <InputNumber<number>
              min={1}
              className="w-full"
              formatter={formatCurrencyInput}
              parser={parseCurrencyInput}
              placeholder="0"
              data-testid="koperasi-loan-principal-input"
            />
          </Form.Item>
        </div>

        {calculationType === 'MONTHLY_RATE' ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Form.Item
              name="interest_rate_per_month"
              label={t('cooperative.loans.form.interestRate')}
              rules={[
                { required: true, message: t('cooperative.loans.validation.interestRequired') },
                { type: 'number', min: 0, message: t('cooperative.loans.validation.interestMin') },
              ]}
            >
              <InputNumber<number>
                min={0}
                step={0.1}
                className="w-full"
                formatter={formatPercentInput}
                parser={parsePercentInput}
                placeholder="0"
                data-testid="koperasi-loan-interest-input"
              />
            </Form.Item>
            <Form.Item
              name="tenor_months"
              label={t('cooperative.loans.form.tenor')}
              rules={[
                { required: true, message: t('cooperative.loans.validation.tenorRequired') },
                { type: 'number', min: 1, message: t('cooperative.loans.validation.tenorMin') },
              ]}
            >
              <InputNumber<number>
                min={1}
                precision={0}
                className="w-full"
                placeholder="12"
                data-testid="koperasi-loan-tenor-input"
              />
            </Form.Item>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <Form.Item
                name="loan_service_rate"
                label={t('cooperative.loans.form.loanServiceRate')}
                rules={[
                  { required: true, message: t('cooperative.loans.validation.loanServiceRequired') },
                  { type: 'number', min: 0, message: t('cooperative.loans.validation.loanServiceMin') },
                ]}
              >
                <InputNumber<number>
                  min={0}
                  step={0.1}
                  className="w-full"
                  formatter={formatPercentInput}
                  parser={parsePercentInput}
                  placeholder="0"
                  data-testid="koperasi-loan-service-rate-input"
                />
              </Form.Item>
              <Form.Item
                name="admin_fee_rate"
                label={t('cooperative.loans.form.adminFeeRate')}
                rules={[
                  { required: true, message: t('cooperative.loans.validation.adminFeeRequired') },
                  { type: 'number', min: 0, message: t('cooperative.loans.validation.adminFeeMin') },
                ]}
              >
                <InputNumber<number>
                  min={0}
                  step={0.1}
                  className="w-full"
                  formatter={formatPercentInput}
                  parser={parsePercentInput}
                  placeholder="0"
                  data-testid="koperasi-loan-admin-fee-rate-input"
                />
              </Form.Item>
              <Form.Item
                name="mandatory_saving_rate"
                label={t('cooperative.loans.form.mandatorySavingRate')}
                rules={[
                  { required: true, message: t('cooperative.loans.validation.mandatorySavingRequired') },
                  { type: 'number', min: 0, message: t('cooperative.loans.validation.mandatorySavingMin') },
                ]}
              >
                <InputNumber<number>
                  min={0}
                  step={0.1}
                  className="w-full"
                  formatter={formatPercentInput}
                  parser={parsePercentInput}
                  placeholder="0"
                  data-testid="koperasi-loan-mandatory-saving-rate-input"
                />
              </Form.Item>
            </div>
            <Form.Item
              name="remember_total_percent_rates"
              valuePropName="checked"
              className="mb-4"
            >
              <Checkbox data-testid="koperasi-loan-remember-total-percent-rates-checkbox">
                {t('cooperative.loans.form.rememberTotalPercentRates')}
              </Checkbox>
            </Form.Item>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Form.Item
                name="installment_count"
                label={t('cooperative.loans.form.installmentCount')}
                rules={[
                  { required: true, message: t('cooperative.loans.validation.installmentCountRequired') },
                  { type: 'number', min: 1, message: t('cooperative.loans.validation.installmentCountMin') },
                ]}
              >
                <InputNumber<number>
                  min={1}
                  precision={0}
                  className="w-full"
                  placeholder="10"
                  data-testid="koperasi-loan-installment-count-input"
                />
              </Form.Item>
              <Form.Item
                name="billing_frequency"
                label={t('cooperative.loans.form.billingFrequency')}
                rules={[{ required: true, message: t('cooperative.loans.validation.billingFrequencyRequired') }]}
              >
                <Select
                  options={cooperativeLoanBillingFrequencyOptions.map((option) => ({
                    value: option.value,
                    label: t(option.labelKey),
                  }))}
                  data-testid="koperasi-loan-billing-frequency-select"
                />
              </Form.Item>
            </div>
          </>
        )}

        {previewRows.length > 0 && (
          <div className="mb-4">
            <Text strong className="mb-2 block">{t('cooperative.loans.preview.title')}</Text>
            <Descriptions size="small" bordered column={1}>
              {previewRows.map((row) => (
                <Descriptions.Item key={row.label} label={row.label}>
                  Rp {formatCurrency(row.value)}
                </Descriptions.Item>
              ))}
            </Descriptions>
          </div>
        )}

        <Form.Item name="notes" label={t('cooperative.loans.form.notes')}>
          <TextArea rows={3} placeholder={t('cooperative.loans.form.notesPlaceholder')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
