import { Button, Empty, Input, Modal, Table, Tag, Typography } from 'antd';
import { Ban } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import { useI18n } from '@/hooks/useI18n';
import type { SalesInvoicePayment } from '@/types';
import {
  formatBaseCurrencyAmount,
  formatDocumentCurrencyAmount,
  isBaseCurrency,
  toDocumentCurrencyAmount,
} from '@/utils/documentCurrency';
import { formatDate } from '@/utils/formatters';
import {
  getSalesInvoicePaymentAllocatedAmount,
  getSalesInvoicePaymentOverpaymentAmount,
  getSalesInvoicePaymentRemainingOverpaymentAmount,
} from '@/utils/accountsReceivable/paymentAmounts';

const { Text } = Typography;

interface ReceivablePaymentHistoryProps {
  payments: SalesInvoicePayment[];
  loading?: boolean;
  onVoidPayment?: (paymentId: string, reason: string) => Promise<void>;
  allowVoid?: boolean;
}

export function ReceivablePaymentHistory({
  payments,
  loading,
  onVoidPayment,
  allowVoid = true,
}: ReceivablePaymentHistoryProps) {
  const { t } = useI18n();
  const renderPaymentAmount = (payment: SalesInvoicePayment) => {
    const displayAmount = payment.foreign_amount ?? toDocumentCurrencyAmount(payment.amount, payment);
    const isForeign = !isBaseCurrency(payment.currency_code, payment.base_currency_code);

    return (
      <span className={payment.status === 'VOIDED' ? 'line-through text-gray-400' : 'font-semibold'}>
        {formatDocumentCurrencyAmount(displayAmount, payment)}
        {isForeign && (
          <span className="block text-xs font-normal text-gray-500">
            {formatBaseCurrencyAmount(payment.amount || 0, payment)}
          </span>
        )}
      </span>
    );
  };

  const handleVoid = (payment: SalesInvoicePayment) => {
    if (!onVoidPayment) return;
    let voidReason = '';

    Modal.confirm({
      title: t('accountsReceivable.voidConfirmTitle'),
      content: (
        <div className="space-y-3">
          <Text type="secondary">
            {t('accountsReceivable.voidConfirmContent', {
              amount: formatDocumentCurrencyAmount(
                payment.foreign_amount ?? toDocumentCurrencyAmount(payment.amount, payment),
                payment,
              ),
              invoice: payment.document_number,
            })}
          </Text>
          <Input.TextArea
            rows={3}
            placeholder={t('accountsReceivable.voidReasonPlaceholder')}
            onChange={(event) => {
              voidReason = event.target.value;
            }}
          />
        </div>
      ),
      okText: t('accountsReceivable.voidPayment'),
      okButtonProps: { danger: true, loading },
      onOk: async () => {
        const normalizedReason = voidReason.trim();
        if (!normalizedReason) {
          throw new Error(t('accountsReceivable.voidReasonRequired'));
        }
        await onVoidPayment(payment.id, normalizedReason);
      },
    });
  };

  const columns: ColumnsType<SalesInvoicePayment> = [
    {
      title: t('accountsReceivable.paymentDate'),
      dataIndex: 'paid_at',
      width: 150,
      render: (value: string) => formatDate(value),
    },
    {
      title: t('accountsReceivable.paymentAmount'),
      dataIndex: 'amount',
      align: 'right',
      width: 150,
      render: (_value: number, record) => renderPaymentAmount(record),
    },
    {
      title: t('salesOverpayments.allocatedPayment'),
      key: 'allocated_amount',
      align: 'right',
      width: 150,
      render: (_, record) => `Rp ${getSalesInvoicePaymentAllocatedAmount(record).toLocaleString('id-ID')}`,
    },
    {
      title: t('salesOverpayments.remainingOverpayment'),
      key: 'overpayment_remaining_amount',
      align: 'right',
      width: 170,
      render: (_, record) => {
        const overpaymentAmount = getSalesInvoicePaymentOverpaymentAmount(record);
        if (overpaymentAmount <= 0) return '-';
        return `Rp ${getSalesInvoicePaymentRemainingOverpaymentAmount(record).toLocaleString('id-ID')}`;
      },
    },
    {
      title: t('checkout.method'),
      dataIndex: 'payment_method',
      width: 130,
      render: (value: SalesInvoicePayment['payment_method'], record) => (
        <div>
          <div>
            {record.source_type === 'CUSTOMER_CREDIT_ALLOCATION'
              ? t('salesOverpayments.method.invoiceAllocation')
              : value === 'NON_TUNAI'
                ? t('payment.nonCash')
                : t('payment.cash')}
          </div>
          {record.payment_channel && (
            <div className="text-xs text-gray-500">{record.payment_channel}</div>
          )}
        </div>
      ),
    },
    {
      title: t('accountsReceivable.cashAccount'),
      dataIndex: 'cash_account_name',
      width: 220,
      render: (_value: string | undefined, record) => (
        record.cash_account_code && record.cash_account_name
          ? `${record.cash_account_code} - ${record.cash_account_name}`
          : '-'
      ),
    },
    {
      title: t('salesDocuments.field.notes'),
      dataIndex: 'notes',
      render: (value?: string) => value || '-',
    },
    {
      title: t('accountsReceivable.financeTransaction'),
      dataIndex: 'finance_transaction_id',
      width: 170,
      render: (value?: string) => value ? <span className="font-mono text-xs">{value.slice(0, 8)}</span> : '-',
    },
    {
      title: t('accountsReceivable.journalEntry'),
      dataIndex: 'journal_entry_id',
      width: 150,
      render: (value?: string) => value ? <span className="font-mono text-xs">{value.slice(0, 8)}</span> : '-',
    },
    {
      title: t('salesDocuments.table.status'),
      dataIndex: 'status',
      width: 120,
      render: (value: SalesInvoicePayment['status'], record) => (
        <div className="space-y-1">
          {record.source_type === 'OPENING_RECEIVABLE' && (
            <Tag color="blue">{t('accountsReceivable.source.openingBalance')}</Tag>
          )}
          {record.source_type === 'CUSTOMER_CREDIT_ALLOCATION' && (
            <Tag color="cyan">{t('salesOverpayments.method.invoiceAllocation')}</Tag>
          )}
          <Tag color={value === 'ACTIVE' ? 'green' : 'red'}>
            {value === 'ACTIVE' ? t('accountsReceivable.paymentRecordStatus.active') : t('accountsReceivable.paymentRecordStatus.voided')}
          </Tag>
          {record.void_reason && (
            <div className="mt-1 text-xs text-gray-500">{record.void_reason}</div>
          )}
        </div>
      ),
    },
    ...(allowVoid ? [{
      title: '',
      key: 'action',
      fixed: 'right',
      width: 100,
      render: (_, record) => (
        <Button
          size="small"
          danger
          icon={<Ban size={14} />}
          disabled={record.status !== 'ACTIVE' || record.source_type === 'CUSTOMER_CREDIT_ALLOCATION'}
          onClick={() => handleVoid(record)}
        >
          {t('accountsReceivable.voidPayment')}
        </Button>
      ),
    } as ColumnsType<SalesInvoicePayment>[number]] : []),
  ];

  if (payments.length === 0) {
    return <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={t('accountsReceivable.noPaymentHistory')} />;
  }

  return (
    <Table
      size="small"
      rowKey="id"
      columns={columns}
      dataSource={payments}
      loading={loading}
      pagination={false}
      scroll={{ x: 1200 }}
    />
  );
}
