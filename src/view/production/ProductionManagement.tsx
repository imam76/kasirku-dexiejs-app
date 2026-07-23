import { useMemo, useState } from 'react';
import { Button, DatePicker, Input, Select, Space, Table, Tag } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { Eye, Package, Plus, RefreshCw } from 'lucide-react';
import ManagementListCard from '@/components/ManagementListCard';
import { useProductionOrders } from '@/hooks/useProductionOrders';
import dayjs from '@/lib/dayjs';
import type { ProductionOrder, ProductionOrderStatus } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import ProductionOrderDetail from './ProductionOrderDetail';
import ProductionOrderForm from './ProductionOrderForm';

type ScreenState =
  | { type: 'list' }
  | { type: 'form' }
  | { type: 'detail'; productionOrderId: string };

type StatusFilter = ProductionOrderStatus | 'ALL';

const statusColor: Record<ProductionOrderStatus, string> = {
  DRAFT: 'default',
  POSTED: 'green',
  VOIDED: 'red',
};

const formatMoney = (value: number) => `Rp ${formatCurrency(Math.round(value || 0))}`;

export default function ProductionManagement() {
  const [screen, setScreen] = useState<ScreenState>({ type: 'list' });
  const [searchText, setSearchText] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [dateRange, setDateRange] = useState<[dayjs.Dayjs, dayjs.Dayjs] | null>([
    dayjs().startOf('month'),
    dayjs().endOf('month'),
  ]);

  const filters = useMemo(() => ({
    searchText,
    status: statusFilter,
    startDate: dateRange?.[0].startOf('day').toISOString(),
    endDate: dateRange?.[1].endOf('day').toISOString(),
  }), [dateRange, searchText, statusFilter]);

  const {
    orders,
    isLoadingOrders,
    isFetchingOrders,
    refetchOrders,
  } = useProductionOrders({ filters });

  if (screen.type === 'form') {
    return (
      <ProductionOrderForm
        onBack={() => setScreen({ type: 'list' })}
        onSaved={(productionOrderId) => setScreen({ type: 'detail', productionOrderId })}
        onPosted={(productionOrderId) => setScreen({ type: 'detail', productionOrderId })}
      />
    );
  }

  if (screen.type === 'detail') {
    return (
      <ProductionOrderDetail
        productionOrderId={screen.productionOrderId}
        onBack={() => setScreen({ type: 'list' })}
      />
    );
  }

  const columns: ColumnsType<ProductionOrder> = [
    {
      title: 'Nomor',
      dataIndex: 'production_number',
      key: 'production_number',
      width: 180,
      render: (value: string, order) => (
        <Button
          type="link"
          className="!px-0"
          onClick={() => setScreen({ type: 'detail', productionOrderId: order.id })}
        >
          {value}
        </Button>
      ),
    },
    {
      title: 'Status',
      dataIndex: 'status',
      key: 'status',
      width: 120,
      render: (status: ProductionOrderStatus) => <Tag color={statusColor[status]}>{status}</Tag>,
    },
    {
      title: 'Tanggal',
      dataIndex: 'produced_at',
      key: 'produced_at',
      width: 180,
      render: (value: string) => dayjs(value).tz().format('DD MMM YYYY HH:mm'),
    },
    {
      title: 'Barang jadi',
      dataIndex: 'finished_product_name',
      key: 'finished_product_name',
      width: 240,
    },
    {
      title: 'Qty',
      key: 'quantity_produced',
      align: 'right',
      width: 130,
      render: (_value, order) => `${order.quantity_produced.toLocaleString('id-ID')} ${order.unit}`,
    },
    {
      title: 'Total biaya',
      dataIndex: 'total_cost',
      key: 'total_cost',
      align: 'right',
      width: 160,
      render: (value: number) => formatMoney(value),
    },
    {
      title: 'HPP/unit',
      dataIndex: 'unit_cost',
      key: 'unit_cost',
      align: 'right',
      width: 150,
      render: (value: number) => formatMoney(value),
    },
    {
      title: 'Aksi',
      key: 'action',
      fixed: 'right',
      width: 110,
      render: (_value, order) => (
        <Button
          type="text"
          icon={<Eye size={16} />}
          onClick={() => setScreen({ type: 'detail', productionOrderId: order.id })}
        >
          Detail
        </Button>
      ),
    },
  ];

  return (
    <ManagementListCard
      title="Produksi"
      icon={<Package className="h-5 w-5" />}
      actions={(
        <Button type="primary" icon={<Plus size={16} />} onClick={() => setScreen({ type: 'form' })}>
          Produksi Baru
        </Button>
      )}
      toolbar={(
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_280px_auto]">
          <Input.Search
            allowClear
            value={searchText}
            placeholder="Cari nomor produksi atau barang jadi..."
            onChange={(event) => setSearchText(event.target.value)}
          />
          <Select<StatusFilter>
            value={statusFilter}
            onChange={setStatusFilter}
            options={[
              { value: 'ALL', label: 'Semua status' },
              { value: 'DRAFT', label: 'Draft' },
              { value: 'POSTED', label: 'Posted' },
              { value: 'VOIDED', label: 'Voided' },
            ]}
          />
          <DatePicker.RangePicker
            value={dateRange}
            allowClear
            format="DD MMM YYYY"
            onChange={(value) => {
              if (value?.[0] && value[1]) {
                setDateRange([value[0], value[1]]);
                return;
              }
              setDateRange(null);
            }}
          />
          <Space>
            <Button icon={<RefreshCw size={16} />} loading={isFetchingOrders} onClick={() => refetchOrders()}>
              Refresh
            </Button>
          </Space>
        </div>
      )}
    >
      <Table
        rowKey="id"
        columns={columns}
        dataSource={orders}
        loading={isLoadingOrders}
        scroll={{ x: 1200 }}
        pagination={{ pageSize: 20, showSizeChanger: true }}
      />
    </ManagementListCard>
  );
}
