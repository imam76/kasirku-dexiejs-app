import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'antd';
import { Plus } from 'lucide-react';
import type { Product, PurchaseDocumentItem, Tax } from '@/types';
import type { PurchaseDocumentConfig } from '@/configs/purchase-document';
import { useI18n } from '@/hooks/useI18n';
import { useUnits } from '@/hooks/useUnits';
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
  onChange: (items: PurchaseDocumentItem[]) => void;
  onCreateProductRequest?: (lineId: string, search: string) => void;
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
  onChange,
  onCreateProductRequest,
}: PurchaseDocumentLineItemsProps) => {
  const { t } = useI18n();
  const { unitOptions: masterUnitOptions } = useUnits();
  const [expandedRowKeys, setExpandedRowKeys] = useState<string[]>([]);
  const [scrollToLastRequest, setScrollToLastRequest] = useState(0);
  const itemsRef = useRef(items);

  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

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
  const unitOptionsByProductId = useMemo(
    () => new Map(products.map((product) => {
      const productUnits = getProductDocumentUnits(product);
      const uniqueUnitKeys = new Set([
        ...productUnits.map((u) => u.toLowerCase()),
        ...Array.from(masterUnitMap.keys()),
      ]);

      const options = Array.from(uniqueUnitKeys)
        .filter(Boolean)
        .map((unitKey) => ({
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
    onChange([
      ...itemsRef.current,
      applyCurrencySnapshotToLineItem(createEmptyPurchaseDocumentItem(documentId), documentCurrencySnapshot),
    ]);
    setScrollToLastRequest((current) => current + 1);
  }, [documentCurrencySnapshot, documentId, onChange]);

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
        quantity,
        ordered_quantity: config.type === 'PURCHASE_RECEIPT' ? item.ordered_quantity ?? quantity : item.ordered_quantity,
        received_quantity: config.type === 'PURCHASE_RECEIPT' ? item.received_quantity ?? quantity : item.received_quantity,
        price: config.behavior.hasPricing
          ? createSystemPurchasePricingPatch(product, { ...nextItem, quantity, unit }).price
          : undefined,
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
      <PurchaseLineItemsVirtualTable
        items={items}
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
        scrollToLastRequest={scrollToLastRequest}
        onUpdateItem={updateItem}
        onSelectProduct={selectProduct}
        onRemoveItem={removeItem}
        onToggleExpanded={toggleExpanded}
        onCreateProductRequest={onCreateProductRequest}
      />
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
