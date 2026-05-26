import { Button, Space, Table, Tag } from 'antd';
import { Link } from '@tanstack/react-router';
import { CreditCard, Eye } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import { getSalesDocumentTypePathSegment } from '@/configs/sales-document';
import { useI18n } from '@/hooks/useI18n';
import type { TranslationKey } from '@/i18n/messages';
import type { AccountsReceivableRow, ReceivableAgingBucket, SalesInvoicePaymentStatus } from '@/types';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { salesInvoicePaymentStatusLabelKeys } from '@/utils/salesDocuments/i18n';

interface AccountsReceivableTableProps {
  rows: AccountsReceivableRow[];
  loading?: boolean;
  onRecordPayment: (row: AccountsReceivableRow) => void;
}

const agingLabelKeys: Record<ReceivableAgingBucket, TranslationKey> = {
  CURRENT: 'accountsReceivable.status.current',
  OVERDUE_1_30: 'accountsReceivable.status.overdue1To30',
  OVERDUE_31_60: 'accountsReceivable.status.overdue31To60',
  OVERDUE_61_90: 'accountsReceivable.status.overdue61To90',
  OVERDUE_90_PLUS: 'accountsReceivable.status.overdue90Plus',
};

const agingColors: Record<ReceivableAgingBucket, string> = {
  CURRENT: 'green',
  OVERDUE_1_30: 'gold',
  OVERDUE_31_60: 'orange',
  OVERDUE_61_90: 'volcano',
  OVERDUE_90_PLUS: 'red',
};

const paymentStatusColors: Record<SalesInvoicePaymentStatus, string> = {
  UNPAID: 'red',
  PARTIAL: 'gold',
  PAID: 'green',
};

export function AccountsReceivableTable({
  rows,
  loading,
  onRecordPayment,
}: AccountsReceivableTableProps) {
  const { t } = useI18n();
  const columns: ColumnsType<AccountsReceivableRow> = [
    {
      title: t('accountsReceivable.invoiceNumber'),
      dataIndex: 'document_number',
      fixed: 'left',
      width: 170,
      render: (value: string, record) => (
        <Link
          to="/finance/sales/$documentType/$documentId"
          params={{
            documentType: getSalesDocumentTypePathSegment('SALES_INVOICE'),
            documentId: record.sales_document_id,
          }}
        >
          {value}
        </Link>
      ),
    },
    {
      title: t('accountsReceivable.customer'),
      dataIndex: 'customer_name',
      width: 190,
    },
    {
      title: t('accountsReceivable.invoiceDate'),
      dataIndex: 'document_date',
      width: 130,
      render: (value: string) => formatDate(value),
    },
    {
      title: t('accountsReceivable.dueDate'),
      dataIndex: 'due_date',
      width: 130,
      render: (value?: string) => value ? formatDate(value) : '-',
    },
    {
      title: t('accountsReceivable.aging'),
      dataIndex: 'aging_bucket',
      width: 150,
      render: (value: ReceivableAgingBucket, record) => (
        <Space size={4} direction="vertical">
          <Tag color={agingColors[value]}>{t(agingLabelKeys[value])}</Tag>
          {record.overdue_days > 0 && (
            <span className="text-[11px] text-gray-500">
              {t('accountsReceivable.overdueDays', { days: record.overdue_days })}
            </span>
          )}
        </Space>
      ),
    },
    {
      title: t('accountsReceivable.totalInvoice'),
      dataIndex: 'total_amount',
      align: 'right',
      width: 150,
      render: (value: number) => `Rp ${formatCurrency(value || 0)}`,
    },
    {
      title: t('accountsReceivable.paidAmount'),
      dataIndex: 'paid_amount',
      align: 'right',
      width: 150,
      render: (value: number) => `Rp ${formatCurrency(value || 0)}`,
    },
    {
      title: t('accountsReceivable.creditNote'),
      dataIndex: 'return_credit_amount',
      align: 'right',
      width: 150,
      render: (value: number) => `Rp ${formatCurrency(value || 0)}`,
    },
    {
      title: t('accountsReceivable.balanceDue'),
      dataIndex: 'balance_due',
      align: 'right',
      width: 150,
      render: (value: number) => (
        <span className={value > 0 ? 'font-semibold text-rose-700' : 'font-semibold text-emerald-700'}>
          Rp {formatCurrency(value || 0)}
        </span>
      ),
    },
    {
      title: t('accountsReceivable.paymentStatus'),
      dataIndex: 'payment_status',
      width: 130,
      render: (value: SalesInvoicePaymentStatus) => (
        <Tag color={paymentStatusColors[value]}>{t(salesInvoicePaymentStatusLabelKeys[value])}</Tag>
      ),
    },
    {
      title: t('accountsReceivable.actions'),
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
            onClick={() => onRecordPayment(record)}
          >
            {t('accountsReceivable.recordPayment')}
          </Button>
          <Link
            to="/finance/sales/$documentType/$documentId"
            params={{
              documentType: getSalesDocumentTypePathSegment('SALES_INVOICE'),
              documentId: record.sales_document_id,
            }}
          >
            <Button size="small" icon={<Eye size={14} />} />
          </Link>
        </Space>
      ),
    },
  ];

  return (
    <Table
      rowKey="sales_document_id"
      columns={columns}
      dataSource={rows}
      loading={loading}
      scroll={{ x: 1550 }}
      pagination={{ pageSize: 10, showSizeChanger: true }}
    />
  );
}
