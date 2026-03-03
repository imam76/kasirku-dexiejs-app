import { Form, Modal, Input, InputNumber, Grid, Button, Select } from 'antd';
import { Controller, type Control, type FieldErrors, useFieldArray, type UseFormSetValue } from 'react-hook-form';
import { Trash2, Plus, ScanLine, X } from 'lucide-react';
import type { StockFormData } from '@/hooks/useStockManagement';
import { useCallback, useEffect, useRef, useState } from 'react';

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
          (result, error) => {
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <Form.Item label="Nama Produk" validateStatus={errors.name ? 'error' : ''} help={errors.name?.message}>
              <Controller
                name="name"
                control={control}
                rules={{ required: 'Nama produk harus diisi' }}
                render={({ field }) => <Input {...field} />}
              />
            </Form.Item>

            <Form.Item label="SKU" validateStatus={errors.sku ? 'error' : ''} help={errors.sku?.message}>
              <div className="flex gap-2">
                <Controller
                  name="sku"
                  control={control}
                  rules={{ required: 'SKU harus diisi' }}
                  render={({ field }) => <Input {...field} className="flex-1" />}
                />
                <Button icon={<ScanLine size={16} />} onClick={() => setScannerOpen(true)} />
              </div>
            </Form.Item>

            <Form.Item
              label="Harga Beli"
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
                    placeholder="Masukkan harga beli"
                    step={0.01}
                    min={0}
                  />
                )}
              />
            </Form.Item>

            <Form.Item
              label="Harga Jual"
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
                    placeholder="Masukkan harga jual"
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
                      label="Min. Qty"
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
                        defaultValue="unit"
                        render={({ field }) => (
                          <Select
                            {...field}
                            className="w-full"
                            options={[
                              { value: 'unit', label: 'Per Pcs' },
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

