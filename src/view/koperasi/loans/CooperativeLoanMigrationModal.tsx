import { Alert, Checkbox, DatePicker, Descriptions, Divider, Form, Input, InputNumber, Modal, Radio, Select, Typography } from 'antd';
import type { FormInstance } from 'antd';
import type { Dayjs } from 'dayjs';
import { useEffect, useMemo } from 'react';
import { useI18n } from '@/hooks/useI18n';
import dayjs from '@/lib/dayjs';
import type {
  CooperativeCollectionWeekday,
  CooperativeLoanBillingFrequency,
  CooperativeLoanInterestCalculationType,
  CooperativeMember,
  EmployeeCollectionSchedule,
} from '@/types';
import {
  getCollectionWeekdayLabel,
  getFirstScheduledDueDate,
  getIsoWeekday,
  getNextCollectionDateForWeekday,
  getNextDateForWeekday,
} from '@/utils/koperasi/collectionSchedule';
import {
  cooperativeLoanBillingFrequencyOptions,
  cooperativeLoanCalculationTypeOptions,
} from './loanOptions';

const { TextArea } = Input;
const { Text } = Typography;

export type CooperativeLoanMigrationInputMode = 'DETAILED' | 'TOTAL_PAYABLE';
export type CooperativeLoanMigrationSettledMode = 'INSTALLMENT' | 'PRINCIPAL' | 'TOTAL';

export interface CooperativeLoanMigrationFormValues {
  member_id: string;
  application_date: Dayjs;
  disbursement_date: Dayjs;
  collection_weekday: CooperativeCollectionWeekday;
  scheduled_disbursement_date: Dayjs;
  first_due_date: Dayjs;
  migration_input_mode: CooperativeLoanMigrationInputMode;
  total_payable_amount?: number;
  remaining_total_amount?: number;
  interest_calculation_type: CooperativeLoanInterestCalculationType;
  principal_amount: number;
  interest_rate_per_month?: number;
  tenor_months?: number;
  loan_service_rate?: number;
  admin_fee_rate?: number;
  mandatory_saving_rate?: number;
  remember_total_percent_rates?: boolean;
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
  const selectedDisbursementDate = Form.useWatch('disbursement_date', form);
  const selectedCollectionWeekday = Form.useWatch('collection_weekday', form);
  const selectedScheduledDisbursementDate = Form.useWatch('scheduled_disbursement_date', form);
  const selectedBillingFrequency = Form.useWatch('billing_frequency', form);
  const inputMode = Form.useWatch('migration_input_mode', form) ?? 'DETAILED';
  const calculationType = Form.useWatch('interest_calculation_type', form) ?? 'MONTHLY_RATE';
  const settledMode = Form.useWatch('settled_mode', form) ?? 'INSTALLMENT';
  const tenorMonths = Number(Form.useWatch('tenor_months', form) || 0);
  const installmentCount = Number(Form.useWatch('installment_count', form) || 0);
  const totalInstallments = inputMode === 'TOTAL_PAYABLE'
    ? installmentCount
    : calculationType === 'MONTHLY_RATE'
      ? tenorMonths
      : installmentCount;

  const principalAmount = Number(Form.useWatch('principal_amount', form) || 0);
  const totalPayableAmount = Number(Form.useWatch('total_payable_amount', form) || 0);
  const remainingTotalAmount = Number(Form.useWatch('remaining_total_amount', form) || 0);
  const interestRatePerMonth = Number(Form.useWatch('interest_rate_per_month', form) || 0);
  const loanServiceRate = Number(Form.useWatch('loan_service_rate', form) || 0);
  // Batas atas sisa migrasi = total bunga pinjaman. Flat: pokok x bunga%/bln x tenor.
  // Total-percent: pokok x jasa%. Dipakai sebagai `max` input agar sisa tak melebihi total bunga.
  const totalInterest = calculationType === 'MONTHLY_RATE'
    ? Math.round(principalAmount * (interestRatePerMonth / 100) * tenorMonths)
    : Math.round(principalAmount * (loanServiceRate / 100));
  const calculatedTotalPayableAmount = Math.round((principalAmount + totalInterest + Number.EPSILON) * 100) / 100;

