import { useMemo } from 'react';
import { useI18n } from '@/hooks/useI18n';
import type { PurchaseDocumentItem } from '@/types';
import type { DocumentCurrencySnapshot } from '@/utils/documentCurrency';
import type { LineItemEntry } from '@/utils/documentLineItems/lineItemView';
import { VirtualLineItemsTable } from '@/components/virtual-line-items/VirtualLineItemsTable';
import { PurchaseLineItemRow } from './PurchaseLineItemRow';

interface Option {
  value: string;
  label: string;
}

interface PurchaseLineItemsVirtualTableProps {
  entries: Array<LineItemEntry<PurchaseDocumentItem>>;
  totalItemCount: number;
  duplicateProductIds: Set<string>;
  calculatedItemsById: Map<string, PurchaseDocumentItem>;
  productOptions: Option[];
  unitOptionsByProductId: Map<string, Option[]>;
  unitOptionsByUnit: Map<string, Option[]>;
  emptyUnitOptions: Option[];
  taxOptions: Option[];
  documentCurrencySnapshot: DocumentCurrencySnapshot;
  expandedRowKeySet: Set<string>;
  expandedRowSignature: string;
  hasPricing: boolean;
  isPurchaseReceipt: boolean;
  scrollToLastRequest: number;
  onUpdateItem: (itemId: string, patch: Partial<PurchaseDocumentItem>) => void;
  onSelectProduct: (itemId: string, productId: string) => void;
  onRemoveItem: (itemId: string) => void;
  onToggleExpanded: (itemId: string) => void;
  onCreateProductRequest?: (lineId: string, search: string) => void;
  onEditProductRequest?: (lineId: string, productId: string) => void;
}

const COLLAPSED_ROW_ESTIMATE = 56;
const EXPANDED_ROW_ESTIMATE = 144;

export const PurchaseLineItemsVirtualTable = ({
  entries,
  totalItemCount,
  duplicateProductIds,
  calculatedItemsById,
  productOptions,
  unitOptionsByProductId,
  unitOptionsByUnit,
  emptyUnitOptions,
  taxOptions,
  documentCurrencySnapshot,
  expandedRowKeySet,
  expandedRowSignature,
  hasPricing,
  isPurchaseReceipt,
  scrollToLastRequest,
  onUpdateItem,
  onSelectProduct,
  onRemoveItem,
  onToggleExpanded,
  onCreateProductRequest,
  onEditProductRequest,
}: PurchaseLineItemsVirtualTableProps) => {
  const { t } = useI18n();
  const gridTemplateColumns = useMemo(() => {
    const columns = ['44px', 'minmax(260px,1fr)', '120px'];
    if (isPurchaseReceipt) columns.push('120px');
    columns.push('120px');
    if (hasPricing) columns.push('140px', '140px', '56px');
    columns.push('56px');
    return columns.join(' ');
  }, [hasPricing, isPurchaseReceipt]);
  const minWidth = isPurchaseReceipt ? 1072 : hasPricing ? 952 : 632;

  return (
    <VirtualLineItemsTable
      rows={entries}
      getRowKey={(entry) => entry.item.id}
      estimateRowSize={(entry) => (
        entry && expandedRowKeySet.has(entry.item.id)
          ? EXPANDED_ROW_ESTIMATE
          : COLLAPSED_ROW_ESTIMATE
      )}
      remeasureSignature={expandedRowSignature}
      scrollToLastRequest={scrollToLastRequest}
      minWidth={minWidth}
      header={(
        <div
          className="grid gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-gray-500"
          style={{ gridTemplateColumns }}
        >
          <div className="text-right">#</div>
          <div>{t('purchaseDocuments.field.product')}</div>
          <div>{t('purchaseDocuments.field.quantity')}</div>
          {isPurchaseReceipt && <div>{t('purchaseDocuments.field.receivedQuantity')}</div>}
          <div>{t('purchaseDocuments.field.unit')}</div>
          {hasPricing && <div>{t('purchaseDocuments.field.price')}</div>}
          {hasPricing && <div className="text-right">{t('purchaseDocuments.field.subtotal')}</div>}
          {hasPricing && <div />}
          <div />
        </div>
      )}
      emptyState={(
        <div className="flex h-[360px] items-center justify-center text-sm text-gray-500">
          {totalItemCount === 0
            ? t('purchaseDocuments.emptyItems')
            : t('documentLineItems.noSearchResults')}
        </div>
      )}
      renderRow={(entry, { virtualIndex, style, measureRef }) => (
        <PurchaseLineItemRow
          ref={measureRef}
          virtualIndex={virtualIndex}
          rowNumber={entry.originalIndex + 1}
          isDuplicateProduct={duplicateProductIds.has(entry.item.product_id)}
          style={style}
          item={entry.item}
          calculatedItem={calculatedItemsById.get(entry.item.id)}
          productOptions={productOptions}
          unitOptions={unitOptionsByProductId.get(entry.item.product_id) ?? unitOptionsByUnit.get(entry.item.unit) ?? emptyUnitOptions}
          taxOptions={taxOptions}
          documentCurrencySnapshot={documentCurrencySnapshot}
          isExpanded={expandedRowKeySet.has(entry.item.id)}
          hasPricing={hasPricing}
          isPurchaseReceipt={isPurchaseReceipt}
          gridTemplateColumns={gridTemplateColumns}
          onUpdateItem={onUpdateItem}
          onSelectProduct={onSelectProduct}
          onRemoveItem={onRemoveItem}
          onToggleExpanded={onToggleExpanded}
          onCreateProductRequest={onCreateProductRequest}
          onEditProductRequest={onEditProductRequest}
        />
      )}
    />
  );
};
