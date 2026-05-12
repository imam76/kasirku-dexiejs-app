import ExportActions from '@/components/ExportActions';
import { Loading } from '@/components/Loading';
import { PRODUCT_CATEGORIES } from '@/constants/categories';
import { useTransactionDetailReport, type TransactionDetailReportRow } from '@/hooks/useReports';
import { useIsMobile } from '@/hooks/useIsMobile';
import dayjs from '@/lib/dayjs';
import { exportCsv, exportPdf, type ExportTarget } from '@/utils/export';
import { formatCategory, formatCurrency } from '@/utils/formatters';
import {
  FilePdfOutlined,
  FileTextOutlined,
  ReloadOutlined,
  SearchOutlined,
} from '@ant-design/icons';
import { App, Button, Card, DatePicker, Empty, Input, Select, Space, Statistic, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import autoTable from 'jspdf-autotable';
import { useMemo, useState } from 'react';

const { Text, Title } = Typography;

const helperOptions = [
  { key: 'today', label: 'Hari ini' },
  { key: 'yesterday', label: 'Kemarin' },
  { key: 'this-week', label: 'Minggu ini' },
  { key: 'this-month', label: 'Bulan ini' },
  { key: 'last-month', label: 'Bulan lalu' },
  { key: 'custom', label: 'Custom' },
];

export default function TransactionDetailReport() {
  const { message } = App.useApp();
  const isMobile = useIsMobile();
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

  const { data, isLoading, error, refetch } = useTransactionDetailReport(
    startDate,
    endDate,
    paymentMethod,
    selectedCategories,
    search
  );

  const columns = useMemo<ColumnsType<TransactionDetailReportRow>>(
    () => [
      {
        title: 'Tanggal',
        dataIndex: 'transaction_created_at',
        width: 150,
        fixed: isMobile ? undefined : 'left',
        render: (value: string) => dayjs(value).tz().format('DD/MM/YY HH:mm'),
      },
      {
        title: 'Transaksi',
        dataIndex: 'transaction_number',
        width: 170,
        fixed: isMobile ? undefined : 'left',
        render: (value: string, row) => (
          <div>
            <div className="font-semibold text-gray-900">{value}</div>
            <Tag color={row.payment_method === 'NON_TUNAI' ? 'blue' : 'green'} className="mt-1">
              {row.payment_method}
            </Tag>
          </div>
        ),
      },
      {
        title: 'Item',
        dataIndex: 'product_name',
        width: 220,
        render: (value: string, row) => (
          <div>
            <div className="font-medium text-gray-900">{value}</div>
            <div className="text-xs text-gray-400">
              {formatCategory(row.category)}
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
        title: 'Harga Jual',
        dataIndex: 'selling_price',
        width: 130,
        align: 'right',
        render: (value: number) => `Rp ${formatCurrency(value)}`,
      },
      {
        title: 'HPP',
        dataIndex: 'purchase_price',
        width: 120,
        align: 'right',
        render: (value: number) => `Rp ${formatCurrency(value)}`,
      },
      {
        title: 'Subtotal',
        dataIndex: 'subtotal',
        width: 130,
        align: 'right',
        render: (value: number) => `Rp ${formatCurrency(value)}`,
      },
      {
        title: 'Modal',
        dataIndex: 'cost_total',
        width: 130,
        align: 'right',
        render: (value: number) => `Rp ${formatCurrency(value)}`,
      },
      {
        title: 'Margin Item',
        dataIndex: 'profit',
        width: 150,
        align: 'right',
        render: (value: number, row) => (
          <div>
            <div className={value >= 0 ? 'font-semibold text-green-600' : 'font-semibold text-red-600'}>
              Rp {formatCurrency(value)}
            </div>
            <div className="text-xs text-gray-400">{row.margin.toFixed(2)}%</div>
          </div>
        ),
      },
      {
        title: 'Margin Transaksi',
        dataIndex: 'transaction_profit',
        width: 160,
        align: 'right',
        render: (value: number, row) => (
          <div>
            <div className={value >= 0 ? 'font-semibold text-green-700' : 'font-semibold text-red-700'}>
              Rp {formatCurrency(value)}
            </div>
            <div className="text-xs text-gray-400">{row.transaction_margin.toFixed(2)}%</div>
          </div>
        ),
      },
    ],
    [isMobile]
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
  };

  const handleExportCsv = async (target: ExportTarget = 'auto') => {
    if (!data) return;

    try {
      const exported = await exportCsv({
        filename: `laporan-detail-transaksi-${dayjs().tz().format('YYYY-MM-DD')}.csv`,
        rows: [
          ['No. Transaksi', 'Tanggal', 'Metode', 'Produk', 'SKU', 'Kategori', 'Qty', 'Satuan', 'Harga Jual', 'HPP', 'Subtotal', 'Total Modal', 'Margin Item', 'Margin Item %', 'Margin Transaksi', 'Margin Transaksi %'],
          ...data.rows.map((row) => [
            row.transaction_number,
            dayjs(row.transaction_created_at).tz().format('YYYY-MM-DD HH:mm:ss'),
            row.payment_method,
            row.product_name,
            row.sku || '',
            formatCategory(row.category),
            row.quantity,
            row.unit,
            row.selling_price,
            row.purchase_price,
            row.subtotal,
            row.cost_total,
            row.profit,
            row.margin.toFixed(2),
            row.transaction_profit,
            row.transaction_margin.toFixed(2),
          ]),
          [],
          ['Ringkasan'],
          ['Total Transaksi', data.transactions.length],
          ['Total Item Line', data.rows.length],
          ['Total Qty', data.totalItems],
          ['Produk Unik', data.uniqueProducts],
          ['Total Penjualan', data.totalRevenue],
          ['Total Modal', data.totalCost],
          ['Total Margin', data.totalProfit],
          ['Rata-rata Margin %', data.averageMargin.toFixed(2)],
        ],
        target,
      });

      if (!exported) return;
      message.success('Export CSV detail transaksi berhasil.');
    } catch (error) {
      console.error('Failed to export transaction detail CSV:', error);
      message.error('Gagal export CSV detail transaksi.');
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
          doc.text('Kasirku', 105, 16, { align: 'center' });
          doc.setFontSize(13);
          doc.text('Laporan Detail Transaksi', 105, 27, { align: 'center' });
          doc.setFontSize(9);
          doc.setFont('helvetica', 'normal');
          doc.text(`Periode ${startDate || 'Semua'} s/d ${endDate || 'Semua'}`, 105, 36, { align: 'center' });
          doc.text(`Total margin: Rp ${formatCurrency(data.totalProfit)} (${data.averageMargin.toFixed(2)}%)`, 105, 44, { align: 'center' });

          autoTable(doc, {
            startY: 52,
            head: [['Tgl', 'Transaksi', 'Item', 'Qty', 'Subtotal', 'Modal', 'Margin', '%']],
            body: data.rows.map((row) => [
              dayjs(row.transaction_created_at).tz().format('DD/MM/YY'),
              row.transaction_number,
              row.product_name,
              `${row.quantity.toLocaleString('id-ID')} ${row.unit}`,
              formatCurrency(row.subtotal),
              formatCurrency(row.cost_total),
              formatCurrency(row.profit),
              row.margin.toFixed(2),
            ]),
            foot: [[
              '',
              '',
              'Total',
              data.totalItems.toLocaleString('id-ID'),
              formatCurrency(data.totalRevenue),
              formatCurrency(data.totalCost),
              formatCurrency(data.totalProfit),
              data.averageMargin.toFixed(2),
            ]],
            theme: 'grid',
            styles: { fontSize: 7, cellPadding: 1.8, overflow: 'linebreak' },
            headStyles: { fillColor: [219, 234, 254], textColor: 30 },
            footStyles: { fillColor: [240, 253, 244], textColor: 20, fontStyle: 'bold' },
            columnStyles: {
              3: { halign: 'right' },
              4: { halign: 'right' },
              5: { halign: 'right' },
              6: { halign: 'right' },
              7: { halign: 'right' },
            },
            margin: { left: 8, right: 8 },
          });
        },
      });

      if (!exported) return;
      message.success('Export PDF detail transaksi berhasil.');
    } catch (error) {
      console.error('Failed to export transaction detail PDF:', error);
      message.error('Gagal export PDF detail transaksi.');
    }
  };

  if (isLoading) return <Loading />;

  if (error) {
    return (
      <div className="p-6">
        <Empty description={`Terjadi kesalahan: ${error instanceof Error ? error.message : 'Unknown error'}`} />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFDFD] p-4 sm:p-6">
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Title level={4} className="!mb-1 !font-bold text-gray-900">Laporan Detail Transaksi</Title>
          <p className="text-xs text-gray-500 sm:text-sm">Rincian item terjual, HPP, margin per item, dan margin total per transaksi</p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <Button className="flex flex-1 items-center justify-center gap-1.5 sm:flex-none" icon={<ReloadOutlined />} onClick={() => refetch()}>
            Refresh
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
        <div className="mb-4 text-[11px] font-bold uppercase tracking-[0.1em] text-gray-400">Parameter Laporan</div>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_240px_220px_260px]">
          <div className="flex flex-col gap-2.5">
            <span className="ml-0.5 text-[13px] font-medium text-gray-700">Rentang Waktu</span>
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
                placeholder={['Mulai', 'Hingga']}
                className="mt-1 w-full sm:w-[320px]"
                size="large"
              />
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="ml-0.5 text-[13px] font-medium text-gray-700">Kategori Produk</span>
            <Select
              mode="multiple"
              allowClear
              maxTagCount="responsive"
              value={selectedCategories}
              onChange={setSelectedCategories}
              placeholder="Semua kategori"
              size="large"
              options={PRODUCT_CATEGORIES}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="ml-0.5 text-[13px] font-medium text-gray-700">Metode Pembayaran</span>
            <Select
              value={paymentMethod}
              onChange={setPaymentMethod}
              size="large"
              options={[
                { value: 'SEMUA', label: 'Semua Metode' },
                { value: 'TUNAI', label: 'Tunai' },
                { value: 'NON_TUNAI', label: 'Non-Tunai' },
              ]}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="ml-0.5 text-[13px] font-medium text-gray-700">Cari Transaksi / Item</span>
            <Space.Compact>
              <Input
                allowClear
                size="large"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="TRX atau nama produk"
                prefix={<SearchOutlined className="text-gray-400" />}
              />
              {(selectedHelper !== 'this-month' || paymentMethod !== 'SEMUA' || selectedCategories.length > 0 || search) && (
                <Button size="large" onClick={handleReset}>
                  Reset
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
              { title: 'Transaksi', value: data.transactions.length, suffix: 'trx', color: '#2563eb' },
              { title: 'Item Line', value: data.rows.length, suffix: 'baris', color: '#7c3aed' },
              { title: 'Produk Unik', value: data.uniqueProducts, suffix: 'produk', color: '#0f766e' },
              { title: 'Penjualan', value: data.totalRevenue, prefix: 'Rp ', color: '#16a34a', currency: true },
              { title: 'Modal', value: data.totalCost, prefix: 'Rp ', color: '#dc2626', currency: true },
              { title: 'Total Margin', value: data.totalProfit, prefix: 'Rp ', suffix: ` / ${data.averageMargin.toFixed(2)}%`, color: '#ea580c', currency: true },
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
              scroll={{ x: 1460 }}
              pagination={{ pageSize: 20, showSizeChanger: true }}
              summary={() => (
                <Table.Summary fixed>
                  <Table.Summary.Row>
                    <Table.Summary.Cell index={0} colSpan={6}>
                      <span className="font-semibold">Total</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={6} align="right">
                      <span className="font-semibold">Rp {formatCurrency(data.totalRevenue)}</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={7} align="right">
                      <span className="font-semibold">Rp {formatCurrency(data.totalCost)}</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={8} align="right">
                      <span className="font-semibold text-green-700">Rp {formatCurrency(data.totalProfit)}</span>
                    </Table.Summary.Cell>
                    <Table.Summary.Cell index={9} align="right">
                      <span className="font-semibold">{data.averageMargin.toFixed(2)}%</span>
                    </Table.Summary.Cell>
                  </Table.Summary.Row>
                </Table.Summary>
              )}
            />
          </div>
        </>
      ) : (
        <div className="rounded-xl border border-gray-100 bg-white py-16 text-center shadow-sm">
          <p className="text-gray-400 italic">Tidak ada detail transaksi untuk filter ini</p>
        </div>
      )}
    </div>
  );
}
