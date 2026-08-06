import {
  inferUnitDefinitionType,
  normalizeUnitKey,
} from '@/constants/units';
import type { StockFormData } from '@/hooks/useStockManagement';
import type { UnitDefinition } from '@/types';
import { useI18n } from '@/hooks/useI18n';
import { getProductCategoryOptions } from '@/i18n/stock';
import { db } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useQuery } from '@tanstack/react-query';
import { Alert, Badge, Button, Grid, Input, InputNumber, Modal, Select, Switch, Tabs } from 'antd';
import type { InputRef } from 'antd';
import { AlertTriangle, Plus, ScanLine, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  type Control,
  Controller,
  type FieldError,
  type FieldErrors,
  type UseFormGetValues,
  type UseFormReset,
  type UseFormSetValue,
  useFieldArray,
  useWatch,
} from 'react-hook-form';
import {
  appendKeyboardBarcodeCharacter,
  finishKeyboardBarcodeScan,
  isKeyboardBarcodeBufferActive,
  type KeyboardBarcodeBuffer,
} from '@/utils/keyboardBarcodeScanner';
import { formatCurrencyInput, parseCurrencyInput } from '@/utils/formatters';
import { resolveProductUnitRatio } from '@/utils/productUnits';

const { useBreakpoint } = Grid;

const buildSellableUnitsWithDefault = (defaultUnit: string, units: string[]) => {
  const normalizedDefault = String(defaultUnit || '').trim();
  const seen = new Set<string>();

  return [normalizedDefault, ...units]
    .map((unit) => String(unit || '').trim())
    .filter(Boolean)
    .filter((unit) => {
      if (seen.has(unit)) return false;
      seen.add(unit);
      return true;
    });
};

type Props = {
  open: boolean;
  editingId: string | null;
  control: Control<StockFormData>;
  errors: FieldErrors<StockFormData>;
  setValue: UseFormSetValue<StockFormData>;
  getValues: UseFormGetValues<StockFormData>;
  reset: UseFormReset<StockFormData>;
  onCancel: () => void;
  onSave: () => void | Promise<void>;
  setIsModalOpen: (open: boolean) => void;
};

type FieldContainerProps = {
  label: ReactNode;
  error?: FieldError;
  help?: string;
  required?: boolean;
  requiredLabel?: string;
  children: ReactNode;
};

function FieldContainer({ label, error, help, required, requiredLabel, children }: FieldContainerProps) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 flex items-center gap-1 text-sm font-medium text-gray-700">
        <span>{label}</span>
        {required ? (
          <span className="text-sm font-bold leading-none text-red-500" aria-label={requiredLabel} title={requiredLabel}>
            *
          </span>
        ) : null}
      </label>
      {children}
      {error?.message ? <p className="mt-1 text-xs text-red-600">{String(error.message)}</p> : null}
      {!error?.message && help ? <p className="mt-1 text-xs text-gray-500">{help}</p> : null}
    </div>
  );
}

