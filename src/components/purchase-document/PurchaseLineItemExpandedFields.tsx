import { InputNumber, Select } from 'antd';
import { useI18n } from '@/hooks/useI18n';
import type { PromoType, PurchaseDocumentItem } from '@/types';
import {
  isBaseCurrency,
  toDocumentCurrencyAmount,
  type DocumentCurrencySnapshot,
} from '@/utils/documentCurrency';
import { formatCurrency } from '@/utils/formatters';

interface Option {
  value: string;
  label: string;
}

interface PurchaseLineItemExpandedFieldsProps {
  item: PurchaseDocumentItem;
  calculatedItem?: PurchaseDocumentItem;
  taxOptions: Option[];
  documentCurrencySnapshot: DocumentCurrencySnapshot;
  onUpdateItem: (itemId: string, patch: Partial<PurchaseDocumentItem>) => void;
}

const expandedFieldControlClassName = [
  'h-9 w-full',
  '[&_.ant-input-number-input]:h-9',
  '[&_.ant-input-number-input]:py-0',
  '[&_.ant-select-selector]:!h-9',
  '[&_.ant-select-selection-item]:!leading-9',
  '[&_.ant-select-selection-placeholder]:!leading-9',
].join(' ');

const expandedFieldLabelClassName = 'mb-1 flex min-h-5 items-center text-xs text-gray-500';

export const PurchaseLineItemExpandedFields = ({
  item,
  calculatedItem,
  taxOptions,
  documentCurrencySnapshot,
  onUpdateItem,
}: PurchaseLineItemExpandedFieldsProps) => {
  const { t } = useI18n();
  const displayedItem = calculatedItem ?? item;
  const isForeignCurrency = !isBaseCurrency(documentCurrencySnapshot.currency_code);
  const displayedPrice = isForeignCurrency
    ? item.foreign_price ?? toDocumentCurrencyAmount(item.price, documentCurrencySnapshot)
    : item.price;

  return (
    <div className="border-t border-gray-100 bg-gray-50/70 px-3 py-3">
      <div className="grid grid-cols-4 gap-3">
        <div>
          <div className={expandedFieldLabelClassName}>{t('purchaseDocuments.field.price')}</div>
          <InputNumber
            min={0}
            className={expandedFieldControlClassName}
            value={displayedPrice}
            onChange={(value) => onUpdateItem(item.id, isForeignCurrency
              ? { foreign_price: Number(value || 0) }
              : { price: Number(value || 0) })}
          />
        </div>
        <div>
          <div className={expandedFieldLabelClassName}>{t('purchaseDocuments.field.discount')}</div>
          <div className="grid grid-cols-[120px_1fr] gap-2">
            <Select
              className={expandedFieldControlClassName}
              value={item.discount_type ?? 'fixed'}
              options={[
                { value: 'percent' satisfies PromoType, label: t('purchaseDocuments.discountType.percent') },
                { value: 'fixed' satisfies PromoType, label: t('purchaseDocuments.discountType.fixed') },
              ]}
              onChange={(discountType: PromoType) => onUpdateItem(item.id, { discount_type: discountType })}
            />
            <InputNumber
              min={0}
              className={expandedFieldControlClassName}
              value={item.discount_value ?? item.discount_amount}
              onChange={(value) => onUpdateItem(item.id, { discount_value: Number(value || 0) })}
            />
          </div>
        </div>
        <div>
          <div className={expandedFieldLabelClassName}>{t('purchaseDocuments.field.tax')} (%)</div>
          <Select
            allowClear
            className={expandedFieldControlClassName}
            placeholder={t('purchaseDocuments.placeholder.itemTax')}
            value={item.tax_id || undefined}
            options={taxOptions}
            onChange={(taxId?: string) => onUpdateItem(item.id, {
              tax_id: taxId,
              tax_name: undefined,
              tax_code: undefined,
              tax_rate: undefined,
              tax_calculation_mode: undefined,
              tax_flow: undefined,
              tax_account_id: undefined,
              tax_account_code: undefined,
              tax_account_name: undefined,
              tax_account_type: undefined,
            })}
          />
        </div>
        <div>
          <div className={expandedFieldLabelClassName}>{t('purchaseDocuments.field.tax')}</div>
          <InputNumber
            className={expandedFieldControlClassName}
            value={displayedItem.tax_amount}
            formatter={(value) => `Rp ${formatCurrency(Number(value || 0))}`}
            disabled
          />
        </div>
      </div>
    </div>
  );
};
