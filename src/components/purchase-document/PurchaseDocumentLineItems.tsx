import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'antd';
import { Plus } from 'lucide-react';
import type { Product, PurchaseCostStatus, PurchaseDocumentItem, Tax } from '@/types';
import type { PurchaseDocumentConfig } from '@/configs/purchase-document';
import { useI18n } from '@/hooks/useI18n';
import { useUnits } from '@/hooks/useUnits';
import { useLineItemViewControls } from '@/hooks/useLineItemViewControls';
import { LineItemsToolbar } from '@/components/document-line-items/LineItemsToolbar';
import { sortLineItems, type LineItemSortKey } from '@/utils/documentLineItems/lineItemView';
import { getPurchasePrice } from '@/utils/pricing';
import { getProductDocumentUnits } from '@/utils/productUnits';
import { createEmptyPurchaseDocumentItem } from '@/utils/purchaseDocuments/createEmptyPurchaseDocumentItem';
import { mapProductToPurchaseDocumentItem } from '@/utils/purchaseDocuments/mapProductToPurchaseDocumentItem';
import {
  applyCurrencySnapshotToLineItem,
  type DocumentCurrencySnapshot,
} from '@/utils/documentCurrency';
import { PurchaseLineItemsVirtualTable } from './PurchaseLineItemsVirtualTable';

interface PurchaseDocumentLineItemsProps {
  config: PurchaseDocumentConfig;
  documentId: string;
  items: PurchaseDocumentItem[];
  calculatedItems: PurchaseDocumentItem[];
  products: Product[];
  taxes: Tax[];
  documentCurrencySnapshot: DocumentCurrencySnapshot;
  receiptCostStatusDefault?: PurchaseCostStatus;
  onChange: (items: PurchaseDocumentItem[]) => void;
  onCreateProductRequest?: (lineId: string, search: string) => void;
  onEditProductRequest?: (lineId: string, productId: string) => void;
}

const emptyUnitOptions: Array<{ value: string; label: string }> = [];

const createSystemPurchasePricingPatch = (
  product: Product,
  item: PurchaseDocumentItem,
  patch: Partial<PurchaseDocumentItem> = {},
): Partial<PurchaseDocumentItem> => {
  const unit = patch.unit ?? item.unit ?? product.purchase_unit;

  return {
    price: getPurchasePrice(product, unit),
  };
};

