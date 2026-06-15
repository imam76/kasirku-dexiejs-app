import { App, Button, Card, Descriptions, Space, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeft, Ban, Send } from 'lucide-react';
import { useProductionOrders } from '@/hooks/useProductionOrders';
import dayjs from '@/lib/dayjs';
import type { ProductionOrderCost, ProductionOrderItem, ProductionOrderStatus } from '@/types';
import { formatCurrency } from '@/utils/formatters';

interface ProductionOrderDetailProps {
  productionOrderId: string;
  onBack: () => void;
}

const { Title, Text } = Typography;

const formatMoney = (value: number) => `Rp ${formatCurrency(Math.round(value || 0))}`;

const statusColor: Record<ProductionOrderStatus, string> = {
  DRAFT: 'default',
  POSTED: 'green',
  VOIDED: 'red',
};

export default function ProductionOrderDetail({ productionOrderId, onBack }: ProductionOrderDetailProps) {
  const { modal, message } = App.useApp();
  const {
    detail,
    isLoadingDetail,
    postDraft,
    voidOrder,
    isPostingDraft,
    isVoidingOrder,
  } = useProductionOrders({ detailId: productionOrderId });

  const order = detail?.order;
  const items = detail?.items ?? [];
  const costs = detail?.costs ?? [];

  const handlePost = async () => {
    if (!order) return;

    try {
      await postDraft({ productionOrderId: order.id });
    } catch (error) {
      message.error(error instanceof Error ? error.message : 'Gagal posting produksi.');
    }
  };

  const handleVoid = async () => {
    if (!order) return;

    modal.confirm({
      title: `Void produksi ${order.production_number}?`,
      content: 'Stok akan dibalik sesuai data produksi ini.',
      okText: 'Void',
      okButtonProps: { danger: true },
      cancelText: 'Batal',
      onOk: async () => {
        try {
          await voidOrder({ productionOrderId: order.id, reason: 'Void dari halaman produksi' });
        } catch (error) {
          message.error(error instanceof Error ? error.message : 'Gagal void produksi.');
        }
      },
    });
  };

  const itemColumns: ColumnsType<ProductionOrderItem> = [
    {
      title: 'Bahan baku',
      dataIndex: 'material_product_name',
      key: 'material_product_name',
      render: (value: string, item) => (
        <div>
          <div className="font-medium">{value}</div>
          {item.sku ? <Text type="secondary">{item.sku}</Text> : null}
        </div>
      ),
    },
    {
      title: 'Jumlah',
      key: 'quantity_used',
      align: 'right',
      width: 160,
      render: (_value, item) => `${item.quantity_used.toLocaleString('id-ID')} ${item.unit}`,
    },
    {
      title: 'Qty stok',
      key: 'stock_quantity_used',
      align: 'right',
      width: 160,
      render: (_value, item) => `${item.stock_quantity_used.toLocaleString('id-ID')} ${item.stock_unit}`,
    },
    {
      title: 'HPP/unit',
      dataIndex: 'cost_per_unit',
      key: 'cost_per_unit',
      align: 'right',
      width: 150,
      render: (value: number) => formatMoney(value),
    },
    {
      title: 'Total',
      dataIndex: 'total_cost',
      key: 'total_cost',
      align: 'right',
      width: 150,
      render: (value: number) => formatMoney(value),
    },
  ];

  const costColumns: ColumnsType<ProductionOrderCost> = [
    {
      title: 'Biaya',
      dataIndex: 'name',
      key: 'name',
    },
    {
      title: 'Akun',
      key: 'account',
      render: (_value, cost) => cost.account_name ?? '-',
    },
    {
      title: 'Nominal',
      dataIndex: 'amount',
      key: 'amount',
      align: 'right',
      width: 160,
      render: (value: number) => formatMoney(value),
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Space>
          <Button icon={<ArrowLeft size={16} />} onClick={onBack}>
            Kembali
          </Button>
          <Title level={4} className="!mb-0">Detail Produksi</Title>
        </Space>
        {order ? (
          <Space wrap>
            {order.status === 'DRAFT' ? (
              <Button type="primary" icon={<Send size={16} />} loading={isPostingDraft} onClick={handlePost}>
                Posting
              </Button>
            ) : null}
            {order.status !== 'VOIDED' ? (
              <Button danger icon={<Ban size={16} />} loading={isVoidingOrder} onClick={handleVoid}>
                Void
              </Button>
            ) : null}
          </Space>
        ) : null}
      </div>

      <Card className="rounded-md shadow-md" loading={isLoadingDetail}>
        {order ? (
          <Descriptions column={{ xs: 1, sm: 2, lg: 3 }} bordered size="small">
            <Descriptions.Item label="Nomor">{order.production_number}</Descriptions.Item>
            <Descriptions.Item label="Status">
              <Tag color={statusColor[order.status]}>{order.status}</Tag>
            </Descriptions.Item>
            <Descriptions.Item label="Tanggal produksi">{dayjs(order.produced_at).tz().format('DD MMM YYYY HH:mm')}</Descriptions.Item>
            <Descriptions.Item label="Barang jadi">{order.finished_product_name}</Descriptions.Item>
            <Descriptions.Item label="Jumlah">{order.quantity_produced.toLocaleString('id-ID')} {order.unit}</Descriptions.Item>
            <Descriptions.Item label="HPP/unit">{formatMoney(order.unit_cost)}</Descriptions.Item>
            <Descriptions.Item label="Total bahan">{formatMoney(order.material_cost)}</Descriptions.Item>
            <Descriptions.Item label="Biaya tambahan">{formatMoney(order.additional_cost)}</Descriptions.Item>
            <Descriptions.Item label="Total produksi">{formatMoney(order.total_cost)}</Descriptions.Item>
            <Descriptions.Item label="Catatan" span={3}>{order.notes ?? '-'}</Descriptions.Item>
          </Descriptions>
        ) : null}
      </Card>

      <Card className="rounded-md shadow-md" title="Bahan Baku">
        <Table
          rowKey="id"
          columns={itemColumns}
          dataSource={items}
          loading={isLoadingDetail}
          pagination={false}
          scroll={{ x: 900 }}
        />
      </Card>

      <Card className="rounded-md shadow-md" title="Biaya Tambahan">
        <Table
          rowKey="id"
          columns={costColumns}
          dataSource={costs}
          loading={isLoadingDetail}
          pagination={false}
          locale={{ emptyText: 'Tidak ada biaya tambahan' }}
          scroll={{ x: 640 }}
        />
      </Card>
    </div>
  );
}
