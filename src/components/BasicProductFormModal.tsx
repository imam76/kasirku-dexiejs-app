import { Input, Modal, Select, Typography } from 'antd';
import { useState, useEffect, useMemo } from 'react';
import { useI18n } from '@/hooks/useI18n';
import { getProductCategoryOptions } from '@/i18n/stock';
import type { ProductCategory } from '@/types';

const { Text } = Typography;

interface BasicProductFormModalProps {
  open: boolean;
  onCancel: () => void;
  onOk: (name: string, sku?: string, category?: ProductCategory) => void;
  initialName?: string;
  initialSku?: string;
  unit: string;
  description?: string;
}

export const BasicProductFormModal = ({
  open,
  onCancel,
  onOk,
  initialName = '',
  initialSku = '',
  unit,
  description = 'Produk akan dibuat sebagai entri dasar dan akan tersimpan permanen setelah Anda menyimpan dokumen ini.',
}: BasicProductFormModalProps) => {
  const { t } = useI18n();
  const [name, setName] = useState(initialName);
  const [sku, setSku] = useState(initialSku);
  const [category, setCategory] = useState<ProductCategory>('non_consumable');

  const categoryOptions = useMemo(() => getProductCategoryOptions(t), [t]);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setSku(initialSku);
      setCategory('non_consumable');
    }
  }, [open, initialName, initialSku]);

  return (
    <Modal
      title="Buat Produk Baru (Entri Dasar)"
      open={open}
      onCancel={onCancel}
      onOk={() => onOk(name, sku, category)}
      okText="Buat"
      cancelText="Batal"
      destroyOnClose
    >
      <div className="flex flex-col gap-3">
        <div className="text-sm text-gray-600">
          {description}
        </div>

        <div>
          <div className="mb-1"><Text strong>Nama Produk</Text></div>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Contoh: Gula Pasir 1kg"
            autoFocus
          />
        </div>

        <div>
          <div className="mb-1"><Text strong>Barcode / SKU (Opsional)</Text></div>
          <Input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="Scan / ketik barcode"
          />
        </div>

        <div>
          <div className="mb-1"><Text strong>Kategori</Text></div>
          <Select
            className="w-full"
            value={category}
            onChange={setCategory}
            options={categoryOptions}
            placeholder="Pilih kategori"
          />
        </div>

        <div className="text-xs text-gray-500 bg-gray-50 p-2 rounded">
          Satuan: <strong>{unit || 'pcs'}</strong>
        </div>
      </div>
    </Modal>
  );
};
