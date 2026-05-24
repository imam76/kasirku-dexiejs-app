import { forwardRef, memo } from 'react';
import type { CSSProperties } from 'react';
import { Button, InputNumber, Select } from 'antd';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { SalesDocumentItem } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { DocumentLineItemExpandedFields } from './DocumentLineItemExpandedFields';

interface Option {
  value: string;
  label: string;
}

export interface DocumentLineItemRowProps {
  item: SalesDocumentItem;
  calculatedItem?: SalesDocumentItem;
  productOptions: Option[];
  unitOptions: Option[];
  taxOptions: Option[];
  isExpanded: boolean;
  hasPricing: boolean;
  isSalesDelivery: boolean;
  gridTemplateColumns: string;
  virtualIndex: number;
  style: CSSProperties;
  onUpdateItem: (itemId: string, patch: Partial<SalesDocumentItem>) => void;
  onSelectProduct: (itemId: string, productId: string) => void;
  onRemoveItem: (itemId: string) => void;
  onToggleExpanded: (itemId: string) => void;
}

const DocumentLineItemRowBase = forwardRef<HTMLDivElement, DocumentLineItemRowProps>(({
  item,
  calculatedItem,
  productOptions,
  unitOptions,
  taxOptions,
  isExpanded,
  hasPricing,
  isSalesDelivery,
  gridTemplateColumns,
  virtualIndex,
  style,
  onUpdateItem,
  onSelectProduct,
  onRemoveItem,
  onToggleExpanded,
}, ref) => {
  const { t } = useI18n();
  const displayedItem = calculatedItem ?? item;

  return (
    <div
      ref={ref}
      data-index={virtualIndex}
      style={style}
      className="border-b border-gray-100 bg-white"
    >
      <div
        className="grid items-center gap-2 px-3 py-2"
        style={{ gridTemplateColumns }}
      >
        <Select
          showSearch
          className="w-full min-w-0"
          placeholder={t('salesDocuments.placeholder.product')}
          value={item.product_id || undefined}
          optionFilterProp="label"
          options={productOptions}
          onChange={(productId: string) => onSelectProduct(item.id, productId)}
        />
        <InputNumber
          min={0}
          className="w-full"
          value={isSalesDelivery ? item.ordered_quantity : item.quantity}
          onChange={(value) => onUpdateItem(item.id, isSalesDelivery
            ? { ordered_quantity: Number(value || 0) }
            : { quantity: Number(value || 0) })}
        />
        {isSalesDelivery && (
          <InputNumber
            min={0}
            className="w-full"
            value={item.delivered_quantity}
            onChange={(value) => onUpdateItem(item.id, {
              delivered_quantity: Number(value || 0),
              quantity: Number(value || 0),
            })}
          />
        )}
        <Select
          className="w-full min-w-0"
          value={item.unit || undefined}
          options={unitOptions}
          onChange={(unit: string) => onUpdateItem(item.id, { unit })}
        />
        {hasPricing && (
          <div className="truncate text-right text-sm font-medium text-gray-700">
            Rp {formatCurrency(displayedItem.subtotal || 0)}
          </div>
        )}
        {hasPricing && (
          <Button
            type="text"
            icon={isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            disabled={!item.product_id}
            onClick={() => onToggleExpanded(item.id)}
            aria-label={t(isExpanded ? 'salesDocuments.closeItemDetail' : 'salesDocuments.openItemDetail')}
          />
        )}
        <Button
          danger
          type="text"
          icon={<Trash2 size={16} />}
          onClick={() => onRemoveItem(item.id)}
          aria-label={t('salesDocuments.deleteItem')}
        />
      </div>
      {hasPricing && isExpanded && item.product_id && (
        <DocumentLineItemExpandedFields
          item={item}
          calculatedItem={calculatedItem}
          taxOptions={taxOptions}
          onUpdateItem={onUpdateItem}
        />
      )}
    </div>
  );
});

DocumentLineItemRowBase.displayName = 'DocumentLineItemRow';

export const DocumentLineItemRow = memo(DocumentLineItemRowBase, (prev, next) => (
  prev.item === next.item &&
  prev.calculatedItem === next.calculatedItem &&
  prev.productOptions === next.productOptions &&
  prev.unitOptions === next.unitOptions &&
  prev.taxOptions === next.taxOptions &&
  prev.isExpanded === next.isExpanded &&
  prev.hasPricing === next.hasPricing &&
  prev.isSalesDelivery === next.isSalesDelivery &&
  prev.gridTemplateColumns === next.gridTemplateColumns &&
  prev.virtualIndex === next.virtualIndex &&
  prev.style === next.style &&
  prev.onUpdateItem === next.onUpdateItem &&
  prev.onSelectProduct === next.onSelectProduct &&
  prev.onRemoveItem === next.onRemoveItem &&
  prev.onToggleExpanded === next.onToggleExpanded
));
