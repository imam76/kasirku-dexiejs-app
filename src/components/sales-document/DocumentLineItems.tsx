import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'antd';
import { Plus } from 'lucide-react';
import type { Product, SalesDocumentItem, Tax } from '@/types';
import type { SalesDocumentConfig } from '@/configs/sales-document';
import { useI18n } from '@/hooks/useI18n';
import { getProductDocumentUnits } from '@/utils/productUnits';
import { createEmptySalesDocumentItem } from '@/utils/salesDocuments/createEmptySalesDocumentItem';
import { mapProductToSalesDocumentItem } from '@/utils/salesDocuments/mapProductToSalesDocumentItem';
import { taxCalculationModeLabelKeys } from '@/utils/salesDocuments/i18n';
import { DocumentLineItemsVirtualTable } from './DocumentLineItemsVirtualTable';

interface DocumentLineItemsProps {
  config: SalesDocumentConfig;
  documentId: string;
  items: SalesDocumentItem[];
  calculatedItems: SalesDocumentItem[];
  products: Product[];
  taxes: Tax[];
  onChange: (items: SalesDocumentItem[]) => void;
}

const emptyUnitOptions: Array<{ value: string; label: string }> = [];

export const DocumentLineItems = ({
  config,
  documentId,
  items,
  calculatedItems,
  products,
  taxes,
  onChange,
}: DocumentLineItemsProps) => {
  const { t } = useI18n();
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

  const taxOptions = useMemo(
    () => taxes.map((tax) => ({
      value: tax.id,
      label: `${tax.name} (${tax.rate}%, ${t(taxCalculationModeLabelKeys[tax.calculation_mode])})`,
    })),
    [t, taxes],
  );

  const unitOptionsByProductId = useMemo(
    () => new Map(products.map((product) => [
      product.id,
      getProductDocumentUnits(product).map((unit) => ({ value: unit, label: unit })),
    ])),
    [products],
  );

  const unitOptionsByUnit = useMemo(() => {
    const uniqueUnits = new Set(items.map((item) => item.unit).filter(Boolean));
    return new Map(Array.from(uniqueUnits).map((unit) => [unit, [{ value: unit, label: unit }]]));
  }, [items]);

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

  const updateItem = useCallback((itemId: string, patch: Partial<SalesDocumentItem>) => {
    onChange(itemsRef.current.map((item) => (item.id === itemId ? { ...item, ...patch } : item)));
  }, [onChange]);

  const addRow = useCallback(() => {
    onChange([...itemsRef.current, createEmptySalesDocumentItem(documentId)]);
    setScrollToLastRequest((current) => current + 1);
  }, [documentId, onChange]);

  const selectProduct = useCallback((itemId: string, productId: string) => {
    const product = productsById.get(productId);
    if (!product) return;

    onChange(itemsRef.current.map((item) => {
      if (item.id !== itemId) return item;

      const nextItem = mapProductToSalesDocumentItem(product, item.document_id);
      return {
        ...nextItem,
        id: item.id,
        quantity: item.quantity || nextItem.quantity,
        ordered_quantity: item.ordered_quantity ?? nextItem.ordered_quantity,
        delivered_quantity: item.delivered_quantity ?? nextItem.delivered_quantity,
        discount_type: item.discount_type ?? nextItem.discount_type,
        discount_value: item.discount_value ?? nextItem.discount_value,
        discount_amount: item.discount_amount ?? nextItem.discount_amount,
        created_at: item.created_at,
      };
    }));
  }, [onChange, productsById]);

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
      <DocumentLineItemsVirtualTable
        items={items}
        calculatedItemsById={calculatedItemsById}
        productOptions={productOptions}
        unitOptionsByProductId={unitOptionsByProductId}
        unitOptionsByUnit={unitOptionsByUnit}
        emptyUnitOptions={emptyUnitOptions}
        taxOptions={taxOptions}
        expandedRowKeySet={expandedRowKeySet}
        expandedRowSignature={expandedRowSignature}
        hasPricing={config.behavior.hasPricing}
        isSalesDelivery={config.type === 'SALES_DELIVERY'}
        scrollToLastRequest={scrollToLastRequest}
        onUpdateItem={updateItem}
        onSelectProduct={selectProduct}
        onRemoveItem={removeItem}
        onToggleExpanded={toggleExpanded}
      />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-xs text-gray-500">
          {t('salesDocuments.addRowShortcut')}
          {' '}
          <span className="font-medium">Ctrl + Enter</span>
          {' / '}
          <span className="font-medium">Cmd + Enter</span>
        </div>
        <Button type="dashed" icon={<Plus size={16} />} onClick={addRow}>
          {t('salesDocuments.addRow')}
        </Button>
      </div>
    </div>
  );
};
