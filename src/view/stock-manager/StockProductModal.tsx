import { PRODUCT_CATEGORIES } from '@/constants/categories';
import {
  DEFAULT_UNITS,
  inferUnitDefinitionType,
  isGlobalConvertibleUnitType,
} from '@/constants/units';
import type { StockFormData } from '@/hooks/useStockManagement';
import { db } from '@/lib/db';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Alert, Button, Grid, Input, InputNumber, Modal, Select, Tabs } from 'antd';
import { AlertTriangle, ExternalLink, Plus, ScanLine, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  label: string;
  error?: FieldError;
  help?: string;
  children: React.ReactNode;
};

function FieldContainer({ label, error, help, children }: FieldContainerProps) {
  return (
    <div className="mb-4">
      <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
      {children}
      {error?.message ? <p className="mt-1 text-xs text-red-600">{String(error.message)}</p> : null}
      {!error?.message && help ? <p className="mt-1 text-xs text-gray-500">{help}</p> : null}
    </div>
  );
}

export default function StockProductModal({ open, editingId, control, errors, setValue, onCancel, onSave }: Props) {
  const screens = useBreakpoint();
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
  const sellableUnits = useWatch({ control, name: 'sellable_units' }) || [];
  const unitMappings = useWatch({ control, name: 'unit_mappings' }) || [];

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
      units.add(unit.id);
    });
    conversions.forEach((conversion) => {
      units.add(conversion.fromUnit);
      units.add(conversion.toUnit);
    });
    return Array.from(units).sort();
  }, [conversions, unitDefinitions]);

  const availableUnitOptions = useMemo(
    () => availableUnits.map((unit) => ({ value: unit, label: unit })),
    [availableUnits],
  );

  const unitTypeById = useMemo(() => {
    const map = new Map(DEFAULT_UNITS.map((unit) => [unit.id, unit.type]));
    unitDefinitions.forEach((unit) => {
      map.set(unit.id, unit.type);
    });
    return map;
  }, [unitDefinitions]);

  const unitMappingOptions = useMemo(
    () =>
      availableUnits
        .filter((unit) => {
          if (unit === purchaseUnit) return false;
          const type = unitTypeById.get(unit) ?? inferUnitDefinitionType(unit);
          return !isGlobalConvertibleUnitType(type);
        })
        .map((unit) => ({ value: unit, label: unit })),
    [availableUnits, purchaseUnit, unitTypeById],
  );

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

  const hasGlobalConversion = useCallback((fromUnit: string, toUnit: string) => {
    if (fromUnit === toUnit) return true;
    return conversions.some(
      (conversion) =>
        (conversion.fromUnit === fromUnit && conversion.toUnit === toUnit) ||
        (conversion.fromUnit === toUnit && conversion.toUnit === fromUnit),
    );
  }, [conversions]);

  const getUnitType = useCallback(
    (unit: string) => unitTypeById.get(unit) ?? inferUnitDefinitionType(unit),
    [unitTypeById],
  );

  const needsProductMapping = useCallback(
    (unit: string) => {
      if (unit === purchaseUnit) return false;
      const unitType = getUnitType(unit);
      const purchaseType = getUnitType(purchaseUnit);
      const canUseGlobalConversion =
        unitType === purchaseType &&
        isGlobalConvertibleUnitType(unitType) &&
        isGlobalConvertibleUnitType(purchaseType);

      return !canUseGlobalConversion;
    },
    [purchaseUnit, getUnitType],
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

  const missingGlobalConversionUnits = useMemo(() => {
    return selectedSellableUnits.filter((unit) => {
      if (unit === purchaseUnit) return false;
      if (needsProductMapping(unit)) return false;
      return !hasGlobalConversion(unit, purchaseUnit);
    });
  }, [selectedSellableUnits, purchaseUnit, needsProductMapping, hasGlobalConversion]);

  const hasUnitConversion = useMemo(() => {
    return missingProductMappingUnits.length === 0 && missingGlobalConversionUnits.length === 0;
  }, [missingProductMappingUnits.length, missingGlobalConversionUnits.length]);

  const conversionWarning = useMemo(() => {
    if (hasUnitConversion) return null;

    return missingGlobalConversionUnits.length > 0
      ? {
        title: 'Konversi Global Belum Ada',
        description: (
          <div className="flex flex-col gap-2">
            <p>
              Konversi <strong>{missingGlobalConversionUnits.join(', ')}</strong> ke <strong>{purchaseUnit}</strong>{' '}
              mengikuti Manajemen Unit. Tambahkan konversi global agar harga dan stok akurat.
            </p>
            <Link to="/units">
              <Button
                size="small"
                type="primary"
                ghost
                icon={<ExternalLink size={14} />}
                className="flex w-fit items-center gap-1"
              >
                Atur Konversi Global
              </Button>
            </Link>
          </div>
        ),
      }
      : {
        title: 'Konversi Produk Belum Ada',
        description: (
          <p>
            Satuan <strong>{missingProductMappingUnits.join(', ')}</strong> perlu ratio khusus produk ke{' '}
            <strong>{purchaseUnit}</strong>. Tambahkan row di tab Konversi Unit.
          </p>
        ),
      };
  }, [hasUnitConversion, purchaseUnit, missingGlobalConversionUnits, missingProductMappingUnits]);

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

  const [scannerOpen, setScannerOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastScannedRef = useRef<{ text: string; at: number } | null>(null);
  const beepUrl = new URL('../../assets/beep.mp3', import.meta.url).href;
  const beepAudioRef = useRef<HTMLAudioElement | null>(null);

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
              <p className="text-lg font-bold">Scan Barcode</p>
              <p className="text-sm text-gray-500">Arahkan kamera ke barcode produk</p>
            </div>
          </div>
        </div>
      ) : null}

      <Modal
        title={editingId ? 'Edit Produk' : 'Tambah Produk Baru'}
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
          <Tabs
            defaultActiveKey="product"
            items={[
              {
                key: 'product',
                label: 'Produk',
                children: (
                  <>
                    <div className="grid grid-cols-1 gap-x-4">
                      <FieldContainer label="Nama Produk" error={errors.name}>
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

                      <FieldContainer label="Kategori" error={errors.category}>
                        <Controller
                          name="category"
                          control={control}
                          render={({ field }) => (
                            <Select {...field} className="w-full" options={PRODUCT_CATEGORIES} />
                          )}
                        />
                      </FieldContainer>
                    </div>

                    <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                      <FieldContainer label="Satuan Dasar Stok" error={errors.purchase_unit}>
                        <Controller
                          name="purchase_unit"
                          control={control}
                          render={({ field }) => (
                            <Select {...field} className="w-full" options={availableUnitOptions} />
                          )}
                        />
                      </FieldContainer>

                      <div className="sm:col-span-2">
                        <FieldContainer
                          label="Satuan Jual Tersedia"
                          error={(errors.sellable_units || errors.selling_unit) as FieldError | undefined}
                          help="Unit pertama menjadi default kasir. Unit ukur pakai konversi global; package/custom perlu ratio di tab Konversi Unit."
                        >
                          <Controller
                            name="sellable_units"
                            control={control}
                            render={({ field }) => (
                              <Select
                                mode="multiple"
                                value={selectedSellableUnits}
                                onChange={(values) => {
                                  const nextUnits = Array.from(new Set(values));
                                  field.onChange(nextUnits);
                                  setValue('selling_unit', nextUnits[0] || '', { shouldDirty: true, shouldValidate: true });
                                }}
                                className="w-full"
                                placeholder="Pilih satuan jual"
                                options={availableUnitOptions}
                              />
                            )}
                          />
                        </FieldContainer>
                      </div>

                      <FieldContainer label={`Harga Beli (per ${purchaseUnit})`} error={errors.purchase_price}>
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
                              placeholder={`Masukkan harga beli per ${purchaseUnit}`}
                              step={0.01}
                              min={0}
                            />
                          )}
                        />
                      </FieldContainer>

                      <FieldContainer label={`Harga Jual (per ${purchaseUnit})`} error={errors.selling_price}>
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
                              placeholder={`Masukkan harga jual per ${purchaseUnit}`}
                              step={0.01}
                              min={0}
                            />
                          )}
                        />
                      </FieldContainer>

                      <FieldContainer label="Stok" error={errors.stock}>
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
                              placeholder="Masukkan stok"
                              min={0}
                            />
                          )}
                        />
                      </FieldContainer>

                      <FieldContainer label="Qty Pembelian (opsional)" error={errors.purchase_quantity}>
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
                              placeholder="Jumlah item yang dibeli (untuk laporan)"
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
                label: 'Konversi Unit',
                children: (
                  <div className="space-y-4">
                    <Alert
                      type="info"
                      showIcon
                      message="Unit ukur mengikuti Manajemen Unit"
                      description="Kg, gram, ons, liter, ml, jam, dan menit tidak perlu diatur ulang per produk. Isi ratio di sini hanya untuk package/custom seperti dus, pack, box, renteng, atau isi kemasan lain."
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
                          <h3 className="font-medium text-gray-700">Konversi Satuan Produk</h3>
                          <p className="text-xs text-gray-500">Format: 1 satuan = jumlah dalam Satuan Dasar Stok.</p>
                        </div>
                        <Button
                          type="dashed"
                          onClick={() => appendUnitMapping({
                            unit: unitMappingOptions[0]?.value || '',
                            base_unit: purchaseUnit,
                            ratio: 1,
                          })}
                          icon={<Plus size={16} />}
                          className="flex items-center gap-1"
                        >
                          Tambah Unit
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
                                  label="Satuan"
                                  error={errors.unit_mappings?.[index]?.unit as FieldError | undefined}
                                >
                                  <Controller
                                    name={`unit_mappings.${index}.unit`}
                                    control={control}
                                    render={({ field: itemField }) => (
                                      <Select
                                        value={itemField.value}
                                        onChange={itemField.onChange}
                                        className="w-full"
                                        placeholder="Pilih satuan"
                                        options={unitMappingOptions}
                                      />
                                    )}
                                  />
                                </FieldContainer>
                              </div>

                              <div className="col-span-4">
                                <FieldContainer
                                  label={`Isi per ${purchaseUnit}`}
                                  error={errors.unit_mappings?.[index]?.ratio as FieldError | undefined}
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
                                  label="Dasar"
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
                          <p className="text-sm italic text-gray-500">Belum ada konversi khusus produk.</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ),
              }] : []),
              {
                key: 'wholesale',
                label: 'Harga Grosir',
                children: (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <h3 className="font-medium text-gray-700">Harga Grosir (Multi Price)</h3>
                      <Button
                        type="dashed"
                        onClick={() => appendWholesale({ min_quantity: 2, price: 0, price_type: 'unit' })}
                        icon={<Plus size={16} />}
                        className="flex items-center gap-1"
                      >
                        Tambah Harga
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
                                label={`Min. Qty (${sellingUnit})`}
                                error={errors.wholesale_prices?.[index]?.min_quantity}
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
                                      placeholder="Qty"
                                      min={1}
                                    />
                                  )}
                                />
                              </FieldContainer>
                            </div>

                            <div className="col-span-4">
                              <FieldContainer label="Tipe">
                                <Controller
                                  name={`wholesale_prices.${index}.price_type`}
                                  control={control}
                                  render={({ field: itemField }) => (
                                    <Select
                                      value={itemField.value}
                                      onChange={itemField.onChange}
                                      className="w-full"
                                      options={[
                                        { value: 'unit', label: `Per ${purchaseUnit}` },
                                        { value: 'bundle', label: 'Paket' },
                                      ]}
                                    />
                                  )}
                                />
                              </FieldContainer>
                            </div>

                            <div className="col-span-5">
                              <FieldContainer label="Harga" error={errors.wholesale_prices?.[index]?.price}>
                                <Controller
                                  name={`wholesale_prices.${index}.price`}
                                  control={control}
                                  render={({ field: itemField }) => (
                                    <InputNumber
                                      value={itemField.value}
                                      onBlur={itemField.onBlur}
                                      onChange={(value) => itemField.onChange(value ?? 0)}
                                      className="w-full"
                                      placeholder="Nominal"
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
                        <p className="text-sm italic text-gray-500">Belum ada harga grosir diatur.</p>
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
              Batal
            </button>
            <button
              type="button"
              onClick={onSave}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm text-white transition-colors hover:bg-green-700"
            >
              Simpan
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
