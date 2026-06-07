import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useI18n } from '@/hooks/useI18n';
import type { PurchaseDocumentItem } from '@/types';
import { PurchaseLineItemRow } from './PurchaseLineItemRow';

interface Option {
  value: string;
  label: string;
}

interface PurchaseLineItemsVirtualTableProps {
  items: PurchaseDocumentItem[];
  calculatedItemsById: Map<string, PurchaseDocumentItem>;
  productOptions: Option[];
  unitOptionsByProductId: Map<string, Option[]>;
  unitOptionsByUnit: Map<string, Option[]>;
  emptyUnitOptions: Option[];
  taxOptions: Option[];
  expandedRowKeySet: Set<string>;
  expandedRowSignature: string;
  hasPricing: boolean;
  isPurchaseReceipt: boolean;
  scrollToLastRequest: number;
  onUpdateItem: (itemId: string, patch: Partial<PurchaseDocumentItem>) => void;
  onSelectProduct: (itemId: string, productId: string) => void;
  onRemoveItem: (itemId: string) => void;
  onToggleExpanded: (itemId: string) => void;
}

const COLLAPSED_ROW_ESTIMATE = 56;
const EXPANDED_ROW_ESTIMATE = 144;

export const PurchaseLineItemsVirtualTable = ({
  items,
  calculatedItemsById,
  productOptions,
  unitOptionsByProductId,
  unitOptionsByUnit,
  emptyUnitOptions,
  taxOptions,
  expandedRowKeySet,
  expandedRowSignature,
  hasPricing,
  isPurchaseReceipt,
  scrollToLastRequest,
  onUpdateItem,
  onSelectProduct,
  onRemoveItem,
  onToggleExpanded,
}: PurchaseLineItemsVirtualTableProps) => {
  const { t } = useI18n();
  const parentRef = useRef<HTMLDivElement>(null);
  const rowElementsRef = useRef(new Map<string, HTMLDivElement>());
  const gridTemplateColumns = useMemo(() => {
    const columns = ['minmax(260px,1fr)', '120px'];
    if (isPurchaseReceipt) columns.push('120px');
    columns.push('120px');
    if (hasPricing) columns.push('140px', '56px');
    columns.push('56px');
    return columns.join(' ');
  }, [hasPricing, isPurchaseReceipt]);
  const minWidth = isPurchaseReceipt ? 880 : hasPricing ? 760 : 580;

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
            <div>{t('purchaseDocuments.field.product')}</div>
            <div>{t('purchaseDocuments.field.quantity')}</div>
            {isPurchaseReceipt && <div>{t('purchaseDocuments.field.receivedQuantity')}</div>}
            <div>{t('purchaseDocuments.field.unit')}</div>
            {hasPricing && <div className="text-right">{t('purchaseDocuments.field.subtotal')}</div>}
            {hasPricing && <div />}
            <div />
          </div>

          <div ref={parentRef} className="max-h-[640px] min-h-[360px] overflow-auto">
            {items.length === 0 ? (
              <div className="flex h-[360px] items-center justify-center text-sm text-gray-500">
                {t('purchaseDocuments.emptyItems')}
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
                    <PurchaseLineItemRow
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
                      isExpanded={expandedRowKeySet.has(item.id)}
                      hasPricing={hasPricing}
                      isPurchaseReceipt={isPurchaseReceipt}
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