export const PurchaseDocumentLineItems = ({
  config,
  documentId,
  items,
  calculatedItems,
  products,
  taxes,
  documentCurrencySnapshot,
  receiptCostStatusDefault = 'FINAL',
  onChange,
  onCreateProductRequest,
  onEditProductRequest,
}: PurchaseDocumentLineItemsProps) => {
  const { t } = useI18n();
  const { unitOptions: masterUnitOptions } = useUnits();
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);
  const [scrollToLastRequest, setScrollToLastRequest] = useState(0);
  const itemsRef = useRef(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const {
    searchText,
    setSearchText,
    clearSearch,
    isFiltering,
    entries,
    filledCount,
    duplicateProductIds,
  } = useLineItemViewControls(items);

  const productOptions = useMemo(
    () => products.map((product) => ({
      value: product.id,
      label: product.sku ? `${product.name} - ${product.sku}` : product.name,
    })),
    [products],
  );

  const productsById = useMemo(
    () => new Map(products.map((product) => [product.id, product])),
    [products],
  );

  const masterUnitMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const option of masterUnitOptions) {
      map.set(option.value.toLowerCase(), option.label);
    }
    return map;
  }, [masterUnitOptions]);

  const taxOptions = useMemo(
    () => taxes.map((tax) => ({
      value: tax.id,
      label: `${tax.name} (${tax.rate}%)`,
    })),
    [taxes],
  );
  // Hanya satuan milik produk yang boleh dipilih. Menawarkan seluruh satuan
  // master membuat pembelian 1 box tercatat 1 satuan dasar, karena rationya
  // tidak ada dan konversi jatuh ke 1.
  const unitOptionsByProductId = useMemo(
    () => new Map(products.map((product) => {
      const options = getProductDocumentUnits(product).map((unitKey) => ({
        value: unitKey,
        label: masterUnitMap.get(unitKey) || unitKey,
      }));

      return [product.id, options];
    })),
    [products, masterUnitMap],
  );

  const unitOptionsByUnit = useMemo(() => {
    const uniqueUnitKeys = new Set([
      ...items.map((item) => item.unit?.toLowerCase()).filter(Boolean),
      ...Array.from(masterUnitMap.keys()),
    ]);

    const allOptions = Array.from(uniqueUnitKeys)
      .filter(Boolean)
      .map((unitKey) => ({
        value: unitKey,
        label: masterUnitMap.get(unitKey) || unitKey,
      }));

    const map = new Map<string, typeof allOptions>();
    for (const unitKey of uniqueUnitKeys) {
      map.set(unitKey, allOptions);
    }
    return map;
  }, [items, masterUnitMap]);

  const calculatedItemsById = useMemo(
    () => new Map(calculatedItems.map((item) => [item.id, item])),
    [calculatedItems],
  );

  const expandedRowKeySet = useMemo(
    () => new Set(expandedRowKeys),
    [expandedRowKeys],
  );

  const expandedRowSignature = useMemo(
    () => expandedRowKeys.join('|'),
    [expandedRowKeys],
  );

  const updateItem = useCallback((itemId: string, patch: Partial<PurchaseDocumentItem>) => {
    onChange(itemsRef.current.map((item) => {
      if (item.id !== itemId) return item;

      const product = productsById.get(item.product_id);
      let nextPatch = patch;

      if (config.behavior.hasPricing && product && patch.unit !== undefined) {
        nextPatch = {
          ...patch,
          ...createSystemPurchasePricingPatch(product, item, patch),
        };
      }

      const mergedItem = { ...item, ...nextPatch };
      const shouldRecalculateCurrency = (
        nextPatch.price !== undefined ||
        patch.foreign_price !== undefined ||
        patch.exchange_rate !== undefined ||
        patch.currency_code !== undefined
      );

      if (!shouldRecalculateCurrency) return mergedItem;

      return applyCurrencySnapshotToLineItem(mergedItem, documentCurrencySnapshot, {
        preferForeignPrice: patch.foreign_price !== undefined,
      });
    }));
  }, [config.behavior.hasPricing, documentCurrencySnapshot, onChange, productsById]);

  const addRow = useCallback(() => {
    clearSearch();
    onChange([
      ...itemsRef.current,
      applyCurrencySnapshotToLineItem(createEmptyPurchaseDocumentItem(documentId), documentCurrencySnapshot),
    ]);
    setScrollToLastRequest((current) => current + 1);
  }, [clearSearch, documentCurrencySnapshot, documentId, onChange]);

  const subtotalById = useMemo(
    () => new Map(calculatedItems.map((item) => [item.id, item.subtotal ?? 0])),
    [calculatedItems],
  );

  const receiptCostSummary = useMemo(() => {
    if (config.type !== 'PURCHASE_RECEIPT') return undefined;

    return items.reduce<Record<PurchaseCostStatus, number>>((summary, item) => {
      if (!item.product_id) return summary;
      const status = item.cost_status ?? receiptCostStatusDefault;
      summary[status] += 1;
      return summary;
    }, { FINAL: 0, ESTIMATED: 0, PENDING: 0 });
  }, [config.type, items, receiptCostStatusDefault]);

  const handleSort = useCallback((sortKey: LineItemSortKey) => {
    onChange(sortLineItems(itemsRef.current, sortKey, subtotalById));
  }, [onChange, subtotalById]);

  const selectProduct = useCallback((itemId: string, productId: string) => {
    const product = productsById.get(productId);
    if (!product) return;

    onChange(itemsRef.current.map((item) => {
      if (item.id !== itemId) return item;

      const nextItem = mapProductToPurchaseDocumentItem(product, item.document_id);
      const quantity = item.quantity || nextItem.quantity;
      const unit = nextItem.unit;

      return applyCurrencySnapshotToLineItem({
        ...nextItem,
        id: item.id,
        cost_status: item.cost_status,
        quantity,
        ordered_quantity: config.type === 'PURCHASE_RECEIPT' ? item.ordered_quantity ?? quantity : item.ordered_quantity,
        received_quantity: config.type === 'PURCHASE_RECEIPT' ? item.received_quantity ?? quantity : item.received_quantity,
        price: config.behavior.hasPricing && item.cost_status !== 'PENDING'
          ? createSystemPurchasePricingPatch(product, { ...nextItem, quantity, unit }).price
          : 0,
        discount_type: item.discount_type ?? nextItem.discount_type,
        discount_value: item.discount_value ?? nextItem.discount_value,
        discount_amount: item.discount_amount ?? nextItem.discount_amount,
        created_at: item.created_at,
      }, documentCurrencySnapshot);
    }));
  }, [config.behavior.hasPricing, config.type, documentCurrencySnapshot, onChange, productsById]);

  const removeItem = useCallback((itemId: string) => {
    setExpandedRowKeys((currentKeys) => currentKeys.filter((key) => key !== itemId));
    onChange(itemsRef.current.filter((item) => item.id !== itemId));
  }, [onChange]);

  const toggleExpanded = useCallback((itemId: string) => {
    setExpandedRowKeys((currentKeys) => (
      currentKeys.includes(itemId)
        ? currentKeys.filter((key) => key !== itemId)
        : [...currentKeys, itemId]
    ));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'enter') {
        event.preventDefault();
        addRow();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [addRow]);

  return (
    <div className="space-y-3">
      <LineItemsToolbar
        searchText={searchText}
        filledCount={filledCount}
        visibleCount={entries.length}
        totalCount={items.length}
        isFiltering={isFiltering}
        showSubtotalSort={config.behavior.hasPricing}
        onSearchChange={setSearchText}
        onSort={handleSort}
      />
      <PurchaseLineItemsVirtualTable
        entries={entries}
        totalItemCount={items.length}
        duplicateProductIds={duplicateProductIds}
        calculatedItemsById={calculatedItemsById}
        productOptions={productOptions}
        unitOptionsByProductId={unitOptionsByProductId}
        unitOptionsByUnit={unitOptionsByUnit}
        emptyUnitOptions={emptyUnitOptions}
        taxOptions={taxOptions}
        documentCurrencySnapshot={documentCurrencySnapshot}
        expandedRowKeySet={expandedRowKeySet}
        expandedRowSignature={expandedRowSignature}
        hasPricing={config.behavior.hasPricing}
        isPurchaseReceipt={config.type === 'PURCHASE_RECEIPT'}
        receiptCostStatusDefault={receiptCostStatusDefault}
        scrollToLastRequest={scrollToLastRequest}
        onUpdateItem={updateItem}
        onSelectProduct={selectProduct}
        onRemoveItem={removeItem}
        onToggleExpanded={toggleExpanded}
        onCreateProductRequest={onCreateProductRequest}
        onEditProductRequest={onEditProductRequest}
      />
      {receiptCostSummary && (receiptCostSummary.FINAL + receiptCostSummary.ESTIMATED + receiptCostSummary.PENDING) > 0 && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between">
          <div className="font-medium">Status harga diatur per produk.</div>
          <div className="flex flex-wrap gap-x-3 gap-y-1">
            <span>{receiptCostSummary.FINAL} Harga Final</span>
            <span>{receiptCostSummary.ESTIMATED} Harga Sementara</span>
            <span>{receiptCostSummary.PENDING} Belum Ada Harga</span>
          </div>
          {receiptCostSummary.PENDING > 0 && (
            <span className="text-red-700">Baris tanpa harga harus dilengkapi sebelum penerimaan diterbitkan.</span>
          )}
        </div>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-gray-500">
          {t('purchaseDocuments.addRowShortcut')}
          {' '}
          <span className="font-medium">Ctrl + Enter</span>
          {' / '}
          <span className="font-medium">Cmd + Enter</span>
        </div>
        <Button type="dashed" icon={<Plus size={16} />} onClick={addRow}>
          {t('purchaseDocuments.addRow')}
        </Button>
      </div>
    </div>
  );
};