  const memberOptions = useMemo(() => activeMembers.map((member) => ({
    value: member.id,
    label: `${member.member_number} - ${member.name}`,
  })), [activeMembers]);
  const scheduleText = useMemo(() => Array.from(new Set(
    collectionSchedules
      .filter((schedule) => schedule.is_active)
      .map((schedule) => getCollectionWeekdayLabel(schedule.weekday)),
  )).join(', '), [collectionSchedules]);
  const collectionWeekdayOptions = useMemo(() => Array.from(
    new Map(
      collectionSchedules
        .filter((schedule) => schedule.is_active)
        .map((schedule) => [schedule.weekday, schedule] as const),
    ).values(),
  )
    .sort((left, right) => left.weekday - right.weekday)
    .map((schedule) => ({
      value: schedule.weekday,
      label: getCollectionWeekdayLabel(schedule.weekday),
    })), [collectionSchedules]);
  const hasCollectionSchedule = collectionWeekdayOptions.length > 0;

  useEffect(() => {
    if (!selectedMemberId || !hasCollectionSchedule) return;
    if (collectionWeekdayOptions.some((option) => option.value === selectedCollectionWeekday)) return;
    form.setFieldValue('collection_weekday', collectionWeekdayOptions[0].value);
  }, [collectionWeekdayOptions, form, hasCollectionSchedule, selectedCollectionWeekday, selectedMemberId]);

  useEffect(() => {
    if (!selectedDisbursementDate || !selectedCollectionWeekday) {
      form.setFieldValue('scheduled_disbursement_date', undefined);
      form.setFieldValue('first_due_date', undefined);
      return;
    }

    const historicalEntry = selectedDisbursementDate.isBefore(dayjs().tz(), 'day');
    const scheduledDate = historicalEntry
      ? getNextDateForWeekday(selectedDisbursementDate, selectedCollectionWeekday, true)
      : getNextCollectionDateForWeekday(
          collectionSchedules,
          selectedDisbursementDate,
          selectedCollectionWeekday,
          true,
        );
    form.setFieldValue('scheduled_disbursement_date', scheduledDate);
  }, [collectionSchedules, form, selectedCollectionWeekday, selectedDisbursementDate]);

  useEffect(() => {
    if (!selectedScheduledDisbursementDate || !selectedCollectionWeekday) {
      form.setFieldValue('first_due_date', undefined);
      return;
    }

    form.setFieldValue('first_due_date', getFirstScheduledDueDate({
      disbursementDate: selectedScheduledDisbursementDate,
      frequency: inputMode === 'TOTAL_PAYABLE' || calculationType === 'TOTAL_PERCENT'
        ? (selectedBillingFrequency ?? 'MONTHLY')
        : 'MONTHLY',
      weekday: selectedCollectionWeekday,
    }));
  }, [
    calculationType,
    form,
    inputMode,
    selectedBillingFrequency,
    selectedCollectionWeekday,
    selectedScheduledDisbursementDate,
  ]);

