import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useI18n } from '@/hooks/useI18n';
import type { SalesDocumentItem } from '@/types';
import type { DocumentCurrencySnapshot } from '@/utils/documentCurrency';
import { DocumentLineItemRow } from './DocumentLineItemRow';

interface Option {
  value: string;
  label: string;
}

interface DocumentLineItemsVirtualTableProps {
  items: SalesDocumentItem[];
  calculatedItemsById: Map<string, SalesDocumentItem>;
  productOptions: Option[];
  unitOptionsByProductId: Map<string, Option[]>;
  unitOptionsByUnit: Map<string, Option[]>;
  emptyUnitOptions: Option[];
  taxOptions: Option[];
  currencyOptions: Option[];
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
}

const COLLAPSED_ROW_ESTIMATE = 56;
const EXPANDED_ROW_ESTIMATE = 144;

export const DocumentLineItemsVirtualTable = ({
  items,
  calculatedItemsById,
  productOptions,
  unitOptionsByProductId,
  unitOptionsByUnit,
  emptyUnitOptions,
  taxOptions,
  currencyOptions,
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
}: DocumentLineItemsVirtualTableProps) => {
  const { t } = useI18n();
  const parentRef = useRef<HTMLDivElement>(null);
  const rowElementsRef = useRef(new Map<string, HTMLDivElement>());
  const gridTemplateColumns = useMemo(() => {
    const columns = ['minmax(260px,1fr)', '120px'];
    if (isSalesDelivery) columns.push('120px');
    columns.push('120px');
    if (hasPricing) columns.push('140px', '56px');
    columns.push('56px');
    return columns.join(' ');
  }, [hasPricing, isSalesDelivery]);
  const minWidth = isSalesDelivery ? 880 : hasPricing ? 760 : 580;

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => items[index]?.id ?? index,
    estimateSize: (index) => (
      expandedRowKeySet.has(items[index]?.id)
        ? EXPANDED_ROW_ESTIMATE
        : COLLAPSED_ROW_ESTIMATE
    ),
    overscan: 10,
  });

  useLayoutEffect(() => {
    const measureMountedRows = () => {
      rowElementsRef.current.forEach((node) => {
        rowVirtualizer.measureElement(node);
      });
    };

    measureMountedRows();
    const frameId = window.requestAnimationFrame(measureMountedRows);

    return () => window.cancelAnimationFrame(frameId);
  }, [expandedRowSignature, rowVirtualizer]);

  useEffect(() => {
    if (!scrollToLastRequest || items.length === 0) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      rowVirtualizer.scrollToIndex(items.length - 1, { align: 'end' });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [items.length, rowVirtualizer, scrollToLastRequest]);

  return (
    <div className="overflow-hidden rounded border border-gray-200">
      <div className="overflow-x-auto">
        <div style={{ minWidth }}>
          <div
            className="grid gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium uppercase tracking-wide text-gray-500"
            style={{ gridTemplateColumns }}
          >
            <div>{t('salesDocuments.field.product')}</div>
            <div>{t(isSalesDelivery ? 'salesDocuments.field.orderedQuantity' : 'salesDocuments.field.quantity')}</div>
            {isSalesDelivery && <div>{t('salesDocuments.field.deliveredQuantity')}</div>}
            <div>{t('salesDocuments.field.unit')}</div>
            {hasPricing && <div className="text-right">{t('salesDocuments.field.subtotal')}</div>}
            {hasPricing && <div />}
            <div />
          </div>

          <div ref={parentRef} className="max-h-[640px] min-h-[360px] overflow-auto">
            {items.length === 0 ? (
              <div className="flex h-[360px] items-center justify-center text-sm text-gray-500">
                {t('salesDocuments.emptyItems')}
              </div>
            ) : (
              <div
                style={{
                  height: rowVirtualizer.getTotalSize(),
                  position: 'relative',
                  width: '100%',
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const item = items[virtualRow.index];
                  if (!item) return null;

                  return (
                    <DocumentLineItemRow
                      key={virtualRow.key}
                      ref={(node) => {
                        if (node) {
                          rowElementsRef.current.set(item.id, node);
                          rowVirtualizer.measureElement(node);
                          return;
                        }

                        rowElementsRef.current.delete(item.id);
                      }}
                      virtualIndex={virtualRow.index}
                      style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        transform: `translateY(${virtualRow.start}px)`,
                      }}
                      item={item}
                      calculatedItem={calculatedItemsById.get(item.id)}
                      productOptions={productOptions}
                      unitOptions={unitOptionsByProductId.get(item.product_id) ?? unitOptionsByUnit.get(item.unit) ?? emptyUnitOptions}
                      taxOptions={taxOptions}
                      currencyOptions={currencyOptions}
                      documentCurrencySnapshot={documentCurrencySnapshot}
                      isExpanded={expandedRowKeySet.has(item.id)}
                      hasPricing={hasPricing}
                      isSalesDelivery={isSalesDelivery}
                      gridTemplateColumns={gridTemplateColumns}
                      onUpdateItem={onUpdateItem}
                      onSelectProduct={onSelectProduct}
                      onRemoveItem={onRemoveItem}
                      onToggleExpanded={onToggleExpanded}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
