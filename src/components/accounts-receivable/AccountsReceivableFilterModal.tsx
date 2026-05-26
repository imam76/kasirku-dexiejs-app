import { useEffect } from 'react';
import { DatePicker, Form, Modal, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from '@/lib/dayjs';
import { useI18n } from '@/hooks/useI18n';
import type { ReceivableAgingBucket, SalesInvoicePaymentStatus } from '@/types';

const { RangePicker } = DatePicker;

export type PaymentStatusFilter = SalesInvoicePaymentStatus | 'ALL';
export type AgingFilter = ReceivableAgingBucket | 'ALL';

export interface AccountsReceivableFilterValues {
  paymentStatus: PaymentStatusFilter;
  agingBucket: AgingFilter;
  invoiceDateFrom?: string;
  invoiceDateTo?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
}

interface AccountsReceivableFilterModalProps {
  open: boolean;
  value: AccountsReceivableFilterValues;
  onApply: (value: AccountsReceivableFilterValues) => void;
  onCancel: () => void;
  onReset: () => void;
}

interface FilterFormValues {
  paymentStatus: PaymentStatusFilter;
  agingBucket: AgingFilter;
  invoiceDateRange?: [Dayjs, Dayjs];
  dueDateRange?: [Dayjs, Dayjs];
}

const toDateRange = (from?: string, to?: string): [Dayjs, Dayjs] | undefined => {
  if (!from || !to) return undefined;
  return [dayjs(from), dayjs(to)];
};

export function AccountsReceivableFilterModal({
  open,
  value,
  onApply,
  onCancel,
  onReset,
}: AccountsReceivableFilterModalProps) {
  const { t } = useI18n();
  const [form] = Form.useForm<FilterFormValues>();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      paymentStatus: value.paymentStatus,
      agingBucket: value.agingBucket,
      invoiceDateRange: toDateRange(value.invoiceDateFrom, value.invoiceDateTo),
      dueDateRange: toDateRange(value.dueDateFrom, value.dueDateTo),
    });
  }, [form, open, value]);

  const handleFinish = (values: FilterFormValues) => {
    onApply({
      paymentStatus: values.paymentStatus,
      agingBucket: values.agingBucket,
      invoiceDateFrom: values.invoiceDateRange?.[0]?.format('YYYY-MM-DD'),
      invoiceDateTo: values.invoiceDateRange?.[1]?.format('YYYY-MM-DD'),
      dueDateFrom: values.dueDateRange?.[0]?.format('YYYY-MM-DD'),
      dueDateTo: values.dueDateRange?.[1]?.format('YYYY-MM-DD'),
    });
  };

  return (
    <Modal
      title={t('accountsReceivable.filterTitle')}
      open={open}
      onCancel={onCancel}
      okText={t('accountsReceivable.applyFilter')}
      onOk={() => form.submit()}
      cancelText={t('common.cancel')}
      destroyOnClose
      afterClose={() => form.resetFields()}
    >
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item name="paymentStatus" label={t('accountsReceivable.paymentStatus')}>
          <Select
            options={[
              { value: 'ALL', label: t('accountsReceivable.allPaymentStatuses') },
              { value: 'UNPAID', label: t('salesDocuments.paymentStatus.unpaid') },
              { value: 'PARTIAL', label: t('salesDocuments.paymentStatus.partial') },
              { value: 'PAID', label: t('salesDocuments.paymentStatus.paid') },
            ]}
          />
        </Form.Item>

        <Form.Item name="agingBucket" label={t('accountsReceivable.aging')}>
          <Select
            options={[
              { value: 'ALL', label: t('accountsReceivable.allAging') },
              { value: 'CURRENT', label: t('accountsReceivable.status.current') },
              { value: 'OVERDUE_1_30', label: t('accountsReceivable.status.overdue1To30') },
              { value: 'OVERDUE_31_60', label: t('accountsReceivable.status.overdue31To60') },
              { value: 'OVERDUE_61_90', label: t('accountsReceivable.status.overdue61To90') },
              { value: 'OVERDUE_90_PLUS', label: t('accountsReceivable.status.overdue90Plus') },
            ]}
          />
        </Form.Item>

        <Form.Item name="invoiceDateRange" label={t('accountsReceivable.invoiceDate')}>
          <RangePicker
            style={{ width: '100%' }}
            placeholder={[t('accountsReceivable.invoiceDateFrom'), t('accountsReceivable.invoiceDateTo')]}
          />
        </Form.Item>

        <Form.Item name="dueDateRange" label={t('accountsReceivable.dueDate')}>
          <RangePicker
            style={{ width: '100%' }}
            placeholder={[t('accountsReceivable.dueDateFrom'), t('accountsReceivable.dueDateTo')]}
          />
        </Form.Item>

        <button
          type="button"
          className="border-0 bg-transparent p-0 text-sm font-medium text-blue-600"
          onClick={() => {
            form.resetFields();
            onReset();
          }}
        >
          {t('common.reset')}
        </button>
      </Form>
    </Modal>
  );
}
