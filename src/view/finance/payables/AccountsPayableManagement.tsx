import { useEffect, useMemo, useState } from 'react';
import { Button, Card, Col, DatePicker, Form, Input, InputNumber, Modal, Row, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { Dayjs } from 'dayjs';
import { Link } from '@tanstack/react-router';
import { useLiveQuery } from 'dexie-react-hooks';
import { AlertCircle, Clock, CreditCard, Eye, FileText, Search, Wallet, X } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import dayjs from '@/lib/dayjs';
import { getPurchaseDocumentTypePathSegment } from '@/configs/purchase-document';
import { useAccountsPayable, type AccountsPayableSummary } from '@/hooks/useAccountsPayable';
import { useI18n } from '@/hooks/useI18n';
import { db } from '@/lib/db';
import type { AccountsPayableRow, PaymentMethod, PurchaseInvoicePaymentStatus, ReceivableAgingBucket } from '@/types';
import type { RecordPurchaseInvoicePaymentInput } from '@/services/accountsPayableService';
import type { TranslationKey } from '@/i18n/messages';
import {
  formatDocumentCurrencyAmount,
  isBaseCurrency,
  toDocumentCurrencyAmount,
} from '@/utils/documentCurrency';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { purchaseInvoicePaymentStatusLabelKeys } from '@/utils/purchaseDocuments/i18n';

const { Title, Text } = Typography;

const agingLabelKeys: Record<ReceivableAgingBucket, TranslationKey> = {
  CURRENT: 'accountsPayable.status.current',
  OVERDUE_1_30: 'accountsPayable.status.overdue1To30',
  OVERDUE_31_60: 'accountsPayable.status.overdue31To60',
  OVERDUE_61_90: 'accountsPayable.status.overdue61To90',
  OVERDUE_90_PLUS: 'accountsPayable.status.overdue90Plus',
};

const agingColors: Record<ReceivableAgingBucket, string> = {
  CURRENT: 'green',
  OVERDUE_1_30: 'gold',
  OVERDUE_31_60: 'orange',
  OVERDUE_61_90: 'volcano',
  OVERDUE_90_PLUS: 'red',
};

const paymentStatusColors: Record<PurchaseInvoicePaymentStatus, string> = {
  UNPAID: 'red',
  PARTIAL: 'gold',
  PAID: 'green',
};

const renderPayableMoney = (
  value: number,
  row: AccountsPayableRow,
  foreignValue?: number,
  className = 'font-semibold',
) => {
  const displayValue = foreignValue ?? toDocumentCurrencyAmount(value, row);
  const isForeign = !isBaseCurrency(row.currency_code);

  return (
    <span className={className}>
      {formatDocumentCurrencyAmount(displayValue, row)}
      {isForeign && (
        <span className="block text-xs font-normal text-gray-500">
          Rp {formatCurrency(value || 0)}
        </span>
      )}
    </span>
  );
};

interface PayablePaymentFormValues {
  amount: number;
  paid_at: Dayjs;
  payment_method: PaymentMethod;
  cash_account_id?: string;
  payment_channel?: string;
  notes?: string;
}

function AccountsPayableSummaryCards({ summary }: { summary: AccountsPayableSummary }) {
  const { t } = useI18n();

  return (
    <Row gutter={[12, 12]}>
      <Col xs={24} sm={12} lg={6}>
        <Card size="small" className="border-l-4 border-l-emerald-600">
          <Statistic
            title={t('accountsPayable.totalOutstanding')}
            value={summary.total_outstanding}
            formatter={(value) => `Rp ${formatCurrency(Number(value))}`}
            prefix={<Wallet size={18} className="mr-2 text-emerald-700" />}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card size="small" className="border-l-4 border-l-blue-500">
          <Statistic
            title={t('accountsPayable.current')}
            value={summary.total_current}
            formatter={(value) => `Rp ${formatCurrency(Number(value))}`}
            prefix={<Clock size={18} className="mr-2 text-blue-600" />}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card size="small" className="border-l-4 border-l-rose-500">
          <Statistic
            title={t('accountsPayable.overdue')}
            value={summary.total_overdue}
            formatter={(value) => `Rp ${formatCurrency(Number(value))}`}
            prefix={<AlertCircle size={18} className="mr-2 text-rose-600" />}
          />
        </Card>
      </Col>
      <Col xs={24} sm={12} lg={6}>
        <Card size="small" className="border-l-4 border-l-slate-500">
          <Statistic
            title={t('accountsPayable.invoiceCount')}
            value={summary.open_invoice_count}
            suffix={`/ ${summary.invoice_count}`}
            prefix={<FileText size={18} className="mr-2 text-slate-600" />}
          />
        </Card>
      </Col>
    </Row>
  );
}

function PayablePaymentModal({
  open,
  row,
  loading,
  onCancel,
  onSubmit,
}: {
  open: boolean;
  row?: AccountsPayableRow;
  loading?: boolean;
  onCancel: () => void;
  onSubmit: (input: RecordPurchaseInvoicePaymentInput) => Promise<void>;
}) {
  const { t } = useI18n();
  const [form] = Form.useForm<PayablePaymentFormValues>();
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

  const handleFinish = async (values: PayablePaymentFormValues) => {
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

  return (
    <Modal
      title={t('accountsPayable.recordPayment')}
      open={open}
      onCancel={onCancel}
      okText={t('accountsPayable.recordPayment')}
      okButtonProps={{ loading, disabled: !row || row.balance_due <= 0 }}
      onOk={() => form.submit()}
      destroyOnClose
    >
      {row && (
        <div className="mb-4 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm">
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <Text type="secondary">{t('accountsPayable.invoiceNumber')}</Text>
              <div className="font-semibold">{row.document_number}</div>
            </div>
            <div>
              <Text type="secondary">{t('accountsPayable.supplier')}</Text>
              <div className="font-semibold">{row.supplier_name}</div>
            </div>
            <div>
              <Text type="secondary">{t('accountsPayable.totalInvoice')}</Text>
              {renderPayableMoney(row.total_amount, row, row.foreign_total_amount)}
            </div>
            <div>
              <Text type="secondary">{t('accountsPayable.balanceDue')}</Text>
              {renderPayableMoney(row.balance_due, row, row.foreign_balance_due, 'font-semibold text-rose-700')}
            </div>
            <div>
              <Text type="secondary">{t('accountsPayable.debitNote')}</Text>
              {renderPayableMoney(row.return_credit_amount, row, row.foreign_return_credit_amount)}
            </div>
          </div>
        </div>
      )}

      <Form form={form} layout="vertical" onFinish={handleFinish}>
        <Form.Item
          name="amount"
          label={t('accountsPayable.paymentAmount')}
          rules={[
            { required: true, message: t('finance.amountRequired') },
            {
              validator: async (_, value) => {
                const amount = Number(value || 0);
                if (amount <= 0) throw new Error(t('finance.amountMin'));
                if (row && amount > (row.foreign_balance_due ?? row.balance_due) + 0.01) {
                  throw new Error(t('accountsPayable.error.amountExceedsBalance'));
                }
              },
            },
          ]}
        >
          <InputNumber min={1} max={row?.foreign_balance_due ?? row?.balance_due} style={{ width: '100%' }} placeholder="0" />
        </Form.Item>
        <Form.Item
          name="paid_at"
          label={t('accountsPayable.paymentDate')}
          rules={[{ required: true, message: t('salesDocuments.validation.required', { field: t('accountsPayable.paymentDate') }) }]}
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
        <Form.Item name="cash_account_id" label={t('accountsPayable.cashAccount')}>
          <Select
            allowClear
            showSearch
            optionFilterProp="label"
            placeholder={t('accountsPayable.cashAccount')}
            options={accountOptions}
          />
        </Form.Item>
        <Form.Item name="payment_channel" label={t('accountsPayable.paymentChannel')}>
          <Input placeholder={t('accountsPayable.paymentChannelPlaceholder')} />
        </Form.Item>
        <Form.Item name="notes" label={t('salesDocuments.field.notes')}>
          <Input.TextArea rows={3} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

export default function AccountsPayableManagement() {
  const { t } = useI18n();
  const [searchText, setSearchText] = useState('');
  const [selectedPaymentRow, setSelectedPaymentRow] = useState<AccountsPayableRow>();
  const { payableRows, summary, recordPayment, isMutating } = useAccountsPayable({ search: searchText });

  const columns: ColumnsType<AccountsPayableRow> = [
    {
      title: t('accountsPayable.invoiceNumber'),
      dataIndex: 'document_number',
      fixed: 'left',
      width: 170,
      render: (value: string, record) => (
        <Link
          to="/purchases/$documentType/$documentId"
          params={{
            documentType: getPurchaseDocumentTypePathSegment('PURCHASE_INVOICE'),
            documentId: record.purchase_document_id,
          }}
        >
          {value}
        </Link>
      ),
    },
    { title: t('accountsPayable.supplier'), dataIndex: 'supplier_name', width: 190 },
    {
      title: t('accountsPayable.invoiceDate'),
      dataIndex: 'document_date',
      width: 130,
      render: (value: string) => formatDate(value),
    },
    {
      title: t('accountsPayable.dueDate'),
      dataIndex: 'due_date',
      width: 130,
      render: (value?: string) => value ? formatDate(value) : '-',
    },
    {
      title: t('accountsPayable.aging'),
      dataIndex: 'aging_bucket',
      width: 150,
      render: (value: ReceivableAgingBucket, record) => (
        <Space size={4} orientation="vertical">
          <Tag color={agingColors[value]}>{t(agingLabelKeys[value])}</Tag>
          {record.overdue_days > 0 && (
            <span className="text-[11px] text-gray-500">
              {t('accountsPayable.overdueDays', { days: record.overdue_days })}
            </span>
          )}
        </Space>
      ),
    },
    {
      title: t('accountsPayable.totalInvoice'),
      dataIndex: 'total_amount',
      align: 'right',
      width: 150,
      render: (value: number, record) => renderPayableMoney(value, record, record.foreign_total_amount),
    },
    {
      title: t('accountsPayable.paidAmount'),
      dataIndex: 'paid_amount',
      align: 'right',
      width: 150,
      render: (value: number, record) => renderPayableMoney(value, record, record.foreign_paid_amount),
    },
    {
      title: t('accountsPayable.debitNote'),
      dataIndex: 'return_credit_amount',
      align: 'right',
      width: 150,
      render: (value: number, record) => renderPayableMoney(value, record, record.foreign_return_credit_amount),
    },
    {
      title: t('accountsPayable.balanceDue'),
      dataIndex: 'balance_due',
      align: 'right',
      width: 150,
      render: (value: number, record) => (
        renderPayableMoney(
          value,
          record,
          record.foreign_balance_due,
          value > 0 ? 'font-semibold text-rose-700' : 'font-semibold text-emerald-700',
        )
      ),
    },
    {
      title: t('accountsPayable.paymentStatus'),
      dataIndex: 'payment_status',
      width: 130,
      render: (value: PurchaseInvoicePaymentStatus) => (
        <Tag color={paymentStatusColors[value]}>{t(purchaseInvoicePaymentStatusLabelKeys[value])}</Tag>
      ),
    },
    {
      title: t('accountsPayable.actions'),
      key: 'actions',
      fixed: 'right',
      width: 240,
      render: (_, record) => (
        <Space>
          <Button
            size="small"
            type="primary"
            icon={<CreditCard size={14} />}
            disabled={record.balance_due <= 0}
            onClick={() => setSelectedPaymentRow(record)}
          >
            {t('accountsPayable.recordPayment')}
          </Button>
          <Link
            to="/purchases/$documentType/$documentId"
            params={{
              documentType: getPurchaseDocumentTypePathSegment('PURCHASE_INVOICE'),
              documentId: record.purchase_document_id,
            }}
          >
            <Button size="small" icon={<Eye size={14} />} />
          </Link>
        </Space>
      ),
    },
  ];

  return (
    <div className="space-y-4 p-3 sm:p-4 md:p-6">
      <div>
        <Title level={2} style={{ margin: 0 }}>{t('accountsPayable.title')}</Title>
        <Text type="secondary">{t('accountsPayable.subtitle')}</Text>
      </div>

      <AccountsPayableSummaryCards summary={summary} />

      <Card size="small">
        <div className="grid gap-2 md:grid-cols-[minmax(220px,1fr)_auto]">
          <Input
            allowClear
            prefix={<Search size={14} />}
            placeholder={t('accountsPayable.searchPlaceholder')}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <Button icon={<X size={14} />} onClick={() => setSearchText('')}>
            {t('common.reset')}
          </Button>
        </div>
      </Card>

      <Table
        rowKey="purchase_document_id"
        columns={columns}
        dataSource={payableRows}
        scroll={{ x: 1550 }}
        pagination={{ pageSize: 10, showSizeChanger: true }}
      />

      <PayablePaymentModal
        open={Boolean(selectedPaymentRow)}
        row={selectedPaymentRow}
        loading={isMutating}
        onCancel={() => setSelectedPaymentRow(undefined)}
        onSubmit={async (input) => {
          if (!selectedPaymentRow) return;
          await recordPayment({ invoiceId: selectedPaymentRow.purchase_document_id, input });
          setSelectedPaymentRow(undefined);
        }}
      />
    </div>
  );
}
