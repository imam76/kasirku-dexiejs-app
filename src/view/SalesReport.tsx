import { PRODUCT_CATEGORIES } from '@/constants/categories';
import { useSalesReport } from '@/hooks/useReports';
import dayjs from '@/lib/dayjs';
import { db } from '@/lib/db';
import { exportCsv, type ExportTarget } from '@/utils/export';
import { formatCategory } from '@/utils/formatters';
import { BarChartOutlined, DownloadOutlined, ReloadOutlined, ShoppingCartOutlined } from '@ant-design/icons';
import { App, Button, Card, DatePicker, Dropdown, Empty, Grid, Select, Statistic, Typography } from 'antd';
import type { MenuProps } from 'antd';
import { useState } from 'react';
import { Loading } from '../components/Loading';
import DesktopSalesTable from './sales-report/DesktopSalesTable';
import MobileSalesList from './sales-report/MobileSalesList';
import TopProductsTable from './sales-report/TopProductsTable';

const { Title, Text } = Typography;
const { useBreakpoint } = Grid;

export default function SalesReport() {
  const { message } = App.useApp();
  const [startDate, setStartDate] = useState<string | undefined>(dayjs.tz().format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState<string | undefined>(dayjs.tz().format('YYYY-MM-DD'));
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>([
    dayjs.tz().startOf('day'),
    dayjs.tz().endOf('day'),
  ]);
  const [selectedHelper, setSelectedHelper] = useState<string | undefined>('today');

  // New Filter States
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<string | undefined>('SEMUA');
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);

  const { data, isLoading, error, refetch } = useSalesReport(startDate, endDate, selectedPaymentMethod, selectedCategories);

  const screens = useBreakpoint();

  const handleDownload = async (target: ExportTarget = 'auto') => {
    if (!data) return;

    try {
      const transactionIds = data.transactions.map(t => t.id);
      const allItems = await db.transactionItems
        .where('transaction_id')
        .anyOf(transactionIds)
        .toArray();

      const products = await db.products.toArray();
      const productMap = new Map(products.map(p => [p.id, p]));

      const csvRows = [
        ['SECTION 1: RINGKASAN TRANSAKSI'],
        ['No. Transaksi', 'Tanggal', 'Metode Pembayaran', 'Total Penjualan', 'Pembayaran', 'Kembalian'],
        ...data.transactions.map((t) => [
          t.transaction_number,
          dayjs(t.created_at).tz().format('YYYY-MM-DD HH:mm:ss'),
          t.payment_method || 'TUNAI',
          t.total_amount,
          t.payment_amount,
          t.change_amount,
        ]),
        [],
        ['SECTION 2: DETAIL ITEM PER TRANSAKSI'],
        ['No. Transaksi', 'Tanggal', 'Nama Produk', 'Kategori', 'Jumlah', 'Satuan', 'Harga Satuan', 'Subtotal', 'HPP', 'Profit'],
        ...allItems.map((item) => {
          const trans = data.transactions.find(t => t.id === item.transaction_id);
          const product = productMap.get(item.product_id);
          return [
            trans?.transaction_number || '-',
            dayjs(item.created_at).tz().format('YYYY-MM-DD HH:mm:ss'),
            item.product_name,
            formatCategory(product?.category || 'lainnya'),
            item.quantity,
            item.unit,
            item.price,
            item.subtotal,
            item.purchase_price,
            item.profit,
          ];
        }),
        [],
        ['RINGKASAN LAPORAN'],
        ['Total Transaksi', data.transactions.length],
        ['Total Penjualan', data.totalRevenue],
        ['Total Keuntungan', data.totalProfit],
        ['Total Item Terjual', data.totalItems],
        ['Rata-rata Transaksi', data.averageTransaction],
      ];

      const exported = await exportCsv({
        filename: `laporan-penjualan-${dayjs().tz().format('YYYY-MM-DD')}.csv`,
        rows: csvRows,
        target,
      });
      if (!exported) return;
      message.success('Export laporan penjualan berhasil.');
    } catch (error) {
      console.error('Failed to export sales report:', error);
      message.error('Gagal export laporan penjualan.');
    }
  };

  const exportMenuItems: MenuProps['items'] = [
    { key: 'share', label: 'Bagikan' },
    { key: 'save', label: 'Simpan ke File' },
  ];

  const handleExportMenuClick: NonNullable<MenuProps['onClick']> = ({ key }) => {
    void handleDownload(key as ExportTarget);
  };

  const handleDateRangeChange = (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    setDateRange(dates);
    if (selectedHelper !== 'custom') {
      setSelectedHelper('custom');
    }
    if (dates && dates[0] && dates[1]) {
      setStartDate(dates[0].format('YYYY-MM-DD'));
      setEndDate(dates[1].format('YYYY-MM-DD'));
    } else {
      setStartDate(undefined);
      setEndDate(undefined);
    }
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

    if (range) {
      setDateRange(range);
      setStartDate(range[0].format('YYYY-MM-DD'));
      setEndDate(range[1].format('YYYY-MM-DD'));
    } else {
      setDateRange(null);
      setStartDate(undefined);
      setEndDate(undefined);
    }
  };

  const handleReset = () => {
    const todayRange: [dayjs.Dayjs, dayjs.Dayjs] = [dayjs.tz().startOf('day'), dayjs.tz().endOf('day')];
    setDateRange(todayRange);
    setStartDate(todayRange[0].format('YYYY-MM-DD'));
    setEndDate(todayRange[1].format('YYYY-MM-DD'));
    setSelectedHelper('today');
    setSelectedPaymentMethod('SEMUA');
    setSelectedCategories([]);
  };

  if (isLoading) {
    return <Loading />;
  }

  if (error) {
    return (
      <div className="p-6">
        <Empty
          description={`Terjadi kesalahan: ${error instanceof Error ? error.message : 'Unknown error'}`}
        />
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 bg-[#FDFDFD] min-h-screen">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <Title level={4} className="!mb-1 !font-bold text-gray-900">Laporan Penjualan</Title>
          <p className="text-gray-500 text-xs sm:text-sm">Analisis performa penjualan dan produk terlaris Anda</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5"
            icon={<ReloadOutlined className="text-[12px]" />}
            onClick={() => refetch()}
            loading={isLoading}
          >
            Refresh
          </Button>
          <Dropdown menu={{ items: exportMenuItems, onClick: handleExportMenuClick }} trigger={['click']}>
            <Button
              type="primary"
              className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 bg-[#2563EB] hover:bg-[#1D4ED8] border-none shadow-sm"
              icon={<DownloadOutlined className="text-[12px]" />}
              disabled={!data || data.transactions.length === 0}
            >
              Export CSV
            </Button>
          </Dropdown>
        </div>
      </div>

      {/* FILTER SECTION */}
      <div className="mb-8 bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
        <div className="text-[11px] font-bold text-gray-400 tracking-[0.1em] mb-4 uppercase">PARAMETER LAPORAN</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-5">
            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-gray-700 ml-0.5">Kategori Produk (Filter Breakdown)</span>
              <Select
                mode="multiple"
                placeholder="Semua kategori"
                className="w-full"
                value={selectedCategories}
                onChange={setSelectedCategories}
                allowClear
                options={PRODUCT_CATEGORIES}
                size="large"
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <span className="text-[13px] font-medium text-gray-700 ml-0.5">Metode Pembayaran</span>
              <Select
                placeholder="Semua metode"
                className="w-full"
                value={selectedPaymentMethod}
                onChange={setSelectedPaymentMethod}
                options={[
                  { value: 'SEMUA', label: 'Semua Metode' },
                  { value: 'TUNAI', label: 'Tunai' },
                  { value: 'NON_TUNAI', label: 'Non-Tunai' },
                ]}
                size="large"
              />
            </div>
          </div>

          <div className="flex flex-col gap-2.5">
            <span className="text-[13px] font-medium text-gray-700 ml-0.5">Rentang Waktu</span>
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'today', label: 'Hari ini' },
                { key: 'yesterday', label: 'Kemarin' },
                { key: 'this-week', label: 'Minggu ini' },
                { key: 'this-month', label: 'Bulan ini' },
                { key: 'last-month', label: 'Bulan lalu' },
                { key: 'custom', label: 'Custom' },
              ].map((helper) => (
                <Button
                  key={helper.key}
                  size={screens.md ? 'middle' : 'small'}
                  className={`rounded-full px-4 text-[12px] font-medium transition-all ${selectedHelper === helper.key ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-gray-50 text-gray-600 border-gray-200 hover:border-[#2563EB]'}`}
                  onClick={() => handleHelperChange(helper.key)}
                >
                  {helper.label}
                </Button>
              ))}

              {(selectedCategories.length > 0 || selectedHelper !== 'today' || selectedPaymentMethod !== 'SEMUA') && (
                <Button type="link" onClick={handleReset} className="text-gray-400 hover:text-red-500 flex items-center gap-1">
                  <ReloadOutlined className="text-[10px]" /> Reset Semua
                </Button>
              )}
            </div>

            {selectedHelper === 'custom' && (
              <div className="mt-2 animate-in fade-in slide-in-from-top-1 duration-300">
                <DatePicker.RangePicker
                  value={dateRange}
                  onChange={handleDateRangeChange}
                  format="YYYY-MM-DD"
                  placeholder={['Mulai', 'Hingga']}
                  className="w-full sm:w-[320px] rounded-lg"
                  size="large"
                />
              </div>
            )}
          </div>
        </div>
      </div>

      {/* SUMMARY STATISTICS */}
      {data && data.transactions.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
          {[
            { title: 'Total Transaksi', value: data.transactions.length, suffix: 'transaksi', color: '#1890ff', border: 'border-l-blue-500' },
            { title: 'Total Penjualan', value: data.totalRevenue, prefix: 'Rp ', color: '#52c41a', border: 'border-l-green-500', isCurrency: true },
            { title: 'Total Keuntungan', value: data.totalProfit, prefix: 'Rp ', color: '#faad14', border: 'border-l-orange-500', isCurrency: true },
            { title: 'Total Item', value: data.totalItems, suffix: 'item', color: '#722ed1', border: 'border-l-purple-500' },
            { title: 'Rata-rata Transaksi', value: data.averageTransaction, prefix: 'Rp ', color: '#eb2f96', border: 'border-l-pink-500', isCurrency: true },
          ].map((stat, idx) => (
            <Card key={idx} className={`shadow-sm border-none border-l-4 ${stat.border} rounded-xl overflow-hidden`}>
              <Statistic
                title={<Text type="secondary" className="text-[11px] uppercase font-bold tracking-wider">{stat.title}</Text>}
                value={stat.value}
                prefix={stat.prefix}
                suffix={stat.suffix}
                precision={stat.isCurrency ? 2 : 0}
                valueStyle={{ color: stat.color, fontWeight: 'bold', fontSize: screens.md ? '20px' : '16px' }}
              />
            </Card>
          ))}
        </div>
      )}

      {/* TOP PRODUCTS SECTION */}
      {data && data.topProducts.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center gap-2 mb-4 ml-1">
            <BarChartOutlined className="text-orange-500" />
            <div className="text-[11px] font-bold text-gray-400 tracking-[0.1em] uppercase">BREAKDOWN PRODUK TERLARIS (TOP 10)</div>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <TopProductsTable products={data.topProducts} />
          </div>
        </div>
      )}

      {/* DATA SECTION */}
      <div>
        <div className="flex items-center gap-2 mb-4 ml-1">
          <ShoppingCartOutlined className="text-blue-500" />
          <div className="text-[11px] font-bold text-gray-400 tracking-[0.1em] uppercase">DAFTAR TRANSAKSI</div>
        </div>

        {/* Desktop View */}
        <div className="hidden md:block bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
          <DesktopSalesTable
            transactions={data?.transactions || []}
            totalRevenue={data?.totalRevenue || 0}
          />
        </div>

        {/* Mobile View */}
        <div className="md:hidden">
          <MobileSalesList
            transactions={data?.transactions || []}
            totalRevenue={data?.totalRevenue || 0}
          />
        </div>
      </div>

      {data && data.transactions.length === 0 && !isLoading && (
        <div className="bg-white py-16 rounded-xl border border-gray-100 shadow-sm text-center">
          <p className="text-gray-400 italic">Tidak ada data transaksi untuk filter ini</p>
        </div>
      )}
    </div>
  );
}