  const totalPayablePreview = useMemo(() => {
    const previewTotalPayable = inputMode === 'TOTAL_PAYABLE'
      ? totalPayableAmount
      : calculatedTotalPayableAmount;
    if (
      !['TOTAL_PAYABLE', 'TOTAL'].includes(inputMode === 'TOTAL_PAYABLE' ? 'TOTAL_PAYABLE' : settledMode) ||
      previewTotalPayable <= 0 ||
      totalInstallments <= 0
    ) {
      return undefined;
    }
    const installmentAmount = Math.round((previewTotalPayable / totalInstallments + Number.EPSILON) * 100) / 100;
    const paidAmount = Math.max(0, Math.round((previewTotalPayable - remainingTotalAmount + Number.EPSILON) * 100) / 100);
    const paidThrough = installmentAmount > 0
      ? Math.min(totalInstallments, Math.floor((paidAmount + 0.01) / installmentAmount))
      : 0;
    const partialAmount = installmentAmount > 0
      ? Math.round((paidAmount - (paidThrough * installmentAmount) + Number.EPSILON) * 100) / 100
      : 0;
    const partialInstallment = partialAmount > 0.01 && paidThrough < totalInstallments
      ? paidThrough + 1
      : undefined;

    return {
      installmentAmount,
      paidThrough,
      partialAmount: partialInstallment ? partialAmount : 0,
      partialInstallment,
    };
  }, [calculatedTotalPayableAmount, inputMode, remainingTotalAmount, settledMode, totalInstallments, totalPayableAmount]);

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
              onChange={() => {
                form.setFieldValue('collection_weekday', undefined);
                form.setFieldValue('scheduled_disbursement_date', undefined);
                form.setFieldValue('first_due_date', undefined);
              }}
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
            extra={selectedMemberId
              ? hasCollectionSchedule
                ? t('cooperative.loans.collectionScheduleInfo', { days: scheduleText })
                : t('cooperative.loans.collectionScheduleMissing')
              : t('cooperative.loans.migration.disbursementDateMemberFirst')}
          >
            <DatePicker
              showTime
              className="w-full"
              disabled={!selectedMemberId || !hasCollectionSchedule}
              data-testid="koperasi-loan-migration-date-input"
            />
          </Form.Item>
          <Form.Item
            name="collection_weekday"
            label={t('cooperative.loans.form.collectionWeekday')}
            rules={[{ required: true, message: t('cooperative.loans.validation.collectionWeekdayRequired') }]}
          >
            <Select
              disabled={!selectedMemberId || !hasCollectionSchedule}
              options={collectionWeekdayOptions}
              data-testid="koperasi-loan-migration-collection-weekday-select"
            />
          </Form.Item>
          <Form.Item name="scheduled_disbursement_date" hidden>
            <DatePicker />
          </Form.Item>
          <Form.Item
            name="first_due_date"
            label={t('cooperative.loans.form.firstDueDate')}
            rules={[{ required: true, message: t('cooperative.loans.validation.firstDueDateRequired') }]}
          >
            <DatePicker
              disabledDate={(current) => (
                selectedDisbursementDate && selectedScheduledDisbursementDate && selectedCollectionWeekday
                  ? !current.isAfter(selectedDisbursementDate, 'day') ||
                    current.isBefore(selectedScheduledDisbursementDate, 'day') ||
                    getIsoWeekday(current) !== selectedCollectionWeekday
                  : true
              )}
              className="w-full"
              data-testid="koperasi-loan-migration-first-due-date-input"
            />
          </Form.Item>
        </div>

        <Divider>{t('cooperative.loans.migration.inputModeTitle')}</Divider>
        <Form.Item name="migration_input_mode" className="mb-3">
          <Radio.Group data-testid="koperasi-loan-migration-input-mode">
            <Radio value="DETAILED">{t('cooperative.loans.migration.inputMode.detailed')}</Radio>
            <Radio value="TOTAL_PAYABLE">{t('cooperative.loans.migration.inputMode.totalPayable')}</Radio>
          </Radio.Group>
        </Form.Item>

        {inputMode === 'TOTAL_PAYABLE' ? (
          <>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <Form.Item
                name="total_payable_amount"
                label={t('cooperative.loans.migration.totalPayableAmount')}
                rules={[
                  { required: true, message: t('cooperative.loans.migration.validation.totalPayableRequired') },
                  { type: 'number', min: 1, message: t('finance.amountMin') },
                ]}
              >
                <InputNumber<number>
                  min={1}
                  className="w-full"
                  formatter={formatCurrencyInput}
                  parser={parseCurrencyInput}
                  placeholder="0"
                  data-testid="koperasi-loan-migration-total-payable-input"
                />
              </Form.Item>
              <Form.Item
                name="remaining_total_amount"
                label={t('cooperative.loans.migration.remainingTotalAmount')}
                rules={[
                  { required: true, message: t('cooperative.loans.migration.validation.remainingTotalRequired') },
                  { type: 'number', min: 0, message: t('cooperative.loans.migration.validation.remainingTotalMin') },
                  {
                    type: 'number',
                    max: totalPayableAmount || undefined,
                    message: t('cooperative.loans.migration.validation.remainingTotalMax'),
                  },
                ]}
              >
                <InputNumber<number>
                  min={0}
                  max={totalPayableAmount || undefined}
                  className="w-full"
                  formatter={formatCurrencyInput}
                  parser={parseCurrencyInput}
                  placeholder="0"
                  data-testid="koperasi-loan-migration-remaining-total-input"
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
                  placeholder="12"
                  data-testid="koperasi-loan-migration-total-installment-count-input"
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
                  data-testid="koperasi-loan-migration-total-billing-frequency-select"
                />
              </Form.Item>
            </div>
            {totalPayablePreview && (
              <Descriptions size="small" bordered column={{ xs: 1, sm: 2 }} className="mb-4">
                <Descriptions.Item label={t('cooperative.loans.preview.installmentAmount')}>
                  {formatCurrencyInput(totalPayablePreview.installmentAmount)}
                </Descriptions.Item>
                <Descriptions.Item label={t('cooperative.loans.migration.preview.paidThrough')}>
                  {totalPayablePreview.paidThrough}
                </Descriptions.Item>
                <Descriptions.Item label={t('cooperative.loans.migration.preview.partialInstallment')}>
                  {totalPayablePreview.partialInstallment ?? '-'}
                </Descriptions.Item>
                <Descriptions.Item label={t('cooperative.loans.migration.preview.partialAmount')}>
                  {formatCurrencyInput(totalPayablePreview.partialAmount)}
                </Descriptions.Item>
              </Descriptions>
            )}
          </>
        ) : (
          <>
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
                <Form.Item
                  name="remember_total_percent_rates"
                  valuePropName="checked"
                  className="mb-4"
                >
                  <Checkbox data-testid="koperasi-loan-migration-remember-total-percent-rates-checkbox">
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
          </>
        )}

