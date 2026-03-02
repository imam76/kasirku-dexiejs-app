import { App, Form, Modal, Input, InputNumber } from 'antd';
import { Plus, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { useStockManagement } from '@/hooks/useStockManagement';
import type { Product } from '@/types';
import { Controller } from 'react-hook-form';
import StockTable from '@/components/StockTable';

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

  const normalizeHeaderName = (value: string) =>
    value
      .trim()
      .toLowerCase()
      .replace(/\uFEFF/g, '')
      .replace(/[^\p{L}\p{N}]+/gu, '_')
      .replace(/^_+|_+$/g, '');

  const parseNumberFlexible = (value: string | undefined) => {
    const raw = (value ?? '').trim();
    if (!raw) return undefined;

    let cleaned = raw.replace(/\s+/g, '');
    if (cleaned.includes('.') && cleaned.includes(',')) {
      if (/,(\d{1,4})$/.test(cleaned)) {
        cleaned = cleaned.replace(/\./g, '').replace(',', '.');
      } else {
        cleaned = cleaned.replace(/,/g, '');
      }
    } else if (cleaned.includes(',') && !cleaned.includes('.')) {
      cleaned = cleaned.replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }

    const parsed = Number.parseFloat(cleaned);
    return Number.isFinite(parsed) ? parsed : undefined;
  };

  const parseCsv = (text: string) => {
    const input = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const firstLine = input.split('\n').find((l) => l.trim().length > 0) ?? '';
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semicolonCount = (firstLine.match(/;/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;
    const delimiter = tabCount >= semicolonCount && tabCount >= commaCount ? '\t' : semicolonCount > commaCount ? ';' : ',';

    const rows: string[][] = [];
    let row: string[] = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < input.length; i++) {
      const ch = input[i];
      if (inQuotes) {
        if (ch === '"') {
          const next = input[i + 1];
          if (next === '"') {
            field += '"';
            i++;
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
        continue;
      }

      if (ch === '"') {
        inQuotes = true;
        continue;
      }

      if (ch === delimiter) {
        row.push(field);
        field = '';
        continue;
      }

      if (ch === '\n') {
        row.push(field);
        field = '';
        const isEmptyRow = row.every((c) => c.trim().length === 0);
        if (!isEmptyRow) rows.push(row);
        row = [];
        continue;
      }

      field += ch;
    }

    row.push(field);
    const isEmptyRow = row.every((c) => c.trim().length === 0);
    if (!isEmptyRow) rows.push(row);

    return rows;
  };

  const buildImportItems = (csvText: string) => {
    const rows = parseCsv(csvText);
    if (rows.length === 0) {
      return { items: [], errors: ['CSV kosong.'] };
    }

    const headerRow = rows[0].map((h) => normalizeHeaderName(h));
    const indexByHeader = new Map<string, number>();
    headerRow.forEach((h, idx) => {
      if (h && !indexByHeader.has(h)) indexByHeader.set(h, idx);
    });

    const pickIndex = (candidates: string[]) => {
      for (const c of candidates) {
        const idx = indexByHeader.get(c);
        if (idx !== undefined) return idx;
      }
      return undefined;
    };

    const idxName = pickIndex(['name', 'nama', 'product_name', 'nama_produk']);
    const idxSku = pickIndex(['sku', 'kode', 'kode_produk', 'product_sku']);
    const idxPurchase = pickIndex(['purchase_price', 'harga_beli', 'buy_price', 'modal']);
    const idxSelling = pickIndex(['selling_price', 'harga_jual', 'sell_price', 'harga']);
    const idxStock = pickIndex(['stock', 'stok', 'qty', 'quantity', 'jumlah']);
    const idxPurchaseQty = pickIndex(['purchase_quantity', 'qty_pembelian', 'purchase_qty', 'qty_beli', 'jumlah_pembelian']);

    const errors: string[] = [];
    if (idxSku === undefined) errors.push('Kolom "sku" tidak ditemukan.');
    if (idxName === undefined) errors.push('Kolom "name" (atau "nama") tidak ditemukan.');
    if (errors.length > 0) return { items: [], errors };

    const items: Array<{
      name: string;
      sku: string;
      purchase_price: number;
      selling_price: number;
      stock: number;
      purchase_quantity?: number;
    }> = [];

    const seenSku = new Set<string>();
    for (let r = 1; r < rows.length; r++) {
      const row = rows[r];
      const rowNumber = r + 1;
      const sku = (row[idxSku!] ?? '').trim();
      const name = (row[idxName!] ?? '').trim();

      if (!sku) {
        errors.push(`Baris ${rowNumber}: sku kosong.`);
        continue;
      }
      if (!name) {
        errors.push(`Baris ${rowNumber}: name/nama kosong (sku: ${sku}).`);
        continue;
      }
      if (seenSku.has(sku)) {
        errors.push(`Baris ${rowNumber}: sku duplikat di file (sku: ${sku}).`);
        continue;
      }
      seenSku.add(sku);

      const purchase_price = parseNumberFlexible(idxPurchase !== undefined ? row[idxPurchase] : undefined) ?? 0;
      const selling_price = parseNumberFlexible(idxSelling !== undefined ? row[idxSelling] : undefined) ?? 0;
      const stock = parseNumberFlexible(idxStock !== undefined ? row[idxStock] : undefined) ?? 0;
      const purchase_quantity =
        parseNumberFlexible(idxPurchaseQty !== undefined ? row[idxPurchaseQty] : undefined) ?? undefined;

      items.push({
        sku,
        name,
        purchase_price,
        selling_price,
        stock,
        purchase_quantity,
      });
    }

    return { items, errors };
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.csv')) {
      message.error('File harus berformat .csv');
      return;
    }

    try {
      const text = await file.text();
      const { items, errors } = buildImportItems(text);

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

  return (
    <div className="p-3 sm:p-4 md:p-6">
      <div className="flex justify-between items-center mb-4 sm:mb-6">
        <h2 className="text-xl sm:text-2xl font-bold text-gray-800">Manajemen Stok</h2>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleImportSelected}
          />
          <button
            type="button"
            onClick={handleImportClick}
            disabled={isImporting}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white px-3 py-2 sm:px-4 sm:py-2 rounded-lg flex items-center gap-1 sm:gap-2 transition-colors text-sm sm:text-base"
          >
            <Upload size={18} />
            <span className="hidden xs:inline sm:inline">Import CSV</span>
            <span className="xs:hidden sm:hidden">Import</span>
          </button>
          <button
            onClick={handleAddProduct}
            className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 sm:px-4 sm:py-2 rounded-lg flex items-center gap-1 sm:gap-2 transition-colors text-sm sm:text-base"
          >
            <Plus size={18} />
            <span className="hidden xs:inline sm:inline">Tambah Produk</span>
            <span className="xs:hidden sm:hidden">Tambah</span>
          </button>
        </div>
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
