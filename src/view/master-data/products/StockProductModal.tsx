import {
  inferUnitDefinitionType,
  normalizeUnitKey,
} from '@/constants/units';
import type { StockFormData } from '@/hooks/useStockManagement';
import type { UnitDefinition } from '@/types';
import { useI18n } from '@/hooks/useI18n';
import { db } from '@/lib/db';
import { useLiveQuery } from 'dexie-react-hooks';
import { useQuery } from '@tanstack/react-query';
import { Badge, Grid, Modal, Tabs } from 'antd';
import type { InputRef } from 'antd';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  type Control,
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
import { resolveProductUnitRatio } from '@/utils/productUnits';
import StockProductBarcodeScanner from './StockProductBarcodeScanner';
import StockProductGeneralTab from './StockProductGeneralTab';
import StockProductUnitConversionTab from './StockProductUnitConversionTab';
import StockProductWholesaleTab from './StockProductWholesaleTab';

const { useBreakpoint } = Grid;

/** Ratio yang tersimpan sebagai float (mis. 1/12) dikembalikan ke angka bulat. */
const snapNearInteger = (value: number) => {
  const rounded = Math.round(value);
  const scale = Math.max(1, Math.abs(value));
  return Math.abs(value - rounded) <= 1e-9 * scale ? rounded : value;
};

