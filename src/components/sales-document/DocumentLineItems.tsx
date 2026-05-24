import { Button, InputNumber, Select, Table } from 'antd';
import { Trash2 } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import type { Product, ProductUnit, SalesDocumentItem } from '@/types';
import type { SalesDocumentConfig } from '@/configs/sales-document';
import { mapProductToSalesDocumentItem } from '@/utils/salesDocuments/mapProductToSalesDocumentItem';
import { formatCurrency } from '@/utils/formatters';

interface DocumentLineItemsProps {
  config: SalesDocumentConfig;
  documentId: string;
  items: SalesDocumentItem[];
  products: Product[];
  onChange: (items: SalesDocumentItem[]) => void;
}

const getProductUnits = (product?: Product): ProductUnit[] => {
  if (!product) return [];
  return Array.from(new Set([product.selling_unit, product.purchase_unit, ...(product.sellable_units || [])]));
};

export const DocumentLineItems = ({
  config,
  documentId,
  items,
  products,
  onChange,
}: DocumentLineItemsProps) => {
  const updateItem = (itemId: string, patch: Partial<SalesDocumentItem>) => {
    onChange(items.map((item) => item.id === itemId ? { ...item, ...patch } : item));
  };

  const addProduct = (productId: string) => {
    const product = products.find((candidate) => candidate.id === productId);
    if (!product) return;
    onChange([...items, mapProductToSalesDocumentItem(product, documentId)]);
  };

  const removeItem = (itemId: string) => {
    onChange(items.filter((item) => item.id !== itemId));
  };

  const columns: ColumnsType<SalesDocumentItem> = [
    {
      title: 'Produk',
      dataIndex: 'product_name',
      render: (_, item) => (
        <div>
          <div className="font-medium text-gray-900">{item.product_name}</div>
          {item.sku && <div className="text-xs text-gray-500">{item.sku}</div>}
        </div>
      ),
    },
    {
      title: config.type === 'SALES_DELIVERY' ? 'Qty Order' : 'Qty',
      dataIndex: config.type === 'SALES_DELIVERY' ? 'ordered_quantity' : 'quantity',
      width: 130,
      render: (_, item) => (
        <InputNumber
          min={0}
          className="w-full"
          value={config.type === 'SALES_DELIVERY' ? item.ordered_quantity : item.quantity}
          onChange={(value) => updateItem(item.id, config.type === 'SALES_DELIVERY'
            ? { ordered_quantity: Number(value || 0) }
            : { quantity: Number(value || 0) })}
        />
      ),
    },
    ...(config.type === 'SALES_DELIVERY' ? [{
      title: 'Qty Kirim',
      dataIndex: 'delivered_quantity',
      width: 130,
      render: (_: unknown, item: SalesDocumentItem) => (
        <InputNumber
          min={0}
          className="w-full"
          value={item.delivered_quantity}
          onChange={(value) => updateItem(item.id, {
            delivered_quantity: Number(value || 0),
            quantity: Number(value || 0),
          })}
        />
      ),
    }] : []),
    {
      title: 'Unit',
      dataIndex: 'unit',
      width: 130,
      render: (_, item) => {
        const product = products.find((candidate) => candidate.id === item.product_id);
        return (
          <Select
            className="w-full"
            value={item.unit}
            options={getProductUnits(product).map((unit) => ({ value: unit, label: unit }))}
            onChange={(unit) => updateItem(item.id, { unit })}
          />
        );
      },
    },
    ...(config.behavior.hasPricing ? [
      {
        title: 'Harga',
        dataIndex: 'price',
        width: 150,
        render: (_: unknown, item: SalesDocumentItem) => (
          <InputNumber
            min={0}
            className="w-full"
            value={item.price}
            onChange={(value) => updateItem(item.id, { price: Number(value || 0) })}
          />
        ),
      },
      {
        title: 'Diskon',
        dataIndex: 'discount_amount',
        width: 130,
        render: (_: unknown, item: SalesDocumentItem) => (
          <InputNumber
            min={0}
            className="w-full"
            value={item.discount_amount}
            onChange={(value) => updateItem(item.id, { discount_amount: Number(value || 0) })}
          />
        ),
      },
      {
        title: 'Subtotal',
        dataIndex: 'subtotal',
        width: 150,
        render: (value: number) => `Rp ${formatCurrency(value || 0)}`,
      },
    ] : []),
    {
      title: '',
      key: 'action',
      width: 56,
      render: (_, item) => (
        <Button
          danger
          type="text"
          icon={<Trash2 size={16} />}
          onClick={() => removeItem(item.id)}
        />
      ),
    },
  ];

  return (
    <div className="space-y-3">
      <div className="flex justify-between gap-3">
        <Select
          showSearch
          className="min-w-0 flex-1"
          placeholder="Tambah produk"
          value={undefined}
          optionFilterProp="label"
          options={products.map((product) => ({
            value: product.id,
            label: product.sku ? `${product.name} - ${product.sku}` : product.name,
          }))}
          onChange={addProduct}
        />
      </div>
      <Table
        rowKey="id"
        size="small"
        scroll={{ x: true }}
        pagination={false}
        columns={columns}
        dataSource={items}
      />
    </div>
  );
};
