import { useState } from 'react';
import { Card, Button, DatePicker, Space, Table, Statistic, Empty, Select } from 'antd';
import { DownloadOutlined, FilterOutlined } from '@ant-design/icons';
import dayjs from '@/lib/dayjs';
import { useSalesReport } from '@/hooks/useReports';
import { formatCurrency } from '@/utils/formatters';
import { Loading } from './Loading';

export default function SalesReport() {
  const [startDate, setStartDate] = useState<string | undefined>(dayjs.tz().format('YYYY-MM-DD'));
  const [endDate, setEndDate] = useState<string | undefined>(dayjs.tz().format('YYYY-MM-DD'));
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs | null, dayjs.Dayjs | null] | null>(null);
  const [selectedHelper, setSelectedHelper] = useState<string | undefined>('today');

  const { data, isLoading, error } = useSalesReport(startDate, endDate);

  const handleDateRangeChange = (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    setDateRange(dates);
    if (selectedHelper !== 'custom') {
      setSelectedHelper(undefined);
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
        range = [dayjs.tz().startOf('week'), dayjs.tz().endOf('week')];
        break;
      case 'last-week':
        range = [dayjs.tz().subtract(1, 'week').startOf('week'), dayjs.tz().subtract(1, 'week').endOf('week')];
        break;
      case 'this-month':
        range = [dayjs.tz().startOf('month'), dayjs.tz().endOf('month')];
        break;
      case 'last-month':
        range = [dayjs.tz().subtract(1, 'month').startOf('month'), dayjs.tz().subtract(1, 'month').endOf('month')];
        break;
      case 'custom':
        // Don't set range, let the user pick from DatePicker
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
    setDateRange(null);
    setStartDate(undefined);
    setEndDate(undefined);
    setSelectedHelper(undefined);
  };

  const handleDownload = () => {
    if (!data) return;

    const csv = [
      ['Laporan Penjualan', dayjs().tz().format('YYYY-MM-DD HH:mm:ss')],
      [`Periode: ${startDate || 'Semua'} s/d ${endDate || 'Semua'}`],
      [],
      ['No. Transaksi', 'Tanggal', 'Total Penjualan', 'Pembayaran', 'Kembalian'],
      ...data.transactions.map((t) => [
        t.transaction_number,
        dayjs(t.created_at).tz().format('YYYY-MM-DD HH:mm:ss'),
        t.total_amount,
        t.payment_amount,
        t.change_amount,
      ]),
      [],
      ['Ringkasan'],
      ['Total Transaksi', data.transactions.length],
      ['Total Penjualan', data.totalRevenue],
      ['Total Keuntungan', data.totalProfit],
      ['Total Item Terjual', data.totalItems],
      ['Rata-rata Transaksi', data.averageTransaction],
    ]
      .map((row) => row.join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laporan-penjualan-${dayjs().tz().format('YYYY-MM-DD')}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const columns = [
    {
      title: 'No. Transaksi',
      dataIndex: 'transaction_number',
      key: 'transaction_number',
      width: 150,
    },
    {
      title: 'Tanggal',
      dataIndex: 'created_at',
      key: 'created_at',
      width: 180,
      render: (date: string) => dayjs(date).tz().format('YYYY-MM-DD HH:mm:ss'),
    },
    {
      title: 'Total Penjualan',
      dataIndex: 'total_amount',
      key: 'total_amount',
      width: 150,
      render: (amount: number) => <span className="text-green-600 font-semibold">{formatCurrency(amount)}</span>,
    },
    {
      title: 'Pembayaran',
      dataIndex: 'payment_amount',
      key: 'payment_amount',
      width: 150,
      render: (amount: number) => formatCurrency(amount),
    },
    {
      title: 'Kembalian',
      dataIndex: 'change_amount',
      key: 'change_amount',
      width: 150,
      render: (amount: number) => formatCurrency(amount),
    },
  ];

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
    <div className="p-4 sm:p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">Laporan Penjualan</h2>

      {/* Filter Section */}
      <Card className="mb-6">
        <Space orientation="vertical" className="w-full" size="large">
          <Space wrap>
            <FilterOutlined className="text-gray-600" />
            <span className="font-semibold">Filter Tanggal:</span>
            <Select
              placeholder="Pilih Periode"
              style={{ width: 150 }}
              value={selectedHelper}
              onChange={handleHelperChange}
              allowClear
              options={[
                { value: 'today', label: 'Hari Ini' },
                { value: 'yesterday', label: 'Kemarin' },
                { value: 'this-week', label: 'Minggu Ini' },
                { value: 'last-week', label: 'Minggu Lalu' },
                { value: 'this-month', label: 'Bulan Ini' },
                { value: 'last-month', label: 'Bulan Lalu' },
                { value: 'custom', label: 'Custom Range' },
              ]}
            />
            {selectedHelper === 'custom' && (
              <DatePicker.RangePicker
                value={dateRange}
                onChange={handleDateRangeChange}
                format="YYYY-MM-DD"
                placeholder={['Mulai', 'Hingga']}
              />
            )}
            <Button onClick={handleReset}>Reset</Button>
            <Button
              type="primary"
              icon={<DownloadOutlined />}
              onClick={handleDownload}
              disabled={!data || data.transactions.length === 0}
            >
              Download CSV
            </Button>
          </Space>
        </Space>
      </Card>

      {/* Summary Statistics */}
      {data && data.transactions.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
          <Card>
            <Statistic
              title="Total Transaksi"
              value={data.transactions.length}
              suffix="transaksi"
              valueStyle={{ color: '#1890ff' }}
            />
          </Card>
          <Card>
            <Statistic
              title="Total Penjualan"
              value={data.totalRevenue}
              prefix="Rp "
              precision={2}
              valueStyle={{ color: '#52c41a' }}
            />
          </Card>
          <Card>
            <Statistic
              title="Total Keuntungan"
              value={data.totalProfit}
              prefix="Rp "
              precision={2}
              valueStyle={{ color: '#faad14' }}
            />
          </Card>
          <Card>
            <Statistic
              title="Total Item"
              value={data.totalItems}
              suffix="item"
              valueStyle={{ color: '#722ed1' }}
            />
          </Card>
          <Card>
            <Statistic
              title="Rata-rata Transaksi"
              value={data.averageTransaction}
              prefix="Rp "
              precision={2}
              valueStyle={{ color: '#eb2f96' }}
            />
          </Card>
        </div>
      )}

      {/* Transactions Table */}
      {data && data.transactions.length > 0 ? (
        <Card>
          <Table
            columns={columns}
            dataSource={data.transactions.map((t) => ({
              ...t,
              key: t.id,
            }))}
            pagination={{
              pageSize: 10,
              showSizeChanger: true,
              showTotal: (total) => `Total ${total} transaksi`,
            }}
            scroll={{ x: 768 }}
          />
        </Card>
      ) : (
        <Empty description="Tidak ada data transaksi untuk periode ini" />
      )}
    </div>
  );
}
