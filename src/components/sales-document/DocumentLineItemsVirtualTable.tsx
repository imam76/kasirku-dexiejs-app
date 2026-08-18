import { useMemo, useState } from 'react';
import { Button, InputNumber, Select } from 'antd';
import { Trash2 } from 'lucide-react';
import { useI18n } from '@/hooks/useI18n';
import { useIsMobile } from '@/hooks/useIsMobile';
import type { SalesDocumentItem } from '@/types';
import {
  formatDocumentCurrencyAmount,
  isBaseCurrency,
  toDocumentCurrencyAmount,
  type DocumentCurrencySnapshot,
} from '@/utils/documentCurrency';
import { formatCurrencyInput, parseCurrencyInput } from '@/utils/formatters';
import type { LineItemEntry } from '@/utils/documentLineItems/lineItemView';
import { VirtualLineItemsTable } from '@/components/virtual-line-items/VirtualLineItemsTable';
import { MobileCrudList, ResponsiveCrudEditor } from '@/components/mobile-crud';
import { LineItemExpandedFields } from '@/components/document-line-items/LineItemExpandedFields';
import { LineItemProductPicker } from '@/components/document-line-items/LineItemProductPicker';
import { DocumentLineItemRow } from './DocumentLineItemRow';
import { LineItemSummaryCard } from './LineItemSummaryCard';

interface Option {
  value: string;
  label: string;
}

interface DocumentLineItemsVirtualTableProps {
  entries: Array<LineItemEntry<SalesDocumentItem>>;
  totalItemCount: number;
  duplicateProductIds: Set<string>;
  calculatedItemsById: Map<string, SalesDocumentItem>;
  productOptions: Option[];
  unitOptionsByProductId: Map<string, Option[]>;
  unitOptionsByUnit: Map<string, Option[]>;
  emptyUnitOptions: Option[];
  taxOptions: Option[];
  documentCurrencySnapshot: DocumentCurrencySnapshot;
  expandedRowKeySet: Set<string>;
  expandedRowSignature: string;
  hasPricing: boolean;
  isSalesDelivery: boolean;
  scrollToLastRequest: number;
  onUpdateItem: (itemId: string, patch: Partial<SalesDocumentItem>) => void;
  onSelectProduct: (itemId: string, productId: string) => void;
  onRemoveItem: (itemId: string) => void;
  onToggleExpanded: (itemId: string) => void;
  onCreateProductRequest?: (lineId: string, search: string) => void;
  onEditProductRequest?: (lineId: string, productId: string) => void;
}

const COLLAPSED_ROW_ESTIMATE = 56;
const EXPANDED_ROW_ESTIMATE = 144;

