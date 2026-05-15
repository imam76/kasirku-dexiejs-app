import {
  DEFAULT_UNITS,
  inferUnitCategory,
  inferUnitDefinitionType,
  isGlobalConvertibleUnitType,
  normalizeUnitKey,
} from '@/constants/units';
import type { StockFormData } from '@/hooks/useStockManagement';
import { useI18n } from '@/hooks/useI18n';
import { getProductCategoryOptions } from '@/i18n/stock';
import { db } from '@/lib/db';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Alert, Badge, Button, Grid, Input, InputNumber, Modal, Select, Tabs, Tooltip } from 'antd';
import { AlertTriangle, ExternalLink, Info, Plus, ScanLine, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  type Control,
  Controller,
  type FieldError,
  type FieldErrors,
  type UseFormSetValue,
  useFieldArray,
  useWatch,
} from 'react-hook-form';

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

export default function StockProductModal({ open, editingId, control, errors, setValue, onCancel, onSave }: Props) {
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
  const sellableUnits = useMemo(() => watchedSellableUnits || [], [watchedSellableUnits]);
  const unitMappings = useMemo(() => watchedUnitMappings || [], [watchedUnitMappings]);
  const previousPurchaseUnitRef = useRef<string | null>(null);

  const { data: conversions = [] } = useQuery({
    queryKey: ['unitConversions'],
    queryFn: () => db.unitConversions.toArray(),
  });

  const { data: unitDefinitions = [] } = useQuery({
    queryKey: ['units'],
    queryFn: () => db.units.toArray(),
  });

  const availableUnits = useMemo(() => {
    const units = new Set<string>(DEFAULT_UNITS.map((unit) => unit.id));
    unitDefinitions.forEach((unit) => {
      units.add(normalizeUnitKey(unit.id));
    });
    conversions.forEach((conversion) => {
      units.add(normalizeUnitKey(conversion.fromUnit));
      units.add(normalizeUnitKey(conversion.toUnit));
    });
    return Array.from(units).filter(Boolean).sort();
  }, [conversions, unitDefinitions]);

  const categoryOptions = useMemo(() => getProductCategoryOptions(t), [t]);

  const unitDefinitionById = useMemo(() => {
    const map = new Map(DEFAULT_UNITS.map((unit) => [unit.id, unit]));
    unitDefinitions.forEach((unit) => {
      map.set(normalizeUnitKey(unit.id), {
        ...unit,
        id: normalizeUnitKey(unit.id),
      });
    });
    return map;
  }, [unitDefinitions]);

  const unitTypeById = useMemo(() => {
    const map = new Map(DEFAULT_UNITS.map((unit) => [unit.id, unit.type]));
    unitDefinitions.forEach((unit) => {
      map.set(normalizeUnitKey(unit.id), unit.type);
    });
    return map;
  }, [unitDefinitions]);

  const getUnitType = useCallback(
    (unit: string) => unitTypeById.get(normalizeUnitKey(unit)) ?? inferUnitDefinitionType(unit),
    [unitTypeById],
  );

  const getUnitCategory = useCallback((unit: string) => {
    const normalizedUnit = normalizeUnitKey(unit);
    const definitionType = unitDefinitionById.get(normalizedUnit)?.type;

    if (definitionType === 'count' || definitionType === 'package' || definitionType === 'time') {
      return definitionType;
    }

    return inferUnitCategory(normalizedUnit);
  }, [unitDefinitionById]);

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

  const baseUnitOptions = useMemo(
    () =>
      availableUnits
        .filter((unit) => {
          const normalizedUnit = normalizeUnitKey(unit);
          const definition = unitDefinitionById.get(normalizedUnit);
          return definition?.canBeBaseUnit ?? (inferUnitDefinitionType(normalizedUnit) !== 'package');
        })
        .map((unit) => ({ value: unit, label: unit })),
    [availableUnits, unitDefinitionById],
  );

  const hasGlobalConversion = useCallback((fromUnit: string, toUnit: string) => {
    const normalizedFromUnit = normalizeUnitKey(fromUnit);
    const normalizedToUnit = normalizeUnitKey(toUnit);

    if (normalizedFromUnit === normalizedToUnit) return true;
    return conversions.some(
      (conversion) => {
        const conversionFromUnit = normalizeUnitKey(conversion.fromUnit);
        const conversionToUnit = normalizeUnitKey(conversion.toUnit);

        return (
          (conversionFromUnit === normalizedFromUnit && conversionToUnit === normalizedToUnit) ||
          (conversionFromUnit === normalizedToUnit && conversionToUnit === normalizedFromUnit)
        );
      },
    );
  }, [conversions]);

  const isSellableUnitCompatible = useCallback((unit: string) => {
    const normalizedUnit = normalizeUnitKey(unit);
    const normalizedPurchaseUnit = normalizeUnitKey(purchaseUnit);

    if (!normalizedUnit || normalizedUnit === normalizedPurchaseUnit) return true;

    const unitType = getUnitType(normalizedUnit);
    const unitCategory = getUnitCategory(normalizedUnit);
    const purchaseCategory = getUnitCategory(normalizedPurchaseUnit);

    if (unitCategory === 'package') {
      return purchaseCategory === 'count';
    }

    if (unitCategory !== purchaseCategory) {
      return false;
    }

    return isGlobalConvertibleUnitType(unitType);
  }, [purchaseUnit, getUnitType, getUnitCategory]);

  const sellableUnitOptions = useMemo(
    () =>
      availableUnits
        .filter((unit) => {
          const normalizedUnit = normalizeUnitKey(unit);
          const definition = unitDefinitionById.get(normalizedUnit);
          const canBeConversionUnit = definition?.canBeConversionUnit ?? (getUnitType(normalizedUnit) !== 'count');

          return normalizedUnit === normalizeUnitKey(purchaseUnit) || (canBeConversionUnit && isSellableUnitCompatible(unit));
        })
        .map((unit) => ({ value: unit, label: unit })),
    [availableUnits, getUnitType, isSellableUnitCompatible, purchaseUnit, unitDefinitionById],
  );

  const unitMappingOptions = useMemo(
    () =>
      availableUnits
        .filter((unit) => {
          const normalizedUnit = normalizeUnitKey(unit);
          const normalizedPurchaseUnit = normalizeUnitKey(purchaseUnit);
          if (normalizedUnit === normalizedPurchaseUnit) return false;

          const definition = unitDefinitionById.get(normalizedUnit);
          const type = getUnitType(normalizedUnit);
          const category = getUnitCategory(normalizedUnit);
          const purchaseCategory = getUnitCategory(normalizedPurchaseUnit);
          const canBeConversionUnit = definition?.canBeConversionUnit ?? (type !== 'count');

          return canBeConversionUnit && category === 'package' && purchaseCategory === 'count';
        })
        .map((unit) => ({ value: unit, label: unit })),
    [availableUnits, purchaseUnit, unitDefinitionById, getUnitType, getUnitCategory],
  );

  const needsProductMapping = useCallback(
    (unit: string) => {
      if (unit === purchaseUnit) return false;
      const unitType = getUnitType(unit);
      const purchaseType = getUnitType(purchaseUnit);
      const canUseGlobalConversion =
        unitType === purchaseType &&
        getUnitCategory(unit) === getUnitCategory(purchaseUnit) &&
        isGlobalConvertibleUnitType(unitType) &&
        isGlobalConvertibleUnitType(purchaseType);

      return !canUseGlobalConversion;
    },
    [purchaseUnit, getUnitType, getUnitCategory],
  );

  const shouldShowUnitConversionTab = useMemo(() => {
    return (
      selectedSellableUnits.some(needsProductMapping) ||
      unitMappings.length > 0 ||
      unitMappingFields.length > 0
    );
  }, [selectedSellableUnits, needsProductMapping, unitMappings.length, unitMappingFields.length]);

  const missingProductMappingUnits = useMemo(() => {
    return selectedSellableUnits.filter((unit) => {
      if (!needsProductMapping(unit)) return false;
      return !unitMappings.some((mapping) => mapping.unit === unit && mapping.base_unit === purchaseUnit);
    });
  }, [selectedSellableUnits, needsProductMapping, unitMappings, purchaseUnit]);

  const incompleteProductMappingUnits = useMemo(() => {
    return selectedSellableUnits.filter((unit) => {
      if (!needsProductMapping(unit)) return false;
      return !unitMappings.some(
        (mapping) =>
          mapping.unit === unit &&
          mapping.base_unit === purchaseUnit &&
          Number.isFinite(Number(mapping.ratio)) &&
          Number(mapping.ratio) > 0,
      );
    });
  }, [selectedSellableUnits, needsProductMapping, unitMappings, purchaseUnit]);

  const missingGlobalConversionUnits = useMemo(() => {
    return selectedSellableUnits.filter((unit) => {
      if (unit === purchaseUnit) return false;
      if (needsProductMapping(unit)) return false;
      return !hasGlobalConversion(unit, purchaseUnit);
    });
  }, [selectedSellableUnits, purchaseUnit, needsProductMapping, hasGlobalConversion]);

  const hasUnitConversion = useMemo(() => {
    return incompleteProductMappingUnits.length === 0 && missingGlobalConversionUnits.length === 0;
  }, [incompleteProductMappingUnits.length, missingGlobalConversionUnits.length]);
  const unitConversionAttentionCount = incompleteProductMappingUnits.length + missingGlobalConversionUnits.length;

  const conversionWarning = useMemo(() => {
    if (hasUnitConversion) return null;

    return missingGlobalConversionUnits.length > 0
      ? {
        title: t('stock.form.globalConversionMissingTitle'),
        description: (
          <div className="flex flex-col gap-2">
            <p>
              {t('stock.form.globalConversionMissingDescription', {
                units: missingGlobalConversionUnits.join(', '),
                baseUnit: purchaseUnit,
              })}
            </p>
            <Link to="/units">
              <Button
                size="small"
                type="primary"
                ghost
                icon={<ExternalLink size={14} />}
                className="flex w-fit items-center gap-1"
              >
                {t('stock.form.setupGlobalConversion')}
              </Button>
            </Link>
          </div>
        ),
      }
      : {
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
  }, [hasUnitConversion, purchaseUnit, missingGlobalConversionUnits, incompleteProductMappingUnits, t]);

  useEffect(() => {
    unitMappingFields.forEach((_, index) => {
      setValue(`unit_mappings.${index}.base_unit`, purchaseUnit, { shouldDirty: true });
    });
  }, [purchaseUnit, setValue, unitMappingFields]);

  useEffect(() => {
    const nextSellingUnit = selectedSellableUnits[0] || '';
    if (nextSellingUnit && nextSellingUnit !== sellingUnit) {
      setValue('selling_unit', nextSellingUnit, { shouldDirty: true, shouldValidate: true });
    }
  }, [selectedSellableUnits, sellingUnit, setValue]);

  useEffect(() => {
    if (!open || missingProductMappingUnits.length === 0) return;

    missingProductMappingUnits.forEach((unit) => {
      appendUnitMapping({
        unit,
        base_unit: purchaseUnit,
        ratio: 0,
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

    const remainingUnits = selectedSellableUnits.slice(1).filter(isSellableUnitCompatible);
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
  }, [open, purchaseUnit, selectedSellableUnits, sellingUnit, setValue, isSellableUnitCompatible]);

  const handleSave = () => {
    if (incompleteProductMappingUnits.length > 0 || errors.unit_mappings) {
      setActiveTab('unit-conversion');
    }

    onSave();
  };

  const [scannerOpen, setScannerOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastScannedRef = useRef<{ text: string; at: number } | null>(null);
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
            setValue('sku', text);
            void beepAudioRef.current?.play().catch(() => { });
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
  }, [scannerOpen, setValue, stopScanner]);

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
                          render={({ field }) => <Input {...field} className="w-full" />}
                        />
                      </FieldContainer>

                      <FieldContainer label="SKU" error={errors.sku}>
                        <div className="flex gap-2">
                          <Controller
                            name="sku"
                            control={control}
                            render={({ field }) => <Input {...field} className="flex-1" />}
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
                            <Select {...field} className="w-full" options={baseUnitOptions} />
                          )}
                        />
                      </FieldContainer>

                     
                        <FieldContainer
                          label={(
                            <span className="inline-flex items-center gap-1.5">
                              {t('stock.form.sellableUnits')}
                              <Tooltip
                                trigger={['hover', 'click']}
                                title={t('stock.form.sellableUnitsHelp')}
                              >
                                <button
                                  type="button"
                                  className="inline-flex h-5 w-5 items-center justify-center rounded-full text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600"
                                  aria-label={t('stock.form.sellableUnitsInfo')}
                                >
                                  <Info size={14} />
                                </button>
                              </Tooltip>
                            </span>
                          )}
                          error={(errors.sellable_units || errors.selling_unit) as FieldError | undefined}
                          required
                          requiredLabel={t('stock.form.requiredLabel')}
                        >
                          <Controller
                            name="sellable_units"
                            control={control}
                            render={({ field }) => (
                              <Select
                                mode="multiple"
                                value={selectedSellableUnits}
                                onChange={(values) => {
                                  const additionalUnits = values
                                    .filter((unit) => normalizeUnitKey(unit) !== normalizeUnitKey(purchaseUnit))
                                    .filter(isSellableUnitCompatible);
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
                              inputMode="decimal"
                              value={field.value}
                              onBlur={field.onBlur}
                              onChange={(value) => field.onChange(value ?? 0)}
                              className="w-full"
                              placeholder={t('stock.form.purchasePricePlaceholder', { unit: purchaseUnit })}
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
                              inputMode="decimal"
                              value={field.value}
                              onBlur={field.onBlur}
                              onChange={(value) => field.onChange(value ?? 0)}
                              className="w-full"
                              placeholder={t('stock.form.sellingPricePlaceholder', { unit: purchaseUnit })}
                              step={0.01}
                              min={0}
                            />
                          )}
                        />
                      </FieldContainer>

                      <FieldContainer
                        label={t('product.stock')}
                        error={errors.stock}
                        required
                        requiredLabel={t('stock.form.requiredLabel')}
                      >
                        <Controller
                          name="stock"
                          control={control}
                          render={({ field }) => (
                            <InputNumber
                              inputMode="decimal"
                              value={field.value}
                              onBlur={field.onBlur}
                              onChange={(value) => field.onChange(value ?? 0)}
                              className="w-full"
                              placeholder={t('stock.form.stockPlaceholder')}
                              min={0}
                            />
                          )}
                        />
                      </FieldContainer>

                      <FieldContainer label={t('stock.form.purchaseQuantity')} error={errors.purchase_quantity}>
                        <Controller
                          name="purchase_quantity"
                          control={control}
                          render={({ field }) => (
                            <InputNumber
                              inputMode="decimal"
                              value={field.value}
                              onBlur={field.onBlur}
                              onChange={(value) => field.onChange(value ?? 0)}
                              className="w-full"
                              placeholder={t('stock.form.purchaseQuantityPlaceholder')}
                              min={0}
                            />
                          )}
                        />
                      </FieldContainer>
                    </div>

                    {!shouldShowUnitConversionTab && conversionWarning ? (
                      <Alert
                        title={conversionWarning.title}
                        description={conversionWarning.description}
                        type="warning"
                        showIcon
                        icon={<AlertTriangle size={20} />}
                        className="mb-4"
                      />
                    ) : null}
                  </>
                ),
              },
              ...(shouldShowUnitConversionTab ? [{
                key: 'unit-conversion',
                label: (
                  <Badge count={unitConversionAttentionCount} size="small">
                    <span className="pr-2">{t('stock.form.unitConversionTab')}</span>
                  </Badge>
                ),
                children: (
                  <div className="space-y-4">
                    <Alert
                      type="info"
                      showIcon
                      message={t('stock.form.unitUsesGlobalManagement')}
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
                            unit: unitMappingOptions[0]?.value || '',
                            base_unit: purchaseUnit,
                            ratio: 0,
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
                              <div className="col-span-5">
                                <FieldContainer
                                  label={t('stock.form.unit')}
                                  error={errors.unit_mappings?.[index]?.unit as FieldError | undefined}
                                  required
                                  requiredLabel={t('stock.form.requiredLabel')}
                                >
                                  <Controller
                                    name={`unit_mappings.${index}.unit`}
                                    control={control}
                                    render={({ field: itemField }) => (
                                      <Select
                                        value={itemField.value}
                                        onChange={itemField.onChange}
                                        className="w-full"
                                        placeholder={t('stock.form.unitPlaceholder')}
                                        options={unitMappingOptions}
                                      />
                                    )}
                                  />
                                </FieldContainer>
                              </div>

                              <div className="col-span-4">
                                <FieldContainer
                                  label={t('stock.form.contentPer', { unit: purchaseUnit })}
                                  error={errors.unit_mappings?.[index]?.ratio as FieldError | undefined}
                                  required
                                  requiredLabel={t('stock.form.requiredLabel')}
                                >
                                  <Controller
                                    name={`unit_mappings.${index}.ratio`}
                                    control={control}
                                    render={({ field: itemField }) => (
                                      <InputNumber
                                        inputMode="decimal"
                                        value={itemField.value}
                                        onBlur={itemField.onBlur}
                                        onChange={(value) => itemField.onChange(value ?? 1)}
                                        className="w-full"
                                        min={0.000001}
                                        step={0.01}
                                      />
                                    )}
                                  />
                                </FieldContainer>
                              </div>

                              <div className="col-span-3">
                                <FieldContainer
                                  label={t('stock.form.base')}
                                  error={errors.unit_mappings?.[index]?.base_unit as FieldError | undefined}
                                >
                                  <Controller
                                    name={`unit_mappings.${index}.base_unit`}
                                    control={control}
                                    render={({ field: itemField }) => (
                                      <Input {...itemField} disabled className="w-full" />
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
              }] : []),
              {
                key: 'wholesale',
                label: t('stock.form.wholesaleTab'),
                children: (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="font-medium text-gray-700">{t('stock.form.wholesaleTitle')}</h3>
                      <Button
                        type="dashed"
                        onClick={() => appendWholesale({ min_quantity: 2, price: 0, price_type: 'unit' })}
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
                                label={t('stock.form.minQty', { unit: sellingUnit })}
                                error={errors.wholesale_prices?.[index]?.min_quantity}
                                required
                                requiredLabel={t('stock.form.requiredLabel')}
                              >
                                <Controller
                                  name={`wholesale_prices.${index}.min_quantity`}
                                  control={control}
                                  render={({ field: itemField }) => (
                                    <InputNumber
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

                            <div className="col-span-4">
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
                                        { value: 'unit', label: t('stock.form.perUnit', { unit: purchaseUnit }) },
                                        { value: 'bundle', label: t('stock.form.bundle') },
                                      ]}
                                    />
                                  )}
                                />
                              </FieldContainer>
                            </div>

                            <div className="col-span-5">
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
                                      value={itemField.value}
                                      onBlur={itemField.onBlur}
                                      onChange={(value) => itemField.onChange(value ?? 0)}
                                      className="w-full"
                                      placeholder={t('stock.form.nominalPlaceholder')}
                                      min={0}
                                      formatter={(value) =>
                                        value !== undefined && value !== null
                                          ? `Rp ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
                                          : ''
                                      }
                                      parser={(value) => (value ? Number(value.replace(/Rp\s?|,/g, '')) : 0)}
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
