import { InputNumber, Select } from 'antd';
import type { PromoType, SalesDocumentItem } from '@/types';
import { formatCurrency } from '@/utils/formatters';

interface Option {
  value: string;
  label: string;
}

interface DocumentLineItemExpandedFieldsProps {
  item: SalesDocumentItem;
  calculatedItem?: SalesDocumentItem;
  taxOptions: Option[];
  onUpdateItem: (itemId: string, patch: Partial<SalesDocumentItem>) => void;
}

export const DocumentLineItemExpandedFields = ({
  item,
  calculatedItem,
  taxOptions,
  onUpdateItem,
}: DocumentLineItemExpandedFieldsProps) => {
  const displayedItem = calculatedItem ?? item;

  return (
    <div className="border-t border-gray-100 bg-gray-50/70 px-3 py-3">
      <div className="grid grid-cols-4 gap-3">
        <div>
          <div className="mb-1 text-xs text-gray-500">Harga</div>
          <InputNumber
            min={0}
            className="w-full"
            value={item.price}
            onChange={(value) => onUpdateItem(item.id, { price: Number(value || 0) })}
          />
        </div>
        <div>
          <div className="mb-1 text-xs text-gray-500">Diskon</div>
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <Select
              value={item.discount_type ?? 'fixed'}
              options={[
                { value: 'percent' satisfies PromoType, label: 'Persen' },
                { value: 'fixed' satisfies PromoType, label: 'Nominal' },
              ]}
              onChange={(discountType: PromoType) => onUpdateItem(item.id, { discount_type: discountType })}
            />
            <InputNumber
              min={0}
              className="w-full"
              value={item.discount_value ?? item.discount_amount}
              onChange={(value) => onUpdateItem(item.id, { discount_value: Number(value || 0) })}
            />
          </div>
        </div>
        <div>
          <div className="mb-1 text-xs text-gray-500">Pajak (%)</div>
          <Select
            allowClear
            className="w-full"
            placeholder="Pajak item (opsional)"
            value={item.tax_id || undefined}
            options={taxOptions}
            onChange={(taxId?: string) => onUpdateItem(item.id, {
              tax_id: taxId,
              tax_name: undefined,
              tax_code: undefined,
              tax_rate: undefined,
              tax_calculation_mode: undefined,
            })}
          />
        </div>
        <div>
          <div className="mb-1 text-xs text-gray-500">Pajak</div>
          <InputNumber
            className="w-full"
            value={displayedItem.tax_amount}
            formatter={(value) => `Rp ${formatCurrency(Number(value || 0))}`}
            disabled
          />
        </div>
      </div>
    </div>
  );
};