export const DocumentLineItemsVirtualTable = ({
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
  isSalesDelivery,
  scrollToLastRequest,
  onUpdateItem,
  onSelectProduct,
  onRemoveItem,
  onToggleExpanded,
  onCreateProductRequest,
  onEditProductRequest,
}: DocumentLineItemsVirtualTableProps) => {
  const { t } = useI18n();
  const isMobile = useIsMobile();
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const gridTemplateColumns = useMemo(() => {
    const columns = ['44px', 'minmax(260px,1fr)', '120px'];
    if (isSalesDelivery) columns.push('120px');
    columns.push('120px');
    if (hasPricing) columns.push('140px', '140px', '56px');
    columns.push('56px');
    return columns.join(' ');
  }, [hasPricing, isSalesDelivery]);
  const minWidth = isSalesDelivery ? 1072 : hasPricing ? 952 : 632;

  const editingEntry = editingItemId
    ? entries.find((entry) => entry.item.id === editingItemId) ?? null
    : null;
  const editingItem = editingEntry?.item;
  const editingIsForeignCurrency = !isBaseCurrency(
    documentCurrencySnapshot.currency_code,
    documentCurrencySnapshot.base_currency_code,
  );
  const editingIsPriceEdited = Boolean(editingItem?.is_price_edited && editingItem?.original_price !== undefined);
  const editingDisplayedPrice = editingItem
    ? (editingIsForeignCurrency
      ? editingItem.foreign_price ?? toDocumentCurrencyAmount(editingItem.price, documentCurrencySnapshot)
      : editingItem.price)
    : undefined;

  if (isMobile) {
    return (
      <>
        <MobileCrudList<LineItemEntry<SalesDocumentItem>>
          items={entries}
          getKey={(entry) => entry.item.id}
          onItemClick={(entry) => setEditingItemId(entry.item.id)}
          emptyText={totalItemCount === 0 ? t('salesDocuments.emptyItems') : t('documentLineItems.noSearchResults')}
          loadMoreLabel={(remaining) => t('salesDocuments.mobile.loadMoreItems', { count: remaining })}
          getItemAriaLabel={(entry) => t('salesDocuments.mobile.editItemAria', {
            product: entry.item.product_name || t('salesDocuments.placeholder.product'),
          })}
          renderItem={(entry) => (
            <LineItemSummaryCard
              item={entry.item}
              calculatedItem={calculatedItemsById.get(entry.item.id)}
              isDuplicate={Boolean(entry.item.product_id) && duplicateProductIds.has(entry.item.product_id)}
              hasPricing={hasPricing}
              isSalesDelivery={isSalesDelivery}
              documentCurrencySnapshot={documentCurrencySnapshot}
            />
          )}
        />

        <ResponsiveCrudEditor
          open={editingEntry !== null}
          title={editingItem?.product_name || t('salesDocuments.placeholder.product')}
          onClose={() => setEditingItemId(null)}
          showCloseButton
          footer={(
            <Button
              block
              danger
              size="large"
              className="h-12"
              icon={<Trash2 size={16} />}
              onClick={() => {
                const id = editingItem?.id;
                setEditingItemId(null);
                if (id) onRemoveItem(id);
              }}
            >
              {t('salesDocuments.deleteItem')}
            </Button>
          )}
        >
          {editingEntry && editingItem ? (
            <div className="space-y-4 pb-2">
              <div>
                <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                  <span>{t('salesDocuments.field.product')}</span>
                  {editingItem.product_id ? (
                    <Button
                      type="link"
                      size="small"
                      className="h-auto p-0"
                      onClick={() => onEditProductRequest?.(editingItem.id, editingItem.product_id)}
                    >
                      {t('salesDocuments.editProduct')}
                    </Button>
                  ) : null}
                </div>
                <LineItemProductPicker
                  productId={editingItem.product_id}
                  productOptions={productOptions}
                  onSelectProduct={(productId) => onSelectProduct(editingItem.id, productId)}
                  onCreateProductRequest={(search) => onCreateProductRequest?.(editingItem.id, search)}
                />
              </div>

              {isSalesDelivery ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="mb-1 text-xs text-gray-500">{t('salesDocuments.field.orderedQuantity')}</div>
                    <InputNumber
                      size="large"
                      className="w-full"
                      min={0}
                      value={editingItem.ordered_quantity}
                      onChange={(value) => onUpdateItem(editingItem.id, { ordered_quantity: Number(value || 0) })}
                    />
                  </div>
                  <div>
                    <div className="mb-1 text-xs text-gray-500">{t('salesDocuments.field.deliveredQuantity')}</div>
                    <InputNumber
                      size="large"
                      className="w-full"
                      min={0}
                      value={editingItem.delivered_quantity}
                      onChange={(value) => onUpdateItem(editingItem.id, {
                        delivered_quantity: Number(value || 0),
                        quantity: Number(value || 0),
                      })}
                    />
                  </div>
                </div>
              ) : (
                <div>
                  <div className="mb-1 text-xs text-gray-500">{t('salesDocuments.field.quantity')}</div>
                  <InputNumber
                    size="large"
                    className="w-full"
                    min={0}
                    value={editingItem.quantity}
                    onChange={(value) => onUpdateItem(editingItem.id, { quantity: Number(value || 0) })}
                  />
                </div>
              )}

              <div>
                <div className="mb-1 text-xs text-gray-500">{t('salesDocuments.field.unit')}</div>
                <Select
                  size="large"
                  className="w-full"
                  value={editingItem.unit || undefined}
                  options={unitOptionsByProductId.get(editingItem.product_id) ?? unitOptionsByUnit.get(editingItem.unit) ?? emptyUnitOptions}
                  onChange={(unit: string) => onUpdateItem(editingItem.id, { unit })}
                />
              </div>

              {hasPricing ? (
                <>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-xs text-gray-500">
                      <span>{t('salesDocuments.field.price')}</span>
                      {editingIsPriceEdited ? (
                        <Button
                          type="link"
                          size="small"
                          className="h-auto p-0"
                          onClick={() => onUpdateItem(editingItem.id, { price: editingItem.original_price })}
                        >
                          {t('salesDocuments.resetSystemPrice')}
                        </Button>
                      ) : null}
                    </div>
                    <InputNumber
                      size="large"
                      className="w-full"
                      min={0}
                      value={editingDisplayedPrice}
                      formatter={formatCurrencyInput}
                      parser={parseCurrencyInput}
                      onChange={(value) => onUpdateItem(editingItem.id, editingIsForeignCurrency
                        ? { foreign_price: Number(value || 0) }
                        : { price: Number(value || 0) })}
                    />
                  </div>

                  <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm dark:bg-gray-800">
                    <span className="text-gray-500">{t('salesDocuments.field.subtotal')}</span>
                    <span className="float-right font-semibold">
                      {formatDocumentCurrencyAmount(
                        toDocumentCurrencyAmount(
                          (calculatedItemsById.get(editingItem.id) ?? editingItem).subtotal,
                          documentCurrencySnapshot,
                        ),
                        documentCurrencySnapshot,
                      )}
                    </span>
                  </div>

                  {editingItem.product_id ? (
                    <LineItemExpandedFields
                      i18nPrefix="salesDocuments"
                      item={editingItem}
                      calculatedItem={calculatedItemsById.get(editingItem.id)}
                      taxOptions={taxOptions}
                      documentCurrencySnapshot={documentCurrencySnapshot}
                      onUpdateItem={onUpdateItem}
                    />
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </ResponsiveCrudEditor>
      </>
    );
  }

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
          <div>{t('salesDocuments.field.product')}</div>
          <div>{t(isSalesDelivery ? 'salesDocuments.field.orderedQuantity' : 'salesDocuments.field.quantity')}</div>
          {isSalesDelivery && <div>{t('salesDocuments.field.deliveredQuantity')}</div>}
          <div>{t('salesDocuments.field.unit')}</div>
          {hasPricing && <div>{t('salesDocuments.field.price')}</div>}
          {hasPricing && <div className="text-right">{t('salesDocuments.field.subtotal')}</div>}
          {hasPricing && <div />}
          <div />
        </div>
      )}
      emptyState={(
        <div className="flex h-[360px] items-center justify-center text-sm text-gray-500">
          {totalItemCount === 0
            ? t('salesDocuments.emptyItems')
            : t('documentLineItems.noSearchResults')}
        </div>
      )}
      renderRow={(entry, { virtualIndex, style, measureRef }) => (
        <DocumentLineItemRow
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
          isSalesDelivery={isSalesDelivery}
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
