import { Button, InputNumber, Select } from 'antd';
import { Trash2 } from 'lucide-react';
import type { Product, ProductUnit } from '@/types';
import { formatCurrency } from '@/utils/formatters';
import { VirtualLineItemsTable } from '@/components/virtual-line-items/VirtualLineItemsTable';

export interface ProductionMaterialDraftRow {
  id: string;
  productId?: string;
  quantity: number;
  unit?: ProductUnit;
}

export interface ProductionMaterialPreviewRow extends ProductionMaterialDraftRow {
  product?: Product;
  unit: ProductUnit;
  stockQuantity: number;
  estimatedCost: number;
}

interface Option {
  value: string;
  label: string;
}

interface ProductionMaterialRowsVirtualTableProps {
  rows: ProductionMaterialPreviewRow[];
  productOptions: Option[];
  unitOptions: Option[];
  scrollToLastRequest: number;
  onUpdateMaterial: (id: string, patch: Partial<ProductionMaterialDraftRow>) => void;
  onRemoveMaterial: (id: string) => void;
}

const GRID_TEMPLATE_COLUMNS = 'minmax(280px,1fr) 140px 140px 160px 160px 64px';
const TABLE_MIN_WIDTH = 960;
const ROW_ESTIMATE = 56;

const formatMoney = (value: number) => `Rp ${formatCurrency(Math.round(value || 0))}`;

export const ProductionMaterialRowsVirtualTable = ({
  rows,
  productOptions,
  unitOptions,
  scrollToLastRequest,
  onUpdateMaterial,
  onRemoveMaterial,
}: ProductionMaterialRowsVirtualTableProps) => (
  <VirtualLineItemsTable
    rows={rows}
    getRowKey={(row) => row.id}
    estimateRowSize={() => ROW_ESTIMATE}
    remeasureSignature={String(rows.length)}
    scrollToLastRequest={scrollToLastRequest}
    minWidth={TABLE_MIN_WIDTH}
    outerClassName="overflow-hidden rounded-md border border-gray-200"
    scrollContainerClassName="max-h-[640px] overflow-auto"
    header={(
      <div
        className="grid items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2 text-sm font-medium text-gray-700"
        style={{ gridTemplateColumns: GRID_TEMPLATE_COLUMNS }}
      >
        <div>Bahan baku</div>
        <div>Jumlah</div>
        <div>Satuan</div>
        <div>Stok terpakai</div>
        <div className="text-right">Estimasi biaya</div>
        <div />
      </div>
    )}
    emptyState={(
      <div className="flex h-24 items-center justify-center text-sm text-gray-500">
        Belum ada bahan baku
      </div>
    )}
    renderRow={(row, { virtualIndex, style, measureRef }) => (
      <div
        ref={measureRef}
        data-index={virtualIndex}
        className="grid items-center gap-2 border-b border-gray-100 bg-white px-3 py-2"
        style={{
          ...style,
          gridTemplateColumns: GRID_TEMPLATE_COLUMNS,
        }}
      >
        <Select
          showSearch
          className="w-full min-w-0"
          value={row.productId}
          placeholder="Pilih produk bahan"
          options={productOptions}
          optionFilterProp="label"
          onChange={(value) => onUpdateMaterial(row.id, { productId: value })}
        />
        <InputNumber
          min={0}
          className="w-full"
          value={row.quantity}
          onChange={(value) => onUpdateMaterial(row.id, { quantity: Number(value || 0) })}
        />
        <Select
          className="w-full min-w-0"
          value={row.unit}
          options={unitOptions}
          onChange={(value) => onUpdateMaterial(row.id, { unit: value })}
        />
        <span className="truncate text-sm text-gray-700">
          {row.stockQuantity.toLocaleString('id-ID')} {row.product?.purchase_unit ?? ''}
        </span>
        <span className="truncate text-right text-sm font-medium text-gray-700">
          {formatMoney(row.estimatedCost)}
        </span>
        <Button
          type="text"
          danger
          aria-label="Hapus bahan"
          icon={<Trash2 size={16} />}
          disabled={rows.length === 1}
          onClick={() => onRemoveMaterial(row.id)}
        />
      </div>
    )}
  />
);
