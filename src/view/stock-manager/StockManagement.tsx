import { App, Button, Drawer, Dropdown } from 'antd';
import type { MenuProps } from 'antd';
import { Plus, Upload, Download, MoreVertical } from 'lucide-react';
import { useRef, useState, type ChangeEvent } from 'react';
import { useStockManagement } from '@/hooks/useStockManagement';
import type { Product } from '@/types';
import StockTable from '@/components/StockTable';
import StockProductModal from './StockProductModal';
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
  const [isActionDrawerOpen, setIsActionDrawerOpen] = useState(false);
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
      const { items, errors: parseErrors } = buildProductCsvImportItems(text);

      if (items.length === 0) {
        message.error(parseErrors[0] ?? 'Tidak ada data valid untuk diimport.');
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
              {parseErrors.length > 0 ? (
                <>
                  {' '}
                  • Error: <span className="font-medium">{parseErrors.length}</span>
                </>
              ) : null}
            </div>
            <div className="text-xs text-gray-500">
              Kolom yang didukung: id, sku, name/nama, category/kategori, purchase_unit/satuan_beli,
              selling_unit/satuan_jual, purchase_price/harga_beli, selling_price/harga_jual, stock/stok,
              purchase_quantity, wholesale_prices, sellable_units.
            </div>
            {parseErrors.length > 0 ? (
              <div className="text-xs text-red-600">
                {parseErrors.slice(0, 5).map((errorText) => (
                  <div key={errorText}>{errorText}</div>
                ))}
                {parseErrors.length > 5 ? <div>...dan {parseErrors.length - 5} error lainnya.</div> : null}
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

  const exportMenuItems: MenuProps['items'] = [
    { key: 'share', label: 'Bagikan' },
    { key: 'save', label: 'Simpan ke File' },
  ];

  const handleExportMenuClick: NonNullable<MenuProps['onClick']> = ({ key }) => {
    void handleExportCsv(key as ExportTarget);
  };

  const handleMobileExport = (target: ExportTarget) => {
    setIsActionDrawerOpen(false);
    void handleExportCsv(target);
  };

  const handleMobileImportClick = () => {
    setIsActionDrawerOpen(false);
    handleImportClick();
  };

  return (
    <div className="p-3 sm:p-4 md:p-6">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleImportSelected}
      />

      <div className="mb-4 flex items-center justify-between gap-3 sm:mb-6">
        <h2 className="min-w-0 flex-1 text-lg font-bold text-gray-800 sm:text-xl md:text-2xl">Manajemen Stok</h2>
        <div className="flex shrink-0 items-center justify-end gap-2 sm:hidden">
          <Button
            type="primary"
            size="large"
            icon={<Plus size={18} />}
            onClick={handleAddProduct}
            className="h-11 px-3 font-semibold"
          >
            Tambah
          </Button>
          <Button
            size="large"
            aria-label="Menu export import stok"
            icon={<MoreVertical size={20} />}
            onClick={() => setIsActionDrawerOpen(true)}
            className="h-11 w-11"
          />
        </div>
        <div className="hidden flex-wrap items-center justify-end gap-2 sm:flex">
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
            type="button"
            onClick={handleAddProduct}
            className="flex items-center gap-2 rounded-lg bg-blue-600 px-3 py-2 text-sm text-white transition-colors hover:bg-blue-700 sm:px-4 sm:py-2 sm:text-base"
          >
            <Plus size={18} />
            <span>Tambah Produk</span>
          </button>
        </div>
      </div>

      <Drawer
        title="Aksi Stok"
        placement="bottom"
        open={isActionDrawerOpen}
        onClose={() => setIsActionDrawerOpen(false)}
        height="auto"
        className="sm:hidden"
        styles={{
          body: { padding: 16 },
          header: { padding: '16px 20px' },
        }}
      >
        <div className="space-y-3 pb-3">
          <div className="rounded-lg border border-gray-100 bg-gray-50 p-3">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-gray-900">
              <Download size={18} />
              <span>Export CSV</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Button
                size="large"
                disabled={products.length === 0}
                onClick={() => handleMobileExport('share')}
                className="h-12"
              >
                Bagikan
              </Button>
              <Button
                size="large"
                disabled={products.length === 0}
                onClick={() => handleMobileExport('save')}
                className="h-12"
              >
                Simpan ke File
              </Button>
            </div>
          </div>

          <Button
            block
            size="large"
            icon={<Upload size={20} />}
            disabled={isImporting}
            onClick={handleMobileImportClick}
            className="flex h-14 items-center justify-start font-semibold"
          >
            Import CSV
          </Button>
        </div>
      </Drawer>

      <StockProductModal
        open={isModalOpen}
        editingId={editingId}
        control={control}
        errors={errors}
        setValue={setValue}
        onCancel={handleModalCancel}
        setIsModalOpen={setIsModalOpen}
        onSave={async () => {
          try {
            const submit = await handleSubmit();
            if (submit) {
              setIsModalOpen(false);
            }
          } catch (error) {
            console.error('Failed to save product:', error);
          }
        }}
      />

      <StockTable
        products={products}
        onEdit={handleEditProduct}
        onDelete={handleDelete}
      />
    </div>
  );
}
