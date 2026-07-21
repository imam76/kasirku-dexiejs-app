import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Typography, Select, DatePicker, Button, Card, Empty } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import dayjs from '@/lib/dayjs';
import { useStockManagement } from '@/hooks/useStockManagement';
import { getStockCard } from '@/services/stockCardService';
import { Loading } from '@/components/Loading';
import type { StockCardRow } from '@/services/stockCardService';

const { Title } = Typography;

const sourceTypeLabels: Record<string, string> = {
  OPENING_BALANCE: 'Saldo Awal Sistem',
  SALDO_AWAL: 'Saldo Awal Periode',
  OPENING_STOCK: 'Saldo Awal Stok',
  STOCK_PURCHASE: 'Pembelian Stok',
  POS_SALE: 'Penjualan (POS)',
  POS_VOID: 'Batal Penjualan (POS)',
  PURCHASE_RECEIPT: 'Penerimaan Pembelian',
  PURCHASE_RECEIPT_VOID: 'Batal Penerimaan',
  PURCHASE_INVOICE: 'Invoice Pembelian Langsung',
  PURCHASE_INVOICE_VOID: 'Batal Invoice Pembelian',
  PURCHASE_RETURN: 'Retur Pembelian',
  PURCHASE_RETURN_VOID: 'Batal Retur Pembelian',
  SALES_DELIVERY: 'Pengiriman Penjualan',
  SALES_DELIVERY_VOID: 'Batal Pengiriman',
  SALES_RETURN: 'Retur Penjualan',
  SALES_RETURN_VOID: 'Batal Retur Penjualan',
  STOCK_OPNAME: 'Stock Opname',
  PRODUCTION_CONSUMPTION: 'Produksi - Bahan Keluar',
  PRODUCTION_OUTPUT: 'Produksi - Barang Jadi',
  PRODUCTION_VOID: 'Void Produksi',
};

const formatQuantity = (value: number, row: StockCardRow) => (
  value > 0 ? `${value} ${row.unit}` : '-'
);

const StockCardVirtualTable = ({ rows }: { rows: StockCardRow[] }) => {
  const parentRef = useRef<HTMLDivElement>(null);
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => rows[index]?.id ?? index,
    estimateSize: () => 56,
    overscan: 10,
  });
  const gridTemplateColumns = '170px 220px minmax(180px,1fr) 120px 120px 140px';
  const viewportHeight = rows.length === 0
    ? 160
    : Math.min(640, Math.max(160, rows.length * 56));

  return (
    <div className="overflow-x-auto">
      <div style={{ minWidth: 900 }}>
        <div
          className="grid border-b border-gray-100 bg-gray-50 text-xs font-medium uppercase tracking-wider text-gray-500"
          style={{ gridTemplateColumns }}
        >
          {['Tanggal', 'Tipe Transaksi', 'No. Referensi', 'Masuk', 'Keluar', 'Sisa Stok'].map((label) => (
            <div
              key={label}
              className={`px-4 py-3 ${['Masuk', 'Keluar', 'Sisa Stok'].includes(label) ? 'text-right' : ''}`}
            >
              {label}
            </div>
          ))}
        </div>

        {rows.length === 0 ? (
          <div className="flex h-40 items-center justify-center text-sm text-gray-400">
            Tidak ada mutasi stok untuk filter ini
          </div>
        ) : (
          <div ref={parentRef} style={{ height: viewportHeight, overflow: 'auto' }}>
            <div style={{ height: rowVirtualizer.getTotalSize(), position: 'relative', width: '100%' }}>
              {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                const row = rows[virtualRow.index];
                if (!row) return null;

                return (
                  <div
                    key={virtualRow.key}
                    className="grid border-b border-gray-50 text-sm text-gray-700 hover:bg-gray-50/80"
                    style={{
                      gridTemplateColumns,
                      height: 56,
                      left: 0,
                      position: 'absolute',
                      top: 0,
                      transform: `translateY(${virtualRow.start}px)`,
                      width: '100%',
                    }}
                  >
                    <div className="truncate px-4 py-3 text-gray-600">{dayjs(row.date).format('DD MMM YYYY HH:mm')}</div>
                    <div className="truncate px-4 py-3 text-gray-700" title={sourceTypeLabels[row.sourceType] || row.sourceType}>{sourceTypeLabels[row.sourceType] || row.sourceType}</div>
                    <div className="truncate px-4 py-3 text-gray-700" title={row.sourceNumber}>{row.sourceNumber}</div>
                    <div className="px-4 py-3 text-right text-emerald-700">{formatQuantity(row.qtyIn, row)}</div>
                    <div className="px-4 py-3 text-right text-red-600">{formatQuantity(row.qtyOut, row)}</div>
                    <div className="px-4 py-3 text-right font-bold text-gray-900">{row.balance} {row.unit}</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

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
          <StockCardVirtualTable rows={data?.rows || []} />
        )}
      </Card>
    </div>
  );
}
