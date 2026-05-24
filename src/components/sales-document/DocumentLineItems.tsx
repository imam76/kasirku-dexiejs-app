import { Button, InputNumber, Select, Table } from 'antd';
import { Plus, Trash2 } from 'lucide-react';
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

const createEmptyItem = (documentId: string): SalesDocumentItem => ({
  id: crypto.randomUUID(),
  document_id: documentId,
  product_id: '',
  product_name: '',
  unit: '',
  quantity: 1,
  ordered_quantity: 1,
  delivered_quantity: 1,
  price: 0,
  discount_amount: 0,
  subtotal: 0,
  created_at: new Date().toISOString(),
});

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

  const addRow = () => {
    onChange([...items, createEmptyItem(documentId)]);
  };

  const selectProduct = (itemId: string, productId: string) => {
    const product = products.find((candidate) => candidate.id === productId);
    if (!product) return;
    onChange(items.map((item) => {
      if (item.id !== itemId) return item;

      const nextItem = mapProductToSalesDocumentItem(product, item.document_id);
      return {
        ...nextItem,
        id: item.id,
        quantity: item.quantity || nextItem.quantity,
        ordered_quantity: item.ordered_quantity ?? nextItem.ordered_quantity,
        delivered_quantity: item.delivered_quantity ?? nextItem.delivered_quantity,
        discount_amount: item.discount_amount ?? nextItem.discount_amount,
        created_at: item.created_at,
      };
    }));
  };

  const removeItem = (itemId: string) => {
    onChange(items.filter((item) => item.id !== itemId));
  };

  const columns: ColumnsType<SalesDocumentItem> = [
    {
      title: 'Produk',
      dataIndex: 'product_name',
      render: (_, item) => (
        <Select
          showSearch
          className="w-full min-w-[220px]"
          placeholder="Pilih produk"
          value={item.product_id || undefined}
          optionFilterProp="label"
          options={products.map((product) => ({
            value: product.id,
            label: product.sku ? `${product.name} - ${product.sku}` : product.name,
          }))}
          onChange={(productId) => selectProduct(item.id, productId)}
        />
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
      <div className="flex justify-end gap-3">
        <Button type="dashed" icon={<Plus size={16} />} onClick={addRow}>
          Tambah Baris
        </Button>
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
