import type { StockFormData } from '@/hooks/useStockManagement';
import { db } from '@/lib/db';
import { useQuery } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Alert, Button, Form, Grid, Input, InputNumber, Modal, Select } from 'antd';
import { AlertTriangle, ExternalLink, Plus, ScanLine, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type Control, Controller, type FieldErrors, useFieldArray, type UseFormSetValue, useWatch } from 'react-hook-form';

const { useBreakpoint } = Grid;

type Props = {
  open: boolean;
  editingId: string | null;
  control: Control<StockFormData>;
  errors: FieldErrors<StockFormData>;
  setValue: UseFormSetValue<StockFormData>;
  onCancel: () => void;
  onSave: () => void | Promise<void>;
};

export default function StockProductModal({ open, editingId, control, errors, setValue, onCancel, onSave }: Props) {
  const screens = useBreakpoint();
  const { fields, append, remove } = useFieldArray({
    control,
    name: 'wholesale_prices',
  });

  const purchaseUnit = useWatch({ control, name: 'purchase_unit' }) || 'pcs';
  const sellingUnit = useWatch({ control, name: 'selling_unit' }) || 'pcs';

  // Fetch unit conversions for dropdowns and validation
  const { data: conversions = [] } = useQuery({
    queryKey: ['unitConversions'],
    queryFn: () => db.unitConversions.toArray(),
  });

  // Extract unique units for dropdowns
  const availableUnits = useMemo(() => {
    const units = new Set<string>(['pcs', 'kg', 'gram', 'ons', 'ikat', 'bundle']);
    conversions.forEach(c => {
      units.add(c.fromUnit);
      units.add(c.toUnit);
    });
    return Array.from(units).sort();
  }, [conversions]);

  // Check if conversion exists between purchase and selling unit
  const hasConversion = useMemo(() => {
    if (purchaseUnit === sellingUnit) return true;
    // const ratio = getConversionRatio(purchaseUnit, sellingUnit);
    // If ratio is 1 but units are different, it's likely a fallback (missing conversion)
    // unless someone explicitly set a 1:1 conversion for different units.
    // We check if the conversion exists in the registry.
    const exists = conversions.some(c =>
      (c.fromUnit === purchaseUnit && c.toUnit === sellingUnit) ||
      (c.fromUnit === sellingUnit && c.toUnit === purchaseUnit)
    );
    return exists;
  }, [purchaseUnit, sellingUnit, conversions]);

  // Scanner logic
  const [scannerOpen, setScannerOpen] = useState(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const controlsRef = useRef<{ stop: () => void } | null>(null);
  const lastScannedRef = useRef<{ text: string; at: number } | null>(null);
  const beepUrl = new URL('../assets/beep.mp3', import.meta.url).href;
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
    if (video) video.srcObject = null;
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

            if (result) {
              const text = result.getText().trim();
              const now = Date.now();
              const last = lastScannedRef.current;
              if (last && last.text === text && now - last.at < 1500) return;

              lastScannedRef.current = { text, at: now };

              // Set SKU value
              setValue('sku', text);

              // Play beep
              void beepAudioRef.current?.play().catch(() => { });

              // Close scanner
              setScannerOpen(false);
              return;
            }
          }
        );

        if (cancelled) {
          controls.stop();
          return;
        }

        controlsRef.current = controls;
      } catch (err) {
        console.error('Scanner error:', err);
      }
    })();

    return () => {
      cancelled = true;
      stopScanner();
    };
  }, [scannerOpen, stopScanner, setValue]);

  return (
    <>
      {scannerOpen && (
        <div className="fixed inset-0 z-[1300] bg-black bg-opacity-80 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg overflow-hidden w-full max-w-md relative flex flex-col">
            <div className="absolute top-2 right-2 z-10">
              <button
                onClick={() => setScannerOpen(false)}
                className="p-2 bg-white rounded-full shadow hover:bg-gray-100 transition-colors"
              >
                <X size={20} />
              </button>
            </div>
            <div className="aspect-square bg-black relative">
              <video ref={videoRef} className="w-full h-full object-cover" muted autoPlay playsInline />
            </div>
            <div className="p-4 text-center bg-white">
              <p className="font-bold text-lg">Scan Barcode</p>
              <p className="text-sm text-gray-500">Arahkan kamera ke barcode produk</p>
            </div>
          </div>
        </div>
      )}
      <Modal
        title={editingId ? 'Edit Produk' : 'Tambah Produk Baru'}
        open={open}
        onCancel={onCancel}
        footer={null}
        destroyOnHidden={true}
        width={!screens.sm ? '100%' : undefined}
        style={!screens.sm ? { top: 0, margin: 0, padding: 0, maxWidth: '100vw', height: '100vh' } : undefined}
        styles={!screens.sm ? { body: { height: 'calc(100vh - 55px)', overflowY: 'auto' } } : undefined}
        centered={!!screens.sm}
      >
        <Form layout="vertical" onFinish={onSave} className="mt-6">
          <div className="grid grid-cols-1 gap-x-4">
            <Form.Item label="Nama Produk" validateStatus={errors.name ? 'error' : ''} help={errors.name?.message}>
              <Controller
                name="name"
                control={control}
                rules={{ required: 'Nama produk harus diisi' }}
                render={({ field }) => <Input {...field} className="w-full" />}
              />
            </Form.Item>

            <Form.Item label="SKU" validateStatus={errors.sku ? 'error' : ''} help={errors.sku?.message}>
              <div className="flex gap-2">
                <Controller
                  name="sku"
                  control={control}
                  render={({ field }) => <Input {...field} className="flex-1" />}
                />
                <Button icon={<ScanLine size={16} />} onClick={() => setScannerOpen(true)} />
              </div>
            </Form.Item>

            <Form.Item label="Kategori" validateStatus={errors.category ? 'error' : ''}>
              <Controller
                name="category"
                control={control}
                render={({ field }) => (
                  <Select {...field} className="w-full">
                    <Select.Option value="bumbu">Bumbu Dapur</Select.Option>
                    <Select.Option value="sembako">Sembako</Select.Option>
                    <Select.Option value="lainnya">Lain-lain</Select.Option>
                  </Select>
                )}
              />
            </Form.Item>

          </div>

          {!hasConversion && (
            <Alert
              title="Konversi Tidak Ditemukan"
              description={
                <div className="flex flex-col gap-2">
                  <p>Aplikasi tidak tahu cara mengonversi dari <strong>{purchaseUnit}</strong> ke <strong>{sellingUnit}</strong>. Harga jual mungkin tidak akurat.</p>
                  <Link to="/units">
                    <Button size="small" type="primary" ghost icon={<ExternalLink size={14} />} className="flex items-center gap-1 w-fit">
                      Atur Konversi Baru
                    </Button>
                  </Link>
                </div>
              }
              type="warning"
              showIcon
              icon={<AlertTriangle size={20} />}
              className="mb-6"
            />
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
             <Form.Item label="Satuan Beli" validateStatus={errors.purchase_unit ? 'error' : ''}>
              <Controller
                name="purchase_unit"
                control={control}
                render={({ field }) => (
                  <Select {...field} className="w-full">
                    {availableUnits.map(unit => (
                      <Select.Option key={unit} value={unit}>{unit}</Select.Option>
                    ))}
                  </Select>
                )}
              />
            </Form.Item>

            <Form.Item label="Satuan Jual" validateStatus={errors.selling_unit ? 'error' : ''}>
              <Controller
                name="selling_unit"
                control={control}
                render={({ field }) => (
                  <Select {...field} className="w-full">
                    {availableUnits.map(unit => (
                      <Select.Option key={unit} value={unit}>{unit}</Select.Option>
                    ))}
                  </Select>
                )}
              />
            </Form.Item>
            
            <Form.Item
              label={`Harga Beli (per ${purchaseUnit})`}
              validateStatus={errors.purchase_price ? 'error' : ''}
              help={errors.purchase_price?.message}
            >
              <Controller
                name="purchase_price"
                control={control}
                rules={{
                  required: 'Harga beli harus diisi',
                  min: { value: 0, message: 'Harga beli harus lebih dari 0' },
                }}
                render={({ field }) => (
                  <InputNumber
                    {...field}
                    className="w-full"
                    placeholder={`Masukkan harga beli per ${purchaseUnit}`}
                    step={0.01}
                    min={0}
                  />
                )}
              />
            </Form.Item>

            <Form.Item
              label={`Harga Jual (per ${purchaseUnit})`}
              validateStatus={errors.selling_price ? 'error' : ''}
              help={errors.selling_price?.message}
            >
              <Controller
                name="selling_price"
                control={control}
                rules={{
                  required: 'Harga jual harus diisi',
                  min: { value: 0, message: 'Harga jual harus lebih dari 0' },
                }}
                render={({ field }) => (
                  <InputNumber
                    {...field}
                    className="w-full"
                    placeholder={`Masukkan harga jual per ${purchaseUnit}`}
                    step={0.01}
                    min={0}
                  />
                )}
              />
            </Form.Item>

            <Form.Item label="Stok" validateStatus={errors.stock ? 'error' : ''} help={errors.stock?.message}>
              <Controller
                name="stock"
                control={control}
                rules={{
                  required: 'Stok harus diisi',
                  min: { value: 0, message: 'Stok harus lebih dari atau sama dengan 0' },
                }}
                render={({ field }) => <InputNumber {...field} className="w-full" placeholder="Masukkan stok" min={0} />}
              />
            </Form.Item>

            <Form.Item
              label="Qty Pembelian (opsional)"
              validateStatus={errors.purchase_quantity ? 'error' : ''}
              help={errors.purchase_quantity?.message}
            >
              <Controller
                name="purchase_quantity"
                control={control}
                render={({ field }) => (
                  <InputNumber
                    {...field}
                    className="w-full"
                    placeholder="Jumlah item yang dibeli (untuk laporan)"
                    min={0}
                  />
                )}
              />
            </Form.Item>
          </div>

          {/* Wholesale Prices Section */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-gray-700">Harga Grosir (Multi Price)</h3>
              <Button
                type="dashed"
                onClick={() => append({ min_quantity: 2, price: 0, price_type: 'unit' })}
                icon={<Plus size={16} />}
                className="flex items-center gap-1"
              >
                Tambah Harga
              </Button>
            </div>

            <div className="space-y-3">
              {fields.map((field, index) => (
                <div key={field.id} className="flex gap-2 items-start bg-gray-50 p-3 rounded-lg border border-gray-200">
                  <div className="flex-1 grid grid-cols-12 gap-2">
                    <Form.Item
                      label={`Min. Qty (${sellingUnit})`}
                      className="mb-0 col-span-3"
                      validateStatus={errors.wholesale_prices?.[index]?.min_quantity ? 'error' : ''}
                      help={errors.wholesale_prices?.[index]?.min_quantity?.message}
                    >
                      <Controller
                        name={`wholesale_prices.${index}.min_quantity`}
                        control={control}
                        rules={{ required: 'Wajib', min: { value: 1, message: '> 0' } }}
                        render={({ field }) => (
                          <InputNumber
                            {...field}
                            className="w-full"
                            placeholder="Qty"
                            min={1}
                          />
                        )}
                      />
                    </Form.Item>

                    <Form.Item
                      label="Tipe"
                      className="mb-0 col-span-4"
                    >
                      <Controller
                        name={`wholesale_prices.${index}.price_type`}
                        control={control}
                        render={({ field }) => (
                          <Select
                            {...field}
                            className="w-full"
                            options={[
                              { value: 'unit', label: `Per ${purchaseUnit}` },
                              { value: 'bundle', label: 'Paket' },
                            ]}
                          />
                        )}
                      />
                    </Form.Item>

                    <Form.Item
                      label="Harga"
                      className="mb-0 col-span-5"
                      validateStatus={errors.wholesale_prices?.[index]?.price ? 'error' : ''}
                      help={errors.wholesale_prices?.[index]?.price?.message}
                    >
                      <Controller
                        name={`wholesale_prices.${index}.price`}
                        control={control}
                        rules={{ required: 'Wajib', min: { value: 0, message: '>= 0' } }}
                        render={({ field }) => (
                          <InputNumber
                            {...field}
                            className="w-full"
                            placeholder="Nominal"
                            min={0}
                            formatter={(value) => value !== undefined && value !== null ? `Rp ${value}`.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : ''}
                            parser={(value) => value?.replace(/Rp\s?|(,*)/g, '') as unknown as number}
                          />
                        )}
                      />
                    </Form.Item>
                  </div>
                  <Button
                    danger
                    type="text"
                    icon={<Trash2 size={16} />}
                    onClick={() => remove(index)}
                    className="mt-8"
                  />
                </div>
              ))}
              {fields.length === 0 && (
                <p className="text-gray-500 text-sm italic">Belum ada harga grosir diatur.</p>
              )}
            </div>
          </div>

          <div className="flex gap-2 justify-end pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="bg-gray-500 hover:bg-gray-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm"
            >
              Batal
            </button>
            <button
              type="submit"
              className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition-colors text-sm"
            >
              Simpan
            </button>
          </div>
        </Form>
      </Modal>
    </>
  );
}
