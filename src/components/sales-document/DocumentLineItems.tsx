import { useEffect, useState } from 'react';
import { Button, InputNumber, Select, Table } from 'antd';
import { ChevronDown, ChevronUp, Plus, Trash2 } from 'lucide-react';
import type { ColumnsType } from 'antd/es/table';
import type { Key } from 'react';
import type { Product, ProductUnit, PromoType, SalesDocumentItem, Tax } from '@/types';
import type { SalesDocumentConfig } from '@/configs/sales-document';
import { mapProductToSalesDocumentItem } from '@/utils/salesDocuments/mapProductToSalesDocumentItem';
import { formatCurrency } from '@/utils/formatters';

interface DocumentLineItemsProps {
  config: SalesDocumentConfig;
  documentId: string;
  items: SalesDocumentItem[];
  products: Product[];
  taxes: Tax[];
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
  discount_type: 'fixed',
  discount_value: 0,
  discount_amount: 0,
  subtotal: 0,
  created_at: new Date().toISOString(),
});

export const DocumentLineItems = ({
  config,
  documentId,
  items,
  products,
  taxes,
  onChange,
}: DocumentLineItemsProps) => {
  const [expandedRowKeys, setExpandedRowKeys] = useState<Key[]>([]);

  const updateItem = (itemId: string, patch: Partial<SalesDocumentItem>) => {
    onChange(items.map((item) => item.id === itemId ? { ...item, ...patch } : item));
  };

  const addRow = () => {
    onChange([...items, createEmptyItem(documentId)]);
  };

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'enter') {
        event.preventDefault();
        addRow();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [items, documentId]);

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
        discount_type: item.discount_type ?? nextItem.discount_type,
        discount_value: item.discount_value ?? nextItem.discount_value,
        discount_amount: item.discount_amount ?? nextItem.discount_amount,
        created_at: item.created_at,
      };
    }));
  };

  const removeItem = (itemId: string) => {
    setExpandedRowKeys((currentKeys) => currentKeys.filter((key) => key !== itemId));
    onChange(items.filter((item) => item.id !== itemId));
  };

  const toggleExpanded = (itemId: string) => {
    setExpandedRowKeys((currentKeys) => (
      currentKeys.includes(itemId)
        ? currentKeys.filter((key) => key !== itemId)
        : [...currentKeys, itemId]
    ));
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
    ...(config.behavior.hasPricing ? [{
      title: 'Subtotal',
      dataIndex: 'subtotal',
      width: 150,
      render: (value: number) => `Rp ${formatCurrency(value || 0)}`,
    }] : []),
    ...(config.behavior.hasPricing ? [
      {
        title: '',
        key: 'expand',
        width: 56,
        render: (_: unknown, item: SalesDocumentItem) => (
          <Button
            type="text"
            icon={expandedRowKeys.includes(item.id) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            disabled={!item.product_id}
            onClick={() => toggleExpanded(item.id)}
          />
        ),
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
      <Table
        rowKey="id"
        size="small"
        scroll={{ x: true }}
        pagination={false}
        columns={columns}
        dataSource={items}
        expandable={config.behavior.hasPricing ? {
          showExpandColumn: false,
          expandedRowKeys,
          onExpandedRowsChange: (nextExpandedRows) => setExpandedRowKeys([...nextExpandedRows]),
          expandedRowRender: (item) => (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <div className="mb-1 text-xs text-gray-500">Harga</div>
                <InputNumber
                  min={0}
                  className="w-full"
                  value={item.price}
                  onChange={(value) => updateItem(item.id, { price: Number(value || 0) })}
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-gray-500">Diskon</div>
                <div className="grid grid-cols-[120px_1fr] gap-2">
                  <Select
                    value={item.discount_type ?? 'fixed'}
                    options={[
                      { value: 'percent' satisfies PromoType, label: 'Persen' },
                      { value: 'fixed' satisfies PromoType, label: 'Nominal' },
                    ]}
                    onChange={(discountType) => updateItem(item.id, { discount_type: discountType })}
                  />
                  <InputNumber
                    min={0}
                    className="w-full"
                    value={item.discount_value ?? item.discount_amount}
                    onChange={(value) => updateItem(item.id, { discount_value: Number(value || 0) })}
                  />
                </div>
              </div>
              <div>
                <div className="mb-1 text-xs text-gray-500">Pajak (%)</div>
                <Select
                  allowClear
                  className="w-full"
                  placeholder="Pajak item (opsional)"
                  value={item.tax_id || undefined}
                  options={taxes.map((tax) => ({
                    value: tax.id,
                    label: `${tax.name} (${tax.rate}%, ${tax.calculation_mode})`,
                  }))}
                  onChange={(taxId) => updateItem(item.id, { tax_id: taxId, tax_name: undefined, tax_code: undefined, tax_rate: undefined, tax_calculation_mode: undefined })}
                />
              </div>
              <div>
                <div className="mb-1 text-xs text-gray-500">Pajak</div>
                <InputNumber
                  className="w-full"
                  value={item.tax_amount}
                  disabled
                />
              </div>
            </div>
          ),
          rowExpandable: (item) => Boolean(item.product_id),
        } : undefined}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-gray-500">
          Shortcut tambah baris:
          {' '}
          <span className="font-medium">Ctrl + Enter</span>
          {' / '}
          <span className="font-medium">Cmd + Enter</span>
        </div>
        <Button type="dashed" icon={<Plus size={16} />} onClick={addRow}>
          Tambah Baris
        </Button>
      </div>
    </div>
  );
};
