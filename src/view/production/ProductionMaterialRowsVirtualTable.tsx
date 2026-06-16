import { useEffect, useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button, InputNumber, Select } from 'antd';
import { Trash2 } from 'lucide-react';
import type { Product, ProductUnit } from '@/types';
import { formatCurrency } from '@/utils/formatters';

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
}: ProductionMaterialRowsVirtualTableProps) => {
  const parentRef = useRef<HTMLDivElement>(null);

  // eslint-disable-next-line react-hooks/incompatible-library
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => rows[index]?.id ?? index,
    estimateSize: () => ROW_ESTIMATE,
    overscan: 10,
  });

  useEffect(() => {
    rowVirtualizer.measure();
  }, [rows.length, rowVirtualizer]);

  useEffect(() => {
    if (!scrollToLastRequest || rows.length === 0) return undefined;

    const frameId = window.requestAnimationFrame(() => {
      rowVirtualizer.scrollToIndex(rows.length - 1, { align: 'end' });
    });

    return () => window.cancelAnimationFrame(frameId);
  }, [rows.length, rowVirtualizer, scrollToLastRequest]);

  return (
    <div className="overflow-hidden rounded-md border border-gray-200">
      <div className="overflow-x-auto">
        <div style={{ minWidth: TABLE_MIN_WIDTH }}>
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

          <div ref={parentRef} className="max-h-[640px] overflow-auto">
            {rows.length === 0 ? (
              <div className="flex h-24 items-center justify-center text-sm text-gray-500">
                Belum ada bahan baku
              </div>
            ) : (
              <div
                style={{
                  height: rowVirtualizer.getTotalSize(),
                  position: 'relative',
                  width: '100%',
                }}
              >
                {rowVirtualizer.getVirtualItems().map((virtualRow) => {
                  const row = rows[virtualRow.index];
                  if (!row) return null;

                  return (
                    <div
                      key={virtualRow.key}
                      ref={rowVirtualizer.measureElement}
                      data-index={virtualRow.index}
                      className="absolute left-0 top-0 grid w-full items-center gap-2 border-b border-gray-100 bg-white px-3 py-2"
                      style={{
                        gridTemplateColumns: GRID_TEMPLATE_COLUMNS,
                        transform: `translateY(${virtualRow.start}px)`,
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
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
