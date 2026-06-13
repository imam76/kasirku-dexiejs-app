import { Input, InputNumber, Table, Tag, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useI18n } from '@/hooks/useI18n';
import type { StockOpnameItem } from '@/types';
import { formatCurrency } from '@/utils/formatters';

const { Text } = Typography;

interface StockOpnameItemTableProps {
  items: StockOpnameItem[];
  editable?: boolean;
  isLoading?: boolean;
  onItemChange?: (id: string, patch: Pick<StockOpnameItem, 'counted_quantity'> | Pick<StockOpnameItem, 'notes'>) => void;
}

const renderQuantityDelta = (delta: number, unit: string) => {
  if (delta > 0) {
    return <Tag color="green">+{delta} {unit}</Tag>;
  }
  if (delta < 0) {
    return <Tag color="red">{delta} {unit}</Tag>;
  }

  return <Tag>0 {unit}</Tag>;
};

export default function StockOpnameItemTable({
  items,
  editable = false,
  isLoading = false,
  onItemChange,
}: StockOpnameItemTableProps) {
  const { t } = useI18n();

  const columns: ColumnsType<StockOpnameItem> = [
    {
      title: t('stockOpname.product'),
      dataIndex: 'product_name',
      key: 'product_name',
      fixed: 'left',
      width: 240,
      render: (value: string, item) => (
        <div>
          <Text strong>{value}</Text>
          {item.category && <div className="text-xs text-gray-500">{item.category}</div>}
        </div>
      ),
    },
    {
      title: t('stockOpname.sku'),
      dataIndex: 'sku',
      key: 'sku',
      width: 130,
      render: (value?: string) => value || '-',
    },
    {
      title: t('stockOpname.systemQty'),
      dataIndex: 'system_quantity',
      key: 'system_quantity',
      align: 'right',
      width: 140,
      render: (value: number, item) => `${value} ${item.unit}`,
    },
    {
      title: t('stockOpname.countedQty'),
      dataIndex: 'counted_quantity',
      key: 'counted_quantity',
      align: 'right',
      width: 170,
      render: (value: number | undefined, item) => editable ? (
        <InputNumber
          min={0}
          precision={6}
          value={value ?? null}
          className="w-full"
          addonAfter={item.unit}
          onChange={(nextValue) => {
            onItemChange?.(item.id, {
              counted_quantity: typeof nextValue === 'number' ? nextValue : undefined,
            });
          }}
        />
      ) : (
        value === undefined ? '-' : `${value} ${item.unit}`
      ),
    },
    {
      title: t('stockOpname.variance'),
      dataIndex: 'quantity_delta',
      key: 'quantity_delta',
      align: 'right',
      width: 140,
      render: (value: number, item) => renderQuantityDelta(value, item.unit),
    },
    {
      title: t('stockOpname.varianceValue'),
      dataIndex: 'variance_value',
      key: 'variance_value',
      align: 'right',
      width: 150,
      render: (value: number) => `Rp ${formatCurrency(value || 0)}`,
    },
    {
      title: t('stockOpname.notes'),
      dataIndex: 'notes',
      key: 'notes',
      width: 240,
      render: (value: string | undefined, item) => editable ? (
        <Input
          value={value}
          onChange={(event) => onItemChange?.(item.id, { notes: event.target.value })}
        />
      ) : (
        value || '-'
      ),
    },
  ];

  return (
    <Table
      dataSource={items}
      columns={columns}
      rowKey="id"
      loading={isLoading}
      pagination={{ pageSize: 25, showSizeChanger: true }}
      scroll={{ x: 1100 }}
      size="middle"
    />
  );
}
