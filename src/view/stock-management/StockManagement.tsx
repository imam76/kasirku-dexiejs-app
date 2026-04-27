import { App, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { Plus, Upload, Download, MoreVertical } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { useStockManagement } from '@/hooks/useStockManagement';
import type { Product } from '@/types';
import StockTable from '@/components/StockTable';
import StockProductModal from '@/view/stock-management/StockProductModal';
import {
  buildProductCsvImportItems,
  createProductCsvExportRows,
} from '@/utils/productsCsv';
import { exportCsv, type ExportTarget } from '@/utils/export';

export default function StockManagement() {
  const { modal, message } = App.useApp();
  const {
    products,
    editingId,
    control,
    handleSubmit,
    handleEdit,
    handleDelete,
    resetForm,
    errors,
    setValue,
    importProductsFromCsv,
    isImporting,
  } = useStockManagement();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  const handleExportCsv = async (target: ExportTarget = 'auto') => {
    if (products.length === 0) {
      message.info('Tidak ada data produk untuk diexport.');
      return;
    }

    try {
      const exported = await exportCsv({
        filename: `products_export_${new Date().toISOString().split('T')[0]}.csv`,
        rows: createProductCsvExportRows(products),
        target,
      });
      if (!exported) return;
      message.success('Export CSV produk berhasil.');
    } catch (error) {
      console.error('Failed to export products CSV:', error);
      message.error('Gagal export CSV produk.');
    }
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportSelected = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      message.error('File harus berformat .csv');
      return;
    }

    try {
      const text = await file.text();
      const { items, errors } = buildProductCsvImportItems(text);

      if (items.length === 0) {
        message.error(errors[0] ?? 'Tidak ada data valid untuk diimport.');
        return;
      }

      modal.confirm({
        title: 'Import CSV Produk',
        content: (
          <div className="space-y-2">
            <div className="text-sm text-gray-700">
              File: <span className="font-medium">{file.name}</span>
            </div>
            <div className="text-sm text-gray-700">
              Baris valid: <span className="font-medium">{items.length}</span>
              {errors.length > 0 ? (
                <>
                  {' '}
                  • Error: <span className="font-medium">{errors.length}</span>
                </>
              ) : null}
            </div>
            <div className="text-xs text-gray-500">
              Kolom yang didukung: sku, name/nama, purchase_price/harga_beli, selling_price/harga_jual, stock/stok,
              purchase_quantity (opsional).
            </div>
            {errors.length > 0 ? (
              <div className="text-xs text-red-600">
                {errors.slice(0, 5).map((er) => (
                  <div key={er}>{er}</div>
                ))}
                {errors.length > 5 ? <div>...dan {errors.length - 5} error lainnya.</div> : null}
              </div>
            ) : null}
          </div>
        ),
        okText: 'Import',
        cancelText: 'Batal',
        okButtonProps: { disabled: isImporting },
        onOk: async () => {
          await importProductsFromCsv(items);
        },
      });
    } catch (error) {
      console.error('Failed to import CSV:', error);
      message.error('Gagal membaca file CSV.');
    }
  };

  const mobileMenuItems: MenuProps['items'] = [
    {
      key: 'export',
      label: 'Export CSV',
      icon: <Download size={16} />,
      disabled: products.length === 0,
      children: [
        { key: 'export-share', label: 'Bagikan' },
        { key: 'export-save', label: 'Simpan ke File' },
      ],
    },
    { key: 'import', label: 'Import CSV', icon: <Upload size={16} />, disabled: isImporting },
    { type: 'divider' },
    { key: 'add', label: 'Tambah Produk', icon: <Plus size={16} /> },
  ];

  const handleMobileMenuClick: NonNullable<MenuProps['onClick']> = ({ key }) => {
    if (key === 'export-share') handleExportCsv('share');
    if (key === 'export-save') handleExportCsv('save');
    if (key === 'import') handleImportClick();
    if (key === 'add') handleAddProduct();
  };

  const exportMenuItems: MenuProps['items'] = [
    { key: 'share', label: 'Bagikan' },
    { key: 'save', label: 'Simpan ke File' },
  ];

  const handleExportMenuClick: NonNullable<MenuProps['onClick']> = ({ key }) => {
    void handleExportCsv(key as ExportTarget);
  };

  return (
    <div className="p-3 sm:p-4 md:p-6">
      <div className="mb-4 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="min-w-0 text-lg font-bold text-gray-800 sm:text-xl md:text-2xl">Manajemen Stok</h2>
        <div className="flex items-center justify-end gap-2 sm:hidden">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleImportSelected}
          />
          <Dropdown
            trigger={['click']}
            placement="bottomRight"
            menu={{ items: mobileMenuItems, onClick: handleMobileMenuClick }}
          >
            <button
              type="button"
              aria-label="Menu aksi stok"
              className="rounded-lg bg-gray-100 p-2 text-gray-700 transition-colors hover:bg-gray-200"
            >
              <MoreVertical size={20} />
            </button>
          </Dropdown>
        </div>
        <div className="hidden flex-wrap items-center justify-end gap-2 sm:flex">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleImportSelected}
          />
          <Dropdown trigger={['click']} placement="bottomRight" menu={{ items: exportMenuItems, onClick: handleExportMenuClick }}>
            <button
              type="button"
              disabled={products.length === 0}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-3 py-2 text-sm text-white transition-colors hover:bg-green-700 disabled:bg-green-400 sm:px-4 sm:py-2 sm:text-base"
            >
              <Download size={18} />
              <span>Export CSV</span>
            </button>
          </Dropdown>
          <button
            type="button"
            onClick={handleImportClick}
            disabled={isImporting}
            className="flex items-center gap-2 rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white transition-colors hover:bg-indigo-700 disabled:bg-indigo-400 sm:px-4 sm:py-2 sm:text-base"
          >
            <Upload size={18} />
            <span>Import CSV</span>
          </button>
          <button
            onClick={handleAddProduct}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-700 sm:px-4 sm:py-2 sm:text-base"
          >
            <Plus size={18} />
            <span>Tambah Produk</span>
          </button>
        </div>
      </div>

      <StockProductModal
        open={isModalOpen}
        editingId={editingId}
        control={control}
        errors={errors}
        setValue={setValue}
        onCancel={handleModalCancel}
        onSave={async () => {
          try {
            await handleSubmit();
            // setIsModalOpen(false);
          } catch (error) {
            console.error('Failed to save product:', error);
          }
        }}
      />

      {/* Desktop & Tablet Table View */}
      <StockTable
        products={products}
        onEdit={handleEditProduct}
        onDelete={handleDelete}
      />
    </div>
  );
}
