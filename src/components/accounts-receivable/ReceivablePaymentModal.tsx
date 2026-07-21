import { useEffect, useMemo } from 'react';
import { DatePicker, Form, Input, InputNumber, Modal, Select, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from '@/lib/dayjs';
import { useLiveQuery } from 'dexie-react-hooks';
import { useI18n } from '@/hooks/useI18n';
import { db } from '@/lib/db';
import type { AccountsReceivableRow, PaymentMethod } from '@/types';
import type { RecordSalesInvoicePaymentInput } from '@/services/accountsReceivableService';
import {
  formatBaseCurrencyAmount,
  formatDocumentCurrencyAmount,
  isBaseCurrency,
  toDocumentCurrencyAmount,
} from '@/utils/documentCurrency';
import { formatDate } from '@/utils/formatters';

const { Text } = Typography;

interface ReceivablePaymentModalProps {
  open: boolean;
  row?: AccountsReceivableRow;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (input: RecordSalesInvoicePaymentInput) => Promise<void>;
}

interface PaymentFormValues {
  amount: number;
  paid_at: Dayjs;
  payment_method: PaymentMethod;
  cash_account_id?: string;
  payment_channel?: string;
  notes?: string;
}

export function ReceivablePaymentModal({
  open,
  row,
  loading,
  onCancel,
  onSubmit,
}: ReceivablePaymentModalProps) {
  const { t } = useI18n();
  const [form] = Form.useForm<PaymentFormValues>();
  const watchedAmount = Form.useWatch('amount', form);
  const paymentAccounts = useLiveQuery(
    () => db.chartOfAccounts
      .where('type')
      .equals('ASSET')
      .filter((account) => account.is_active && account.is_postable)
      .toArray(),
    [],
    [],
  );
  const accountOptions = useMemo(() => paymentAccounts.map((account) => ({
    value: account.id,
    label: `${account.code} - ${account.name}`,
  })), [paymentAccounts]);
  const renderMoney = (value: number, row: AccountsReceivableRow, foreignValue?: number, className = 'font-semibold') => {
    const displayValue = foreignValue ?? toDocumentCurrencyAmount(value, row);
    const isForeign = !isBaseCurrency(row.currency_code, row.base_currency_code);

    return (
      <div className={className}>
        {formatDocumentCurrencyAmount(displayValue, row)}
        {isForeign && (
          <div className="text-xs font-normal text-gray-500">
            {formatBaseCurrencyAmount(value || 0, row)}
          </div>
        )}
      </div>
    );
  };

  useEffect(() => {
    if (!open || !row) return;
    form.setFieldsValue({
      amount: row.foreign_balance_due ?? row.balance_due,
      paid_at: dayjs(),
      payment_method: 'TUNAI',
      cash_account_id: undefined,
      payment_channel: undefined,
      notes: undefined,
    });
  }, [form, open, row]);

  const handleFinish = async (values: PaymentFormValues) => {
    await onSubmit({
      amount: Number(values.amount || 0),
      paid_at: values.paid_at?.toISOString() ?? new Date().toISOString(),
      payment_method: values.payment_method,
      cash_account_id: values.cash_account_id,
      payment_channel: values.payment_channel,
      notes: values.notes,
    });
    form.resetFields();
  };
  const overpaymentPreview = row
    ? Math.max(0, Number(watchedAmount || 0) - Number(row.foreign_balance_due ?? row.balance_due ?? 0))
    : 0;

  return (
    <Modal
      title={t('accountsReceivable.recordPayment')}
      open={open}
      onCancel={onCancel}
      okText={t('accountsReceivable.recordPayment')}
      okButtonProps={{ loading, disabled: !row || row.balance_due <= 0 }}
      onOk={() => form.submit()}
      destroyOnClose
    >
      {row && (
        <div className="mb-4 rounded-lg border border-blue-100 bg-blue-50 px-4 py-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Text type="secondary">{t('accountsReceivable.invoiceNumber')}</Text>
              <div className="font-semibold">{row.document_number}</div>
            </div>
            <div>
              <Text type="secondary">{t('accountsReceivable.customer')}</Text>
              <div className="font-semibold">{row.customer_name}</div>
            </div>
            <div>
              <Text type="secondary">{t('accountsReceivable.totalInvoice')}</Text>
              {renderMoney(row.total_amount, row, row.foreign_total_amount)}
            </div>
            <div>
              <Text type="secondary">{t('accountsReceivable.balanceDue')}</Text>
              {renderMoney(row.balance_due, row, row.foreign_balance_due, 'font-semibold text-rose-700')}
            </div>
            {row.due_date && (
              <div>
                <Text type="secondary">{t('accountsReceivable.dueDate')}</Text>
                <div className="font-semibold">{formatDate(row.due_date)}</div>
              </div>
            )}
            <div>
              <Text type="secondary">{t('accountsReceivable.creditNote')}</Text>
              {renderMoney(row.return_credit_amount, row, row.foreign_return_credit_amount)}
            </div>
          </div>
        </div>
      )}

      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item
          name="amount"
          label={t('accountsReceivable.paymentAmount')}
          rules={[
            { required: true, message: t('finance.amountRequired') },
            {
              validator: async (_, value) => {
                const amount = Number(value || 0);
                if (amount <= 0) throw new Error(t('finance.amountMin'));
              },
            },
          ]}
        >
          <InputNumber
            min={1}
            style={{ width: '100%' }}
            placeholder="0"
          />
        </Form.Item>

        {row && overpaymentPreview > 0.01 && (
          <div className="mb-4 rounded-lg border border-amber-100 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            {t('salesOverpayments.initialOverpayment')}: {formatDocumentCurrencyAmount(overpaymentPreview, row)}
          </div>
        )}

        <Form.Item
          name="paid_at"
          label={t('accountsReceivable.paymentDate')}
          rules={[{ required: true, message: t('salesDocuments.validation.required', { field: t('accountsReceivable.paymentDate') }) }]}
        >
          <DatePicker showTime style={{ width: '100%' }} />
        </Form.Item>

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
          />
        </Form.Item>

        <Form.Item name="cash_account_id" label={t('accountsReceivable.cashAccount')}>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('accountsReceivable.cashAccount')}
            options={accountOptions}
          />
        </Form.Item>

        <Form.Item name="payment_channel" label={t('accountsReceivable.paymentChannel')}>
          <Input placeholder={t('accountsReceivable.paymentChannelPlaceholder')} />
        </Form.Item>

        <Form.Item name="notes" label={t('salesDocuments.field.notes')}>
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
