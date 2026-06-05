import { forwardRef, memo } from 'react';
import type { CSSProperties } from 'react';
import { Button, InputNumber, Select } from 'antd';
import { ChevronDown, ChevronUp, Trash2 } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { PurchaseDocumentItem } from '@/types';
import type { DocumentCurrencySnapshot } from '@/utils/documentCurrency';
import { formatCurrency } from '@/utils/formatters';
import { PurchaseLineItemExpandedFields } from './PurchaseLineItemExpandedFields';

interface Option {
  value: string;
  label: string;
}

export interface PurchaseLineItemRowProps {
  item: PurchaseDocumentItem;
  calculatedItem?: PurchaseDocumentItem;
  productOptions: Option[];
  unitOptions: Option[];
  taxOptions: Option[];
  currencyOptions: Option[];
  documentCurrencySnapshot: DocumentCurrencySnapshot;
  isExpanded: boolean;
  hasPricing: boolean;
  isPurchaseReceipt: boolean;
  gridTemplateColumns: string;
  virtualIndex: number;
  style: CSSProperties;
  onUpdateItem: (itemId: string, patch: Partial<PurchaseDocumentItem>) => void;
  onSelectProduct: (itemId: string, productId: string) => void;
  onRemoveItem: (itemId: string) => void;
  onToggleExpanded: (itemId: string) => void;
}

const PurchaseLineItemRowBase = forwardRef<HTMLDivElement, PurchaseLineItemRowProps>(({
  item,
  calculatedItem,
  productOptions,
  unitOptions,
  taxOptions,
  currencyOptions,
  documentCurrencySnapshot,
  isExpanded,
  hasPricing,
  isPurchaseReceipt,
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
          showSearch={{ optionFilterProp: 'label' }}
          className="w-full min-w-0"
          placeholder={t('purchaseDocuments.placeholder.product')}
          value={item.product_id || undefined}
          options={productOptions}
          onChange={(productId: string) => onSelectProduct(item.id, productId)}
        />
        <InputNumber
          min={0}
          className="w-full"
          value={item.quantity}
          onChange={(value) => onUpdateItem(item.id, { quantity: Number(value || 0) })}
        />
        {isPurchaseReceipt && (
          <InputNumber
            min={0}
            className="w-full"
            value={item.received_quantity ?? item.quantity}
            onChange={(value) => onUpdateItem(item.id, {
              received_quantity: Number(value || 0),
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
            aria-label={t(isExpanded ? 'purchaseDocuments.closeItemDetail' : 'purchaseDocuments.openItemDetail')}
          />
        )}
        <Button
          danger
          type="text"
          icon={<Trash2 size={16} />}
          onClick={() => onRemoveItem(item.id)}
          aria-label={t('purchaseDocuments.deleteItem')}
        />
      </div>
      {hasPricing && isExpanded && item.product_id && (
        <PurchaseLineItemExpandedFields
          item={item}
          calculatedItem={calculatedItem}
          taxOptions={taxOptions}
          currencyOptions={currencyOptions}
          documentCurrencySnapshot={documentCurrencySnapshot}
          onUpdateItem={onUpdateItem}
        />
      )}
    </div>
  );
});

PurchaseLineItemRowBase.displayName = 'PurchaseLineItemRow';

export const PurchaseLineItemRow = memo(PurchaseLineItemRowBase, (prev, next) => (
  prev.item === next.item &&
  prev.calculatedItem === next.calculatedItem &&
  prev.productOptions === next.productOptions &&
  prev.unitOptions === next.unitOptions &&
  prev.taxOptions === next.taxOptions &&
  prev.currencyOptions === next.currencyOptions &&
  prev.documentCurrencySnapshot === next.documentCurrencySnapshot &&
  prev.isExpanded === next.isExpanded &&
  prev.hasPricing === next.hasPricing &&
  prev.isPurchaseReceipt === next.isPurchaseReceipt &&
  prev.gridTemplateColumns === next.gridTemplateColumns &&
  prev.virtualIndex === next.virtualIndex &&
  prev.style === next.style &&
  prev.onUpdateItem === next.onUpdateItem &&
  prev.onSelectProduct === next.onSelectProduct &&
  prev.onRemoveItem === next.onRemoveItem &&
  prev.onToggleExpanded === next.onToggleExpanded
));
