import { useEffect } from 'react';
import { Button, DatePicker, Form, Modal, Select } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from '@/lib/dayjs';
import { useI18n } from '@/hooks/useI18n';
import type { AccountsAgingReportFilters } from '@/hooks/useReports';

const { RangePicker } = DatePicker;

export interface AgingReportAdvancedFilters {
  asOfDate: string;
  paymentStatus: AccountsAgingReportFilters['paymentStatus'];
  agingBucket: AccountsAgingReportFilters['agingBucket'];
  invoiceDateFrom?: string;
  invoiceDateTo?: string;
  dueDateFrom?: string;
  dueDateTo?: string;
}

interface AgingReportFilterModalProps {
  open: boolean;
  value: AgingReportAdvancedFilters;
  onApply: (value: AgingReportAdvancedFilters) => void;
  onCancel: () => void;
  onReset: () => void;
}

interface FilterFormValues {
  asOfDate: Dayjs;
  paymentStatus: AgingReportAdvancedFilters['paymentStatus'];
  agingBucket: AgingReportAdvancedFilters['agingBucket'];
  invoiceDateRange?: [Dayjs, Dayjs];
  dueDateRange?: [Dayjs, Dayjs];
}

const toDateRange = (from?: string, to?: string): [Dayjs, Dayjs] | undefined => {
  if (!from || !to) return undefined;
  return [dayjs(from), dayjs(to)];
};

export function AgingReportFilterModal({
  open,
  value,
  onApply,
  onCancel,
  onReset,
}: AgingReportFilterModalProps) {
  const { t } = useI18n();
  const [form] = Form.useForm<FilterFormValues>();

  useEffect(() => {
    if (!open) return;
    form.setFieldsValue({
      asOfDate: dayjs(value.asOfDate),
      paymentStatus: value.paymentStatus,
      agingBucket: value.agingBucket,
      invoiceDateRange: toDateRange(value.invoiceDateFrom, value.invoiceDateTo),
      dueDateRange: toDateRange(value.dueDateFrom, value.dueDateTo),
    });
  }, [form, open, value]);

  const handleFinish = (values: FilterFormValues) => {
    onApply({
      asOfDate: values.asOfDate?.format('YYYY-MM-DD') ?? dayjs.tz().format('YYYY-MM-DD'),
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
      title={t('report.aging.filterTitle')}
      open={open}
      onCancel={onCancel}
      footer={[
        <Button
          key="reset"
          onClick={() => {
            form.resetFields();
            onReset();
          }}
        >
          {t('common.reset')}
        </Button>,
        <Button key="apply" type="primary" onClick={() => form.submit()}>
          {t('report.aging.applyFilter')}
        </Button>,
      ]}
      destroyOnClose
      afterClose={() => form.resetFields()}
    >
      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item name="asOfDate" label={t('report.aging.asOfDate')}>
          <DatePicker
            allowClear={false}
            format="YYYY-MM-DD"
            style={{ width: '100%' }}
          />
        </Form.Item>

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
              { value: 'CURRENT', label: t('report.aging.bucket.current') },
              { value: 'OVERDUE_1_30', label: t('report.aging.bucket.overdue1To30') },
              { value: 'OVERDUE_31_60', label: t('report.aging.bucket.overdue31To60') },
              { value: 'OVERDUE_61_90', label: t('report.aging.bucket.overdue61To90') },
              { value: 'OVERDUE_90_PLUS', label: t('report.aging.bucket.overdue90Plus') },
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
      </Form>
    </Modal>
  );
}