export default function StockProductModal({
  open,
  editingId,
  control,
  errors,
  setValue,
  getValues,
  reset,
  onCancel,
  onSave,
}: Props) {
  const { t } = useI18n();
  const screens = useBreakpoint();
  const [activeTab, setActiveTab] = useState('product');
  const { fields: wholesaleFields, append: appendWholesale, remove: removeWholesale } = useFieldArray({
    control,
    name: 'wholesale_prices',
  });
  const { fields: unitMappingFields, append: appendUnitMapping, remove: removeUnitMapping } = useFieldArray({
    control,
    name: 'unit_mappings',
  });

  const purchaseUnit = useWatch({ control, name: 'purchase_unit' }) || 'pcs';
  const sellingUnit = useWatch({ control, name: 'selling_unit' }) || 'pcs';
  const watchedSellableUnits = useWatch({ control, name: 'sellable_units' });
  const watchedUnitMappings = useWatch({ control, name: 'unit_mappings' });
  const watchedWholesalePrices = useWatch({ control, name: 'wholesale_prices' });
  const sellableUnits = useMemo(() => watchedSellableUnits || [], [watchedSellableUnits]);
  const unitMappings = useMemo(() => watchedUnitMappings || [], [watchedUnitMappings]);
  const wholesalePrices = useMemo(() => watchedWholesalePrices || [], [watchedWholesalePrices]);
  const previousPurchaseUnitRef = useRef<string | null>(null);
  const pendingAutoMappingUnitsRef = useRef(new Set<string>());

  const { data: conversions = [] } = useQuery({
    queryKey: ['unitConversions'],
    queryFn: () => db.unitConversions.toArray(),
  });

  const unitDefinitions = useLiveQuery(
    () => db.units.orderBy('name').toArray(),
    [],
    [],
  );

  const availableUnits = useMemo(() => {
    const units = new Set<string>();
    unitDefinitions.forEach((unit) => {
      units.add(normalizeUnitKey(unit.id));
    });
    [purchaseUnit, sellingUnit, ...sellableUnits].forEach((unit) => units.add(normalizeUnitKey(unit)));
    unitMappings.forEach((mapping) => {
      units.add(normalizeUnitKey(mapping.from_unit));
      units.add(normalizeUnitKey(mapping.to_unit));
    });
    return Array.from(units).filter(Boolean).sort();
  }, [purchaseUnit, sellableUnits, sellingUnit, unitDefinitions, unitMappings]);

  const categoryOptions = useMemo(() => getProductCategoryOptions(t), [t]);

  const unitDefinitionById = useMemo(() => {
    const map = new Map<string, UnitDefinition>();
    unitDefinitions.forEach((unit) => {
      map.set(normalizeUnitKey(unit.id), {
        ...unit,
        id: normalizeUnitKey(unit.id),
      });
    });
    return map;
  }, [unitDefinitions]);

  const selectedSellableUnits = useMemo(() => {
    const seen = new Set<string>();

    return sellableUnits
      .map((unit) => String(unit || '').trim())
      .filter(Boolean)
      .filter((unit) => {
        if (seen.has(unit)) return false;
        seen.add(unit);
        return true;
      });
  }, [sellableUnits]);

  const wholesaleUnitOptions = useMemo(
    () => selectedSellableUnits.map((unit) => ({
      value: unit,
      label: unitDefinitionById.get(normalizeUnitKey(unit))?.name ?? unit,
    })),
    [selectedSellableUnits, unitDefinitionById],
  );

  const baseUnitOptions = useMemo(
    () =>
      availableUnits
        .filter((unit) => {
          const normalizedUnit = normalizeUnitKey(unit);
          const definition = unitDefinitionById.get(normalizedUnit);
          return definition?.canBeBaseUnit ?? (inferUnitDefinitionType(normalizedUnit) !== 'package');
        })
        .map((unit) => ({ value: unit, label: unitDefinitionById.get(normalizeUnitKey(unit))?.name ?? unit })),
    [availableUnits, unitDefinitionById],
  );

  const canUseAsConversionUnit = useCallback((unit: string) => {
    const normalizedUnit = normalizeUnitKey(unit);
    const normalizedPurchaseUnit = normalizeUnitKey(purchaseUnit);

    if (!normalizedUnit) return false;
    if (normalizedUnit === normalizedPurchaseUnit) return true;

    const definition = unitDefinitionById.get(normalizedUnit);
    return definition?.canBeConversionUnit ?? (inferUnitDefinitionType(normalizedUnit) !== 'count');
  }, [purchaseUnit, unitDefinitionById]);

  const sellableUnitOptions = useMemo(
    () =>
      availableUnits
        .filter((unit) => {
          const normalizedUnit = normalizeUnitKey(unit);
          return normalizedUnit === normalizeUnitKey(purchaseUnit) || canUseAsConversionUnit(unit);
        })
        .map((unit) => ({ value: unit, label: unitDefinitionById.get(normalizeUnitKey(unit))?.name ?? unit })),
    [availableUnits, canUseAsConversionUnit, purchaseUnit, unitDefinitionById],
  );

  const unitMappingOptions = useMemo(
    () =>
      availableUnits
        .map((unit) => ({ value: unit, label: unitDefinitionById.get(normalizeUnitKey(unit))?.name ?? unit })),
    [availableUnits, unitDefinitionById],
  );

  const nextUnitMappingTarget = useMemo(() => unitMappingOptions.find((option) => {
    const targetUnit = normalizeUnitKey(option.value);
    const baseUnit = normalizeUnitKey(purchaseUnit);
    if (!targetUnit || targetUnit === baseUnit) return false;

    return !unitMappings.some((mapping) => {
      const fromUnit = normalizeUnitKey(mapping.from_unit);
      const toUnit = normalizeUnitKey(mapping.to_unit);
      return (
        (fromUnit === baseUnit && toUnit === targetUnit) ||
        (fromUnit === targetUnit && toUnit === baseUnit)
      );
    });
  })?.value || '', [purchaseUnit, unitMappingOptions, unitMappings]);

  const resolveSelectedUnit = useCallback((unit: string) => resolveProductUnitRatio({
    purchase_unit: purchaseUnit,
    selling_unit: sellingUnit,
    sellable_units: selectedSellableUnits,
    unit_mappings: unitMappings,
  }, unit, purchaseUnit, { globalConversions: conversions }), [
    conversions,
    purchaseUnit,
    selectedSellableUnits,
    sellingUnit,
    unitMappings,
  ]);

  const missingProductMappingUnits = useMemo(() => {
    return selectedSellableUnits.filter((unit) => {
      if (resolveSelectedUnit(unit).status !== 'disconnected') return false;
      const normalizedUnit = normalizeUnitKey(unit);
      return !unitMappings.some((mapping) => (
        normalizeUnitKey(mapping.from_unit) === normalizedUnit ||
        normalizeUnitKey(mapping.to_unit) === normalizedUnit
      ));
    });
  }, [selectedSellableUnits, resolveSelectedUnit, unitMappings]);

  const incompleteProductMappingUnits = useMemo(() => {
    return selectedSellableUnits.filter((unit) => {
      return resolveSelectedUnit(unit).status !== 'resolved';
    });
  }, [selectedSellableUnits, resolveSelectedUnit]);

  const hasUnitConversion = incompleteProductMappingUnits.length === 0;
  const unitConversionAttentionCount = incompleteProductMappingUnits.length;

  const conversionWarning = useMemo(() => {
    if (hasUnitConversion) return null;

    return {
      title: t('stock.form.productConversionMissingTitle'),
      description: (
        <p>
          {t('stock.form.productConversionMissingDescription', {
            units: incompleteProductMappingUnits.join(', '),
            baseUnit: purchaseUnit,
          })}
        </p>
      ),
    };
  }, [hasUnitConversion, purchaseUnit, incompleteProductMappingUnits, t]);

  useEffect(() => {
    const nextSellingUnit = selectedSellableUnits[0] || '';
    if (nextSellingUnit && nextSellingUnit !== sellingUnit) {
      setValue('selling_unit', nextSellingUnit, { shouldDirty: true, shouldValidate: true });
    }
  }, [selectedSellableUnits, sellingUnit, setValue]);

  useEffect(() => {
    if (!open) {
      pendingAutoMappingUnitsRef.current.clear();
      return;
    }

    unitMappings.forEach((mapping) => {
      pendingAutoMappingUnitsRef.current.delete(normalizeUnitKey(mapping.from_unit));
      pendingAutoMappingUnitsRef.current.delete(normalizeUnitKey(mapping.to_unit));
    });
  }, [open, unitMappings]);

  useEffect(() => {
    if (!open || missingProductMappingUnits.length === 0) return;
    const previousPurchaseUnit = previousPurchaseUnitRef.current;
    if (
      previousPurchaseUnit !== null &&
      normalizeUnitKey(previousPurchaseUnit) !== normalizeUnitKey(purchaseUnit)
    ) return;

    missingProductMappingUnits.forEach((unit) => {
      const normalizedUnit = normalizeUnitKey(unit);
      if (pendingAutoMappingUnitsRef.current.has(normalizedUnit)) return;
      pendingAutoMappingUnitsRef.current.add(normalizedUnit);
      appendUnitMapping({
        from_quantity: 1,
        from_unit: purchaseUnit,
        to_quantity: 0,
        to_unit: unit,
      });
    });
  }, [open, missingProductMappingUnits, purchaseUnit, appendUnitMapping]);

  useEffect(() => {
    if (!open) {
      previousPurchaseUnitRef.current = null;
      return;
    }

    const normalizedPurchaseUnit = String(purchaseUnit || '').trim();
    const previousPurchaseUnit = previousPurchaseUnitRef.current;
    previousPurchaseUnitRef.current = normalizedPurchaseUnit;

    if (!normalizedPurchaseUnit || previousPurchaseUnit === null || previousPurchaseUnit === normalizedPurchaseUnit) {
      return;
    }

    const remainingUnits = selectedSellableUnits.filter(
      (unit) => normalizeUnitKey(unit) !== normalizeUnitKey(previousPurchaseUnit),
    );
    const nextSellableUnits = buildSellableUnitsWithDefault(normalizedPurchaseUnit, remainingUnits);
    const hasChanged =
      nextSellableUnits.length !== selectedSellableUnits.length ||
      nextSellableUnits.some((unit, index) => unit !== selectedSellableUnits[index]);

    if (hasChanged) {
      setValue('sellable_units', nextSellableUnits, { shouldDirty: true, shouldValidate: true });
    }

    if (sellingUnit !== normalizedPurchaseUnit) {
      setValue('selling_unit', normalizedPurchaseUnit, { shouldDirty: true, shouldValidate: true });
    }

  }, [open, purchaseUnit, selectedSellableUnits, sellingUnit, setValue]);

  useEffect(() => {
    if (!open) return;

    if (errors.wholesale_prices) {
      setActiveTab('wholesale');
      return;
    }

    if (errors.unit_mappings || errors.sellable_units || errors.selling_unit) {
      setActiveTab('multi-unit');
    }
  }, [errors.sellable_units, errors.selling_unit, errors.unit_mappings, errors.wholesale_prices, open]);

  const handleSave = () => {
    if (errors.wholesale_prices) {
      setActiveTab('wholesale');
    } else if (!hasUnitConversion || errors.unit_mappings || errors.sellable_units || errors.selling_unit) {
      setActiveTab('multi-unit');
    }

    if (!hasUnitConversion) return;

    onSave();
  };

  const [scannerOpen, setScannerOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const skuInputRef = useRef<InputRef>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastScannedRef = useRef<{ text: string; at: number } | null>(null);
  const keyboardScannerBufferRef = useRef<KeyboardBarcodeBuffer | null>(null);
  const keyboardScannerFormSnapshotRef = useRef<StockFormData | null>(null);
  const shouldRestoreFormAfterScanRef = useRef(false);
  const beepUrl = new URL('../../assets/beep.mp3', import.meta.url).href;
  const beepAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    if (!open) {
      setActiveTab('product');
    }
  }, [open]);

  useEffect(() => {
    beepAudioRef.current = new Audio(beepUrl);
  }, [beepUrl]);

  const applyScannedSku = useCallback((text: string) => {
    const normalizedSku = text.trim();
    if (!normalizedSku) return;

    setActiveTab('product');
    setValue('sku', normalizedSku, { shouldDirty: true, shouldValidate: true });
    void beepAudioRef.current?.play().catch(() => { });

    window.requestAnimationFrame(() => {
      skuInputRef.current?.focus();
      skuInputRef.current?.select();
    });
  }, [setValue]);

  useEffect(() => {
    if (!open || scannerOpen) {
      keyboardScannerBufferRef.current = null;
      keyboardScannerFormSnapshotRef.current = null;
      shouldRestoreFormAfterScanRef.current = false;
      return;
    }

    const handleHardwareScannerKeyDown = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented
        || event.ctrlKey
        || event.metaKey
        || event.altKey
        || event.repeat
      ) return;

      const isTerminator = event.code === 'Enter'
        || event.code === 'NumpadEnter'
        || event.key === 'Tab';

      if (isTerminator) {
        const scannedCode = finishKeyboardBarcodeScan(
          keyboardScannerBufferRef.current,
          event.timeStamp,
        );
        keyboardScannerBufferRef.current = null;

        if (scannedCode) {
          event.preventDefault();

          const snapshot = keyboardScannerFormSnapshotRef.current;
          if (snapshot && shouldRestoreFormAfterScanRef.current) {
            reset(snapshot, {
              keepDirty: true,
              keepErrors: true,
              keepTouched: true,
            });
          }

          applyScannedSku(scannedCode);
        }

        keyboardScannerFormSnapshotRef.current = null;
        shouldRestoreFormAfterScanRef.current = false;
        return;
      }

      const isModifierKey = event.key === 'Shift'
        || event.key === 'Control'
        || event.key === 'Alt'
        || event.key === 'AltGraph'
        || event.key === 'CapsLock';

      if (event.key.length !== 1) {
        if (!isModifierKey) {
          keyboardScannerBufferRef.current = null;
          keyboardScannerFormSnapshotRef.current = null;
          shouldRestoreFormAfterScanRef.current = false;
        }
        return;
      }

      const isActiveSequence = isKeyboardBarcodeBufferActive(
        keyboardScannerBufferRef.current,
        event.timeStamp,
      );
      if (!isActiveSequence) {
        keyboardScannerFormSnapshotRef.current = structuredClone(getValues());
        const target = event.target;
        shouldRestoreFormAfterScanRef.current = target instanceof HTMLElement && (
          target.isContentEditable
          || target.tagName === 'INPUT'
          || target.tagName === 'TEXTAREA'
          || target.tagName === 'SELECT'
        );
      }

      keyboardScannerBufferRef.current = appendKeyboardBarcodeCharacter(
        keyboardScannerBufferRef.current,
        event.key,
        event.timeStamp,
      );
    };

    window.addEventListener('keydown', handleHardwareScannerKeyDown, true);
    return () => window.removeEventListener('keydown', handleHardwareScannerKeyDown, true);
  }, [applyScannedSku, getValues, open, reset, scannerOpen]);

  const stopScanner = useCallback(() => {
    controlsRef.current?.stop();
    controlsRef.current = null;

    const video = videoRef.current;
    const stream = (video?.srcObject ?? null) as MediaStream | null;
    if (stream) {
      for (const track of stream.getTracks()) track.stop();
    }
    if (video) {
      video.srcObject = null;
    }
  }, []);

  useEffect(() => {
    if (!scannerOpen) {
      stopScanner();
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const ZXingBrowser = await import('@zxing/browser');
        const codeReader = new ZXingBrowser.BrowserMultiFormatReader();
        const video = videoRef.current;
        if (!video) return;

        const controls = await codeReader.decodeFromConstraints(
          {
            audio: false,
            video: { facingMode: { ideal: 'environment' } },
          },
          video,
          (result) => {
            if (cancelled) return;
            if (!result) return;

            const text = result.getText().trim();
            const now = Date.now();
            const last = lastScannedRef.current;
            if (last && last.text === text && now - last.at < 1500) return;

            lastScannedRef.current = { text, at: now };
            applyScannedSku(text);
            setScannerOpen(false);
          },
        );

        if (cancelled) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;
      } catch (error) {
        console.error('Scanner error:', error);
      }
    })();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [applyScannedSku, scannerOpen, stopScanner]);

  return (
    <>
      {scannerOpen ? (
        <div className="fixed inset-0 z-[1300] flex items-center justify-center bg-black bg-opacity-80 p-4">
          <div className="relative flex w-full max-w-md flex-col overflow-hidden rounded-lg bg-white">
            <div className="absolute right-2 top-2 z-10">
              <button
                type="button"
                onClick={() => setScannerOpen(false)}
                className="rounded-full bg-white p-2 shadow transition-colors hover:bg-gray-100"
              >
                <X size={20} />
              </button>
            </div>
            <div className="relative aspect-square bg-black">
              <video ref={videoRef} className="h-full w-full object-cover" muted autoPlay playsInline />
            </div>
            <div className="bg-white p-4 text-center">
              <p className="text-lg font-bold">{t('stock.form.scanBarcode')}</p>
              <p className="text-sm text-gray-500">{t('stock.form.scanBarcodeDescription')}</p>
            </div>
          </div>
        </div>
      ) : null}

      <Modal
        title={editingId ? t('stock.editProduct') : t('stock.newProduct')}
        open={open}
        onCancel={onCancel}
        footer={null}
        destroyOnHidden
        width={!screens.sm ? '100%' : undefined}
        style={!screens.sm ? { top: 0, margin: 0, padding: 0, maxWidth: '100vw', height: '100vh' } : undefined}
        styles={!screens.sm ? { body: { height: 'calc(100vh - 55px)', overflowY: 'auto' } } : undefined}
        centered={!!screens.sm}
      >
        <form onSubmit={onSave} className="mt-6">
          <div className="mb-4 rounded-md border border-red-100 bg-red-50 px-3 py-2 text-xs text-gray-600">
            <span className="mr-1 font-bold text-red-500">*</span>
            {t('stock.form.requiredHint')}
          </div>
          <Tabs
            activeKey={activeTab}
            onChange={setActiveTab}
            items={[
              {
                key: 'product',
                label: t('stock.form.productTab'),
                children: (
                  <>
                    <div className="grid grid-cols-1 gap-x-4">
                      <FieldContainer
                        label={t('stock.form.name')}
                        error={errors.name}
                        required
                        requiredLabel={t('stock.form.requiredLabel')}
                      >
                        <Controller
                          name="name"
                          control={control}
                          render={({ field }) => (
                            <Input {...field} data-testid="stock-product-name" className="w-full" />
                          )}
                        />
                      </FieldContainer>

                      <FieldContainer
                        label="SKU"
                        error={errors.sku}
                        help={t('stock.form.hardwareScannerHint')}
                      >
                        <div className="flex gap-2">
                          <Controller
                            name="sku"
                            control={control}
                            render={({ field }) => (
                              <Input
                                {...field}
                                ref={skuInputRef}
                                data-testid="stock-product-sku"
                                className="flex-1"
                              />
                            )}
                          />
                          <Button type="default" icon={<ScanLine size={16} />} onClick={() => setScannerOpen(true)} />
                        </div>
                      </FieldContainer>

                      <FieldContainer
                        label={t('stock.category')}
                        error={errors.category}
                        required
                        requiredLabel={t('stock.form.requiredLabel')}
                      >
                        <Controller
                          name="category"
                          control={control}
                          render={({ field }) => (
                            <Select {...field} className="w-full" options={categoryOptions} />
                          )}
                        />
                      </FieldContainer>

                      <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                        <FieldContainer label="Tipe Produk" error={errors.product_type}>
                          <Controller
                            name="product_type"
                            control={control}
                            render={({ field }) => (
                              <Select {...field} className="w-full" options={[
                                { value: 'FINISHED_GOOD', label: 'Barang Jadi' },
                                { value: 'RAW_MATERIAL', label: 'Bahan Baku' },
                              ]} />
                            )}
                          />
                        </FieldContainer>
                        <FieldContainer
                          label="Tampil di POS"
                          error={errors.is_visible_in_pos}
                          help="Jika dinonaktifkan, produk tetap tersimpan tetapi tidak muncul di katalog POS."
                        >
                          <Controller
                            name="is_visible_in_pos"
                            control={control}
                            render={({ field }) => <Switch checked={field.value} onChange={field.onChange} />}
                          />
                        </FieldContainer>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                      <FieldContainer
                        label={t('stock.form.baseStockUnit')}
                        error={errors.purchase_unit}
                        required
                        requiredLabel={t('stock.form.requiredLabel')}
                      >
                        <Controller
                          name="purchase_unit"
                          control={control}
                          render={({ field }) => (
                            <Select
                              {...field}
                              data-testid="stock-product-base-unit"
                              showSearch={{ optionFilterProp: 'label' }}
                              className="w-full"
                              options={baseUnitOptions}
                            />
                          )}
                        />
                      </FieldContainer>
                      <FieldContainer
                        label={t('stock.form.purchasePricePer', { unit: purchaseUnit })}
                        error={errors.purchase_price}
                        required
                        requiredLabel={t('stock.form.requiredLabel')}
                      >
                        <Controller
                          name="purchase_price"
                          control={control}
                          render={({ field }) => (
                            <InputNumber
                              data-testid="stock-product-purchase-price"
                              inputMode="decimal"
                              value={field.value}
                              onBlur={field.onBlur}
                              onChange={(value) => field.onChange(value ?? 0)}
                              className="w-full"
                              placeholder={t('stock.form.purchasePricePlaceholder', { unit: purchaseUnit })}
                              prefix="Rp"
                              formatter={formatCurrencyInput}
                              parser={parseCurrencyInput}
                              step={0.01}
                              min={0}
                            />
                          )}
                        />
                      </FieldContainer>

                      <FieldContainer
                        label={t('stock.form.sellingPricePer', { unit: purchaseUnit })}
                        error={errors.selling_price}
                        required
                        requiredLabel={t('stock.form.requiredLabel')}
                      >
                        <Controller
                          name="selling_price"
                          control={control}
                          render={({ field }) => (
                            <InputNumber
                              data-testid="stock-product-selling-price"
                              inputMode="decimal"
                              value={field.value}
                              onBlur={field.onBlur}
                              onChange={(value) => field.onChange(value ?? 0)}
                              className="w-full"
                              placeholder={t('stock.form.sellingPricePlaceholder', { unit: purchaseUnit })}
                              prefix="Rp"
                              formatter={formatCurrencyInput}
                              parser={parseCurrencyInput}
                              step={0.01}
                              min={0}
                            />
                          )}
                        />
                      </FieldContainer>

                    </div>

                  </>
                ),
              },
              {
                key: 'multi-unit',
                label: (
                  <Badge count={unitConversionAttentionCount} size="small">
                    <span className="pr-2">{t('stock.form.unitConversionTab')}</span>
                  </Badge>
                ),
                children: (
                  <div className="space-y-4">
                    <FieldContainer
                      label={t('stock.form.sellableUnits')}
                      error={(errors.sellable_units || errors.selling_unit) as FieldError | undefined}
                      help={t('stock.form.sellableUnitsHelp')}
                      required
                      requiredLabel={t('stock.form.requiredLabel')}
                    >
                      <Controller
                        name="sellable_units"
                        control={control}
                        render={({ field }) => (
                          <Select
                            mode="multiple"
                            data-testid="stock-product-sellable-units"
                            value={selectedSellableUnits}
                            onChange={(values) => {
                              const additionalUnits = values
                                .filter((unit) => normalizeUnitKey(unit) !== normalizeUnitKey(purchaseUnit))
                                .filter(canUseAsConversionUnit);
                              const nextUnits = buildSellableUnitsWithDefault(purchaseUnit, additionalUnits);
                              field.onChange(nextUnits);
                              setValue('selling_unit', nextUnits[0] || '', { shouldDirty: true, shouldValidate: true });
                            }}
                            className="w-full"
                            placeholder={t('stock.form.sellableUnitsPlaceholder')}
                            options={sellableUnitOptions}
                          />
                        )}
                      />
                    </FieldContainer>

                    <Alert
                      type="info"
                      showIcon
                      title={t('stock.form.unitUsesGlobalManagement')}
                      description={t('stock.form.unitUsesGlobalManagementDescription')}
                    />

                    {conversionWarning ? (
                      <Alert
                        title={conversionWarning.title}
                        description={conversionWarning.description}
                        type="warning"
                        showIcon
                        icon={<AlertTriangle size={20} />}
                      />
                    ) : null}

                    <div>
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                          <h3 className="font-medium text-gray-700">{t('stock.form.productUnitConversion')}</h3>
                          <p className="text-xs text-gray-500">{t('stock.form.productUnitConversionFormat')}</p>
                        </div>
                        <Button
                          type="dashed"
                          onClick={() => appendUnitMapping({
                            from_quantity: 1,
                            from_unit: purchaseUnit,
                            to_quantity: 0,
                            to_unit: nextUnitMappingTarget,
                          })}
                          icon={<Plus size={16} />}
                          className="flex items-center gap-1"
                        >
                          {t('stock.form.addUnit')}
                        </Button>
                      </div>

                      <div className="space-y-3">
                        {unitMappingFields.map((field, index) => (
                          <div
                            key={field.id}
                            className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3"
                          >
                            <div className="grid flex-1 grid-cols-12 gap-2">
                              <div className="col-span-2">
                                <FieldContainer
                                  label={t('stock.form.qty')}
                                  error={errors.unit_mappings?.[index]?.from_quantity as FieldError | undefined}
                                >
                                  <Controller
                                    name={`unit_mappings.${index}.from_quantity`}
                                    control={control}
                                    render={({ field: itemField }) => (
                                      <InputNumber
                                        {...itemField}
                                        data-testid={`stock-product-unit-mapping-quantity-${index}`}
                                        disabled
                                        controls={false}
                                        className="w-full"
                                      />
                                    )}
                                  />
                                </FieldContainer>
                              </div>

                              <div className="col-span-3">
                                <FieldContainer
                                  label={t('stock.form.unit')}
                                  error={errors.unit_mappings?.[index]?.from_unit as FieldError | undefined}
                                  required
                                  requiredLabel={t('stock.form.requiredLabel')}
                                >
                                  <Controller
                                    name={`unit_mappings.${index}.from_unit`}
                                    control={control}
                                    render={({ field: itemField }) => (
                                      <Select
                                        data-testid={`stock-product-unit-mapping-source-unit-${index}`}
                                        value={itemField.value}
                                        onChange={itemField.onChange}
                                        className="w-full"
                                        placeholder={t('stock.form.unitPlaceholder')}
                                        options={unitMappingOptions.filter(
                                          (option) => normalizeUnitKey(option.value) !== normalizeUnitKey(unitMappings[index]?.to_unit),
                                        )}
                                      />
                                    )}
                                  />
                                </FieldContainer>
                              </div>

                              <div className="col-span-3">
                                <FieldContainer
                                  label={t('stock.form.value')}
                                  error={errors.unit_mappings?.[index]?.to_quantity as FieldError | undefined}
                                  required
                                  requiredLabel={t('stock.form.requiredLabel')}
                                >
                                  <Controller
                                    name={`unit_mappings.${index}.to_quantity`}
                                    control={control}
                                    render={({ field: itemField }) => (
                                      <InputNumber
                                        data-testid={`stock-product-unit-mapping-value-${index}`}
                                        inputMode="decimal"
                                        value={itemField.value}
                                        onBlur={itemField.onBlur}
                                        onChange={(value) => itemField.onChange(value ?? 0)}
                                        className="w-full"
                                        min={0.000001}
                                        step={1}
                                      />
                                    )}
                                  />
                                </FieldContainer>
                              </div>

                              <div className="col-span-4">
                                <FieldContainer
                                  label={t('stock.form.unit')}
                                  error={errors.unit_mappings?.[index]?.to_unit as FieldError | undefined}
                                  required
                                  requiredLabel={t('stock.form.requiredLabel')}
                                >
                                  <Controller
                                    name={`unit_mappings.${index}.to_unit`}
                                    control={control}
                                    render={({ field: itemField }) => (
                                      <Select
                                        data-testid={`stock-product-unit-mapping-target-unit-${index}`}
                                        value={itemField.value}
                                        onChange={itemField.onChange}
                                        className="w-full"
                                        placeholder={t('stock.form.unitPlaceholder')}
                                        options={unitMappingOptions.filter(
                                          (option) => normalizeUnitKey(option.value) !== normalizeUnitKey(unitMappings[index]?.from_unit),
                                        )}
                                      />
                                    )}
                                  />
                                </FieldContainer>
                              </div>
                            </div>

                            <Button
                              danger
                              type="text"
                              icon={<Trash2 size={16} />}
                              onClick={() => removeUnitMapping(index)}
                              className="mt-8"
                            />
                          </div>
                        ))}
                        {unitMappingFields.length === 0 ? (
                          <p className="text-sm italic text-gray-500">{t('stock.form.noProductConversions')}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ),
              },
              {
                key: 'wholesale',
                label: t('stock.form.wholesaleTab'),
                children: (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="font-medium text-gray-700">{t('stock.form.wholesaleTitle')}</h3>
                      <Button
                        type="dashed"
                        onClick={() => appendWholesale({
                          min_quantity: 2,
                          unit: purchaseUnit,
                          price: 0,
                          price_type: 'unit',
                        })}
                        icon={<Plus size={16} />}
                        className="flex items-center gap-1"
                      >
                        {t('stock.form.addPrice')}
                      </Button>
                    </div>

                    <div className="space-y-3">
                      {wholesaleFields.map((field, index) => (
                        <div
                          key={field.id}
                          className="flex items-start gap-2 rounded-lg border border-gray-200 bg-gray-50 p-3"
                        >
                          <div className="grid flex-1 grid-cols-12 gap-2">
                            <div className="col-span-3">
                              <FieldContainer
                                label={t('stock.form.minQty')}
                                error={errors.wholesale_prices?.[index]?.min_quantity}
                                required
                                requiredLabel={t('stock.form.requiredLabel')}
                              >
                                <Controller
                                  name={`wholesale_prices.${index}.min_quantity`}
                                  control={control}
                                  render={({ field: itemField }) => (
                                    <InputNumber
                                      data-testid={`stock-product-wholesale-min-quantity-${index}`}
                                      inputMode="decimal"
                                      value={itemField.value}
                                      onBlur={itemField.onBlur}
                                      onChange={(value) => itemField.onChange(value ?? 1)}
                                      className="w-full"
                                      placeholder={t('stock.form.qtyPlaceholder')}
                                      min={1}
                                    />
                                  )}
                                />
                              </FieldContainer>
                            </div>

                            <div className="col-span-3">
                              <FieldContainer
                                label={t('stock.form.unit')}
                                error={errors.wholesale_prices?.[index]?.unit}
                                required
                                requiredLabel={t('stock.form.requiredLabel')}
                              >
                                <Controller
                                  name={`wholesale_prices.${index}.unit`}
                                  control={control}
                                  render={({ field: itemField }) => (
                                    <Select
                                      data-testid={`stock-product-wholesale-unit-${index}`}
                                      value={itemField.value}
                                      onChange={itemField.onChange}
                                      className="w-full"
                                      placeholder={t('stock.form.unitPlaceholder')}
                                      options={wholesaleUnitOptions}
                                    />
                                  )}
                                />
                              </FieldContainer>
                            </div>

                            <div className="col-span-3">
                              <FieldContainer label={t('stock.form.type')}>
                                <Controller
                                  name={`wholesale_prices.${index}.price_type`}
                                  control={control}
                                  render={({ field: itemField }) => (
                                    <Select
                                      value={itemField.value}
                                      onChange={itemField.onChange}
                                      className="w-full"
                                      options={[
                                        {
                                          value: 'unit',
                                          label: t('stock.form.perUnit', {
                                            unit: wholesalePrices[index]?.unit || purchaseUnit,
                                          }),
                                        },
                                        { value: 'bundle', label: t('stock.form.bundle') },
                                      ]}
                                    />
                                  )}
                                />
                              </FieldContainer>
                            </div>

                            <div className="col-span-3">
                              <FieldContainer
                                label={t('stock.form.price')}
                                error={errors.wholesale_prices?.[index]?.price}
                                required
                                requiredLabel={t('stock.form.requiredLabel')}
                              >
                                <Controller
                                  name={`wholesale_prices.${index}.price`}
                                  control={control}
                                  render={({ field: itemField }) => (
                                    <InputNumber
                                      data-testid={`stock-product-wholesale-price-${index}`}
                                      inputMode="decimal"
                                      value={itemField.value}
                                      onBlur={itemField.onBlur}
                                      onChange={(value) => itemField.onChange(value ?? 0)}
                                      className="w-full"
                                      placeholder={t('stock.form.nominalPlaceholder')}
                                      prefix="Rp"
                                      min={0}
                                      formatter={formatCurrencyInput}
                                      parser={parseCurrencyInput}
                                    />
                                  )}
                                />
                              </FieldContainer>
                            </div>
                          </div>

                          <Button
                            danger
                            type="text"
                            icon={<Trash2 size={16} />}
                            onClick={() => removeWholesale(index)}
                            className="mt-8"
                          />
                        </div>
                      ))}
                      {wholesaleFields.length === 0 ? (
                        <p className="text-sm italic text-gray-500">{t('stock.form.noWholesalePrices')}</p>
                      ) : null}
                    </div>
                  </div>
                ),
              },
            ]}
          />

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="flex items-center gap-2 rounded-lg bg-gray-500 px-4 py-2 text-sm text-white transition-colors hover:bg-gray-600"
            >
              {t('stock.form.cancel')}
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm text-white transition-colors hover:bg-green-700"
            >
              {t('stock.form.save')}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
