import { useQuery } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { Alert, Button, Card, Descriptions, Result, Space, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { ArrowLeft } from 'lucide-react';
import dayjs from '@/lib/dayjs';
import {
  marketplaceAdapter,
  marketplaceErrorMessage,
  type MarketplaceOrderItemDto,
} from '@/services/marketplaceAdapter';
import { isTauriRuntime } from '@/utils/export/platform';
import { Route } from '@/routes/marketplace/shopee/orders/$orderId.lazy';
import { InternalStatusTag } from './marketplaceFormatters';
import { formatMarketplaceMoney } from '@/utils/marketplace';

const { Text, Title } = Typography;

export default function MarketplaceOrderDetail() {
  const desktop = isTauriRuntime();
  const navigate = useNavigate();
  const { orderId } = Route.useParams();
  const orderQuery = useQuery({
    queryKey: ['marketplace', 'order', orderId],
    queryFn: () => marketplaceAdapter.getOrder(orderId),
    enabled: desktop,
  });

  if (!desktop) {
    return (
      <Result
        status="info"
        title="Detail Marketplace hanya tersedia di aplikasi desktop"
        extra={<Button onClick={() => navigate({ to: '/' })}>Kembali ke Home</Button>}
      />
    );
  }

  if (orderQuery.error) {
    return (
      <div className="p-4 md:p-6">
        <Alert
          type="error"
          showIcon
          title="Detail pesanan tidak dapat dibuka"
          description={marketplaceErrorMessage(orderQuery.error)}
          action={<Button onClick={() => navigate({ to: '/marketplace/shopee' })}>Kembali</Button>}
        />
      </div>
    );
  }

  const bundle = orderQuery.data;
  const order = bundle?.order;
  const itemColumns: ColumnsType<MarketplaceOrderItemDto> = [
    {
      title: 'Item',
      dataIndex: 'item_name',
      key: 'item_name',
      render: (name: string, item) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          <Text type="secondary" className="text-xs">
            Item ID {item.item_id} · Model ID {item.model_id}
          </Text>
        </Space>
      ),
    },
    { title: 'SKU', dataIndex: 'sku', key: 'sku', render: (value) => value || '-' },
    { title: 'Qty', dataIndex: 'quantity', key: 'quantity', align: 'right' },
    {
      title: 'Harga Awal',
      dataIndex: 'original_price',
      key: 'original_price',
      align: 'right',
      render: (value: string | null) => formatMarketplaceMoney(value, order?.currency),
    },
    {
      title: 'Harga Diskon',
      dataIndex: 'discounted_price',
      key: 'discounted_price',
      align: 'right',
      render: (value: string | null) => formatMarketplaceMoney(value, order?.currency),
    },
  ];

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <Button
          type="text"
          icon={<ArrowLeft size={18} />}
          onClick={() => navigate({ to: '/marketplace/shopee' })}
        />
        <div>
          <Title level={2} style={{ marginBottom: 2 }}>Detail Pesanan Shopee</Title>
          <Text type="secondary">{order?.order_sn ?? 'Memuat pesanan...'}</Text>
        </div>
      </div>

      <Card loading={orderQuery.isLoading}>
        {order && (
          <Descriptions bordered column={{ xs: 1, md: 2, xl: 3 }}>
            <Descriptions.Item label="Order SN">{order.order_sn}</Descriptions.Item>
            <Descriptions.Item label="Toko">
              {order.shop_name} ({order.shop_id})
            </Descriptions.Item>
            <Descriptions.Item label="Buyer">{order.buyer_username ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="Status Internal">
              <InternalStatusTag status={order.internal_status} />
            </Descriptions.Item>
            <Descriptions.Item label="Status Shopee">{order.marketplace_status}</Descriptions.Item>
            <Descriptions.Item label="Total">
              <Text strong>{formatMarketplaceMoney(order.total_amount, order.currency)}</Text>
            </Descriptions.Item>
            <Descriptions.Item label="Dibuat">
              {dayjs(order.order_created_at).format('DD MMM YYYY HH:mm:ss')}
            </Descriptions.Item>
            <Descriptions.Item label="Diperbarui Shopee">
              {dayjs(order.order_updated_at).format('DD MMM YYYY HH:mm:ss')}
            </Descriptions.Item>
          </Descriptions>
        )}
      </Card>

      <Card title={`Item Pesanan (${bundle?.items.length ?? 0})`}>
        <Table
          rowKey="id"
          loading={orderQuery.isLoading}
          columns={itemColumns}
          dataSource={bundle?.items ?? []}
          pagination={false}
          scroll={{ x: 760 }}
          locale={{ emptyText: 'Item pesanan belum tersedia.' }}
        />
      </Card>
    </div>
  );
}
