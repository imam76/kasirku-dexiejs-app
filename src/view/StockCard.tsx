import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Typography, Select, DatePicker, Button, Table, Card, Empty } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs from '@/lib/dayjs';
import { useStockManagement } from '@/hooks/useStockManagement';
import { getStockCard } from '@/services/stockCardService';
import { Loading } from '@/components/Loading';
import type { StockCardRow } from '@/services/stockCardService';

const { Title } = Typography;

export default function StockCard() {
  const { products } = useStockManagement();

  const [selectedProductId, setSelectedProductId] = useState<string | undefined>(undefined);
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs]>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ]);

  const startDate = dateRange[0].toDate();
  const endDate = dateRange[1].toDate();

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['stockCard', selectedProductId, startDate.toISOString(), endDate.toISOString()],
    queryFn: () => getStockCard(selectedProductId!, startDate, endDate),
    enabled: !!selectedProductId,
  });

  const handleDateRangeChange = (dates: [dayjs.Dayjs | null, dayjs.Dayjs | null] | null) => {
    if (dates && dates[0] && dates[1]) {
      setDateRange([dates[0].startOf('day'), dates[1].endOf('day')]);
    }
  };

  const columns = [
    {
      title: 'Tanggal',
      dataIndex: 'date',
      key: 'date',
      render: (date: string) => dayjs(date).format('DD MMM YYYY HH:mm'),
    },
    {
      title: 'Tipe Transaksi',
      dataIndex: 'sourceType',
      key: 'sourceType',
      render: (type: string) => {
        const types: Record<string, string> = {
          'OPENING_BALANCE': 'Saldo Awal Sistem',
          'SALDO_AWAL': 'Saldo Awal Periode',
          'OPENING_STOCK': 'Saldo Awal Stok',
          'STOCK_PURCHASE': 'Pembelian Stok',
          'POS_SALE': 'Penjualan (POS)',
          'POS_VOID': 'Batal Penjualan (POS)',
          'PURCHASE_RECEIPT': 'Penerimaan Pembelian',
          'PURCHASE_RECEIPT_VOID': 'Batal Penerimaan',
          'PURCHASE_INVOICE': 'Invoice Pembelian Langsung',
          'PURCHASE_INVOICE_VOID': 'Batal Invoice Pembelian',
          'PURCHASE_RETURN': 'Retur Pembelian',
          'PURCHASE_RETURN_VOID': 'Batal Retur Pembelian',
          'SALES_DELIVERY': 'Pengiriman Penjualan',
          'SALES_DELIVERY_VOID': 'Batal Pengiriman',
          'SALES_RETURN': 'Retur Penjualan',
          'SALES_RETURN_VOID': 'Batal Retur Penjualan',
          'STOCK_OPNAME': 'Stock Opname',
          'PRODUCTION_CONSUMPTION': 'Produksi - Bahan Keluar',
          'PRODUCTION_OUTPUT': 'Produksi - Barang Jadi',
          'PRODUCTION_VOID': 'Void Produksi',
        };
        return types[type] || type;
      },
    },
    {
      title: 'No. Referensi',
      dataIndex: 'sourceNumber',
      key: 'sourceNumber',
    },
    {
      title: 'Masuk',
      dataIndex: 'qtyIn',
      key: 'qtyIn',
      render: (val: number, record: StockCardRow) => val > 0 ? `${val} ${record.unit}` : '-',
    },
    {
      title: 'Keluar',
      dataIndex: 'qtyOut',
      key: 'qtyOut',
      render: (val: number, record: StockCardRow) => val > 0 ? `${val} ${record.unit}` : '-',
    },
    {
      title: 'Sisa Stok',
      dataIndex: 'balance',
      key: 'balance',
      render: (val: number, record: StockCardRow) => <span className="font-bold">{val} {record.unit}</span>,
    },
  ];

  return (
    <div className="p-4 sm:p-6 bg-[#FDFDFD] min-h-screen">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-8">
        <div>
          <Title level={4} className="!mb-1 !font-bold text-gray-900">Kartu Stok</Title>
          <p className="text-gray-500 text-xs sm:text-sm">Pantau pergerakan stok barang secara mendetail</p>
        </div>
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button
            className="flex-1 sm:flex-none flex items-center justify-center gap-1.5"
            icon={<ReloadOutlined className="text-[12px]" />}
            onClick={() => refetch()}
            loading={isFetching}
            disabled={!selectedProductId}
          >
            Perbarui
          </Button>
        </div>
      </div>

      <div className="mb-8 bg-white p-5 rounded-xl border border-gray-100 shadow-sm">
        <div className="text-[11px] font-bold text-gray-400 tracking-[0.1em] mb-4 uppercase">Filter Laporan</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-gray-700 ml-0.5">Pilih Produk</span>
            <Select
              showSearch
              placeholder="Cari dan pilih produk..."
              className="w-full"
              value={selectedProductId}
              onChange={setSelectedProductId}
              size="large"
              options={products.map(p => ({ label: p.name, value: p.id }))}
              filterOption={(input, option) =>
                (option?.label ?? '').toLowerCase().includes(input.toLowerCase())
              }
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-gray-700 ml-0.5">Rentang Waktu</span>
            <DatePicker.RangePicker
              value={dateRange}
              onChange={(dates) => handleDateRangeChange(dates)}
              format="DD MMM YYYY"
              className="w-full rounded-lg"
              size="large"
              allowClear={false}
            />
          </div>
        </div>
      </div>

      <Card className="shadow-sm border border-gray-100 rounded-xl overflow-hidden">
        {!selectedProductId ? (
          <div className="py-16 text-center">
            <Empty description="Pilih produk terlebih dahulu untuk melihat kartu stok" />
          </div>
        ) : isLoading ? (
          <Loading />
        ) : (
          <Table
            dataSource={data?.rows || []}
            columns={columns}
            rowKey="id"
            pagination={false}
            scroll={{ x: 800 }}
            className="[&_.ant-table-thead_th]:!bg-gray-50 [&_.ant-table-thead_th]:!text-gray-500 [&_.ant-table-thead_th]:!font-medium [&_.ant-table-thead_th]:!text-xs [&_.ant-table-thead_th]:uppercase [&_.ant-table-thead_th]:tracking-wider"
          />
        )}
      </Card>
    </div>
  );
}
