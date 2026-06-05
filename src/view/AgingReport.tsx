import { useMemo, useState } from 'react';
import { Link } from '@tanstack/react-router';
import { App, Button, Card, DatePicker, Empty, Input, Modal, Select, Space, Statistic, Table, Tabs, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import type { Dayjs } from 'dayjs';
import { FileExcelOutlined } from '@ant-design/icons';
import { AlertCircle, Eye, History, RefreshCw, Search, Scale, Wallet, X } from 'lucide-react';
import ExportActions from '@/components/ExportActions';
import { Loading } from '@/components/Loading';
import { PayablePaymentHistory } from '@/components/accounts-payable/PayablePaymentHistory';
import { ReceivablePaymentHistory } from '@/components/accounts-receivable/ReceivablePaymentHistory';
import { getPurchaseDocumentTypePathSegment } from '@/configs/purchase-document';
import { getSalesDocumentTypePathSegment } from '@/configs/sales-document';
import { useI18n } from '@/hooks/useI18n';
import { useAccountsAgingReport, type AccountsAgingReportFilters } from '@/hooks/useReports';
import type { TranslationKey } from '@/i18n/messages';
import dayjs from '@/lib/dayjs';
import type {
  AccountsPayableRow,
  AccountsReceivableRow,
  PurchaseInvoicePaymentStatus,
  ReceivableAgingBucket,
  SalesInvoicePaymentStatus,
} from '@/types';
import {
  formatDocumentCurrencyAmount,
  isBaseCurrency,
  toDocumentCurrencyAmount,
} from '@/utils/documentCurrency';
import { exportXlsx, type ExportTarget } from '@/utils/export';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { purchaseInvoicePaymentStatusLabelKeys } from '@/utils/purchaseDocuments/i18n';
import { salesInvoicePaymentStatusLabelKeys } from '@/utils/salesDocuments/i18n';

const { Text, Title } = Typography;

type AgingTab = 'receivable' | 'payable';
type HistoryTarget =
  | { type: 'receivable'; row: AccountsReceivableRow }
  | { type: 'payable'; row: AccountsPayableRow };
type CurrencyAmountSnapshot = {
  currency_code?: string;
  exchange_rate?: number;
};

const agingLabelKeys: Record<ReceivableAgingBucket, TranslationKey> = {
  CURRENT: 'report.aging.bucket.current',
  OVERDUE_1_30: 'report.aging.bucket.overdue1To30',
  OVERDUE_31_60: 'report.aging.bucket.overdue31To60',
  OVERDUE_61_90: 'report.aging.bucket.overdue61To90',
  OVERDUE_90_PLUS: 'report.aging.bucket.overdue90Plus',
};

const agingColors: Record<ReceivableAgingBucket, string> = {
  CURRENT: 'green',
  OVERDUE_1_30: 'gold',
  OVERDUE_31_60: 'orange',
  OVERDUE_61_90: 'volcano',
  OVERDUE_90_PLUS: 'red',
};

const paymentStatusColors: Record<SalesInvoicePaymentStatus | PurchaseInvoicePaymentStatus, string> = {
  UNPAID: 'red',
  PARTIAL: 'gold',
  PAID: 'green',
};

const moneyForExport = (
  value: number,
  row: CurrencyAmountSnapshot,
  foreignValue?: number,
) => {
  const displayValue = foreignValue ?? toDocumentCurrencyAmount(value, row);
  if (isBaseCurrency(row.currency_code)) return value;
  return `${row.currency_code || ''} ${displayValue} / Rp ${value}`;
};

export default function AgingReport() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const [activeTab, setActiveTab] = useState<AgingTab>('receivable');
  const [searchText, setSearchText] = useState('');
  const [asOfDate, setAsOfDate] = useState<Dayjs>(dayjs.tz());
  const [invoiceRange, setInvoiceRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [dueRange, setDueRange] = useState<[Dayjs | null, Dayjs | null] | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<AccountsAgingReportFilters['paymentStatus']>('ALL');
  const [agingBucket, setAgingBucket] = useState<AccountsAgingReportFilters['agingBucket']>('ALL');
  const [historyTarget, setHistoryTarget] = useState<HistoryTarget | null>(null);

  const filters = useMemo<AccountsAgingReportFilters>(() => ({
    search: searchText,
    paymentStatus,
    agingBucket,
    asOfDate: asOfDate.format('YYYY-MM-DD'),
    invoiceDateFrom: invoiceRange?.[0]?.format('YYYY-MM-DD'),
    invoiceDateTo: invoiceRange?.[1]?.format('YYYY-MM-DD'),
    dueDateFrom: dueRange?.[0]?.format('YYYY-MM-DD'),
    dueDateTo: dueRange?.[1]?.format('YYYY-MM-DD'),
  }), [agingBucket, asOfDate, dueRange, invoiceRange, paymentStatus, searchText]);

  const { data, isLoading, error, refetch } = useAccountsAgingReport(filters);

  const receivableRows = data?.receivableRows ?? [];
  const payableRows = data?.payableRows ?? [];
  const selectedReceivablePayments = historyTarget?.type === 'receivable'
    ? (data?.salesInvoicePayments ?? []).filter((payment) => payment.sales_document_id === historyTarget.row.sales_document_id)
    : [];
  const selectedPayablePayments = historyTarget?.type === 'payable'
    ? (data?.purchaseInvoicePayments ?? []).filter((payment) => payment.purchase_document_id === historyTarget.row.purchase_document_id)
    : [];

  const renderMoney = (
    value: number,
    row: AccountsReceivableRow | AccountsPayableRow,
    foreignValue?: number,
    className = 'font-medium',
  ) => {
    const displayValue = foreignValue ?? toDocumentCurrencyAmount(value, row);
    const isForeign = !isBaseCurrency(row.currency_code);

    return (
      <span className={className}>
        {formatDocumentCurrencyAmount(displayValue, row)}
        {isForeign && (
          <span className="block text-[11px] font-normal text-gray-500">
            Rp {formatCurrency(value || 0)}
          </span>
        )}
      </span>
    );
  };

  const renderAging = (value: ReceivableAgingBucket, overdueDays: number) => (
    <Space size={4} direction="vertical">
      <Tag color={agingColors[value]}>{t(agingLabelKeys[value])}</Tag>
      {overdueDays > 0 && (
        <span className="text-[11px] text-gray-500">
          {t('report.aging.overdueDays', { days: overdueDays })}
        </span>
      )}
    </Space>
  );

  const resetFilters = () => {
    setSearchText('');
    setAsOfDate(dayjs.tz());
    setInvoiceRange(null);
    setDueRange(null);
    setPaymentStatus('ALL');
    setAgingBucket('ALL');
  };

  const exportRows = async (target: ExportTarget = 'auto') => {
    if (!data) return;

    try {
      const summaryRows = [
        [t('report.aging.title')],
        [`${t('report.aging.asOfDate')}: ${asOfDate.format('YYYY-MM-DD')}`],
        [`${t('report.printDate')} ${dayjs().tz().format('YYYY-MM-DD HH:mm:ss')}`],
        [],
        [t('report.aging.metric'), t('report.aging.receivable'), t('report.aging.payable')],
        [t('report.aging.totalOutstanding'), data.receivableSummary.total_outstanding, data.payableSummary.total_outstanding],
        [t('report.aging.current'), data.receivableSummary.total_current, data.payableSummary.total_current],
        [t('report.aging.overdue'), data.receivableSummary.total_overdue, data.payableSummary.total_overdue],
        [t('report.aging.openInvoices'), data.receivableSummary.open_invoice_count, data.payableSummary.open_invoice_count],
        [t('report.aging.netReceivablePayable'), data.netReceivablePayable, ''],
      ];
      const detailHeader = [
        t('report.aging.invoiceNo'),
        t('report.aging.party'),
        t('accountsReceivable.invoiceDate'),
        t('accountsReceivable.dueDate'),
        t('accountsReceivable.aging'),
        t('accountsReceivable.totalInvoice'),
        t('accountsReceivable.paidAmount'),
        t('report.aging.returnCredit'),
        t('report.aging.balanceDue'),
        t('accountsReceivable.paymentStatus'),
      ];
      const receivableSheetRows = [
        [t('report.aging.receivable')],
        [],
        detailHeader,
        ...receivableRows.map((row) => [
          row.document_number,
          row.customer_name,
          row.document_date,
          row.due_date || '-',
          t(agingLabelKeys[row.aging_bucket]),
          moneyForExport(row.total_amount, row, row.foreign_total_amount),
          moneyForExport(row.paid_amount, row, row.foreign_paid_amount),
          moneyForExport(row.return_credit_amount, row, row.foreign_return_credit_amount),
          moneyForExport(row.balance_due, row, row.foreign_balance_due),
          t(salesInvoicePaymentStatusLabelKeys[row.payment_status]),
        ]),
      ];
      const payableSheetRows = [
        [t('report.aging.payable')],
        [],
        detailHeader,
        ...payableRows.map((row) => [
          row.document_number,
          row.supplier_name,
          row.document_date,
          row.due_date || '-',
          t(agingLabelKeys[row.aging_bucket]),
          moneyForExport(row.total_amount, row, row.foreign_total_amount),
          moneyForExport(row.paid_amount, row, row.foreign_paid_amount),
          moneyForExport(row.return_credit_amount, row, row.foreign_return_credit_amount),
          moneyForExport(row.balance_due, row, row.foreign_balance_due),
          t(purchaseInvoicePaymentStatusLabelKeys[row.payment_status]),
        ]),
      ];
      const paymentRows = [
        [
          t('report.aging.type'),
          t('report.aging.invoiceNo'),
          t('report.aging.party'),
          t('accountsReceivable.paymentDate'),
          t('accountsReceivable.paymentAmount'),
          t('checkout.method'),
          t('accountsReceivable.paymentChannel'),
          t('accountsReceivable.cashAccount'),
          t('salesDocuments.table.status'),
          t('salesDocuments.field.notes'),
        ],
        ...data.salesInvoicePayments.map((payment) => [
          t('report.aging.receivable'),
          payment.document_number,
          payment.customer_name,
          payment.paid_at,
          moneyForExport(payment.amount, payment, payment.foreign_amount),
          payment.payment_method || '-',
          payment.payment_channel || '-',
          payment.cash_account_code && payment.cash_account_name ? `${payment.cash_account_code} - ${payment.cash_account_name}` : '-',
          payment.status,
          payment.void_reason || payment.notes || '-',
        ]),
        ...data.purchaseInvoicePayments.map((payment) => [
          t('report.aging.payable'),
          payment.document_number,
          payment.supplier_name,
          payment.paid_at,
          moneyForExport(payment.amount, payment, payment.foreign_amount),
          payment.payment_method || '-',
          payment.payment_channel || '-',
          payment.cash_account_code && payment.cash_account_name ? `${payment.cash_account_code} - ${payment.cash_account_name}` : '-',
          payment.status,
          payment.void_reason || payment.notes || '-',
        ]),
      ];

      await exportXlsx({
        filename: `laporan-piutang-hutang-aging-${dayjs().tz().format('YYYY-MM-DD')}.xlsx`,
        target,
        sheets: [
          { name: t('report.aging.summarySheet'), rows: summaryRows },
          { name: t('report.aging.receivable'), rows: receivableSheetRows },
          { name: t('report.aging.payable'), rows: payableSheetRows },
          { name: t('report.aging.paymentHistory'), rows: paymentRows },
        ],
      });
      message.success(t('report.aging.exportSuccess'));
    } catch (exportError) {
      console.error('Failed to export aging report:', exportError);
      message.error(t('report.aging.exportFailed'));
    }
  };

  const receivableColumns: ColumnsType<AccountsReceivableRow> = [
    {
      title: t('accountsReceivable.invoiceNumber'),
      dataIndex: 'document_number',
      fixed: 'left',
      width: 170,
      render: (value: string, record) => (
        <Link
          to="/sales/$documentType/$documentId"
          params={{
            documentType: getSalesDocumentTypePathSegment('SALES_INVOICE'),
            documentId: record.sales_document_id,
          }}
        >
          {value}
        </Link>
      ),
    },
    { title: t('accountsReceivable.customer'), dataIndex: 'customer_name', width: 190 },
    { title: t('accountsReceivable.invoiceDate'), dataIndex: 'document_date', width: 130, render: (value: string) => formatDate(value) },
    { title: t('accountsReceivable.dueDate'), dataIndex: 'due_date', width: 130, render: (value?: string) => value ? formatDate(value) : '-' },
    { title: t('accountsReceivable.aging'), dataIndex: 'aging_bucket', width: 150, render: (value: ReceivableAgingBucket, record) => renderAging(value, record.overdue_days) },
    { title: t('accountsReceivable.totalInvoice'), dataIndex: 'total_amount', align: 'right', width: 150, render: (value: number, record) => renderMoney(value, record, record.foreign_total_amount) },
    { title: t('accountsReceivable.paidAmount'), dataIndex: 'paid_amount', align: 'right', width: 150, render: (value: number, record) => renderMoney(value, record, record.foreign_paid_amount) },
    { title: t('accountsReceivable.creditNote'), dataIndex: 'return_credit_amount', align: 'right', width: 150, render: (value: number, record) => renderMoney(value, record, record.foreign_return_credit_amount) },
    { title: t('accountsReceivable.balanceDue'), dataIndex: 'balance_due', align: 'right', width: 150, render: (value: number, record) => renderMoney(value, record, record.foreign_balance_due, value > 0 ? 'font-semibold text-rose-700' : 'font-semibold text-emerald-700') },
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
      width: 140,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<History size={14} />} onClick={() => setHistoryTarget({ type: 'receivable', row: record })} />
          <Link
            to="/sales/$documentType/$documentId"
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

  const payableColumns: ColumnsType<AccountsPayableRow> = [
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
    { title: t('accountsPayable.invoiceDate'), dataIndex: 'document_date', width: 130, render: (value: string) => formatDate(value) },
    { title: t('accountsPayable.dueDate'), dataIndex: 'due_date', width: 130, render: (value?: string) => value ? formatDate(value) : '-' },
    { title: t('accountsPayable.aging'), dataIndex: 'aging_bucket', width: 150, render: (value: ReceivableAgingBucket, record) => renderAging(value, record.overdue_days) },
    { title: t('accountsPayable.totalInvoice'), dataIndex: 'total_amount', align: 'right', width: 150, render: (value: number, record) => renderMoney(value, record, record.foreign_total_amount) },
    { title: t('accountsPayable.paidAmount'), dataIndex: 'paid_amount', align: 'right', width: 150, render: (value: number, record) => renderMoney(value, record, record.foreign_paid_amount) },
    { title: t('accountsPayable.debitNote'), dataIndex: 'return_credit_amount', align: 'right', width: 150, render: (value: number, record) => renderMoney(value, record, record.foreign_return_credit_amount) },
    { title: t('accountsPayable.balanceDue'), dataIndex: 'balance_due', align: 'right', width: 150, render: (value: number, record) => renderMoney(value, record, record.foreign_balance_due, value > 0 ? 'font-semibold text-rose-700' : 'font-semibold text-emerald-700') },
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
      width: 140,
      render: (_, record) => (
        <Space>
          <Button size="small" icon={<History size={14} />} onClick={() => setHistoryTarget({ type: 'payable', row: record })} />
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

  if (isLoading) return <Loading />;

  if (error) {
    return (
      <div className="p-6">
        <Empty description={t('report.aging.error', { message: error instanceof Error ? error.message : t('common.unknownError') })} />
      </div>
    );
  }

  return (
    <div className="min-h-screen space-y-4 bg-[#FDFDFD] p-3 sm:p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <Title level={3} style={{ margin: 0 }}>{t('report.aging.title')}</Title>
          <Text type="secondary">{t('report.aging.subtitle')}</Text>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button icon={<RefreshCw size={14} />} onClick={() => refetch()} loading={isLoading}>
            {t('common.refresh')}
          </Button>
          <ExportActions
            disabled={!data || (receivableRows.length === 0 && payableRows.length === 0)}
            formats={[{
              key: 'xlsx',
              label: 'XLSX',
              icon: <FileExcelOutlined />,
              onExport: exportRows,
            }]}
          />
        </div>
      </div>

      <Card size="small">
        <div className="grid gap-2 lg:grid-cols-[minmax(220px,1.2fr)_180px_220px_220px_170px_170px_auto]">
          <Input
            allowClear
            prefix={<Search size={14} />}
            placeholder={t('report.aging.searchPlaceholder')}
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
          <DatePicker
            allowClear={false}
            value={asOfDate}
            onChange={(value) => value && setAsOfDate(value)}
            format="YYYY-MM-DD"
            placeholder={t('report.aging.asOfDate')}
          />
          <DatePicker.RangePicker
            value={invoiceRange}
            onChange={setInvoiceRange}
            format="YYYY-MM-DD"
            placeholder={[t('accountsReceivable.invoiceDateFrom'), t('accountsReceivable.invoiceDateTo')]}
          />
          <DatePicker.RangePicker
            value={dueRange}
            onChange={setDueRange}
            format="YYYY-MM-DD"
            placeholder={[t('accountsReceivable.dueDateFrom'), t('accountsReceivable.dueDateTo')]}
          />
          <Select
            value={paymentStatus}
            onChange={setPaymentStatus}
            options={[
              { value: 'ALL', label: t('accountsReceivable.allPaymentStatuses') },
              { value: 'UNPAID', label: t(salesInvoicePaymentStatusLabelKeys.UNPAID) },
              { value: 'PARTIAL', label: t(salesInvoicePaymentStatusLabelKeys.PARTIAL) },
              { value: 'PAID', label: t(salesInvoicePaymentStatusLabelKeys.PAID) },
            ]}
          />
          <Select
            value={agingBucket}
            onChange={setAgingBucket}
            options={[
              { value: 'ALL', label: t('accountsReceivable.allAging') },
              { value: 'CURRENT', label: t(agingLabelKeys.CURRENT) },
              { value: 'OVERDUE_1_30', label: t(agingLabelKeys.OVERDUE_1_30) },
              { value: 'OVERDUE_31_60', label: t(agingLabelKeys.OVERDUE_31_60) },
              { value: 'OVERDUE_61_90', label: t(agingLabelKeys.OVERDUE_61_90) },
              { value: 'OVERDUE_90_PLUS', label: t(agingLabelKeys.OVERDUE_90_PLUS) },
            ]}
          />
          <Button icon={<X size={14} />} onClick={resetFilters}>
            {t('common.reset')}
          </Button>
        </div>
      </Card>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card size="small" className="border-l-4 border-l-blue-500">
          <Statistic
            title={t('report.aging.totalReceivable')}
            value={data?.totalReceivable ?? 0}
            formatter={(value) => `Rp ${formatCurrency(Number(value))}`}
            prefix={<Wallet size={18} className="mr-2 text-blue-600" />}
          />
        </Card>
        <Card size="small" className="border-l-4 border-l-emerald-500">
          <Statistic
            title={t('report.aging.totalPayable')}
            value={data?.totalPayable ?? 0}
            formatter={(value) => `Rp ${formatCurrency(Number(value))}`}
            prefix={<Wallet size={18} className="mr-2 text-emerald-600" />}
          />
        </Card>
        <Card size="small" className="border-l-4 border-l-slate-500">
          <Statistic
            title={t('report.aging.netReceivablePayable')}
            value={data?.netReceivablePayable ?? 0}
            formatter={(value) => `Rp ${formatCurrency(Number(value))}`}
            prefix={<Scale size={18} className="mr-2 text-slate-600" />}
            valueStyle={{ color: (data?.netReceivablePayable ?? 0) < 0 ? '#dc2626' : '#111827' }}
          />
        </Card>
        <Card size="small" className="border-l-4 border-l-rose-500">
          <Statistic
            title={t('report.aging.totalOverdue')}
            value={data?.totalOverdue ?? 0}
            formatter={(value) => `Rp ${formatCurrency(Number(value))}`}
            prefix={<AlertCircle size={18} className="mr-2 text-rose-600" />}
          />
        </Card>
      </div>

      <Card size="small">
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key as AgingTab)}
          items={[
            {
              key: 'receivable',
              label: `${t('report.aging.receivable')} (${receivableRows.length})`,
              children: (
                <Table
                  rowKey="sales_document_id"
                  columns={receivableColumns}
                  dataSource={receivableRows}
                  scroll={{ x: 1580 }}
                  pagination={{ pageSize: 10, showSizeChanger: true }}
                />
              ),
            },
            {
              key: 'payable',
              label: `${t('report.aging.payable')} (${payableRows.length})`,
              children: (
                <Table
                  rowKey="purchase_document_id"
                  columns={payableColumns}
                  dataSource={payableRows}
                  scroll={{ x: 1580 }}
                  pagination={{ pageSize: 10, showSizeChanger: true }}
                />
              ),
            },
          ]}
        />
      </Card>

      <Modal
        title={historyTarget ? `${t('report.aging.paymentHistory')} - ${historyTarget.row.document_number}` : t('report.aging.paymentHistory')}
        open={Boolean(historyTarget)}
        onCancel={() => setHistoryTarget(null)}
        footer={null}
        width={1100}
        destroyOnClose
      >
        {historyTarget?.type === 'receivable' ? (
          <ReceivablePaymentHistory
            payments={selectedReceivablePayments}
            allowVoid={false}
          />
        ) : historyTarget?.type === 'payable' ? (
          <PayablePaymentHistory
            payments={selectedPayablePayments}
            allowVoid={false}
          />
        ) : null}
      </Modal>
    </div>
  );
}
