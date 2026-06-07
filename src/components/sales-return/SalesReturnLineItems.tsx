import { InputNumber, Select, Table, Typography } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { useMemo } from 'react';
import { useI18n } from '@/hooks/useI18n';
import type { SalesReturnItemCondition, SalesReturnSourceItem } from '@/types';
import type { SalesReturnItemInput } from '@/services/salesReturnService';
import type { TranslationKey } from '@/i18n/messages';
import { formatCurrency } from '@/utils/formatters';

const { Text } = Typography;

interface SalesReturnLineItemsProps {
  sourceItems: SalesReturnSourceItem[];
  items: SalesReturnItemInput[];
  hasPricing: boolean;
  onChange: (items: SalesReturnItemInput[]) => void;
}

const conditionOptions: Array<{ value: SalesReturnItemCondition; labelKey: TranslationKey }> = [
  { value: 'SELLABLE', labelKey: 'salesReturns.condition.sellable' },
  { value: 'DAMAGED', labelKey: 'salesReturns.condition.damaged' },
  { value: 'DISCARDED', labelKey: 'salesReturns.condition.discarded' },
];

export const SalesReturnLineItems = ({
  sourceItems,
  items,
  hasPricing,
  onChange,
}: SalesReturnLineItemsProps) => {
  const { t } = useI18n();
  const itemsBySourceItemId = useMemo(
    () => new Map(items.map((item) => [item.source_item_id, item])),
    [items],
  );

  const updateItem = (sourceItem: SalesReturnSourceItem, patch: Partial<SalesReturnItemInput>) => {
    const currentItem = itemsBySourceItemId.get(sourceItem.source_item_id) ?? {
      source_item_id: sourceItem.source_item_id,
      quantity: 0,
      condition: 'SELLABLE' as SalesReturnItemCondition,
      restock_quantity: 0,
    };
    const nextItem = {
      ...currentItem,
      ...patch,
    };
    const canRestock = sourceItem.can_restock !== false;

    if (patch.quantity !== undefined && nextItem.condition === 'SELLABLE') {
      nextItem.restock_quantity = canRestock ? patch.quantity : 0;
    }

    if (!canRestock || (patch.condition && patch.condition !== 'SELLABLE')) {
      nextItem.restock_quantity = 0;
    }

    const nextItems = sourceItems
      .map((candidate) => (
        candidate.source_item_id === sourceItem.source_item_id
          ? nextItem
          : itemsBySourceItemId.get(candidate.source_item_id)
      ))
      .filter((item): item is SalesReturnItemInput => Boolean(item));

    onChange(nextItems);
  };

  const columns: ColumnsType<SalesReturnSourceItem> = [
    {
      title: t('salesReturns.field.product'),
      dataIndex: 'product_name',
      render: (value: string, record) => (
        <div>
          <Text strong>{value}</Text>
          <div className="mt-1 text-xs text-gray-500">
            {record.sku ? `${record.sku} · ` : ''}
            {t('salesReturns.field.sourceQuantity')}: {record.source_quantity} {record.unit}
            {record.source_stock_document_number ? ` · ${record.source_stock_document_number}` : ''}
          </div>
        </div>
      ),
    },
    {
      title: t('salesReturns.field.remainingQuantity'),
      dataIndex: 'remaining_quantity',
      align: 'right',
      width: 140,
      render: (value: number, record) => `${value} ${record.unit}`,
    },
    {
      title: t('salesReturns.field.returnQuantity'),
      key: 'quantity',
      align: 'right',
      width: 150,
      render: (_, record) => {
        const currentItem = itemsBySourceItemId.get(record.source_item_id);
        return (
          <InputNumber
            min={0}
            max={record.remaining_quantity}
            value={currentItem?.quantity ?? 0}
            onChange={(value) => updateItem(record, { quantity: Number(value || 0) })}
            className="w-full"
          />
        );
      },
    },
    {
      title: t('salesReturns.field.condition'),
      key: 'condition',
      width: 170,
      render: (_, record) => {
        const currentItem = itemsBySourceItemId.get(record.source_item_id);
        return (
          <Select
            value={currentItem?.condition ?? 'SELLABLE'}
            onChange={(value) => updateItem(record, { condition: value })}
            options={conditionOptions.map((option) => ({ value: option.value, label: t(option.labelKey) }))}
            className="w-full"
          />
        );
      },
    },
    {
      title: t('salesReturns.field.restockQuantity'),
      key: 'restock_quantity',
      align: 'right',
      width: 150,
      render: (_, record) => {
        const currentItem = itemsBySourceItemId.get(record.source_item_id);
        const isSellable = (currentItem?.condition ?? 'SELLABLE') === 'SELLABLE';
        const canRestock = record.can_restock !== false;
        return (
          <InputNumber
            min={0}
            max={currentItem?.quantity ?? 0}
            value={currentItem?.restock_quantity ?? 0}
            disabled={!isSellable || !canRestock}
            onChange={(value) => updateItem(record, { restock_quantity: Number(value || 0) })}
            className="w-full"
          />
        );
      },
    },
    ...(hasPricing ? [{
      title: t('salesReturns.field.returnValue'),
      key: 'return_value',
      align: 'right' as const,
      width: 160,
      render: (_: unknown, record: SalesReturnSourceItem) => {
        const currentItem = itemsBySourceItemId.get(record.source_item_id);
        const ratio = record.source_quantity > 0 ? Number(currentItem?.quantity || 0) / record.source_quantity : 0;
        return `Rp ${formatCurrency(Math.max(0, record.total_amount * ratio))}`;
      },
    }] : []),
  ];

  return (
    <Table
      rowKey="source_item_id"
      columns={columns}
      dataSource={sourceItems}
      pagination={false}
      scroll={{ x: true }}
    />
  );
};
