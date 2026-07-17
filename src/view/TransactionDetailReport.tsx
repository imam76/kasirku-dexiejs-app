import ExportActions from '@/components/ExportActions';
import { Loading } from '@/components/Loading';
import { useTransactionDetailReport, type TransactionDetailReportRow } from '@/hooks/useReports';
import { useI18n } from '@/hooks/useI18n';
import { useIsMobile } from '@/hooks/useIsMobile';
import { useAuth } from '@/auth/useAuth';
import { getProductCategoryLabel, getProductCategoryOptions } from '@/i18n/stock';
import dayjs from '@/lib/dayjs';
import { exportCsv, exportPdf, type ExportTarget } from '@/utils/export';
import { formatCurrency } from '@/utils/formatters';
import {
  FilePdfOutlined,
  FileTextOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { App, Button, Card, DatePicker, Empty, Input, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import autoTable from 'jspdf-autotable';
import { useEffect, useMemo, useState } from 'react';
import PaymentMethodBadge from '@/components/PaymentMethodBadge';
import { usePosPaymentMethodFilterOptions } from '@/hooks/usePosPaymentMethodFilterOptions';

const { Text, Title } = Typography;

const hppStatusLabel = {
  FINAL: 'Final',
  ESTIMATED: 'Estimasi',
  PENDING: 'Pending',
} as const;

const profitStatusLabel = {
  FINAL: 'Final',
  ESTIMATED: 'Estimasi',
  RECONCILED: 'Rekonsiliasi',
} as const;

export default function TransactionDetailReport() {
  const { message } = App.useApp();
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const { can } = useAuth();
  const canViewProfit = can('PROFIT_VIEW');
  const [selectedHelper, setSelectedHelper] = useState('this-month');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>([
    dayjs.tz().startOf('month'),
    dayjs.tz().endOf('day'),
  ]);
  const [startDate, setStartDate] = useState<string | undefined>(dayjs.tz().startOf('month').format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState<string | undefined>(dayjs.tz().endOf('day').format('YYYY-MM-DD'));
  const [paymentMethod, setPaymentMethod] = useState('SEMUA');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const { options: paymentMethodOptions, isLoading: isLoadingPaymentMethods } = usePosPaymentMethodFilterOptions();

  const { data, isLoading, error, refetch } = useTransactionDetailReport(
    startDate,
    endDate,
    paymentMethod,
    selectedCategories,
    debouncedSearch
  );
  const categoryOptions = getProductCategoryOptions(t);
  const helperOptions = [
    { key: 'today', label: t('report.today') },
    { key: 'yesterday', label: t('report.yesterday') },
    { key: 'this-week', label: t('report.thisWeek') },
    { key: 'this-month', label: t('report.thisMonth') },
    { key: 'last-month', label: t('report.lastMonth') },
    { key: 'custom', label: t('report.custom') },
  ];

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [search]);

  const columns = useMemo<ColumnsType<TransactionDetailReportRow>>(
    () => [
      {
        title: t('report.date'),
        dataIndex: 'transaction_created_at',
        width: 150,
        fixed: isMobile ? undefined : 'left',
        render: (value: string) => dayjs(value).tz().format('DD/MM/YY HH:mm'),
      },
      {
        title: t('report.transaction'),
        dataIndex: 'transaction_number',
        width: 170,
        fixed: isMobile ? undefined : 'left',
        render: (value: string, row) => (
          <div>
            <div className="font-semibold text-gray-900">{value}</div>
            <PaymentMethodBadge
              name={row.payment_method_name}
              category={row.payment_method_category}
              className="mt-1"
            />
            {row.payment_reference && (
              <div className="mt-1 max-w-40 truncate font-mono text-[10px] text-gray-400" title={row.payment_reference}>
                {row.payment_reference}
              </div>
            )}
          </div>
        ),
      },
      {
        title: t('report.item'),
        dataIndex: 'product_name',
        width: 220,
        render: (value: string, row) => (
          <div>
            <div className="font-medium text-gray-900">{value}</div>
            <div className="text-xs text-gray-400">
              {getProductCategoryLabel(row.category, t)}
              {row.sku ? ` / ${row.sku}` : ''}
            </div>
          </div>
        ),
      },
      {
        title: 'Qty',
        width: 100,
        align: 'right',
        render: (_, row) => `${row.quantity.toLocaleString('id-ID')} ${row.unit}`,
      },
      {
        title: t('report.sellingPrice'),
        dataIndex: 'selling_price',
        width: 130,
        align: 'right',
        render: (value: number) => `Rp ${formatCurrency(value)}`,
      },
      ...(canViewProfit ? [{
        title: 'HPP',
        dataIndex: 'purchase_price',
        width: 150,
        align: 'right' as const,
        render: (value: number, row: TransactionDetailReportRow) => (
          <div>
            <div>Rp {formatCurrency(value)}</div>
            <Tag
              color={row.hpp_status === 'ESTIMATED' ? 'gold' : row.hpp_status === 'PENDING' ? 'red' : 'green'}
              className="mt-1"
            >
              {hppStatusLabel[row.hpp_status ?? 'FINAL']}
            </Tag>
          </div>
        ),
      }] : []),
      {
        title: t('report.discount'),
        dataIndex: 'discount_amount',
        width: 120,
        align: 'right',
        render: (value: number) => value > 0 ? `-Rp ${formatCurrency(value)}` : '-',
      },
      {
        title: 'Subtotal',
        dataIndex: 'subtotal',
        width: 130,
        align: 'right',
        render: (value: number) => `Rp ${formatCurrency(value)}`,
      },
      ...(canViewProfit ? [
        {
          title: t('report.cost'),
          dataIndex: 'cost_total',
          width: 130,
          align: 'right' as const,
          render: (value: number) => `Rp ${formatCurrency(value)}`,
        },
        {
          title: t('report.itemMargin'),
          dataIndex: 'profit',
          width: 150,
          align: 'right' as const,
          render: (value: number, row: TransactionDetailReportRow) => (
            <div>
              <div className={value >= 0 ? 'font-semibold text-green-600' : 'font-semibold text-red-600'}>
                Rp {formatCurrency(value)}
              </div>
              <div className="text-xs text-gray-400">{row.margin.toFixed(2)}%</div>
              <Tag color={row.profit_status === 'ESTIMATED' ? 'gold' : row.profit_status === 'RECONCILED' ? 'blue' : 'green'} className="mt-1">
                {profitStatusLabel[row.profit_status ?? 'FINAL']}
              </Tag>
            </div>
          ),
        },
        {
          title: t('report.transactionMargin'),
          dataIndex: 'transaction_profit',
          width: 160,
          align: 'right' as const,
          render: (value: number, row: TransactionDetailReportRow) => (
            <div>
              <div className={value >= 0 ? 'font-semibold text-green-700' : 'font-semibold text-red-700'}>
                Rp {formatCurrency(value)}
              </div>
              <div className="text-xs text-gray-400">{row.transaction_margin.toFixed(2)}%</div>
            </div>
          ),
        },
      ] : []),
    ],
    [canViewProfit, isMobile, t]
  );

  const handleDateRangeChange = (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    setDateRange(dates);
    if (selectedHelper !== 'custom') setSelectedHelper('custom');

    if (dates?.[0] && dates?.[1]) {
      setStartDate(dates[0].format('YYYY-MM-DD'));
      setEndDate(dates[1].format('YYYY-MM-DD'));
      return;
    }

    setStartDate(undefined);
    setEndDate(undefined);
  };

  const handleHelperChange = (value: string) => {
    setSelectedHelper(value);

    let range: [dayjs.Dayjs, dayjs.Dayjs] | null = null;
    switch (value) {
      case 'today':
        range = [dayjs.tz().startOf('day'), dayjs.tz().endOf('day')];
        break;
      case 'yesterday':
        range = [dayjs.tz().subtract(1, 'day').startOf('day'), dayjs.tz().subtract(1, 'day').endOf('day')];
        break;
      case 'this-week':
        range = [dayjs.tz().startOf('week').add(1, 'day'), dayjs.tz().endOf('day')];
        break;
      case 'this-month':
        range = [dayjs.tz().startOf('month'), dayjs.tz().endOf('day')];
        break;
      case 'last-month':
        range = [dayjs.tz().subtract(1, 'month').startOf('month'), dayjs.tz().subtract(1, 'month').endOf('month')];
        break;
      case 'custom':
        return;
      default:
        range = null;
    }

    setDateRange(range);
    setStartDate(range?.[0].format('YYYY-MM-DD'));
    setEndDate(range?.[1].format('YYYY-MM-DD'));
  };

  const handleReset = () => {
    const monthRange: [dayjs.Dayjs, dayjs.Dayjs] = [dayjs.tz().startOf('month'), dayjs.tz().endOf('day')];
    setDateRange(monthRange);
    setStartDate(monthRange[0].format('YYYY-MM-DD'));
    setEndDate(monthRange[1].format('YYYY-MM-DD'));
    setSelectedHelper('this-month');
    setPaymentMethod('SEMUA');
    setSelectedCategories([]);
    setSearch('');
    setDebouncedSearch('');
  };

  const handleExportCsv = async (target: ExportTarget = 'auto') => {
    if (!data) return;

    try {
      const header = [
        t('report.transactionNo'),
        t('report.date'),
        t('report.method'),
        'Kode Metode',
        t('checkout.paymentReference'),
        t('report.product'),
        'SKU',
        t('report.category'),
        t('report.qty'),
        t('report.unit'),
        t('report.sellingPrice'),
        ...(canViewProfit ? [t('report.hpp'), 'Status HPP'] : []),
        t('report.discount'),
        t('report.subtotal'),
        ...(canViewProfit ? [t('report.totalCost'), t('report.itemMargin'), 'Status Profit', `${t('report.itemMargin')} %`, t('report.transactionMargin'), `${t('report.transactionMargin')} %`] : []),
      ];
      const summaryRows = [
        [t('report.totalTransactions'), data.transactions.length],
        [t('report.totalItemLine'), data.rows.length],
        [t('report.totalQty'), data.totalItems],
        [t('report.uniqueProducts'), data.uniqueProducts],
        [t('report.discount'), data.totalDiscount],
        [t('report.salesTotal'), data.totalRevenue],
        ...(canViewProfit ? [
          [t('report.totalCost'), data.totalCost],
          [t('report.totalMargin'), data.totalProfit],
          [t('report.marginPercentAverage'), data.averageMargin.toFixed(2)],
        ] : []),
      ];
      const exported = await exportCsv({
        filename: `laporan-detail-transaksi-${dayjs().tz().format('YYYY-MM-DD')}.csv`,
        rows: [
          header,
          ...data.rows.map((row) => [
            row.transaction_number,
            dayjs(row.transaction_created_at).tz().format('YYYY-MM-DD HH:mm:ss'),
            row.payment_method_name,
            row.payment_method_code,
            row.payment_reference ?? '',
            row.product_name,
            row.sku || '',
            getProductCategoryLabel(row.category, t),
            row.quantity,
            row.unit,
            row.selling_price,
            ...(canViewProfit ? [row.purchase_price, hppStatusLabel[row.hpp_status ?? 'FINAL']] : []),
            row.discount_amount,
            row.subtotal,
            ...(canViewProfit ? [
              row.cost_total,
              row.profit,
              profitStatusLabel[row.profit_status ?? 'FINAL'],
              row.margin.toFixed(2),
              row.transaction_profit,
              row.transaction_margin.toFixed(2),
            ] : []),
          ]),
          [],
          [t('report.summary')],
          ...summaryRows,
        ],
        target,
      });

      if (!exported) return;
      message.success(t('report.detail.exportCsvSuccess'));
    } catch (error) {
      console.error('Failed to export transaction detail CSV:', error);
      message.error(t('report.detail.exportCsvFailed'));
    }
  };

  const handleExportPdf = async (target: ExportTarget = 'auto') => {
    if (!data) return;

    try {
      const exported = await exportPdf({
        filename: `laporan-detail-transaksi-${dayjs().tz().format('YYYY-MM-DD')}.pdf`,
        target,
        build: (doc) => {
          doc.setFontSize(16);
          doc.setFont('helvetica', 'bold');
          doc.text('Frayukti', 105, 16, { align: 'center' });
          doc.setFontSize(13);
          doc.text(t('report.detail.title'), 105, 27, { align: 'center' });
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.text(`${t('report.period')} ${startDate || t('report.allPeriod')} s/d ${endDate || t('report.allPeriod')}`, 105, 36, { align: 'center' });
          doc.text(
            canViewProfit
              ? `${t('report.totalMargin')}: Rp ${formatCurrency(data.totalProfit)} (${data.averageMargin.toFixed(2)}%)`
              : `${t('report.salesTotal')}: Rp ${formatCurrency(data.totalRevenue)}`,
            105,
            44,
            { align: 'center' },
          );

          const tableHead = canViewProfit
            ? [t('report.date'), t('report.transaction'), t('report.paymentMethod'), t('report.item'), t('report.qty'), t('report.discount'), t('report.subtotal'), t('report.cost'), 'Status HPP', t('report.margin'), 'Status Profit', '%']
            : [t('report.date'), t('report.transaction'), t('report.paymentMethod'), t('report.item'), t('report.qty'), t('report.discount'), t('report.subtotal')];
          const tableBody = data.rows.map((row) => [
            dayjs(row.transaction_created_at).tz().format('DD/MM/YY'),
            row.transaction_number,
            row.payment_reference
              ? `${row.payment_method_name} [${row.payment_method_code}]\n${row.payment_reference}`
              : `${row.payment_method_name} [${row.payment_method_code}]`,
            row.product_name,
            `${row.quantity.toLocaleString('id-ID')} ${row.unit}`,
            formatCurrency(row.discount_amount),
            formatCurrency(row.subtotal),
            ...(canViewProfit ? [
              formatCurrency(row.cost_total),
              hppStatusLabel[row.hpp_status ?? 'FINAL'],
              formatCurrency(row.profit),
              profitStatusLabel[row.profit_status ?? 'FINAL'],
              row.margin.toFixed(2),
            ] : []),
          ]);
          const tableFoot = canViewProfit
            ? [
              '',
              '',
              '',
              t('common.total'),
              data.totalItems.toLocaleString('id-ID'),
              formatCurrency(data.totalDiscount),
              formatCurrency(data.totalRevenue),
              formatCurrency(data.totalCost),
              '',
              formatCurrency(data.totalProfit),
              '',
              data.averageMargin.toFixed(2),
            ]
            : [
              '',
              '',
              '',
              t('common.total'),
              data.totalItems.toLocaleString('id-ID'),
              formatCurrency(data.totalDiscount),
              formatCurrency(data.totalRevenue),
            ];

          autoTable(doc, {
            startY: 52,
            head: [tableHead],
            body: tableBody,
            foot: [tableFoot],
            theme: 'grid',
            styles: { fontSize: 7, cellPadding: 1.8, overflow: 'linebreak' },
            headStyles: { fillColor: [219, 234, 254], textColor: 30 },
            footStyles: { fillColor: [240, 253, 244], textColor: 20, fontStyle: 'bold' },
            columnStyles: canViewProfit ? {
              4: { halign: 'right' },
              5: { halign: 'right' },
              6: { halign: 'right' },
              7: { halign: 'right' },
              8: { halign: 'right' },
              9: { halign: 'right' },
            } : {
              4: { halign: 'right' },
              5: { halign: 'right' },
              6: { halign: 'right' },
            },
            margin: { left: 8, right: 8 },
          });
        },
      });

      if (!exported) return;
      message.success(t('report.detail.exportPdfSuccess'));
    } catch (error) {
      console.error('Failed to export transaction detail PDF:', error);
      message.error(t('report.detail.exportPdfFailed'));
    }
  };

  if (isLoading) return <Loading />;

  if (error) {
    return (
      <div className="p-6">
        <Empty description={t('report.withDateError', { message: error instanceof Error ? error.message : t('common.unknownError') })} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFDFD] p-4 sm:p-6">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Title level={4} className="!mb-1 !font-bold text-gray-900">{t('report.detail.title')}</Title>
          <p className="text-xs text-gray-500 sm:text-sm">{t('report.detail.subtitle')}</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button className="flex flex-1 items-center justify-center gap-1.5 sm:flex-none" icon={<ReloadOutlined />} onClick={() => refetch()}>
            {t('common.refresh')}
          </Button>
          <ExportActions
            buttonClassName="flex flex-1 items-center justify-center gap-1.5 border-none bg-[#2563EB] shadow-sm hover:bg-[#1D4ED8] sm:flex-none"
            disabled={!data || data.rows.length === 0}
            formats={[
              { key: 'csv', label: 'CSV', icon: <FileTextOutlined />, onExport: handleExportCsv },
              { key: 'pdf', label: 'PDF', icon: <FilePdfOutlined />, onExport: handleExportPdf },
            ]}
          />
        </div>
      </div>

      <div className="mb-8 rounded-xl border border-gray-100 bg-white p-5 shadow-sm">
        <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.1em] text-gray-400">{t('report.parameterTitle')}</div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_240px_220px_260px]">
          <div className="flex flex-col gap-2.5">
            <span className="ml-0.5 text-[13px] font-medium text-gray-700">{t('report.dateRange')}</span>
            <div className="flex flex-wrap gap-2">
              {helperOptions.map((helper) => (
                <Button
                  key={helper.key}
                  size={isMobile ? 'small' : 'middle'}
                  className={`rounded-full px-4 text-[12px] font-medium ${selectedHelper === helper.key ? 'border-[#2563EB] bg-[#2563EB] text-white' : 'border-gray-200 bg-gray-50 text-gray-600 hover:border-[#2563EB]'}`}
                  onClick={() => handleHelperChange(helper.key)}
                >
                  {helper.label}
                </Button>
              ))}
            </div>
            {selectedHelper === 'custom' && (
              <DatePicker.RangePicker
                value={dateRange}
                onChange={handleDateRangeChange}
                format="YYYY-MM-DD"
                placeholder={[t('common.from'), t('common.to')]}
                className="mt-1 w-full sm:w-[320px]"
                size="large"
              />
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="ml-0.5 text-[13px] font-medium text-gray-700">{t('report.productCategory')}</span>
            <Select
              mode="multiple"
              allowClear
              maxTagCount="responsive"
              value={selectedCategories}
              onChange={setSelectedCategories}
              placeholder={t('report.allCategories')}
              size="large"
              options={categoryOptions}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="ml-0.5 text-[13px] font-medium text-gray-700">{t('report.paymentMethod')}</span>
            <Select
              data-testid="transaction-detail-payment-method-filter"
              value={paymentMethod}
              onChange={setPaymentMethod}
              size="large"
              loading={isLoadingPaymentMethods}
              options={[
                { value: 'SEMUA', label: t('report.allMethods') },
                ...paymentMethodOptions.map((option) => ({ value: option.value, label: option.label })),
              ]}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="ml-0.5 text-[13px] font-medium text-gray-700">{t('report.searchTransactionItem')}</span>
            <Space.Compact>
              <Input
                allowClear
                size="large"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t('report.searchPlaceholder')}
                prefix={<SearchOutlined className="text-gray-400" />}
              />
              {(selectedHelper !== 'this-month' || paymentMethod !== 'SEMUA' || selectedCategories.length > 0 || search) && (
                <Button size="large" onClick={handleReset}>
                  {t('common.reset')}
                </Button>
              )}
            </Space.Compact>
          </div>
        </div>
      </div>

      {data && data.rows.length > 0 ? (
        <>
          <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6">
            {[
              { title: t('report.transaction'), value: data.transactions.length, suffix: t('report.trxSuffix'), color: '#2563eb' },
              { title: t('report.totalItemLine'), value: data.rows.length, suffix: t('report.rowSuffix'), color: '#7c3aed' },
              { title: t('report.uniqueProducts'), value: data.uniqueProducts, suffix: t('report.productSuffix'), color: '#0f766e' },
              { title: t('report.discount'), value: data.totalDiscount, prefix: 'Rp ', color: '#15803d', currency: true },
              { title: t('report.salesTotal'), value: data.totalRevenue, prefix: 'Rp ', color: '#16a34a', currency: true },
              ...(canViewProfit ? [
                { title: t('report.cost'), value: data.totalCost, prefix: 'Rp ', color: '#dc2626', currency: true },
                { title: t('report.totalMargin'), value: data.totalProfit, prefix: 'Rp ', suffix: ` / ${data.averageMargin.toFixed(2)}%`, color: '#ea580c', currency: true },
              ] : []),
            ].map((stat) => (
              <Card key={stat.title} className="overflow-hidden rounded-xl border-none border-l-4 border-l-blue-500 shadow-sm">
                <Statistic
                  title={<Text type="secondary" className="text-[11px] font-bold uppercase tracking-wider">{stat.title}</Text>}
                  value={stat.value}
                  prefix={stat.prefix}
                  suffix={stat.suffix}
                  precision={stat.currency ? 2 : 0}
                  valueStyle={{ color: stat.color, fontSize: isMobile ? 16 : 20, fontWeight: 700 }}
                />
              </Card>
            ))}
          </div>

          <div className="rounded-xl border border-gray-100 bg-white shadow-sm">
            <Table
              columns={columns}
              dataSource={data.rows}
              size={isMobile ? 'small' : 'middle'}
              scroll={{ x: canViewProfit ? 1580 : 1100 }}
              pagination={{ pageSize: 20, showSizeChanger: true }}
              summary={() => (
                <Table.Summary fixed>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={canViewProfit ? 6 : 5}>
                      <span className="font-semibold">{t('common.total')}</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={canViewProfit ? 6 : 5} align="right">
                      <span className="font-semibold text-green-700">Rp {formatCurrency(data.totalDiscount)}</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={canViewProfit ? 7 : 6} align="right">
                      <span className="font-semibold">Rp {formatCurrency(data.totalRevenue)}</span>
                    </Table.Summary.Cell>
                    {canViewProfit && (
                      <>
                        <Table.Summary.Cell index={8} align="right">
                          <span className="font-semibold">Rp {formatCurrency(data.totalCost)}</span>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={9} align="right">
                          <span className="font-semibold text-green-700">Rp {formatCurrency(data.totalProfit)}</span>
                        </Table.Summary.Cell>
                        <Table.Summary.Cell index={10} align="right">
                          <span className="font-semibold">{data.averageMargin.toFixed(2)}%</span>
                        </Table.Summary.Cell>
                      </>
                    )}
                  </Table.Summary.Row>
                </Table.Summary>
              )}
            />
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-gray-100 bg-white py-16 text-center shadow-sm">
          <p className="text-gray-400 italic">{t('report.noTransactionDetailsForFilter')}</p>
        </div>
      )}
    </div>
  );
}
