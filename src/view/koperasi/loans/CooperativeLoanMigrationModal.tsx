import { Alert, DatePicker, Divider, Form, Input, InputNumber, Modal, Radio, Select, Typography } from 'antd';
import type { FormInstance } from 'antd';
import type { Dayjs } from 'dayjs';
import { useMemo } from 'react';
import { useI18n } from '@/hooks/useI18n';
import dayjs from '@/lib/dayjs';
import type {
  CooperativeLoanBillingFrequency,
  CooperativeLoanInterestCalculationType,
  CooperativeMember,
  EmployeeCollectionSchedule,
} from '@/types';
import { findCollectionScheduleByWeekday } from '@/utils/koperasi/collectionSchedule';
import {
  cooperativeLoanBillingFrequencyOptions,
  cooperativeLoanCalculationTypeOptions,
} from './loanOptions';

const { TextArea } = Input;
const { Text } = Typography;

export type CooperativeLoanMigrationSettledMode = 'INSTALLMENT' | 'PRINCIPAL';

export interface CooperativeLoanMigrationFormValues {
  member_id: string;
  application_date: Dayjs;
  disbursement_date: Dayjs;
  interest_calculation_type: CooperativeLoanInterestCalculationType;
  principal_amount: number;
  interest_rate_per_month?: number;
  tenor_months?: number;
  loan_service_rate?: number;
  admin_fee_rate?: number;
  mandatory_saving_rate?: number;
  installment_count?: number;
  billing_frequency?: CooperativeLoanBillingFrequency;
  settled_mode: CooperativeLoanMigrationSettledMode;
  settled_through_installment_number?: number;
  outstanding_principal_amount?: number;
  outstanding_interest_amount?: number;
  notes?: string;
}

interface CooperativeLoanMigrationModalProps {
  form: FormInstance<CooperativeLoanMigrationFormValues>;
  open: boolean;
  isSubmitting: boolean;
  activeMembers: CooperativeMember[];
  /** Collection schedules for the currently selected member's officer+area. */
  collectionSchedules: EmployeeCollectionSchedule[];
  onCancel: () => void;
  onSubmit: (values: CooperativeLoanMigrationFormValues) => void;
}

const formatCurrencyInput = (value: number | string | undefined) => (
  `Rp ${value ?? ''}`.replace(/\B(?=(\d{3})+(?!\d))/g, '.')
);
const parseCurrencyInput = (value: string | undefined) => (
  value?.replace(/Rp\s?|(\.*)/g, '') as unknown as number
);
const formatPercentInput = (value: number | string | undefined) => `${value ?? ''}%`;
const parsePercentInput = (value: string | undefined) => value?.replace('%', '') as unknown as number;

