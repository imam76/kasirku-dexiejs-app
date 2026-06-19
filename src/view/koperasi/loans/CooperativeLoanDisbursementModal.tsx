import { Alert, Checkbox, DatePicker, Descriptions, Form, Input, Modal, Select, Tag, Typography } from 'antd';
import type { FormInstance } from 'antd';
import type { Dayjs } from 'dayjs';
import { useEffect, useMemo } from 'react';
import { useI18n } from '@/hooks/useI18n';
import dayjs from '@/lib/dayjs';
import type {
  ChartOfAccount,
  CooperativeLoan,
  EmployeeCollectionSchedule,
  PaymentMethod,
} from '@/types';
import { formatCurrency } from '@/utils/formatters';
import {
  findCollectionScheduleByWeekday,
  findMatchingCollectionSchedule,
  getCollectionWeekdayLabel,
  getFirstScheduledDueDate,
  resolveCollectionScheduleForDisbursement,
} from '@/utils/koperasi/collectionSchedule';

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
  fieldCashAccountIds: Set<string>;
  fieldCashBalances: Map<string, number>;
  collectionSchedules: EmployeeCollectionSchedule[];
  onCancel: () => void;
  onSubmit: (values: CooperativeLoanDisbursementFormValues) => void;
}

export default function CooperativeLoanDisbursementModal({
  form,
  loan,
  open,
  isSubmitting,
  paymentAccounts,
  fieldCashAccountIds,
  fieldCashBalances,
  collectionSchedules,
  onCancel,
  onSubmit,
}: CooperativeLoanDisbursementModalProps) {
  const { t } = useI18n();
  const selectedCashAccountId = Form.useWatch('cash_account_id', form);
  const selectedDisbursementDate = Form.useWatch('disbursement_date', form);
  const historicalEntry = Boolean(
    selectedDisbursementDate?.isBefore(dayjs().tz(), 'day'),
  );
  const accountOptions = useMemo(() => paymentAccounts.map((account) => ({
    value: account.id,
    label: `${account.code} - ${account.name}`,
  })), [paymentAccounts]);
  const selectedAccount = useMemo(() => (
    paymentAccounts.find((account) => account.id === selectedCashAccountId)
  ), [paymentAccounts, selectedCashAccountId]);
  const isDeductedLoan = loan?.deduction_method === 'DEDUCT_ON_DISBURSEMENT';
  const netDisbursementAmount = loan
    ? loan.net_disbursement_amount ?? loan.principal_amount
    : 0;
  const scheduleText = useMemo(() => Array.from(new Set(
    collectionSchedules
      .filter((schedule) => schedule.is_active)
      .map((schedule) => getCollectionWeekdayLabel(schedule.weekday)),
  )).join(', '), [collectionSchedules]);

  useEffect(() => {
    if (!loan || !selectedDisbursementDate) return;
    const resolvedSchedule = resolveCollectionScheduleForDisbursement({
      schedules: collectionSchedules,
      value: selectedDisbursementDate,
      allowHistoricalFallback: historicalEntry,
    });
    if (!resolvedSchedule) {
      form.setFieldValue('first_due_date', undefined);
      return;
    }
    form.setFieldValue('first_due_date', getFirstScheduledDueDate({
      disbursementDate: selectedDisbursementDate,
      frequency: loan.billing_frequency ?? 'MONTHLY',
      weekday: resolvedSchedule.weekday,
    }));
  }, [collectionSchedules, form, historicalEntry, loan, selectedDisbursementDate]);

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
        <Alert
          type="info"
          showIcon
          className="mb-4"
          message={historicalEntry
            ? t('cooperative.loans.historicalEntryInfo')
            : t('cooperative.loans.collectionScheduleInfo', {
                days: scheduleText || '-',
              })}
        />
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Form.Item
            name="disbursement_date"
            label={t('cooperative.loans.form.disbursementDate')}
            rules={[{ required: true, message: t('cooperative.loans.validation.disbursementDateRequired') }]}
          >
            <DatePicker
              showTime
              className="w-full"
              disabledDate={(current) => current.isBefore(dayjs().tz(), 'day')
                ? !findCollectionScheduleByWeekday(collectionSchedules, current)
                : !findMatchingCollectionSchedule(collectionSchedules, current)}
              data-testid="koperasi-loan-disbursement-date-input"
            />
          </Form.Item>
          <Form.Item
            name="first_due_date"
            label={t('cooperative.loans.form.firstDueDate')}
            rules={[{ required: true, message: t('cooperative.loans.validation.firstDueDateRequired') }]}
          >
            <DatePicker
              disabled={!historicalEntry}
              disabledDate={(current) => (
                selectedDisbursementDate
                  ? !current.isAfter(selectedDisbursementDate, 'day') ||
                    !findCollectionScheduleByWeekday(collectionSchedules, current)
                  : false
              )}
              className="w-full"
              data-testid="koperasi-loan-first-due-date-input"
            />
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

        {selectedAccount && fieldCashAccountIds.has(selectedAccount.id) && (
          <Tag color="green" className="mb-4">
            Kas Petugas {selectedAccount.code} - saldo Rp {formatCurrency(Number(fieldCashBalances.get(selectedAccount.id) || 0))}
          </Tag>
        )}

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
