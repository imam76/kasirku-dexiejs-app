import { Form, Modal, Input, InputNumber } from 'antd';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useStockManagement } from '@/hooks/useStockManagement';
import type { Product } from '@/types';
import { Controller } from 'react-hook-form';
import StockTable from '@/components/StockTable';

export default function StockManagement() {
  const {
    products,
    editingId,
    control,
    handleSubmit,
    handleEdit,
    handleDelete,
    resetForm,
    errors,
  } = useStockManagement();

  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleModalCancel = () => {
    resetForm();
    setIsModalOpen(false);
  };

  const handleAddProduct = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const handleEditProduct = (product: Product) => {
    handleEdit(product);
    setIsModalOpen(true);
  };

  return (
    <div className="p-3 sm:p-4 md:p-6">
      <div className="flex justify-between items-center mb-4 sm:mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Manajemen Stok</h2>
        <button
          onClick={handleAddProduct}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 sm:px-4 sm:py-2 rounded-lg flex items-center gap-1 sm:gap-2 transition-colors text-sm sm:text-base"
        >
          <Plus size={18} />
          <span className="hidden xs:inline sm:inline">Tambah Produk</span>
          <span className="xs:hidden sm:hidden">Tambah</span>
        </button>
      </div>

      {/* Modal for Create/Update */}
      <Modal
        title={editingId ? 'Edit Produk' : 'Tambah Produk Baru'}
        open={isModalOpen}
        onCancel={handleModalCancel}
        footer={null}
        destroyOnClose
      >
        <Form
          layout="vertical"
          onFinish={async () => {
            try {
              await handleSubmit();
              setIsModalOpen(false);
            } catch (error) {
              console.error('Failed to save product:', error);
            }
          }}
          className="mt-6"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4">
            <Form.Item
              label="Nama Produk"
              validateStatus={errors.name ? 'error' : ''}
              help={errors.name?.message}
            >
              <Controller
                name="name"
                control={control}
                rules={{ required: 'Nama produk harus diisi' }}
                render={({ field }) => <Input {...field} />}
              />
            </Form.Item>

            <Form.Item
              label="SKU"
              validateStatus={errors.sku ? 'error' : ''}
              help={errors.sku?.message}
            >
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

            <Form.Item
              label="Stok"
              validateStatus={errors.stock ? 'error' : ''}
              help={errors.stock?.message}
            >
              <Controller
                name="stock"
                control={control}
                rules={{
                  required: 'Stok harus diisi',
                  min: { value: 0, message: 'Stok harus lebih dari atau sama dengan 0' },
                }}
                render={({ field }) => (
                  <InputNumber
                    {...field}
                    className="w-full"
                    placeholder="Masukkan stok"
                    min={0}
                  />
                )}
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
              onClick={handleModalCancel}
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

      {/* Desktop & Tablet Table View */}
      <StockTable
        products={products}
        onEdit={handleEditProduct}
        onDelete={handleDelete}
      />
    </div>
  );
}
