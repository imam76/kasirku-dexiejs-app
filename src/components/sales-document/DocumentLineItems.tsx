import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button } from 'antd';
import { Plus } from 'lucide-react';
import type { Currency, Product, SalesDocumentItem, Tax } from '@/types';
import type { SalesDocumentConfig } from '@/configs/sales-document';
import { useI18n } from '@/hooks/useI18n';
import { getPrice, normalisasiHargaProduk } from '@/utils/pricing';
import { getProductDocumentUnits } from '@/utils/productUnits';
import { createEmptySalesDocumentItem } from '@/utils/salesDocuments/createEmptySalesDocumentItem';
import { mapProductToSalesDocumentItem } from '@/utils/salesDocuments/mapProductToSalesDocumentItem';
import { taxCalculationModeLabelKeys } from '@/utils/salesDocuments/i18n';
import {
  applyCurrencySnapshotToLineItem,
  normalizeCurrencyCode,
  normalizeExchangeRate,
  type DocumentCurrencySnapshot,
} from '@/utils/documentCurrency';
import { DocumentLineItemsVirtualTable } from './DocumentLineItemsVirtualTable';

interface DocumentLineItemsProps {
  config: SalesDocumentConfig;
  documentId: string;
  items: SalesDocumentItem[];
  calculatedItems: SalesDocumentItem[];
  products: Product[];
  taxes: Tax[];
  currencies: Currency[];
  documentCurrencySnapshot: DocumentCurrencySnapshot;
  onChange: (items: SalesDocumentItem[]) => void;
}

const emptyUnitOptions: Array<{ value: string; label: string }> = [];

const getItemPricingQuantity = (
  item: SalesDocumentItem,
  patch: Partial<SalesDocumentItem> = {},
) => Number(patch.quantity ?? item.quantity ?? 0);

const createSystemPricingPatch = (
  product: Product,
  item: SalesDocumentItem,
  patch: Partial<SalesDocumentItem> = {},
): Partial<SalesDocumentItem> => {
  const unit = patch.unit ?? item.unit ?? product.selling_unit;
  const quantity = getItemPricingQuantity(item, patch);

  return {
    price: getPrice(product, quantity, unit),
    purchase_price: normalisasiHargaProduk(product.purchase_price, product, product.purchase_unit, unit),
    original_price: undefined,
    is_price_edited: undefined,
    price_edited_by: undefined,
    price_edited_at: undefined,
  };
};

export const DocumentLineItems = ({
  config,
  documentId,
  items,
  calculatedItems,
  products,
  taxes,
  currencies,
  documentCurrencySnapshot,
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
  const currencyOptions = useMemo(
    () => {
      const sourceCurrencies = currencies.length > 0
        ? currencies
        : [{
          code: 'IDR',
          name: 'Rupiah Indonesia',
          is_active: true,
        } as Currency];

      return sourceCurrencies
      .filter((currency) => currency.is_active || currency.code === 'IDR')
      .map((currency) => ({
        value: currency.code,
        label: `${currency.code} - ${currency.name}`,
      }));
    },
    [currencies],
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
    onChange(itemsRef.current.map((item) => {
      if (item.id !== itemId) return item;

      const product = productsById.get(item.product_id);
      let nextPatch = patch;

      if (config.behavior.hasPricing && product) {
        const shouldReprice = patch.quantity !== undefined || patch.unit !== undefined;
        const shouldResetManualPrice = patch.unit !== undefined;

        if (shouldReprice && (!item.is_price_edited || shouldResetManualPrice)) {
          nextPatch = {
            ...patch,
            ...createSystemPricingPatch(product, item, patch),
          };
        } else if (shouldReprice) {
          nextPatch = {
            ...patch,
            purchase_price: normalisasiHargaProduk(
              product.purchase_price,
              product,
              product.purchase_unit,
              patch.unit ?? item.unit,
            ),
            original_price: getPrice(product, getItemPricingQuantity(item, patch), patch.unit ?? item.unit),
          };
        }

        if (patch.price !== undefined) {
          const price = Number(patch.price || 0);
          const originalPrice = getPrice(product, getItemPricingQuantity(item, patch), patch.unit ?? item.unit);
          const isPriceEdited = price !== originalPrice;

          nextPatch = {
            ...nextPatch,
            price,
            original_price: isPriceEdited ? originalPrice : undefined,
            is_price_edited: isPriceEdited || undefined,
            price_edited_at: isPriceEdited ? new Date().toISOString() : undefined,
          };
        }
      }

      const mergedItem = { ...item, ...nextPatch };
      const shouldRecalculateCurrency = (
        nextPatch.price !== undefined ||
        patch.foreign_price !== undefined ||
        patch.exchange_rate !== undefined ||
        patch.currency_code !== undefined
      );

      if (!shouldRecalculateCurrency) return mergedItem;

      const itemSnapshot = {
        ...documentCurrencySnapshot,
        currency_code: normalizeCurrencyCode(mergedItem.currency_code ?? documentCurrencySnapshot.currency_code),
        exchange_rate: normalizeExchangeRate(mergedItem.exchange_rate ?? documentCurrencySnapshot.exchange_rate),
        exchange_rate_source: mergedItem.exchange_rate_source ?? documentCurrencySnapshot.exchange_rate_source,
        exchange_rate_basis: mergedItem.exchange_rate_basis ?? documentCurrencySnapshot.exchange_rate_basis,
        exchange_rate_date: mergedItem.exchange_rate_date ?? documentCurrencySnapshot.exchange_rate_date,
      };

      return applyCurrencySnapshotToLineItem(mergedItem, itemSnapshot, {
        preferForeignPrice: patch.foreign_price !== undefined || patch.exchange_rate !== undefined,
      });
    }));
  }, [config.behavior.hasPricing, documentCurrencySnapshot, onChange, productsById]);

  const addRow = useCallback(() => {
    onChange([
      ...itemsRef.current,
      applyCurrencySnapshotToLineItem(createEmptySalesDocumentItem(documentId), documentCurrencySnapshot),
    ]);
    setScrollToLastRequest((current) => current + 1);
  }, [documentCurrencySnapshot, documentId, onChange]);

  const selectProduct = useCallback((itemId: string, productId: string) => {
    const product = productsById.get(productId);
    if (!product) return;

    onChange(itemsRef.current.map((item) => {
      if (item.id !== itemId) return item;

      const nextItem = mapProductToSalesDocumentItem(product, item.document_id);
      const quantity = item.quantity || nextItem.quantity;
      const unit = nextItem.unit;

      return applyCurrencySnapshotToLineItem({
        ...nextItem,
        id: item.id,
        quantity,
        ordered_quantity: item.ordered_quantity ?? nextItem.ordered_quantity,
        delivered_quantity: item.delivered_quantity ?? nextItem.delivered_quantity,
        ...createSystemPricingPatch(product, { ...nextItem, quantity, unit }),
        discount_type: item.discount_type ?? nextItem.discount_type,
        discount_value: item.discount_value ?? nextItem.discount_value,
        discount_amount: item.discount_amount ?? nextItem.discount_amount,
        created_at: item.created_at,
      }, documentCurrencySnapshot);
    }));
  }, [documentCurrencySnapshot, onChange, productsById]);

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
        currencyOptions={currencyOptions}
        documentCurrencySnapshot={documentCurrencySnapshot}
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