const buildProductUnits = (baseUnit: string, units: Array<string | undefined>) => {
  const seen = new Set<string>();

  return [baseUnit, ...units]
    .map((unit) => normalizeUnitKey(unit))
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
  title?: ReactNode;
  submitLabel?: string;
  /** Konten tambahan di atas tab, mis. panel deteksi duplikat produk saat quick-create. */
  topContent?: ReactNode;
};

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
  title,
  submitLabel,
  topContent,
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
  const hasMaterializedStoredUnitsRef = useRef(false);

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

  const selectedSellableUnits = useMemo(
    () => buildProductUnits('', sellableUnits),
    [sellableUnits],
  );

  /**
   * Satuan yang boleh dipakai produk ini: satuan utama plus setiap satuan yang
   * muncul di baris konversi. Daftar inilah yang disimpan sebagai
   * `sellable_units`, jadi tidak ada daftar terpisah yang harus disamakan
   * manual dengan tabel konversinya — dan tidak ada satuan jual yang bisa
   * dipilih tanpa persamaan konversinya.
   */
  const productUnits = useMemo(
    () => buildProductUnits(
      purchaseUnit,
      unitMappings.flatMap((mapping) => [mapping.from_unit, mapping.to_unit]),
    ),
    [purchaseUnit, unitMappings],
  );

  const productUnitOptions = useMemo(
    () => productUnits.map((unit) => ({
      value: unit,
      label: unitDefinitionById.get(unit)?.name ?? unit,
    })),
    [productUnits, unitDefinitionById],
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

  const getUnitType = useCallback((unit: string) => {
    const normalizedUnit = normalizeUnitKey(unit);
    return unitDefinitionById.get(normalizedUnit)?.type ?? inferUnitDefinitionType(normalizedUnit);
  }, [unitDefinitionById]);

  const canUseAsConversionUnit = useCallback((unit: string) => {
    const normalizedUnit = normalizeUnitKey(unit);
    const normalizedPurchaseUnit = normalizeUnitKey(purchaseUnit);

    if (!normalizedUnit) return false;
    if (normalizedUnit === normalizedPurchaseUnit) return true;

    // Satuan hitungan pernah ditandai bukan satuan konversi karena satuan utama
    // dulu selalu hitungan. Begitu satuan utamanya kemasan, justru satuan
    // hitungan itulah satu-satunya isi yang masuk akal, jadi penandaan lama
    // tidak boleh mengunci pilihannya.
    if (getUnitType(normalizedUnit) === 'count' && getUnitType(normalizedPurchaseUnit) === 'package') return true;

    const definition = unitDefinitionById.get(normalizedUnit);
    return definition?.canBeConversionUnit ?? (inferUnitDefinitionType(normalizedUnit) !== 'count');
  }, [getUnitType, purchaseUnit, unitDefinitionById]);

  /**
   * Baris konversi jadi satu-satunya tempat satuan jual ditambahkan, jadi
   * batasan "bisa jadi satuan konversi" dari master satuan dipasang di sini.
   */
  const unitMappingOptions = useMemo(
    () =>
      availableUnits
        .filter((unit) => canUseAsConversionUnit(unit))
        .map((unit) => ({ value: unit, label: unitDefinitionById.get(normalizeUnitKey(unit))?.name ?? unit })),
    [availableUnits, canUseAsConversionUnit, unitDefinitionById],
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

  const productUnitShape = useMemo(() => ({
    purchase_unit: purchaseUnit,
    selling_unit: sellingUnit,
    sellable_units: productUnits,
    unit_mappings: unitMappings,
  }), [productUnits, purchaseUnit, sellingUnit, unitMappings]);

  const resolveSelectedUnit = useCallback(
    (unit: string) => resolveProductUnitRatio(
      productUnitShape,
      unit,
      purchaseUnit,
      { globalConversions: conversions },
    ),
    [conversions, productUnitShape, purchaseUnit],
  );

  /**
   * Baris konversi untuk satuan yang belum punya baris. Kalau ratio globalnya
   * ada, angkanya langsung terisi; kalau tidak, 0 supaya barisnya terhitung
   * belum lengkap dan pengguna diminta melengkapinya. Satuan yang lebih besar
   * dari satuan utama ditulis terbalik ("1 box = 12 pcs") supaya angkanya tetap
   * bulat — kolom jumlah di form terkunci di 1.
   */
  const buildStoredUnitMapping = useCallback((unit: string) => {
    const resolution = resolveProductUnitRatio(
      productUnitShape,
      purchaseUnit,
      unit,
      { globalConversions: conversions },
    );
    const baseToUnitRatio = resolution.status === 'resolved' ? resolution.ratio : 0;

    if (baseToUnitRatio > 0 && baseToUnitRatio < 1) {
      return {
        from_quantity: 1,
        from_unit: unit,
        to_quantity: snapNearInteger(1 / baseToUnitRatio),
        to_unit: purchaseUnit,
      };
    }

    return {
      from_quantity: 1,
      from_unit: purchaseUnit,
      to_quantity: snapNearInteger(baseToUnitRatio),
      to_unit: unit,
    };
  }, [conversions, productUnitShape, purchaseUnit]);

  const incompleteProductMappingUnits = useMemo(() => {
    return productUnits.filter((unit) => {
      return resolveSelectedUnit(unit).status !== 'resolved';
    });
  }, [productUnits, resolveSelectedUnit]);

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

  /**
   * `sellable_units` selalu mengikuti baris konversi. Produk lama yang menyimpan
   * satuan jual tanpa baris konversi dimaterialkan dulu jadi baris — kalau
   * tidak, satuannya hilang diam-diam begitu produk disimpan ulang dari form
   * ini. Materialisasi hanya sekali saat form dibuka; sesudah itu satuan yang
   * tidak lagi punya baris memang harus gugur, mis. satuan utama yang lama
   * setelah penggunanya berganti satuan utama.
   */
  useEffect(() => {
    if (!open) {
      hasMaterializedStoredUnitsRef.current = false;
      return;
    }

    if (!hasMaterializedStoredUnitsRef.current) {
      hasMaterializedStoredUnitsRef.current = true;

      const unmappedUnits = selectedSellableUnits.filter((unit) => !productUnits.includes(unit));
      if (unmappedUnits.length > 0) {
        unmappedUnits.forEach((unit) => appendUnitMapping(buildStoredUnitMapping(unit)));
        return;
      }
    }

    const isSynced = selectedSellableUnits.length === productUnits.length
      && productUnits.every((unit, index) => unit === selectedSellableUnits[index]);

    if (!isSynced) {
      setValue('sellable_units', productUnits, { shouldDirty: true, shouldValidate: true });
    }
  }, [
    appendUnitMapping,
    buildStoredUnitMapping,
    open,
    productUnits,
    selectedSellableUnits,
    setValue,
  ]);

  // Satuan default harus selalu ada di daftar satuan yang dipakai transaksi.
  useEffect(() => {
    if (!open || productUnits.length === 0) return;
    if (productUnits.includes(normalizeUnitKey(sellingUnit))) return;

    setValue('selling_unit', productUnits[0], { shouldDirty: true, shouldValidate: true });
  }, [open, productUnits, sellingUnit, setValue]);

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
      <StockProductBarcodeScanner
        open={scannerOpen}
        videoRef={videoRef}
        onClose={() => setScannerOpen(false)}
      />

      {/*
        Baris konversi memuat empat kolom (jumlah, satuan, setara, satuan), jadi
        lebar bawaan 520px milik antd bikin isinya berhimpitan.
      */}
      <Modal
        title={title ?? (editingId ? t('stock.editProduct') : t('stock.newProduct'))}
        open={open}
        onCancel={onCancel}
        footer={null}
        destroyOnHidden
        width={!screens.sm ? '100%' : 760}
        style={!screens.sm ? { top: 0, margin: 0, padding: 0, maxWidth: '100vw', height: '100vh' } : undefined}
        styles={!screens.sm ? { body: { height: 'calc(100vh - 55px)', overflowY: 'auto' } } : undefined}
        centered={!!screens.sm}
      >
        <form onSubmit={onSave} className="mt-6">
          {topContent}
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
                  <StockProductGeneralTab
                    control={control}
                    errors={errors}
                    purchaseUnit={purchaseUnit}
                    baseUnitOptions={baseUnitOptions}
                    skuInputRef={skuInputRef}
                    onOpenScanner={() => setScannerOpen(true)}
                  />
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
                  <StockProductUnitConversionTab
                    control={control}
                    errors={errors}
                    conversionWarning={conversionWarning}
                    unitMappingFields={unitMappingFields}
                    appendUnitMapping={appendUnitMapping}
                    removeUnitMapping={removeUnitMapping}
                    purchaseUnit={purchaseUnit}
                    nextUnitMappingTarget={nextUnitMappingTarget}
                    unitMappingOptions={unitMappingOptions}
                    unitMappings={unitMappings}
                    productUnits={productUnits}
                    productUnitOptions={productUnitOptions}
                  />
                ),
              },
              {
                key: 'wholesale',
                label: t('stock.form.wholesaleTab'),
                children: (
                  <StockProductWholesaleTab
                    control={control}
                    errors={errors}
                    wholesaleFields={wholesaleFields}
                    appendWholesale={appendWholesale}
                    removeWholesale={removeWholesale}
                    purchaseUnit={purchaseUnit}
                    productUnitOptions={productUnitOptions}
                    wholesalePrices={wholesalePrices}
                  />
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
              {submitLabel ?? t('stock.form.save')}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