export default function CooperativeLoanMigrationModal({
  form,
  open,
  isSubmitting,
  activeMembers,
  collectionSchedules,
  onCancel,
  onSubmit,
}: CooperativeLoanMigrationModalProps) {
  const { t } = useI18n();
  const selectedMemberId = Form.useWatch('member_id', form);
  const calculationType = Form.useWatch('interest_calculation_type', form) ?? 'MONTHLY_RATE';
  const settledMode = Form.useWatch('settled_mode', form) ?? 'INSTALLMENT';
  const tenorMonths = Number(Form.useWatch('tenor_months', form) || 0);
  const installmentCount = Number(Form.useWatch('installment_count', form) || 0);
  const totalInstallments = calculationType === 'MONTHLY_RATE' ? tenorMonths : installmentCount;

  const principalAmount = Number(Form.useWatch('principal_amount', form) || 0);
  const interestRatePerMonth = Number(Form.useWatch('interest_rate_per_month', form) || 0);
  const loanServiceRate = Number(Form.useWatch('loan_service_rate', form) || 0);
  // Batas atas sisa migrasi = total bunga pinjaman. Flat: pokok x bunga%/bln x tenor.
  // Total-percent: pokok x jasa%. Dipakai sebagai `max` input agar sisa tak melebihi total bunga.
  const totalInterest = calculationType === 'MONTHLY_RATE'
    ? Math.round(principalAmount * (interestRatePerMonth / 100) * tenorMonths)
    : Math.round(principalAmount * (loanServiceRate / 100));

  const memberOptions = useMemo(() => activeMembers.map((member) => ({
    value: member.id,
    label: `${member.member_number} - ${member.name}`,
  })), [activeMembers]);

  return (
    <Modal
      title={t('cooperative.loans.migration.addTitle')}
      open={open}
      onCancel={onCancel}
      onOk={() => form.submit()}
      okText={t('cooperative.loans.migration.submit')}
      okButtonProps={{ 'data-testid': 'koperasi-loan-migration-submit-button' }}
      confirmLoading={isSubmitting}
      destroyOnHidden
      forceRender
      width={860}
    >
      <Form<CooperativeLoanMigrationFormValues>
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        requiredMark={false}
        className="mt-4"
      >
        <Alert
          type="warning"
          showIcon
          className="mb-4"
          message={t('cooperative.loans.migration.info')}
        />

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
              onChange={() => form.setFieldValue('disbursement_date', undefined)}
              data-testid="koperasi-loan-migration-member-select"
            />
          </Form.Item>
          <Form.Item
            name="application_date"
            label={t('cooperative.loans.form.applicationDate')}
            rules={[{ required: true, message: t('cooperative.loans.validation.applicationDateRequired') }]}
          >
            <DatePicker
              showTime
              className="w-full"
              disabledDate={(current) => !current.isBefore(dayjs().tz(), 'day')}
              data-testid="koperasi-loan-migration-application-date-input"
            />
          </Form.Item>
          <Form.Item
            name="disbursement_date"
            label={t('cooperative.loans.form.disbursementDate')}
            dependencies={['application_date']}
            rules={[
              { required: true, message: t('cooperative.loans.validation.disbursementDateRequired') },
              ({ getFieldValue }) => ({
                validator(_, value?: Dayjs) {
                  const selectedApplicationDate = getFieldValue('application_date') as Dayjs | undefined;
                  if (
                    value &&
                    selectedApplicationDate &&
                    value.isBefore(selectedApplicationDate, 'day')
                  ) {
                    return Promise.reject(new Error(t('cooperative.loans.validation.disbursementBeforeApplication')));
                  }
                  return Promise.resolve();
                },
              }),
            ]}
            extra={selectedMemberId ? undefined : t('cooperative.loans.migration.disbursementDateMemberFirst')}
          >
            <DatePicker
              showTime
              className="w-full"
              disabled={!selectedMemberId}
              disabledDate={(current) => (
                !current.isBefore(dayjs().tz(), 'day') ||
                !findCollectionScheduleByWeekday(collectionSchedules, current)
              )}
              data-testid="koperasi-loan-migration-date-input"
            />
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
              data-testid="koperasi-loan-migration-calculation-type-select"
            />
          </Form.Item>
          <Form.Item
            name="principal_amount"
            label={t('cooperative.loans.migration.originalPrincipal')}
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
              data-testid="koperasi-loan-migration-principal-input"
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
                data-testid="koperasi-loan-migration-interest-input"
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
                data-testid="koperasi-loan-migration-tenor-input"
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
                  data-testid="koperasi-loan-migration-service-rate-input"
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
                  data-testid="koperasi-loan-migration-admin-fee-rate-input"
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
                  data-testid="koperasi-loan-migration-mandatory-saving-rate-input"
                />
              </Form.Item>
            </div>
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
                  data-testid="koperasi-loan-migration-installment-count-input"
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
                  data-testid="koperasi-loan-migration-billing-frequency-select"
                />
              </Form.Item>
            </div>
          </>
        )}

        <Divider>{t('cooperative.loans.migration.positionTitle')}</Divider>
        <Text type="secondary" className="mb-3 block">{t('cooperative.loans.migration.positionHint')}</Text>

        <Form.Item name="settled_mode" className="mb-3">
          <Radio.Group data-testid="koperasi-loan-migration-settled-mode">
            <Radio value="INSTALLMENT">{t('cooperative.loans.migration.settledByInstallment')}</Radio>
            <Radio value="PRINCIPAL">{t('cooperative.loans.migration.settledByPrincipal')}</Radio>
          </Radio.Group>
        </Form.Item>

        {settledMode === 'INSTALLMENT' ? (
          <Form.Item
            name="settled_through_installment_number"
            label={t('cooperative.loans.migration.settledThroughInstallment')}
            rules={[
              { required: true, message: t('cooperative.loans.migration.validation.settledInstallmentRequired') },
              { type: 'number', min: 0, message: t('cooperative.loans.migration.validation.settledInstallmentMin') },
              {
                type: 'number',
                max: totalInstallments || undefined,
                message: t('cooperative.loans.migration.validation.settledInstallmentMax', { count: totalInstallments }),
              },
            ]}
            extra={t('cooperative.loans.migration.settledThroughInstallmentExtra', { count: totalInstallments })}
          >
            <InputNumber<number>
              min={0}
              precision={0}
              className="w-full"
              placeholder="0"
              data-testid="koperasi-loan-migration-settled-installment-input"
            />
          </Form.Item>
        ) : (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Form.Item
              name="outstanding_principal_amount"
              label={t('cooperative.loans.migration.outstandingPrincipal')}
              rules={[
                { required: true, message: t('cooperative.loans.migration.validation.outstandingPrincipalRequired') },
                { type: 'number', min: 0, message: t('finance.amountMin') },
                {
                  type: 'number',
                  max: principalAmount || undefined,
                  message: t('cooperative.loans.migration.validation.outstandingPrincipalMax'),
                },
              ]}
              extra={principalAmount
                ? t('cooperative.loans.migration.outstandingPrincipalExtra', { amount: formatCurrencyInput(principalAmount) })
                : undefined}
            >
              <InputNumber<number>
                min={0}
                max={principalAmount || undefined}
                className="w-full"
                formatter={formatCurrencyInput}
                parser={parseCurrencyInput}
                placeholder="0"
                data-testid="koperasi-loan-migration-outstanding-principal-input"
              />
            </Form.Item>
            <Form.Item
              name="outstanding_interest_amount"
              label={t('cooperative.loans.migration.outstandingInterest')}
              rules={[
                { type: 'number', min: 0, message: t('finance.amountMin') },
                {
                  type: 'number',
                  max: totalInterest || undefined,
                  message: t('cooperative.loans.migration.validation.outstandingInterestMax'),
                },
              ]}
              extra={totalInterest
                ? t('cooperative.loans.migration.outstandingInterestMaxExtra', { amount: formatCurrencyInput(totalInterest) })
                : t('cooperative.loans.migration.outstandingInterestExtra')}
            >
              <InputNumber<number>
                min={0}
                max={totalInterest || undefined}
                className="w-full"
                formatter={formatCurrencyInput}
                parser={parseCurrencyInput}
                placeholder="0"
                data-testid="koperasi-loan-migration-outstanding-interest-input"
              />
            </Form.Item>
          </div>
        )}

        <Form.Item name="notes" label={t('cooperative.loans.form.notes')}>
          <TextArea rows={3} placeholder={t('cooperative.loans.form.notesPlaceholder')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