        {inputMode === 'DETAILED' && (
          <>
            <Divider>{t('cooperative.loans.migration.positionTitle')}</Divider>
            <Text type="secondary" className="mb-3 block">{t('cooperative.loans.migration.positionHint')}</Text>

            <Form.Item name="settled_mode" className="mb-3">
              <Radio.Group data-testid="koperasi-loan-migration-settled-mode">
                <Radio value="INSTALLMENT">{t('cooperative.loans.migration.settledByInstallment')}</Radio>
                <Radio value="PRINCIPAL">{t('cooperative.loans.migration.settledByPrincipal')}</Radio>
                <Radio value="TOTAL">{t('cooperative.loans.migration.settledByTotal')}</Radio>
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
            ) : settledMode === 'PRINCIPAL' ? (
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
            ) : (
              <>
                <Form.Item
                  name="remaining_total_amount"
                  label={t('cooperative.loans.migration.remainingTotalAmount')}
                  rules={[
                    { required: true, message: t('cooperative.loans.migration.validation.remainingTotalRequired') },
                    { type: 'number', min: 0, message: t('cooperative.loans.migration.validation.remainingTotalMin') },
                    {
                      type: 'number',
                      max: calculatedTotalPayableAmount || undefined,
                      message: t('cooperative.loans.migration.validation.remainingTotalMax'),
                    },
                  ]}
                  extra={calculatedTotalPayableAmount
                    ? t('cooperative.loans.migration.remainingTotalExtra', { amount: formatCurrencyInput(calculatedTotalPayableAmount) })
                    : undefined}
                >
                  <InputNumber<number>
                    min={0}
                    max={calculatedTotalPayableAmount || undefined}
                    className="w-full"
                    formatter={formatCurrencyInput}
                    parser={parseCurrencyInput}
                    placeholder="0"
                    data-testid="koperasi-loan-migration-remaining-total-detailed-input"
                  />
                </Form.Item>
                {totalPayablePreview && (
                  <Descriptions size="small" bordered column={{ xs: 1, sm: 2 }} className="mb-4">
                    <Descriptions.Item label={t('cooperative.loans.preview.installmentAmount')}>
                      {formatCurrencyInput(totalPayablePreview.installmentAmount)}
                    </Descriptions.Item>
                    <Descriptions.Item label={t('cooperative.loans.migration.preview.paidThrough')}>
                      {totalPayablePreview.paidThrough}
                    </Descriptions.Item>
                    <Descriptions.Item label={t('cooperative.loans.migration.preview.partialInstallment')}>
                      {totalPayablePreview.partialInstallment ?? '-'}
                    </Descriptions.Item>
                    <Descriptions.Item label={t('cooperative.loans.migration.preview.partialAmount')}>
                      {formatCurrencyInput(totalPayablePreview.partialAmount)}
                    </Descriptions.Item>
                  </Descriptions>
                )}
              </>
            )}
          </>
        )}

        <Form.Item name="notes" label={t('cooperative.loans.form.notes')}>
          <TextArea rows={3} placeholder={t('cooperative.loans.form.notesPlaceholder')} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
