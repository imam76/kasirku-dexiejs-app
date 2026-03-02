import { Form, Modal, Input, InputNumber, Grid } from 'antd';
import { Controller, type Control, type FieldErrors } from 'react-hook-form';
import type { StockFormData } from '@/hooks/useStockManagement';

const { useBreakpoint } = Grid;

type Props = {
  open: boolean;
  editingId: string | null;
  control: Control<StockFormData>;
  errors: FieldErrors<StockFormData>;
  onCancel: () => void;
  onSave: () => void | Promise<void>;
};

export default function StockProductModal({ open, editingId, control, errors, onCancel, onSave }: Props) {
  const screens = useBreakpoint();
  
  return (
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
            <Controller
              name="sku"
              control={control}
              rules={{ required: 'SKU harus diisi' }}
              render={({ field }) => <Input {...field} />}
            />
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
  );
}

