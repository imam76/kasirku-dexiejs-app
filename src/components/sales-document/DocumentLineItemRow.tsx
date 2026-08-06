import { forwardRef, memo, useState } from 'react';
import type { CSSProperties } from 'react';
import { Button, InputNumber, Select } from 'antd';
import { ChevronDown, ChevronUp, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import type { SalesDocumentItem } from '@/types';
import {
  formatDocumentCurrencyAmount,
  isBaseCurrency,
  toDocumentCurrencyAmount,
  type DocumentCurrencySnapshot,
} from '@/utils/documentCurrency';
import {
  formatCurrency,
  formatCurrencyInput,
  parseCurrencyInput,
} from '@/utils/formatters';
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
  documentCurrencySnapshot: DocumentCurrencySnapshot;
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
  onCreateProductRequest?: (lineId: string, search: string) => void;
  onEditProductRequest?: (lineId: string, productId: string) => void;
}

const DocumentLineItemRowBase = forwardRef<HTMLDivElement, DocumentLineItemRowProps>(({
  item,
  calculatedItem,
  productOptions,
  unitOptions,
  taxOptions,
  documentCurrencySnapshot,
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
  onCreateProductRequest,
  onEditProductRequest,
}, ref) => {
  const { t } = useI18n();
  const [productSearch, setProductSearch] = useState('');
  const displayedItem = calculatedItem ?? item;
  const displayedSubtotal = toDocumentCurrencyAmount(displayedItem.subtotal, documentCurrencySnapshot);
  const isPriceEdited = Boolean(item.is_price_edited && item.original_price !== undefined);
  const isForeignCurrency = !isBaseCurrency(documentCurrencySnapshot.currency_code, documentCurrencySnapshot.base_currency_code);
  const displayedPrice = isForeignCurrency
    ? item.foreign_price ?? toDocumentCurrencyAmount(item.price, documentCurrencySnapshot)
    : item.price;

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
        <div className="flex min-w-0 items-center gap-1">
          <Select
            showSearch={{ optionFilterProp: 'label' }}
            className="w-full min-w-0"
            placeholder={t('salesDocuments.placeholder.product')}
            value={item.product_id || undefined}
            options={productOptions}
            onSearch={setProductSearch}
            searchValue={productSearch}
            notFoundContent={
              productSearch.trim().length > 0 ? (
                <div className="px-2 py-2">
                  <div className="mb-2 text-sm text-gray-600">
                    {t('salesDocuments.quickCreate.notFound')}
                  </div>
                  <Button
                    type="primary"
                    size="small"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onCreateProductRequest?.(item.id, productSearch);
                      setProductSearch('');
                    }}
                  >
                    {t('salesDocuments.quickCreate.action')}
                  </Button>
                </div>
              ) : null
            }
            onChange={(productId: string) => {
              onSelectProduct(item.id, productId);
              setProductSearch('');
            }}
          />
          {item.product_id && (
            <Button
              type="text"
              size="small"
              icon={<Pencil size={14} />}
              onClick={() => onEditProductRequest?.(item.id, item.product_id)}
              aria-label={t('salesDocuments.editProduct')}
              title={t('salesDocuments.editProduct')}
            />
          )}
        </div>
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
          <div className="flex min-w-0 items-center gap-1">
            <InputNumber
              min={0}
              className="w-full"
              value={displayedPrice}
              formatter={formatCurrencyInput}
              parser={parseCurrencyInput}
              onChange={(value) => onUpdateItem(item.id, isForeignCurrency
                ? { foreign_price: Number(value || 0) }
                : { price: Number(value || 0) })}
            />
            {isPriceEdited && (
              <Button
                type="text"
                size="small"
                className="shrink-0"
                icon={<RotateCcw size={14} />}
                onClick={() => onUpdateItem(item.id, { price: item.original_price })}
                aria-label={t('salesDocuments.resetSystemPrice')}
                title={t('salesDocuments.systemPrice', { price: formatCurrency(item.original_price || 0) })}
              />
            )}
          </div>
        )}
        {hasPricing && (
          <div className="truncate text-right text-sm font-medium text-gray-700">
            {formatDocumentCurrencyAmount(displayedSubtotal, documentCurrencySnapshot)}
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
          documentCurrencySnapshot={documentCurrencySnapshot}
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
  prev.documentCurrencySnapshot === next.documentCurrencySnapshot &&
  prev.isExpanded === next.isExpanded &&
  prev.hasPricing === next.hasPricing &&
  prev.isSalesDelivery === next.isSalesDelivery &&
  prev.gridTemplateColumns === next.gridTemplateColumns &&
  prev.virtualIndex === next.virtualIndex &&
  prev.style === next.style &&
  prev.onUpdateItem === next.onUpdateItem &&
  prev.onSelectProduct === next.onSelectProduct &&
  prev.onRemoveItem === next.onRemoveItem &&
  prev.onToggleExpanded === next.onToggleExpanded &&
  prev.onCreateProductRequest === next.onCreateProductRequest &&
  prev.onEditProductRequest === next.onEditProductRequest
));
